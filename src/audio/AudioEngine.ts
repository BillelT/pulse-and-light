import { BANDS, BAND_COUNT } from './bands'
import { COLUMN_COUNT, type AudioFrame, type SpectrumProvider } from './types'

/**
 * Reglages "Lighting Designer" (PARTIE 3 du brief) : les trous volontaires
 * laisses par la science, exposes comme variables d'ajustement.
 */
export interface AnalysisSettings {
  /** Facteur de gain K de la formule I = log10(1 + A*K) / log10(1 + K). */
  gain: number
  /** Plancher : en dessous, on considere que c'est du bruit -> noir. 0..1 */
  noiseFloor: number
  /** Plafond : au dessus, on sature a 1. 0..1 */
  ceiling: number
  /** Constante de temps de montee, en secondes (petit = attaque seche). */
  attack: number
  /** Constante de temps de descente, en secondes (grand = longue trainee). */
  decay: number
  /** Sensibilite de la detection de kick : multiplicateur du seuil adaptatif. */
  beatSensitivity: number
  /** Duree minimale entre deux kicks, en secondes (anti double-trigger). */
  beatCooldown: number
}

export const DEFAULT_ANALYSIS: AnalysisSettings = {
  gain: 24,
  noiseFloor: 0.08,
  ceiling: 0.92,
  attack: 0.02,
  decay: 0.22,
  beatSensitivity: 1.6,
  beatCooldown: 0.16,
}

/**
 * Historique glissant du seuil adaptatif d'onsets, en ticks.
 * A 125 Hz (cf. AudioDriver) cela represente ~1,5 s, soit plusieurs mesures :
 * assez pour que la moyenne soit stable, assez court pour suivre un morceau
 * qui change de section.
 */
const HISTORY = 192

/**
 * Traduit un flux de spectre brut en donnees scenographiques exploitables :
 * bandes, colonnes VU, onsets, BPM, brillance.
 *
 * Le moteur est agnostique de la source : AnalyserNode reel ou generateur
 * procedural, il applique exactement le meme traitement.
 */
export class AudioEngine {
  settings: AnalysisSettings

  private provider: SpectrumProvider | null = null
  private spectrum = new Uint8Array(new ArrayBuffer(0))
  /** Bin de depart / fin de chaque bande. */
  private bandBins: Int32Array = new Int32Array(BAND_COUNT * 2)
  /** Bin de depart / fin de chaque colonne du mur. */
  private columnBins: Int32Array = new Int32Array(COLUMN_COUNT * 2)

  private readonly bands = new Float32Array(BAND_COUNT)
  private readonly bandsRaw = new Float32Array(BAND_COUNT)
  private readonly columns = new Float32Array(COLUMN_COUNT)
  private readonly columnsTarget = new Float32Array(COLUMN_COUNT)

  /** Historique des MONTEES d'energie basse, pas de l'energie elle-meme. */
  private readonly history = new Float32Array(HISTORY)
  private historyIndex = 0
  private historyFilled = 0
  private prevLowEnergy = 0

  private prevSpectrum = new Float32Array(0)

  private level = 0
  private levelRaw = 0
  private beat = 0
  private onset = false
  private onsetCount = 0
  private lastOnsetAt = -1
  private flux = 0
  private brightness = 0
  private bpm = 0
  private time = 0

  /** Intervalles entre onsets recents, pour estimer le tempo. */
  private readonly intervals: number[] = []

  private readonly frame: AudioFrame

  constructor(settings: AnalysisSettings = DEFAULT_ANALYSIS) {
    this.settings = { ...settings }
    this.frame = {
      bands: this.bands,
      bandsRaw: this.bandsRaw,
      level: 0,
      levelRaw: 0,
      columns: this.columns,
      beat: 0,
      onset: false,
      onsetCount: 0,
      bpm: 0,
      flux: 0,
      brightness: 0,
      time: 0,
      real: false,
    }
  }

  setProvider(provider: SpectrumProvider | null) {
    if (this.provider && this.provider !== provider) this.provider.dispose()
    this.provider = provider
    if (!provider) return

    this.spectrum = new Uint8Array(new ArrayBuffer(provider.binCount))
    this.prevSpectrum = new Float32Array(provider.binCount)
    this.computeBins(provider)
    this.history.fill(0)
    this.historyIndex = 0
    this.historyFilled = 0
    this.intervals.length = 0
    this.lastOnsetAt = -1
  }

  get currentProvider(): SpectrumProvider | null {
    return this.provider
  }

  /**
   * Derniere frame publiee, sans faire avancer l'analyse.
   * `AudioDriver` appelle `update()` une fois par frame en priorite -10 ;
   * tous les autres composants lisent ce getter.
   */
  get currentFrame(): AudioFrame {
    return this.frame
  }

  /** Precalcule les plages de bins pour les bandes et les colonnes. */
  private computeBins(provider: SpectrumProvider) {
    const nyquist = provider.sampleRate / 2
    const binCount = provider.binCount
    const hzToBin = (hz: number) =>
      Math.max(0, Math.min(binCount - 1, Math.round((hz / nyquist) * binCount)))

    for (let i = 0; i < BAND_COUNT; i++) {
      const spec = BANDS[i]
      const lo = hzToBin(spec.from)
      const hi = Math.max(lo + 1, hzToBin(spec.to))
      this.bandBins[i * 2] = lo
      this.bandBins[i * 2 + 1] = hi
    }

    // Colonnes : repartition logarithmique de 30 Hz a 14 kHz, comme un VU-metre
    // a bandes d'octave. Une repartition lineaire ecraserait tout le contenu
    // musical dans les deux premieres colonnes.
    const fLo = 30
    const fHi = Math.min(14000, nyquist * 0.95)
    const logLo = Math.log2(fLo)
    const logHi = Math.log2(fHi)
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const a = 2 ** (logLo + ((logHi - logLo) * i) / COLUMN_COUNT)
      const b = 2 ** (logLo + ((logHi - logLo) * (i + 1)) / COLUMN_COUNT)
      const lo = hzToBin(a)
      const hi = Math.max(lo + 1, hzToBin(b))
      this.columnBins[i * 2] = lo
      this.columnBins[i * 2 + 1] = hi
    }
  }

  /**
   * Reponse logarithmique + fenetre noiseFloor/ceiling.
   * I = log10(1 + A*K) / log10(1 + K), puis remap sur [floor, ceiling].
   */
  private shape(amp: number): number {
    const { gain, noiseFloor, ceiling } = this.settings
    const i = Math.log10(1 + amp * gain) / Math.log10(1 + gain)
    const span = Math.max(1e-4, ceiling - noiseFloor)
    return clamp01((i - noiseFloor) / span)
  }

  /** Lissage asymetrique, independant du framerate (attaque rapide, decay lent). */
  private smooth(prev: number, target: number, dt: number): number {
    const tau = target > prev ? this.settings.attack : this.settings.decay
    const alpha = 1 - Math.exp(-dt / Math.max(1e-4, tau))
    return prev + (target - prev) * alpha
  }

  /** Fait avancer l'analyse d'une frame. Renvoie toujours le meme objet (zero alloc). */
  update(dt: number): AudioFrame {
    const d = Math.min(0.1, Math.max(1 / 240, dt))
    this.time += d

    const provider = this.provider
    const hasData = provider ? provider.read(this.spectrum, d) : false

    if (!hasData) {
      // Retombee douce vers le noir plutot qu'une coupure brutale.
      for (let i = 0; i < BAND_COUNT; i++) {
        this.bandsRaw[i] = 0
        this.bands[i] = this.smooth(this.bands[i], 0, d)
      }
      for (let i = 0; i < COLUMN_COUNT; i++) {
        this.columnsTarget[i] = 0
        this.columns[i] = this.smooth(this.columns[i], 0, d)
      }
      this.levelRaw = 0
      this.level = this.smooth(this.level, 0, d)
      this.beat = Math.max(0, this.beat - d / 0.25)
      this.onset = false
      this.flux = this.smooth(this.flux, 0, d)
      this.brightness = this.smooth(this.brightness, 0, d)
      return this.publish(provider)
    }

    const spec = this.spectrum
    const n = spec.length

    // --- Bandes ---
    for (let i = 0; i < BAND_COUNT; i++) {
      const lo = this.bandBins[i * 2]
      const hi = this.bandBins[i * 2 + 1]
      let sum = 0
      for (let b = lo; b < hi; b++) sum += spec[b]
      const amp = sum / ((hi - lo) * 255)
      const shaped = this.shape(amp)
      this.bandsRaw[i] = shaped
      this.bands[i] = this.smooth(this.bands[i], shaped, d)
    }

    // --- Colonnes du mur (VU-metre) ---
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const lo = this.columnBins[i * 2]
      const hi = this.columnBins[i * 2 + 1]
      let sum = 0
      let peak = 0
      for (let b = lo; b < hi; b++) {
        sum += spec[b]
        if (spec[b] > peak) peak = spec[b]
      }
      // Melange moyenne / pic : la moyenne seule ecrase les transitoires,
      // le pic seul rend l'affichage nerveux.
      const amp = (0.6 * (sum / (hi - lo)) + 0.4 * peak) / 255
      // Compensation de pente : les hautes frequences portent naturellement
      // moins d'energie, sans ca les colonnes de droite restent eteintes.
      const tilt = 1 + 1.35 * (i / (COLUMN_COUNT - 1)) ** 0.8
      this.columnsTarget[i] = this.shape(Math.min(1, amp * tilt))
      this.columns[i] = this.smooth(this.columns[i], this.columnsTarget[i], d)
    }

    // --- Niveau global, flux spectral, centroide ---
    let total = 0
    let weighted = 0
    let fluxSum = 0
    for (let b = 0; b < n; b++) {
      const v = spec[b] / 255
      total += v
      weighted += v * b
      const diff = v - this.prevSpectrum[b]
      if (diff > 0) fluxSum += diff
      this.prevSpectrum[b] = v
    }
    this.levelRaw = this.shape(total / n)
    this.level = this.smooth(this.level, this.levelRaw, d)
    this.flux = this.smooth(this.flux, clamp01((fluxSum / n) * 12), d)
    const centroid = total > 1e-5 ? weighted / total / n : 0
    // Le centroide brut vit dans le bas du spectre : on l'etale pour qu'il
    // serve reellement de descripteur de timbre.
    this.brightness = this.smooth(this.brightness, clamp01(centroid * 3.2), d)

    // --- Detection de transitoires sur sub + bass (kick) ---
    const lowEnergy = this.bandsRaw[0] * 0.65 + this.bandsRaw[1] * 0.35
    this.detectOnset(lowEnergy, d)

    return this.publish(provider)
  }

  /**
   * Detection de transitoires sur la DERIVEE de l'energie basse — le "dE > seuil"
   * du brief, avec un seuil adaptatif en k-sigma.
   *
   * Seuiller l'energie elle-meme ne marche pas : des qu'un morceau porte une
   * basse continue, le plancher d'energie monte et le kick, pourtant tres
   * audible, ne depasse plus la moyenne glissante. C'est la montee qui
   * distingue une attaque d'un fond soutenu, pas le niveau absolu.
   */
  private detectOnset(energy: number, dt: number) {
    const rise = Math.max(0, energy - this.prevLowEnergy)
    this.prevLowEnergy = energy

    let mean = 0
    let variance = 0
    const count = this.historyFilled
    if (count > 0) {
      for (let i = 0; i < count; i++) mean += this.history[i]
      mean /= count
      for (let i = 0; i < count; i++) {
        const dv = this.history[i] - mean
        variance += dv * dv
      }
      variance /= count
    }

    // mean + k·sigma : le plancher additionnel evite de declencher sur le
    // bruit numerique quand le morceau est quasi silencieux.
    const threshold = mean + this.settings.beatSensitivity * Math.sqrt(variance) + 0.004
    const ready = this.time - this.lastOnsetAt > this.settings.beatCooldown
    const fired = count >= HISTORY / 4 && rise > threshold && energy > 0.08 && ready

    this.onset = fired
    if (fired) {
      if (this.lastOnsetAt > 0) {
        const iv = this.time - this.lastOnsetAt
        if (iv > 0.25 && iv < 1.5) {
          this.intervals.push(iv)
          if (this.intervals.length > 24) this.intervals.shift()
          this.bpm = estimateBpm(this.intervals)
        }
      }
      this.lastOnsetAt = this.time
      this.onsetCount++
      this.beat = 1
    } else {
      this.beat = Math.max(0, this.beat - dt / Math.max(0.05, this.settings.decay * 1.6))
    }

    this.history[this.historyIndex] = rise
    this.historyIndex = (this.historyIndex + 1) % HISTORY
    if (this.historyFilled < HISTORY) this.historyFilled++
  }

  private publish(provider: SpectrumProvider | null): AudioFrame {
    const f = this.frame
    f.level = this.level
    f.levelRaw = this.levelRaw
    f.beat = this.beat
    f.onset = this.onset
    f.onsetCount = this.onsetCount
    f.flux = this.flux
    f.brightness = this.brightness
    f.time = this.time
    f.real = provider?.isRealAudio ?? false
    const known = provider?.knownBpm?.()
    f.bpm = known && known > 0 ? known : this.bpm
    return f
  }

  dispose() {
    this.provider?.dispose()
    this.provider = null
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Mediane des intervalles -> BPM, repliee dans la plage musicale usuelle. */
function estimateBpm(intervals: number[]): number {
  if (intervals.length < 4) return 0
  const sorted = [...intervals].sort((a, b) => a - b)
  const median = sorted[sorted.length >> 1]
  if (median <= 0) return 0
  let bpm = 60 / median
  while (bpm < 70) bpm *= 2
  while (bpm > 180) bpm /= 2
  return Math.round(bpm)
}

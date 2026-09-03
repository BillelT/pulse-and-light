import type { SpectrumProvider } from '../types'
import type { AudioAnalysis, PlaybackSnapshot } from '../../spotify/types'
import { FFT_SIZE } from './analyserProvider'

const SAMPLE_RATE = 48000
const BIN_COUNT = FFT_SIZE / 2
const NYQUIST = SAMPLE_RATE / 2

/** Frequence fondamentale des 12 classes de hauteur a l'octave 0 (Do0 = 16.35 Hz). */
const PITCH_CLASS_HZ = [
  16.35, 17.32, 18.35, 19.45, 20.6, 21.83, 23.12, 24.5, 25.96, 27.5, 29.14, 30.87,
]

/**
 * Source procedurale pilotee par la timeline Spotify — l'option B du brief.
 *
 * Pourquoi elle existe : le Web Playback SDK decode la piste derriere l'EME
 * (DRM). Le signal n'est donc jamais accessible depuis Web Audio, quel que
 * soit le navigateur. Plutot que de renoncer a la reactivite quand on ne peut
 * pas capturer l'audio de l'onglet, on reconstruit un spectre plausible :
 *
 *  - si l'endpoint Audio Analysis repond, on synthetise le spectre a partir des
 *    `segments` (pitches, timbre, loudness) et de la grille de `beats` : le
 *    resultat est reellement cale sur le morceau, note par note ;
 *  - sinon, on retombe sur une grille rythmique construite a partir du tempo et
 *    des audio-features (energy / danceability), ce qui reste synchrone avec la
 *    musique meme si le contenu harmonique est invente.
 *
 * Le moteur d'analyse en aval ne fait aucune difference : il recoit un spectre.
 */
export class SpotifyTimelineProvider implements SpectrumProvider {
  readonly id = 'spotify-timeline'
  readonly isRealAudio = false
  readonly sampleRate = SAMPLE_RATE
  readonly binCount = BIN_COUNT

  private readonly acc = new Float32Array(BIN_COUNT)
  private readonly binHz = new Float32Array(BIN_COUNT)
  /** Enveloppes persistantes pour eviter des sauts entre deux frames. */
  private kickEnv = 0
  private hatEnv = 0
  private snareEnv = 0
  private lastSegment = -1
  private phase = 0

  constructor(private readonly getSnapshot: () => PlaybackSnapshot) {
    for (let i = 0; i < BIN_COUNT; i++) this.binHz[i] = ((i + 0.5) / BIN_COUNT) * NYQUIST
  }

  get label(): string {
    const snap = this.getSnapshot()
    return snap.analysis ? 'Spotify Audio Analysis' : 'Spotify (grille rythmique)'
  }

  knownBpm = () => {
    const t = this.getSnapshot().tempo
    return t > 0 ? Math.round(t) : null
  }

  read(out: Uint8Array<ArrayBuffer>, dt: number): boolean {
    const snap = this.getSnapshot()
    this.acc.fill(0)

    if (!snap.playing) {
      this.kickEnv = 0
      this.hatEnv = 0
      this.snareEnv = 0
      out.fill(0)
      return true
    }

    this.phase += dt
    const t = snap.positionSec

    if (snap.analysis && snap.analysis.segments.length > 0) {
      this.renderFromAnalysis(snap.analysis, t, dt)
    } else {
      this.renderFromGrid(snap, t, dt)
    }

    // Plancher de bruit tres faible : evite un spectre parfaitement nul entre
    // deux evenements, qui ferait clignoter les colonnes hautes.
    for (let i = 0; i < BIN_COUNT; i++) {
      const air = 0.004 * (1 - i / BIN_COUNT)
      const v = this.acc[i] + air
      out[i] = v <= 0 ? 0 : Math.min(255, Math.round(Math.sqrt(v) * 255))
    }
    return true
  }

  // --- Chemin 1 : Audio Analysis (segments + beats) ------------------------

  private renderFromAnalysis(analysis: AudioAnalysis, t: number, dt: number) {
    const segments = analysis.segments
    const idx = findInterval(segments, t)
    if (idx < 0) return
    const seg = segments[idx]

    // Enveloppe intra-segment : attaque jusqu'a loudness_max_time, puis chute.
    const local = t - seg.start
    const attackTime = Math.max(0.01, seg.loudness_max_time)
    const env =
      local < attackTime
        ? local / attackTime
        : Math.max(0, 1 - (local - attackTime) / Math.max(0.05, seg.duration - attackTime)) ** 0.6

    const loudness = dbToLinear(lerp(seg.loudness_start, seg.loudness_max, Math.min(1, env * 1.4)))
    const gain = loudness * (0.45 + 0.55 * seg.confidence)

    // Contenu harmonique : chaque classe de hauteur active est posee sur
    // plusieurs octaves avec une decroissance de type spectre naturel.
    for (let p = 0; p < 12; p++) {
      const amp = seg.pitches[p]
      if (amp < 0.08) continue
      for (let octave = 1; octave <= 7; octave++) {
        const hz = PITCH_CLASS_HZ[p] * 2 ** octave
        if (hz > NYQUIST * 0.85) break
        const rolloff = 1 / (1 + 0.55 * octave)
        this.peak(hz, 0.11, amp * amp * gain * rolloff * 1.8)
      }
    }

    // Timbre : timbre[1] porte la brillance, timbre[2] l'attaque.
    // On s'en sert pour incliner le spectre plutot que pour inventer des notes.
    const brightness = clamp(seg.timbre[1] / 120, -1, 1)
    const attack = clamp(seg.timbre[2] / 120, -1, 1)
    this.tilt(0.35 + brightness * 0.5)
    this.shelf(4000, gain * (0.18 + Math.max(0, brightness) * 0.5))

    // Percussions : declenchees sur la grille de beats, colorees par l'attaque.
    const beatIdx = findInterval(analysis.beats, t)
    if (beatIdx >= 0 && beatIdx !== this.lastSegment) {
      const beat = analysis.beats[beatIdx]
      const fresh = t - beat.start < 0.06
      if (fresh) {
        this.lastSegment = beatIdx
        this.kickEnv = 0.85 * beat.confidence + 0.15
        if (beatIdx % 2 === 1) this.snareEnv = 0.6 * beat.confidence
        this.hatEnv = 0.35 + Math.max(0, attack) * 0.5
      }
    }
    this.renderDrums(dt, gain)
  }

  // --- Chemin 2 : grille rythmique (tempo + audio features) ----------------

  private renderFromGrid(snap: PlaybackSnapshot, t: number, dt: number) {
    const bpm = snap.tempo > 0 ? snap.tempo : 120
    const beatDur = 60 / bpm
    const beatPos = t / beatDur
    const beatIndex = Math.floor(beatPos)
    const beatPhase = beatPos - beatIndex
    // Mesure reelle (3/4, 4/4, ...) au lieu d'un pattern fige a 4 temps.
    const beatsPerBar = snap.timeSignature >= 2 ? snap.timeSignature : 4
    const beatInBar = ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar

    if (beatIndex !== this.lastSegment) {
      this.lastSegment = beatIndex
      const strong = beatInBar === 0
      this.kickEnv = strong ? 1 : 0.72
      if (beatInBar === Math.floor(beatsPerBar / 2)) this.snareEnv = 0.75
    }
    // Charley sur les croches, plus persistant sur un morceau dansant.
    const dance = clamp(snap.danceability, 0.05, 1)
    if (beatPhase < 0.5 && beatPhase + dt / beatDur >= 0.5) this.hatEnv = 0.2 + dance * 0.5

    const energy = clamp(snap.energy, 0.05, 1)
    // acousticness/instrumentalness deplacent le poids entre percussions
    // synthetiques (morceaux electro/produits) et nappe harmonique (morceaux
    // acoustiques/instrumentaux), plutot qu'un seul melange fixe pour tout.
    const acoustic = clamp(snap.acousticness, 0, 1)
    const instrumental = clamp(snap.instrumentalness, 0, 1)
    // Gain global calibre sur le loudness reel du morceau (LUFS-like, en dB).
    const loudnessGain = clamp(dbToLinear(snap.loudness) * 1.8, 0.35, 1.4)

    // Nappe : plus presente si le morceau est acoustique/instrumental. La
    // largeur (nombre d'harmoniques allumees, donc combien de colonnes hautes
    // s'activent) suit la danceability : un morceau dansant occupe plus de
    // colonnes, un morceau pose reste concentre sur les graves.
    // mode Spotify (0 = mineur, 1 = majeur) incline le registre en plus de la valence.
    const root = 55 * 2 ** ((snap.key >= 0 ? snap.key : 0) / 12) * (snap.mode === 0 ? 0.944 : 1)
    const harmonicPresence = 0.6 + instrumental * 0.5 + acoustic * 0.3
    const harmonicSpread = 4 + Math.round(dance * 8)
    for (let harmonic = 1; harmonic <= harmonicSpread; harmonic++) {
      const wob = 1 + 0.02 * Math.sin(this.phase * (0.7 + harmonic * 0.13))
      const amp =
        (energy * 0.5) / harmonic ** 1.15 +
        0.06 * Math.abs(Math.sin(this.phase * 0.35 + harmonic)) * snap.valence
      this.peak(root * harmonic * wob, 0.13, amp * 0.7 * harmonicPresence * loudnessGain)
    }
    this.shelf(3000, (energy * 0.12 + dance * 0.05) * loudnessGain)
    // Inclinaison spectrale par la valence : un morceau "triste" (valence
    // basse) garde le poids dans les graves, un morceau "joyeux" (valence
    // haute) pousse l'energie vers les colonnes aigues. C'est ce qui fait
    // qu'un autre morceau allume d'autres colonnes, pas juste plus fort/vite.
    this.tilt(0.5 + (snap.valence - 0.5) * 0.7)
    // Presence vocale : la speechiness pousse une bosse dans le medium
    // (voix/paroles), qui n'existe pas sur un morceau instrumental.
    if (snap.speechiness > 0.05) {
      this.peak(1800, 0.6, snap.speechiness * energy * 1.3 * loudnessGain)
    }
    // Percussions attenuees sur les morceaux acoustiques/instrumentaux : elles
    // en ont generalement moins que la pop/electro dansante.
    const drumPresence = 1 - 0.5 * Math.max(acoustic, instrumental)
    this.renderDrums(dt, (0.55 + energy * 0.6) * drumPresence * loudnessGain)
  }

  // --- Percussions communes aux deux chemins -------------------------------

  private renderDrums(dt: number, gain: number) {
    this.kickEnv = decay(this.kickEnv, dt, 0.085)
    this.snareEnv = decay(this.snareEnv, dt, 0.12)
    this.hatEnv = decay(this.hatEnv, dt, 0.045)

    if (this.kickEnv > 0.001) {
      const k = this.kickEnv * gain
      // Le kick balaye vers le bas : plus percussif qu'un simple sinus fixe.
      this.peak(38 + 55 * this.kickEnv, 0.55, k * 2.6)
      this.peak(90, 0.4, k * 0.9)
    }
    if (this.snareEnv > 0.001) {
      const s = this.snareEnv * gain
      this.peak(210, 0.5, s * 0.8)
      this.noise(900, 6000, s * 0.35)
    }
    if (this.hatEnv > 0.001) {
      this.noise(6000, 15000, this.hatEnv * gain * 0.55)
    }
  }

  // --- Primitives de synthese de spectre -----------------------------------

  /** Pic gaussien en echelle log-frequentielle (largeur en octaves). */
  private peak(hz: number, widthOct: number, amp: number) {
    if (amp <= 0 || hz <= 0 || hz >= NYQUIST) return
    const center = Math.log2(hz)
    const inv = 1 / (2 * widthOct * widthOct)
    // On borne la boucle a +/- 3 largeurs : au dela la gaussienne est negligeable.
    const lo = hzToBin(2 ** (center - widthOct * 3))
    const hi = hzToBin(2 ** (center + widthOct * 3))
    for (let i = lo; i <= hi; i++) {
      const d = Math.log2(this.binHz[i]) - center
      this.acc[i] += amp * Math.exp(-d * d * inv)
    }
  }

  /** Bruit large bande entre deux frequences, avec granulation pseudo-aleatoire. */
  private noise(fLo: number, fHi: number, amp: number) {
    if (amp <= 0) return
    const lo = hzToBin(fLo)
    const hi = hzToBin(fHi)
    for (let i = lo; i <= hi; i++) {
      const n = 0.55 + 0.45 * hash(i * 12.9898 + this.phase * 37.719)
      this.acc[i] += amp * n
    }
  }

  /** Plateau au dessus d'une frequence (etage d'aigus). */
  private shelf(fromHz: number, amp: number) {
    if (amp <= 0) return
    const lo = hzToBin(fromHz)
    for (let i = lo; i < BIN_COUNT; i++) {
      this.acc[i] += amp * (1 - (i - lo) / (BIN_COUNT - lo)) ** 1.6
    }
  }

  /** Inclinaison globale du spectre : <0.5 = sombre, >0.5 = brillant. */
  private tilt(amount: number) {
    const slope = (amount - 0.5) * 1.4
    for (let i = 0; i < BIN_COUNT; i++) {
      this.acc[i] *= 1 + slope * (i / BIN_COUNT - 0.5) * 2
      if (this.acc[i] < 0) this.acc[i] = 0
    }
  }

  dispose() {
    /* rien a liberer : pas de ressource navigateur */
  }
}

function hzToBin(hz: number): number {
  return Math.max(0, Math.min(BIN_COUNT - 1, Math.round((hz / NYQUIST) * BIN_COUNT)))
}

/** Recherche dichotomique de l'intervalle contenant `t`. */
function findInterval(list: Array<{ start: number; duration: number }>, t: number): number {
  let lo = 0
  let hi = list.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const item = list[mid]
    if (t < item.start) hi = mid - 1
    else if (t >= item.start + item.duration) lo = mid + 1
    else return mid
  }
  return Math.max(0, Math.min(list.length - 1, hi))
}

function dbToLinear(db: number): number {
  return 10 ** (Math.max(-60, db) / 20)
}

function decay(v: number, dt: number, tau: number): number {
  return v * Math.exp(-dt / tau)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453
  return s - Math.floor(s)
}

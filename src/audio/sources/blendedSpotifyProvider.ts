import type { SpectrumProvider } from '../types'
import type { PlaybackSnapshot } from '../../spotify/types'
import { SpotifyTimelineProvider } from './spotifyTimelineSource'
import { FFT_SIZE } from './analyserProvider'

const BIN_COUNT = FFT_SIZE / 2

/** Poids du signal reel iTunes une fois l'extrait pret ; le reste va a la procedurale. */
const REAL_WEIGHT = 0.6
const PROC_WEIGHT = 1 - REAL_WEIGHT

/**
 * Fusionne FFT reelle (extrait iTunes) et resynthese procedurale plutot que
 * de choisir l'une ou l'autre — cf. LIMITE_SYNCHRONISATION_ITUNES.md.
 *
 * La procedurale ancre le rythme sur le vrai tempo/la vraie position Spotify
 * (jamais desynchronisee, meme si son contenu est invente) ; le signal reel
 * apporte la texture spectrale organique. Le blend amortit les cas ou
 * l'extrait boucle rejoue un passage fort pendant un moment calme du vrai
 * morceau, sans pretendre resoudre la synchronisation qu'on n'a pas les
 * moyens d'obtenir.
 *
 * Deux garde-fous supplementaires, tous les deux bases sur des donnees
 * Spotify fiables (contrairement au contenu spectral instant par instant) :
 *  - `energy` (scalaire par morceau) plafonne le signal reel : un extrait
 *    "fort" ne peut jamais depasser ce que l'energie globale du morceau
 *    rend plausible.
 *  - le volume choisi par l'utilisateur (`getVolume`) module l'intensite
 *    finale, pour coller a ce qu'il entend vraiment (mur discret si le
 *    volume est bas), plutot qu'une intensite deconnectee du son reel.
 */
export class BlendedSpotifyProvider implements SpectrumProvider {
  readonly id = 'spotify-blend'
  readonly sampleRate: number
  readonly binCount = BIN_COUNT

  private real: SpectrumProvider | null = null
  private readonly procedural: SpotifyTimelineProvider
  private readonly procBuf = new Uint8Array(new ArrayBuffer(BIN_COUNT))
  private readonly realBuf = new Uint8Array(new ArrayBuffer(BIN_COUNT))

  constructor(
    private readonly getSnapshot: () => PlaybackSnapshot,
    private readonly getVolume: () => number,
  ) {
    this.procedural = new SpotifyTimelineProvider(getSnapshot)
    this.sampleRate = this.procedural.sampleRate
  }

  get isRealAudio(): boolean {
    return this.real !== null
  }

  get label(): string {
    const snap = this.getSnapshot()
    // Aucune source (Spotify audio-features/analysis fermes, ReccoBeats ET
    // Deezer muets) n'a fourni de tempo reel pour ce morceau : le mur tourne
    // alors sur des valeurs par defaut generiques, pas sur une donnee propre
    // au morceau. On le rend visible plutot que de le cacher derriere un
    // label identique a un morceau avec de vraies donnees.
    const generic = snap.tempoSource === 'inconnu' ? ' (donnees generiques — aucun tempo reel trouve)' : ''
    return (this.real ? `iTunes + Spotify (FFT reelle amortie) — ${this.procedural.label}` : this.procedural.label) + generic
  }

  knownBpm = () => this.procedural.knownBpm()

  /** Branche (ou debranche) le signal reel une fois l'extrait iTunes pret. */
  attachReal(provider: SpectrumProvider | null) {
    if (this.real && this.real !== provider) this.real.dispose()
    this.real = provider
  }

  read(out: Uint8Array<ArrayBuffer>, dt: number): boolean {
    this.procedural.read(this.procBuf, dt)
    const volume = clamp01(this.getVolume())

    if (!this.real || !this.real.read(this.realBuf, dt)) {
      // Meme sans extrait iTunes, le volume choisi par l'utilisateur doit
      // moduler l'intensite du mur — sinon il reste a la meme energie qu'on
      // baisse le son ou pas, ce qui n'a rien "d'accurate".
      for (let i = 0; i < BIN_COUNT; i++) out[i] = Math.round(this.procBuf[i] * volume)
      return true
    }

    const snap = this.getSnapshot()
    const energyCeiling = clamp(0.3 + clamp01(snap.energy) * 0.85, 0.3, 1) * 255

    for (let i = 0; i < BIN_COUNT; i++) {
      const realVal = Math.min(this.realBuf[i], energyCeiling)
      const blended = realVal * REAL_WEIGHT + this.procBuf[i] * PROC_WEIGHT
      out[i] = Math.round(blended * volume)
    }
    return true
  }

  dispose() {
    this.real?.dispose()
    this.procedural.dispose()
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

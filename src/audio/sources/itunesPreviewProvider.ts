import type { PlaybackSnapshot } from '../../spotify/types'
import { AnalyserProvider, makeContext } from './analyserProvider'

/**
 * Les extraits iTunes sont masterises tres fort (loudness quasi 0 dBFS,
 * typique d'un extrait promo). Sans attenuation, la quasi-totalite du
 * spectre tape en permanence le plafond de l'AnalyserNode (`maxDecibels`),
 * meme quand le morceau "sonne" calme sur Spotify — d'ou un mur qui reste
 * scotche en haut. Le GainNode ramene le niveau dans une plage comparable a
 * une capture d'onglet/micro, pour lesquelles le reste du moteur est calibre.
 */
const PREVIEW_ATTENUATION = 0.4

/** Duree du fondu applique en debut/fin de piste, en secondes. */
const FADE_SEC = 4

/**
 * Vraie FFT sur un extrait iTunes (30s, meme master, libre de DRM) — le pivot
 * decrit dans le document de decision : remplace la resynthese procedurale
 * par un signal reel quand un extrait est trouve (cf. `useAudioSource.ts`
 * pour le routage source-reelle / fallback procedural).
 *
 * L'extrait n'est JAMAIS routé vers les enceintes (`ctx.destination`) : le
 * son que l'utilisateur entend reste celui du Web Playback SDK Spotify. On ne
 * se sert du <audio> que comme fournisseur de signal pour l'AnalyserNode.
 *
 * Deux limites structurelles de l'extrait bouclé, compensées ici du mieux
 * possible avec ce qu'on connaît de vrai (position/durée Spotify) :
 *
 *  - L'extrait tourne en boucle sur son propre timer, sans lien natif avec
 *    l'état play/pause de Spotify : `read()` synchronise donc l'élément à
 *    chaque frame (pause/lecture), et renvoie un spectre nul quand Spotify
 *    est en pause.
 *  - L'extrait ne correspond à AUCUNE position précise dans le morceau réel
 *    (souvent un passage fort, joué en boucle) : au début/à la fin de la
 *    piste, la vraie lecture Spotify monte/descend en volume alors que
 *    l'extrait bouclé peut très bien être ailleurs dans son propre cycle. On
 *    applique donc un fondu artificiel calé sur `positionSec`/`durationSec`
 *    (des données Spotify réelles et fiables, contrairement au contenu
 *    spectral instant par instant) pour éviter un mur plein volume sur une
 *    intro/outro qui doit être calme. Les transitions AU MILIEU du morceau
 *    restent en revanche non corrigibles sans signal réel — c'est la limite
 *    de fond de cette approche.
 */
export class ItunesPreviewProvider extends AnalyserProvider {
  constructor(
    ctx: AudioContext,
    input: AudioNode,
    readonly element: HTMLAudioElement,
    label: string,
    private readonly getSnapshot: () => PlaybackSnapshot,
  ) {
    super('itunes-preview', label, ctx, input)
  }

  knownBpm = () => null

  read(out: Uint8Array<ArrayBuffer>): boolean {
    const snap = this.getSnapshot()
    if (snap.playing && this.element.paused) void this.element.play().catch(() => {})
    if (!snap.playing && !this.element.paused) this.element.pause()
    if (!snap.playing) {
      out.fill(0)
      return true
    }

    if (!super.read(out)) return false

    const fade = fadeGain(snap.positionSec, snap.durationSec)
    if (fade < 1) {
      for (let i = 0; i < out.length; i++) out[i] = Math.round(out[i] * fade)
    }
    return true
  }
}

function fadeGain(positionSec: number, durationSec: number): number {
  if (durationSec <= 0) return 1
  const fadeIn = clamp01(positionSec / FADE_SEC)
  const fadeOut = clamp01((durationSec - positionSec) / FADE_SEC)
  return Math.min(fadeIn, fadeOut)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export async function createItunesPreviewSource(
  previewUrl: string,
  label: string,
  getSnapshot: () => PlaybackSnapshot,
): Promise<ItunesPreviewProvider> {
  const element = new Audio(previewUrl)
  element.crossOrigin = 'anonymous'
  element.loop = true

  const ctx = await makeContext()
  const source = ctx.createMediaElementSource(element)
  const gain = ctx.createGain()
  gain.gain.value = PREVIEW_ATTENUATION
  source.connect(gain)
  // Volontairement pas de connexion vers ctx.destination : extrait analyse en
  // silence, jamais entendu (Spotify fournit deja le vrai son a l'utilisateur).

  const provider = new ItunesPreviewProvider(ctx, gain, element, label, getSnapshot)
  provider.onDispose(() => {
    element.pause()
    element.removeAttribute('src')
    element.load()
    source.disconnect()
    gain.disconnect()
  })

  if (getSnapshot().playing) await element.play()
  return provider
}

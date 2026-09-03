import { AnalyserProvider, makeContext } from './analyserProvider'

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
 * L'extrait tourne en boucle sur son propre timer, sans lien natif avec l'etat
 * play/pause de Spotify : `read()` synchronise donc l'element a chaque frame
 * avec `getPlaying()` (pause/lecture, et sortie a zero quand Spotify est en
 * pause) — sinon le mur reste "a fond" meme piste en pause.
 */
export class ItunesPreviewProvider extends AnalyserProvider {
  constructor(
    ctx: AudioContext,
    input: AudioNode,
    readonly element: HTMLAudioElement,
    label: string,
    private readonly getPlaying: () => boolean,
  ) {
    super('itunes-preview', label, ctx, input)
  }

  knownBpm = () => null

  read(out: Uint8Array<ArrayBuffer>): boolean {
    const playing = this.getPlaying()
    if (playing && this.element.paused) void this.element.play().catch(() => {})
    if (!playing && !this.element.paused) this.element.pause()
    if (!playing) {
      out.fill(0)
      return true
    }
    return super.read(out)
  }
}

export async function createItunesPreviewSource(
  previewUrl: string,
  label: string,
  getPlaying: () => boolean,
): Promise<ItunesPreviewProvider> {
  const element = new Audio(previewUrl)
  element.crossOrigin = 'anonymous'
  element.loop = true

  const ctx = await makeContext()
  const node = ctx.createMediaElementSource(element)
  // Volontairement pas de node.connect(ctx.destination) : extrait analyse en
  // silence, jamais entendu (Spotify fournit deja le vrai son a l'utilisateur).

  const provider = new ItunesPreviewProvider(ctx, node, element, label, getPlaying)
  provider.onDispose(() => {
    element.pause()
    element.removeAttribute('src')
    element.load()
    node.disconnect()
  })

  if (getPlaying()) await element.play()
  return provider
}

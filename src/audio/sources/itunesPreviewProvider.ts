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
 */
export class ItunesPreviewProvider extends AnalyserProvider {
  constructor(ctx: AudioContext, input: AudioNode, readonly element: HTMLAudioElement, label: string) {
    super('itunes-preview', label, ctx, input)
  }

  knownBpm = () => null
}

export async function createItunesPreviewSource(
  previewUrl: string,
  label: string,
): Promise<ItunesPreviewProvider> {
  const element = new Audio(previewUrl)
  element.crossOrigin = 'anonymous'
  element.loop = true

  const ctx = await makeContext()
  const node = ctx.createMediaElementSource(element)
  // Volontairement pas de node.connect(ctx.destination) : extrait analyse en
  // silence, jamais entendu (Spotify fournit deja le vrai son a l'utilisateur).

  const provider = new ItunesPreviewProvider(ctx, node, element, label)
  provider.onDispose(() => {
    element.pause()
    element.removeAttribute('src')
    element.load()
    node.disconnect()
  })

  await element.play()
  return provider
}

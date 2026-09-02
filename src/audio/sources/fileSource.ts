import { AnalyserProvider, makeContext } from './analyserProvider'

/**
 * Lecture d'un fichier audio local. Chemin de secours toujours disponible :
 * pas de compte Premium, pas de partage d'onglet, une vraie FFT.
 */
export class FileAudioProvider extends AnalyserProvider {
  constructor(
    ctx: AudioContext,
    input: AudioNode,
    readonly element: HTMLAudioElement,
    readonly fileName: string,
  ) {
    super('file', fileName, ctx, input)
  }

  knownBpm = () => null
}

export async function createFileSource(file: File): Promise<FileAudioProvider> {
  const url = URL.createObjectURL(file)
  const element = new Audio(url)
  element.crossOrigin = 'anonymous'
  element.loop = true

  const ctx = await makeContext()
  const node = ctx.createMediaElementSource(element)
  // On renvoie aussi vers les enceintes, sinon le fichier est analyse en silence.
  node.connect(ctx.destination)

  const provider = new FileAudioProvider(ctx, node, element, file.name)
  provider.onDispose(() => {
    element.pause()
    element.removeAttribute('src')
    element.load()
    URL.revokeObjectURL(url)
    node.disconnect()
  })

  await element.play()
  return provider
}

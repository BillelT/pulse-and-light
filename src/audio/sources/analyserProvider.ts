import type { SpectrumProvider } from '../types'

export const FFT_SIZE = 4096

/**
 * Base commune a toutes les sources "vrai audio" : elle branche un AnalyserNode
 * sur un noeud Web Audio et expose son spectre.
 */
export class AnalyserProvider implements SpectrumProvider {
  readonly isRealAudio = true
  readonly binCount: number
  readonly sampleRate: number

  protected readonly ctx: AudioContext
  protected readonly analyser: AnalyserNode
  private readonly cleanup: Array<() => void> = []

  constructor(
    readonly id: string,
    readonly label: string,
    ctx: AudioContext,
    input: AudioNode,
  ) {
    this.ctx = ctx
    this.sampleRate = ctx.sampleRate
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = FFT_SIZE
    // On fait notre propre lissage (attaque/decay asymetriques) dans le moteur :
    // celui de l'AnalyserNode reste faible pour ne pas ecraser les transitoires.
    this.analyser.smoothingTimeConstant = 0.5
    this.analyser.minDecibels = -95
    this.analyser.maxDecibels = -12
    this.binCount = this.analyser.frequencyBinCount
    input.connect(this.analyser)
    this.cleanup.push(() => {
      try {
        input.disconnect(this.analyser)
      } catch {
        /* deja deconnecte */
      }
    })
  }

  onDispose(fn: () => void) {
    this.cleanup.push(fn)
  }

  read(out: Uint8Array<ArrayBuffer>): boolean {
    if (this.ctx.state === 'closed') return false
    this.analyser.getByteFrequencyData(out)
    return true
  }

  dispose() {
    for (const fn of this.cleanup.splice(0)) {
      try {
        fn()
      } catch {
        /* best effort */
      }
    }
    if (this.ctx.state !== 'closed') void this.ctx.close().catch(() => {})
  }
}

/** Cree (ou reprend) un AudioContext et le reveille si le navigateur l'a suspendu. */
export async function makeContext(): Promise<AudioContext> {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  if (ctx.state === 'suspended') await ctx.resume()
  return ctx
}

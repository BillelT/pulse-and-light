import type { PlaybackSnapshot } from '../../spotify/types'
import { AnalyserProvider, makeContext } from './analyserProvider'

/**
 * iTunes previews are mastered very hot (loudness near 0 dBFS, typical of a
 * promo clip). Without attenuation, nearly the entire spectrum permanently
 * hits the AnalyserNode's ceiling (`maxDecibels`), even when the track
 * "sounds" quiet on Spotify — hence a wall that stays stuck at the top. The
 * GainNode brings the level into a range comparable to a tab/mic capture,
 * for which the rest of the engine is calibrated.
 */
const PREVIEW_ATTENUATION = 0.4

/** Duration of the fade applied at the start/end of the track, in seconds. */
const FADE_SEC = 4

/**
 * Real FFT on an iTunes preview (30s, same master, DRM-free) — the pivot
 * described in the decision document: replaces the procedural resynthesis
 * with a real signal when a preview is found (see `useAudioSource.ts` for
 * the real-source / procedural-fallback routing).
 *
 * The preview is NEVER routed to the speakers (`ctx.destination`): the
 * sound the user hears stays that of the Spotify Web Playback SDK. The
 * <audio> element is only used as a signal source for the AnalyserNode.
 *
 * Two structural limitations of the looped preview, compensated here as
 * best as possible with what's actually known to be real (Spotify
 * position/duration):
 *
 *  - The preview loops on its own timer, with no native link to Spotify's
 *    play/pause state: `read()` therefore syncs the element every frame
 *    (pause/play), and returns a null spectrum when Spotify is paused.
 *  - The preview doesn't correspond to ANY precise position in the real
 *    track (often a strong passage, played on loop): at the start/end of
 *    the track, the real Spotify playback ramps volume up/down while the
 *    looped preview could very well be elsewhere in its own cycle. An
 *    artificial fade is therefore applied, keyed to `positionSec`/
 *    `durationSec` (real and reliable Spotify data, unlike the
 *    instant-by-instant spectral content) to avoid a full-volume wall on
 *    an intro/outro that should be calm. Transitions in the MIDDLE of the
 *    track remain, however, uncorrectable without a real signal — that's
 *    the fundamental limit of this approach.
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
  // Deliberately no connection to ctx.destination: the preview is analyzed
  // silently, never heard (Spotify already provides the real sound to the user).

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

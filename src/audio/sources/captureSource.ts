import { AnalyserProvider, makeContext } from './analyserProvider'

/**
 * System audio capture via `getDisplayMedia`.
 *
 * This is THE path that allows a real FFT on a Spotify stream: the Spotify
 * SDK decodes its track behind EME (DRM), so the sound isn't accessible
 * from Web Audio. By sharing the tab playing the music with "Share tab
 * audio", we get the real signal.
 */
export async function createTabAudioSource(): Promise<AnalyserProvider> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("This browser doesn't support tab capture (getDisplayMedia).")
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    // Chrome requires a video track to offer tab sharing;
    // we stop it right after so nothing gets encoded needlessly.
    video: { width: 1, height: 1, frameRate: 1 },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })

  for (const track of stream.getVideoTracks()) track.stop()

  if (stream.getAudioTracks().length === 0) {
    for (const track of stream.getTracks()) track.stop()
    throw new Error(
      'No audio track shared. Try again and check "Share tab audio".',
    )
  }

  const ctx = await makeContext()
  const node = ctx.createMediaStreamSource(stream)
  const provider = new AnalyserProvider('tab', 'Tab audio', ctx, node)
  provider.onDispose(() => {
    for (const track of stream.getTracks()) track.stop()
    node.disconnect()
  })
  return provider
}

/** Mic capture: works with any source that comes out of the speakers. */
export async function createMicSource(): Promise<AnalyserProvider> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser doesn't support mic capture.")
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Disable all processing: AGC and noise reduction destroy the
      // dynamics needed to drive the lights.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
  const ctx = await makeContext()
  const node = ctx.createMediaStreamSource(stream)
  const provider = new AnalyserProvider('mic', 'Micro', ctx, node)
  provider.onDispose(() => {
    for (const track of stream.getTracks()) track.stop()
    node.disconnect()
  })
  return provider
}

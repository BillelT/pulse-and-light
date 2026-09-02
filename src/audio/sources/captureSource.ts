import { AnalyserProvider, makeContext } from './analyserProvider'

/**
 * Capture de l'audio systeme via `getDisplayMedia`.
 *
 * C'est LE chemin qui permet une vraie FFT sur un flux Spotify : le SDK
 * Spotify decode sa piste derriere l'EME (DRM), donc le son n'est pas
 * accessible depuis Web Audio. En partageant l'onglet qui joue la musique
 * avec "Partager l'audio de l'onglet", on recupere le signal reel.
 */
export async function createTabAudioSource(): Promise<AnalyserProvider> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Ce navigateur ne supporte pas la capture d'onglet (getDisplayMedia).")
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    // Chrome exige une piste video pour proposer le partage d'onglet ;
    // on la coupe juste apres pour ne rien encoder inutilement.
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
      "Aucune piste audio partagee. Relance et coche « Partager l'audio de l'onglet ».",
    )
  }

  const ctx = await makeContext()
  const node = ctx.createMediaStreamSource(stream)
  const provider = new AnalyserProvider('tab', 'Audio de l’onglet', ctx, node)
  provider.onDispose(() => {
    for (const track of stream.getTracks()) track.stop()
    node.disconnect()
  })
  return provider
}

/** Capture micro : marche avec n'importe quelle source qui sort sur les enceintes. */
export async function createMicSource(): Promise<AnalyserProvider> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Ce navigateur ne supporte pas la capture micro.')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Desactive tout traitement : l'AGC et la reduction de bruit detruisent
      // la dynamique dont on a besoin pour piloter les lumieres.
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

import { useStore } from '../state/store'
import type { AudioSourceController } from '../audio/useAudioSource'
import type { SpotifyController } from '../spotify/useSpotify'
import { clientId } from '../spotify/auth'

/**
 * Ecran d'entree. Il n'est pas decoratif : les navigateurs exigent un geste
 * utilisateur avant de demarrer un AudioContext ou une capture, donc il faut
 * de toute facon un premier clic.
 */
export function Splash({
  audio,
  spotify,
  onDismiss,
}: {
  audio: AudioSourceController
  spotify: SpotifyController
  onDismiss: () => void
}) {
  const connected = useStore((s) => Boolean(s.token))
  const configured = clientId().length > 0

  const run = (fn: () => Promise<void> | void) => () => {
    void fn()
    onDismiss()
  }

  return (
    <div className="splash">
      <div className="splash-inner">
        <h1>PULSE &amp; LIGHT</h1>
        <p>
          Un mur de caissons LED qui lit la musique. Choisis d&apos;ou vient le son :
          la scene applique la meme analyse spectrale dans tous les cas.
        </p>
        <div className="btn-row">
          {configured && !connected && (
            <button className="btn btn-primary" onClick={spotify.login}>
              Connecter Spotify
            </button>
          )}
          {connected && (
            <button className="btn btn-primary" onClick={run(() => audio.select('spotify'))}>
              Piloter par la timeline Spotify
            </button>
          )}
          <button className="btn" onClick={run(() => audio.select('tab'))}>
            Capturer l&apos;audio d&apos;un onglet
          </button>
          <button className="btn" onClick={run(() => audio.select('demo'))}>
            Entrer en mode demo
          </button>
          <button className="btn" onClick={onDismiss}>
            Juste regarder la scene
          </button>
        </div>
      </div>
    </div>
  )
}

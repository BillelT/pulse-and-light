import { useStore } from '../state/store'
import type { SpotifyController } from '../spotify/useSpotify'
import { Analyzer } from './Analyzer'

export function Hud({ spotify }: { spotify: SpotifyController }) {
  const panelOpen = useStore((s) => s.panelOpen)
  const togglePanel = useStore((s) => s.togglePanel)

  return (
    <div className="hud">
      <div className="hud-tr">
        <button
          className="icon-btn"
          onClick={togglePanel}
          title={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}
          aria-label={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}
        >
          {panelOpen ? '×' : '⋯'}
        </button>
      </div>

      <Analyzer />
      <NowPlaying spotify={spotify} />
    </div>
  )
}

function NowPlaying({ spotify }: { spotify: SpotifyController }) {
  const snapshot = useStore((s) => s.snapshot)
  const deviceId = useStore((s) => s.deviceId)
  const track = snapshot.track
  if (!track) return null

  const cover = track.album.images.at(-1)?.url ?? track.album.images[0]?.url
  const progress = snapshot.durationSec > 0 ? snapshot.positionSec / snapshot.durationSec : 0

  return (
    <div className="now-playing">
      {cover && <img src={cover} alt="" />}
      <div className="np-text">
        <div className="np-title">{track.name}</div>
        <div className="np-artist">{track.artists.map((a) => a.name).join(', ')}</div>
      </div>
      <div className="np-controls">
        <button onClick={() => void spotify.previous()} disabled={!deviceId} title="Precedent">
          {'⏮'}
        </button>
        <button onClick={() => void spotify.togglePlay()} disabled={!deviceId} title="Lecture / pause">
          {snapshot.playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => void spotify.next()} disabled={!deviceId} title="Suivant">
          {'⏭'}
        </button>
      </div>
      <div className="np-progress">
        <i style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
    </div>
  )
}

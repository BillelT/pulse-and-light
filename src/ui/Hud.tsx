import { useState } from 'react'
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

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function NowPlaying({ spotify }: { spotify: SpotifyController }) {
  const snapshot = useStore((s) => s.snapshot)
  const deviceId = useStore((s) => s.deviceId)
  const track = snapshot.track

  const [seekDrag, setSeekDrag] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.7)
  const [volumeDrag, setVolumeDrag] = useState<number | null>(null)

  if (!track) return null

  const cover = track.album.images.at(-1)?.url ?? track.album.images[0]?.url
  const duration = snapshot.durationSec
  const position = seekDrag ?? Math.min(snapshot.positionSec, duration || snapshot.positionSec)
  const displayVolume = volumeDrag ?? volume

  return (
    <div className="now-playing">
      <div className="np-row">
        {cover && <img src={cover} alt="" />}
        <div className="np-text">
          <div className="np-title">{track.name}</div>
          <div className="np-artist">{track.artists.map((a) => a.name).join(', ')}</div>
        </div>
        <div className="np-controls">
          <button onClick={() => void spotify.previous()} disabled={!deviceId} title="Precedent">
            {'⏮'}
          </button>
          <button
            onClick={() => void spotify.togglePlay()}
            disabled={!deviceId}
            title="Lecture / pause"
          >
            {snapshot.playing ? '⏸' : '▶'}
          </button>
          <button onClick={() => void spotify.next()} disabled={!deviceId} title="Suivant">
            {'⏭'}
          </button>
        </div>
      </div>

      <div className="np-seekrow">
        <span className="np-time">{formatTime(position)}</span>
        <input
          type="range"
          className="np-seek"
          min={0}
          max={duration > 0 ? duration : 1}
          step={1}
          value={position}
          disabled={!deviceId || duration <= 0}
          onChange={(e) => setSeekDrag(Number(e.target.value))}
          onMouseUp={(e) => {
            const v = Number((e.target as HTMLInputElement).value)
            setSeekDrag(null)
            void spotify.seek(v)
          }}
          onTouchEnd={(e) => {
            const v = Number((e.target as HTMLInputElement).value)
            setSeekDrag(null)
            void spotify.seek(v)
          }}
        />
        <span className="np-time">{formatTime(duration)}</span>
      </div>

      <div className="np-volrow">
        <span className="np-vol-icon">{displayVolume === 0 ? '🔇' : '🔊'}</span>
        <input
          type="range"
          className="np-vol"
          min={0}
          max={1}
          step={0.01}
          value={displayVolume}
          disabled={!deviceId}
          onChange={(e) => {
            const v = Number(e.target.value)
            setVolumeDrag(v)
            setVolume(v)
            void spotify.setVolume(v)
          }}
          onMouseUp={() => setVolumeDrag(null)}
          onTouchEnd={() => setVolumeDrag(null)}
        />
      </div>
    </div>
  )
}

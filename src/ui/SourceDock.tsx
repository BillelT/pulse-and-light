import { useState } from 'react'
import { useStore } from '../state/store'
import type { AudioSourceController } from '../audio/useAudioSource'
import type { SpotifyController } from '../spotify/useSpotify'
import { formatTime } from './controls'

type Mode = 'spotify' | 'mic' | 'tab'

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'mic', label: 'Microphone' },
  { id: 'tab', label: 'Onglet' },
]

/**
 * Dock flottant, seule UI visible en production : choix de la source audio
 * (Spotify / micro / onglet) et ses reglages associes, en "liquid glass"
 * (le panneau lateral complet — reglages lumiere, debug — reste reserve au
 * developpement, cf. Panel).
 */
export function SourceDock({
  audio,
  spotify,
}: {
  audio: AudioSourceController
  spotify: SpotifyController
}) {
  const sourceKind = useStore((s) => s.sourceKind)
  const [mode, setMode] = useState<Mode>('spotify')

  const selectMode = (m: Mode) => {
    setMode(m)
    void audio.select(m)
  }

  return (
    <div className="dock">
      <div className="dock-modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className="dock-mode"
            data-active={mode === m.id}
            onClick={() => selectMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="dock-body">
        {mode === 'spotify' && <SpotifyDock spotify={spotify} />}
        {mode === 'mic' && (
          <div className="dock-hint">
            {sourceKind === 'mic'
              ? 'Micro actif — capte ce qui sort des enceintes.'
              : 'Active le micro pour analyser le son de la piece.'}
          </div>
        )}
        {mode === 'tab' && (
          <div className="dock-hint">
            {sourceKind === 'tab'
              ? "Audio de l'onglet actif."
              : "Choisis l'onglet Spotify et coche « Partager l'audio de l'onglet » (Chrome / Edge)."}
          </div>
        )}
      </div>
    </div>
  )
}

function SpotifyDock({ spotify }: { spotify: SpotifyController }) {
  const token = useStore((s) => s.token)
  const snapshot = useStore((s) => s.snapshot)
  const deviceId = useStore((s) => s.deviceId)
  const track = snapshot.track

  const [seekDrag, setSeekDrag] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.7)
  const [volumeDrag, setVolumeDrag] = useState<number | null>(null)

  if (!token) {
    return (
      <div className="dock-hint">
        <button className="dock-connect" onClick={spotify.login}>
          Se connecter a Spotify
        </button>
      </div>
    )
  }

  if (!track) {
    return <div className="dock-hint">Rien en lecture sur ce device.</div>
  }

  const cover = track.album.images.at(-1)?.url ?? track.album.images[0]?.url
  const duration = snapshot.durationSec
  const position = seekDrag ?? Math.min(snapshot.positionSec, duration || snapshot.positionSec)
  const displayVolume = volumeDrag ?? volume

  return (
    <div>
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

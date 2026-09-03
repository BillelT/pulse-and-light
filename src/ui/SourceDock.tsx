import { useState } from 'react'
import { useStore } from '../state/store'
import type { AudioSourceController } from '../audio/useAudioSource'
import type { SpotifyController } from '../spotify/useSpotify'
import type { SpotifyTrack } from '../spotify/types'
import { formatTime } from './controls'
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, SearchIcon, SpeakerIcon } from './icons'

type Mode = 'spotify' | 'mic' | 'tab'

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'mic', label: 'Microphone' },
  { id: 'tab', label: 'Onglet' },
]

/** Degrade "piste jouee / restante" pour un slider, dans le style Apple Music. */
function trackGradient(pct: number): string {
  const p = Math.max(0, Math.min(100, pct))
  return `linear-gradient(to right, #fff ${p}%, rgba(255, 255, 255, 0.22) ${p}%)`
}

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
  const spotifyError = useStore((s) => s.spotifyError)
  const track = snapshot.track

  const [seekDrag, setSeekDrag] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.7)
  const [volumeDrag, setVolumeDrag] = useState<number | null>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyTrack[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  if (!token) {
    return (
      <div className="dock-hint">
        <button className="dock-connect" onClick={spotify.login}>
          Se connecter a Spotify
        </button>
      </div>
    )
  }

  const cover = track?.album.images.at(-1)?.url ?? track?.album.images[0]?.url
  const duration = snapshot.durationSec
  const position = seekDrag ?? Math.min(snapshot.positionSec, duration || snapshot.positionSec)
  const displayVolume = volumeDrag ?? volume
  const seekPct = duration > 0 ? (position / duration) * 100 : 0

  const runSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    try {
      setResults(await spotify.search(q))
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  const toggleSearch = () => {
    setSearchOpen((open) => !open)
    if (searchOpen) {
      setQuery('')
      setResults([])
      setSearched(false)
    }
  }

  return (
    <div className="dock-playback">
      <div className="np-row">
        {cover && <img src={cover} alt="" />}
        <div className="np-text">
          <div className="np-title">{track ? track.name : 'Rien en lecture'}</div>
          <div className="np-artist">
            {track ? track.artists.map((a) => a.name).join(', ') : 'Cherche un morceau'}
          </div>
        </div>
        <div className="np-controls">
          <button
            onClick={toggleSearch}
            className={searchOpen ? 'np-search-active' : undefined}
            title="Chercher un morceau"
          >
            <SearchIcon size={14} />
          </button>
          {track && (
            <>
              <button onClick={() => void spotify.previous()} disabled={!deviceId} title="Precedent">
                <PrevIcon size={13} />
              </button>
              <button
                className="np-play"
                onClick={() => void spotify.togglePlay()}
                disabled={!deviceId}
                title="Lecture / pause"
              >
                {snapshot.playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
              </button>
              <button onClick={() => void spotify.next()} disabled={!deviceId} title="Suivant">
                <NextIcon size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {track && (
        <>
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
              style={{ background: trackGradient(seekPct) }}
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
            <span className="np-time np-time-end">{formatTime(duration)}</span>
          </div>

          <div className="np-volrow">
            <span className="np-vol-icon">
              <SpeakerIcon size={16} muted={displayVolume === 0} />
            </span>
            <input
              type="range"
              className="np-vol"
              min={0}
              max={1}
              step={0.01}
              value={displayVolume}
              disabled={!deviceId}
              style={{ background: trackGradient(displayVolume * 100) }}
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
        </>
      )}

      {searchOpen && (
        <div className="np-search">
          <input
            type="search"
            autoFocus
            placeholder="titre, artiste…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch()
            }}
          />
          <button onClick={() => void runSearch()} disabled={searching || !query.trim()}>
            {searching ? '…' : 'OK'}
          </button>
        </div>
      )}

      {searchOpen && !deviceId && (
        <div className="np-search-note">
          Lecteur Spotify indisponible — un compte Premium est requis pour lancer un morceau.
        </div>
      )}

      {searchOpen && spotifyError && <div className="np-search-note np-search-note-error">{spotifyError}</div>}

      {searchOpen && searched && !searching && results.length === 0 && !spotifyError && (
        <div className="np-search-note">Aucun resultat pour « {query.trim()} ».</div>
      )}

      {searchOpen && results.length > 0 && (
        <div className="np-search-results">
          {results.map((t) => (
            <button
              key={t.uri}
              className="np-search-result"
              onClick={() => {
                void spotify.playTrack(t.uri)
                setSearchOpen(false)
                setQuery('')
                setResults([])
                setSearched(false)
              }}
              disabled={!deviceId}
              title={deviceId ? 'Lancer sur ce device' : 'Lecteur Spotify indisponible'}
            >
              {t.album.images.at(-1)?.url && <img src={t.album.images.at(-1)!.url} alt="" />}
              <div className="np-search-result-text">
                <div className="np-search-result-title">{t.name}</div>
                <div className="np-search-result-artist">
                  {t.artists.map((a) => a.name).join(', ')}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

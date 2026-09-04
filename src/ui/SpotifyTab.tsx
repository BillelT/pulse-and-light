import { useState } from 'react'
import { useStore } from '../state/store'
import { clientId, redirectUri } from '../spotify/auth'
import type { SpotifyController } from '../spotify/useSpotify'
import type { PlaybackSnapshot, SpotifyTrack } from '../spotify/types'
import { Kv, Section } from './controls'

const TEMPO_SOURCE_LABEL: Record<PlaybackSnapshot['tempoSource'], string> = {
  analysis: '',
  features: '',
  reccobeats: ' (via ReccoBeats)',
  deezer: ' (via Deezer)',
  inconnu: '',
}

const SDK_LABEL: Record<string, string> = {
  idle: 'idle',
  loading: 'connecting…',
  ready: 'ready',
  unsupported: 'unsupported',
  'needs-premium': 'Premium required',
  error: 'error',
}

export function SpotifyTab({ spotify }: { spotify: SpotifyController }) {
  const token = useStore((s) => s.token)
  const user = useStore((s) => s.user)
  const deviceId = useStore((s) => s.deviceId)
  const sdkStatus = useStore((s) => s.sdkStatus)
  const error = useStore((s) => s.spotifyError)
  const snapshot = useStore((s) => s.snapshot)
  const analysisAvailable = useStore((s) => s.analysisAvailable)
  const featuresAvailable = useStore((s) => s.featuresAvailable)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyTrack[]>([])
  const [searching, setSearching] = useState(false)

  const configured = clientId().length > 0

  if (!configured) {
    return (
      <Section title="Configuration required">
        <div className="note note-warn">
          No <code>VITE_SPOTIFY_CLIENT_ID</code> in the environment.
          <br />
          <br />
          1. Create an app on <b>developer.spotify.com/dashboard</b>.
          <br />
          2. Add the Redirect URI: <code>{redirectUri()}</code>
          <br />
          3. Copy <code>.env.example</code> to <code>.env</code>, paste the Client ID,
          restart <code>npm run dev</code>.
          <br />
          <br />
          No client secret needed: the app uses the PKCE flow.
        </div>
      </Section>
    )
  }

  if (!token) {
    return (
      <>
        <Section title="Account">
          <button className="btn btn-primary" onClick={spotify.login}>
            Connect to Spotify
          </button>
          <div className="field-hint" style={{ marginTop: 8 }}>
            In-app playback requires a <b>Premium</b> account (a Web Playback SDK
            constraint). With a free account, connecting is still useful for metadata:
            play the music from the Spotify app and capture the tab's or the
            microphone's audio.
          </div>
        </Section>
        {error && <div className="note note-error">{error}</div>}
      </>
    )
  }

  const runSearch = async () => {
    setSearching(true)
    try {
      setResults(await spotify.search(query))
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div>
      <Section title="Account">
        <Kv k="User" v={user?.display_name ?? user?.id ?? '—'} />
        <Kv k="Subscription" v={user?.product ?? '—'} />
        <Kv k="Player" v={SDK_LABEL[sdkStatus] ?? sdkStatus} />
        <Kv k="Device" v={deviceId ? deviceId.slice(0, 10) + '…' : '—'} />
        <button className="btn" style={{ marginTop: 8 }} onClick={spotify.logout}>
          Log out
        </button>
      </Section>

      {error && <div className="note note-error" style={{ marginBottom: 16 }}>{error}</div>}

      <Section title="Now playing">
        {snapshot.track ? (
          <>
            <Kv k="Title" v={snapshot.track.name} />
            <Kv
              k="Tempo"
              v={
                snapshot.tempo > 0
                  ? `${snapshot.tempo.toFixed(1)} BPM${TEMPO_SOURCE_LABEL[snapshot.tempoSource]}`
                  : 'unknown'
              }
            />
            <Kv k="Key" v={keyName(snapshot.key, snapshot.mode)} />
            <Kv
              k="Audio Features"
              v={featuresAvailable === null ? '—' : featuresAvailable ? 'available' : 'unavailable'}
            />
            <Kv
              k="Audio Analysis"
              v={analysisAvailable === null ? '—' : analysisAvailable ? 'available' : 'unavailable'}
            />
            {analysisAvailable === false && (
              <div className="note note-warn" style={{ marginTop: 8 }}>
                Spotify restricted <code>/audio-features</code> and <code>/audio-analysis</code>
                &nbsp;to apps created before November 2024: a new app gets a 403.
                The tempo then falls back to Deezer (public catalog) when the track is
                found there; otherwise the scene falls back to the default rhythmic grid — or,
                better, to capturing the tab's audio.
              </div>
            )}
          </>
        ) : (
          <div className="field-hint">Nothing playing on this device.</div>
        )}
      </Section>

      <Section title="Search for a track">
        <input
          type="search"
          placeholder="title, artist…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch()
          }}
        />
        <button
          className="btn"
          style={{ marginTop: 6 }}
          onClick={() => void runSearch()}
          disabled={searching || !query.trim()}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        {results.length > 0 && (
          <div className="results">
            {results.map((track) => (
              <button
                key={track.uri}
                className="result"
                onClick={() => void spotify.playTrack(track.uri)}
                disabled={!deviceId}
                title={deviceId ? 'Play on this device' : 'Spotify player unavailable'}
              >
                {track.album.images.at(-1)?.url && (
                  <img src={track.album.images.at(-1)!.url} alt="" />
                )}
                <div className="result-text">
                  <div className="result-title">{track.name}</div>
                  <div className="result-artist">
                    {track.artists.map((a) => a.name).join(', ')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function keyName(key: number, mode: number): string {
  if (key < 0 || key > 11) return 'unknown'
  return `${NOTES[key]} ${mode === 0 ? 'min' : 'maj'}`
}

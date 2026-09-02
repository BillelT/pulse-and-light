import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { clientId, redirectUri } from '../spotify/auth'
import type { SpotifyController } from '../spotify/useSpotify'
import type { SpotifyTrack } from '../spotify/types'
import { Kv, Section } from './controls'

const SDK_LABEL: Record<string, string> = {
  idle: 'inactif',
  loading: 'connexion…',
  ready: 'pret',
  unsupported: 'non supporte',
  'needs-premium': 'Premium requis',
  error: 'erreur',
}

export function SpotifyTab({ spotify }: { spotify: SpotifyController }) {
  const token = useStore((s) => s.token)
  const user = useStore((s) => s.user)
  const deviceId = useStore((s) => s.deviceId)
  const sdkStatus = useStore((s) => s.sdkStatus)
  const error = useStore((s) => s.spotifyError)
  const snapshot = useStore((s) => s.snapshot)
  const analysisAvailable = useStore((s) => s.analysisAvailable)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpotifyTrack[]>([])
  const [searching, setSearching] = useState(false)

  const configured = clientId().length > 0

  if (!configured) {
    return (
      <Section title="Configuration requise">
        <div className="note note-warn">
          Aucun <code>VITE_SPOTIFY_CLIENT_ID</code> dans l&apos;environnement.
          <br />
          <br />
          1. Cree une app sur <b>developer.spotify.com/dashboard</b>.
          <br />
          2. Ajoute la Redirect URI : <code>{redirectUri()}</code>
          <br />
          3. Copie <code>.env.example</code> en <code>.env</code>, colle le Client ID,
          relance <code>npm run dev</code>.
          <br />
          <br />
          Aucun client secret n&apos;est necessaire : l&apos;app utilise le flow PKCE.
        </div>
      </Section>
    )
  }

  if (!token) {
    return (
      <>
        <Section title="Compte">
          <button className="btn btn-primary" onClick={spotify.login}>
            Se connecter a Spotify
          </button>
          <div className="field-hint" style={{ marginTop: 8 }}>
            La lecture in-app demande un compte <b>Premium</b> (contrainte du Web Playback
            SDK). Avec un compte gratuit, la connexion sert quand meme aux metadonnees :
            lance la musique depuis l&apos;app Spotify et capture l&apos;audio de
            l&apos;onglet ou du micro.
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
      <Section title="Compte">
        <Kv k="Utilisateur" v={user?.display_name ?? user?.id ?? '—'} />
        <Kv k="Abonnement" v={user?.product ?? '—'} />
        <Kv k="Lecteur" v={SDK_LABEL[sdkStatus] ?? sdkStatus} />
        <Kv k="Device" v={deviceId ? deviceId.slice(0, 10) + '…' : '—'} />
        <button className="btn" style={{ marginTop: 8 }} onClick={spotify.logout}>
          Deconnexion
        </button>
      </Section>

      {error && <div className="note note-error" style={{ marginBottom: 16 }}>{error}</div>}

      <Section title="Lecture">
        <PlaybackControls spotify={spotify} deviceId={deviceId} />
      </Section>

      <Section title="Piste en cours">
        {snapshot.track ? (
          <>
            <Kv k="Titre" v={snapshot.track.name} />
            <Kv k="Tempo" v={snapshot.tempo > 0 ? `${snapshot.tempo.toFixed(1)} BPM` : 'inconnu'} />
            <Kv k="Tonalite" v={keyName(snapshot.key, snapshot.mode)} />
            <Kv
              k="Audio Analysis"
              v={analysisAvailable === null ? '—' : analysisAvailable ? 'disponible' : 'indisponible'}
            />
            {analysisAvailable === false && (
              <div className="note note-warn" style={{ marginTop: 8 }}>
                Spotify a restreint <code>/audio-features</code> et <code>/audio-analysis</code>
                &nbsp;aux apps creees avant novembre 2024 : une nouvelle app recoit un 403.
                La scene bascule automatiquement sur la grille rythmique — ou, mieux, sur la
                capture de l&apos;audio de l&apos;onglet.
              </div>
            )}
          </>
        ) : (
          <div className="field-hint">Rien en lecture sur ce device.</div>
        )}
      </Section>

      <Section title="Chercher un morceau">
        <input
          type="search"
          placeholder="titre, artiste…"
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
          {searching ? 'Recherche…' : 'Rechercher'}
        </button>
        {results.length > 0 && (
          <div className="results">
            {results.map((track) => (
              <button
                key={track.uri}
                className="result"
                onClick={() => void spotify.playTrack(track.uri)}
                disabled={!deviceId}
                title={deviceId ? 'Lancer sur ce device' : 'Lecteur Spotify indisponible'}
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

const NOTES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']

function keyName(key: number, mode: number): string {
  if (key < 0 || key > 11) return 'inconnue'
  return `${NOTES[key]} ${mode === 0 ? 'min' : 'maj'}`
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Transport (lecture/pause, precedent/suivant), timeline seekable et volume. */
function PlaybackControls({
  spotify,
  deviceId,
}: {
  spotify: SpotifyController
  deviceId: string | null
}) {
  const snapshot = useStore((s) => s.snapshot)
  const track = snapshot.track

  // Position affichee : celle du store, sauf pendant un drag de la timeline.
  const [seekDrag, setSeekDrag] = useState<number | null>(null)
  const [volume, setVolume] = useState(0.7)
  const [volumeDrag, setVolumeDrag] = useState<number | null>(null)

  useEffect(() => {
    if (seekDrag !== null && !track) setSeekDrag(null)
  }, [seekDrag, track])

  if (!track) {
    return <div className="field-hint">Rien en lecture sur ce device.</div>
  }

  const duration = snapshot.durationSec
  const position = seekDrag ?? Math.min(snapshot.positionSec, duration || snapshot.positionSec)
  const displayVolume = volumeDrag ?? volume

  return (
    <div className="playback-controls">
      <div className="np-controls" style={{ marginBottom: 10 }}>
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

      <div className="field">
        <input
          type="range"
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
        <div className="field-head">
          <span>{formatTime(position)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="field">
        <div className="field-head">
          <span>Volume</span>
          <b>{Math.round(displayVolume * 100)}%</b>
        </div>
        <input
          type="range"
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

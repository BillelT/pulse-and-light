import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import {
  beginLogin,
  consumeRedirect,
  ensureFresh,
  loadToken,
  logout as clearToken,
  type StoredToken,
} from './auth'
import * as api from './api'
import type { AudioAnalysis, PlaybackSnapshot, SpotifyTrack } from './types'
import { EMPTY_SNAPSHOT } from './types'

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'
const PLAYER_NAME = 'PULSE & LIGHT'

let sdkPromise: Promise<typeof Spotify> | null = null

/** Charge le script du Web Playback SDK une seule fois par page. */
function loadSdk(): Promise<typeof Spotify> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve(window.Spotify)
      return
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify)
      else reject(new Error('SDK Spotify charge mais indisponible.'))
    }
    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.onerror = () => reject(new Error('Impossible de charger le SDK Spotify.'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

/** Horloge de lecture : le SDK ne publie un etat que sur evenement, pas a 60 fps. */
interface Clock {
  positionMs: number
  updatedAt: number
  playing: boolean
}

export interface SpotifyController {
  login: () => void
  logout: () => void
  togglePlay: () => Promise<void>
  next: () => Promise<void>
  previous: () => Promise<void>
  seek: (sec: number) => Promise<void>
  setVolume: (v: number) => Promise<void>
  search: (q: string) => Promise<SpotifyTrack[]>
  playTrack: (uri: string) => Promise<void>
  /** Snapshot vivant, lu a chaque frame sans re-render. */
  readSnapshot: () => PlaybackSnapshot
  busy: boolean
}

export function useSpotify(): SpotifyController {
  const setToken = useStore((s) => s.setToken)
  const setUser = useStore((s) => s.setUser)
  const setDeviceId = useStore((s) => s.setDeviceId)
  const setSdkStatus = useStore((s) => s.setSdkStatus)
  const setSpotifyError = useStore((s) => s.setSpotifyError)
  const setSnapshot = useStore((s) => s.setSnapshot)
  const setAnalysisAvailable = useStore((s) => s.setAnalysisAvailable)

  const [busy, setBusy] = useState(false)

  const tokenRef = useRef<StoredToken | null>(null)
  const playerRef = useRef<Spotify.Player | null>(null)
  const deviceRef = useRef<string | null>(null)
  const clockRef = useRef<Clock>({ positionMs: 0, updatedAt: performance.now(), playing: false })
  const snapshotRef = useRef<PlaybackSnapshot>({ ...EMPTY_SNAPSHOT })
  const trackIdRef = useRef<string | null>(null)
  const analysisRef = useRef<AudioAnalysis | null>(null)

  /** Token frais a la demande — utilise par le SDK et par tous les appels API. */
  const freshToken = useCallback(async (): Promise<string> => {
    const current = tokenRef.current
    if (!current) throw new Error('Non connecte a Spotify.')
    const next = await ensureFresh(current)
    if (next !== current) {
      tokenRef.current = next
      setToken(next)
    }
    return next.accessToken
  }, [setToken])

  /** Recopie l'etat interne dans le store (pour l'UI React). */
  const publish = useCallback(
    (patch: Partial<PlaybackSnapshot>) => {
      snapshotRef.current = { ...snapshotRef.current, ...patch }
      setSnapshot(snapshotRef.current)
    },
    [setSnapshot],
  )

  /** Charge les metadonnees analytiques d'une piste (best effort). */
  const loadTrackAnalysis = useCallback(
    async (trackId: string | null) => {
      analysisRef.current = null
      if (!trackId) {
        setAnalysisAvailable(null)
        publish({ analysis: null, tempo: 0, key: -1 })
        return
      }
      try {
        const token = await freshToken()
        const [features, analysis] = await Promise.all([
          api.getAudioFeatures(token, trackId),
          api.getAudioAnalysis(token, trackId),
        ])
        // La piste a pu changer pendant la requete.
        if (trackIdRef.current !== trackId) return
        analysisRef.current = analysis
        setAnalysisAvailable(Boolean(analysis))
        publish({
          analysis,
          tempo: features?.tempo ?? analysis?.track.tempo ?? 0,
          energy: features?.energy ?? 0.6,
          danceability: features?.danceability ?? 0.6,
          valence: features?.valence ?? 0.5,
          key: features?.key ?? analysis?.track.key ?? -1,
          mode: features?.mode ?? analysis?.track.mode ?? 1,
        })
      } catch {
        // Endpoints deprecies / restreints : la scene continue sur la grille.
        if (trackIdRef.current === trackId) setAnalysisAvailable(false)
      }
    },
    [freshToken, publish, setAnalysisAvailable],
  )

  const onPlayerState = useCallback(
    (state: Spotify.PlaybackState | null) => {
      if (!state) {
        clockRef.current = { positionMs: 0, updatedAt: performance.now(), playing: false }
        publish({ playing: false })
        return
      }
      const t = state.track_window.current_track
      clockRef.current = {
        positionMs: state.position,
        updatedAt: performance.now(),
        playing: !state.paused,
      }
      const track: SpotifyTrack = {
        id: t.id,
        uri: t.uri,
        name: t.name,
        duration_ms: t.duration_ms,
        artists: t.artists.map((a) => ({ id: a.uri, name: a.name })),
        album: { name: t.album.name, images: t.album.images as SpotifyTrack['album']['images'] },
      }
      publish({
        connected: true,
        playing: !state.paused,
        track,
        durationSec: state.duration / 1000,
        positionSec: state.position / 1000,
      })
      if (t.id !== trackIdRef.current) {
        trackIdRef.current = t.id
        void loadTrackAnalysis(t.id)
      }
    },
    [loadTrackAnalysis, publish],
  )

  // --- Recuperation du token au montage (retour de redirection ou storage) ---
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let token: StoredToken | null = null
      try {
        token = await consumeRedirect()
      } catch (err) {
        if (!cancelled) setSpotifyError(err instanceof Error ? err.message : String(err))
      }
      token ??= loadToken()
      if (cancelled || !token) return
      tokenRef.current = token
      setToken(token)
      try {
        const fresh = await ensureFresh(token)
        tokenRef.current = fresh
        setToken(fresh)
        const me = await api.getMe(fresh.accessToken)
        if (cancelled) return
        setUser(me)
        if (me && me.product !== 'premium') {
          setSdkStatus('needs-premium')
          setSpotifyError(
            'Le Web Playback SDK exige un compte Spotify Premium. La connexion reste utile pour lire les metadonnees, mais la lecture doit se faire depuis une autre app.',
          )
        }
      } catch (err) {
        if (!cancelled) {
          setSpotifyError(err instanceof Error ? err.message : String(err))
          tokenRef.current = null
          setToken(null)
          clearToken()
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setSdkStatus, setSpotifyError, setToken, setUser])

  // --- Initialisation du lecteur une fois le token en place ---
  const token = useStore((s) => s.token)
  const user = useStore((s) => s.user)
  useEffect(() => {
    if (!token || !user || user.product !== 'premium') return
    let disposed = false
    setSdkStatus('loading')

    void (async () => {
      try {
        const sdk = await loadSdk()
        if (disposed) return
        const player = new sdk.Player({
          name: PLAYER_NAME,
          volume: 0.7,
          getOAuthToken: (cb) => {
            void freshToken().then(cb).catch(() => {})
          },
        })

        player.addListener('ready', ({ device_id }) => {
          deviceRef.current = device_id
          setDeviceId(device_id)
          setSdkStatus('ready')
          publish({ connected: true })
          // Transfert sans lancer la lecture : l'utilisateur garde la main.
          void freshToken()
            .then((t) => api.transferPlayback(t, device_id, false))
            .catch(() => {})
        })
        player.addListener('not_ready', () => {
          deviceRef.current = null
          setDeviceId(null)
          publish({ connected: false, playing: false })
        })
        player.addListener('player_state_changed', onPlayerState)
        player.addListener('initialization_error', (e) => {
          setSdkStatus('unsupported')
          setSpotifyError(e.message)
        })
        player.addListener('authentication_error', (e) => {
          setSdkStatus('error')
          setSpotifyError(`Authentification refusee : ${e.message}`)
        })
        player.addListener('account_error', () => {
          setSdkStatus('needs-premium')
          setSpotifyError('Compte non Premium : la lecture in-app est indisponible.')
        })
        player.addListener('playback_error', (e) => setSpotifyError(e.message))

        const ok = await player.connect()
        if (!ok && !disposed) {
          setSdkStatus('error')
          setSpotifyError('Le lecteur Spotify n’a pas pu se connecter.')
        }
        playerRef.current = player
      } catch (err) {
        if (!disposed) {
          setSdkStatus('error')
          setSpotifyError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      disposed = true
      playerRef.current?.disconnect()
      playerRef.current = null
    }
  }, [token, user, freshToken, onPlayerState, publish, setDeviceId, setSdkStatus, setSpotifyError])

  // --- Extrapolation de la position entre deux evenements du SDK ---
  useEffect(() => {
    const id = window.setInterval(() => {
      const clock = clockRef.current
      if (!clock.playing) return
      const elapsed = (performance.now() - clock.updatedAt) / 1000
      snapshotRef.current = {
        ...snapshotRef.current,
        positionSec: clock.positionMs / 1000 + elapsed,
      }
      setSnapshot(snapshotRef.current)
    }, 250)
    return () => window.clearInterval(id)
  }, [setSnapshot])

  // --- Actions ---
  const guard = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      setSpotifyError(null)
    } catch (err) {
      setSpotifyError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [setSpotifyError])

  const readSnapshot = useCallback((): PlaybackSnapshot => {
    const clock = clockRef.current
    const base = snapshotRef.current
    if (!clock.playing) return base
    const elapsed = (performance.now() - clock.updatedAt) / 1000
    // On ne remplace que la position : l'objet reste stable pour le reste.
    return { ...base, positionSec: clock.positionMs / 1000 + elapsed, analysis: analysisRef.current }
  }, [])

  return {
    busy,
    readSnapshot,
    login: () => {
      beginLogin().catch((err: unknown) =>
        setSpotifyError(err instanceof Error ? err.message : String(err)),
      )
    },
    logout: () => {
      playerRef.current?.disconnect()
      playerRef.current = null
      deviceRef.current = null
      tokenRef.current = null
      snapshotRef.current = { ...EMPTY_SNAPSHOT }
      analysisRef.current = null
      trackIdRef.current = null
      clearToken()
      setToken(null)
      setUser(null)
      setDeviceId(null)
      setSdkStatus('idle')
      setSpotifyError(null)
      setAnalysisAvailable(null)
      setSnapshot({ ...EMPTY_SNAPSHOT })
    },
    togglePlay: () =>
      guard(async () => {
        const player = playerRef.current
        if (!player) throw new Error('Lecteur indisponible.')
        // Requis par les politiques d'autoplay : lie la lecture a un geste.
        await player.activateElement().catch(() => {})
        await player.togglePlay()
      }),
    next: () => guard(async () => { await playerRef.current?.nextTrack() }),
    previous: () => guard(async () => { await playerRef.current?.previousTrack() }),
    seek: (sec) => guard(async () => { await playerRef.current?.seek(Math.max(0, sec) * 1000) }),
    setVolume: (v) => guard(async () => { await playerRef.current?.setVolume(v) }),
    search: async (q: string) => {
      if (!q.trim()) return []
      try {
        const t = await freshToken()
        const res = await api.searchTracks(t, q)
        setSpotifyError(null)
        return res?.tracks.items ?? []
      } catch (err) {
        setSpotifyError(err instanceof Error ? err.message : String(err))
        return []
      }
    },
    playTrack: (uri: string) =>
      guard(async () => {
        const device = deviceRef.current
        if (!device) throw new Error('Aucun device Spotify actif.')
        await playerRef.current?.activateElement().catch(() => {})
        const t = await freshToken()
        await api.play(t, device, [uri])
      }),
  }
}

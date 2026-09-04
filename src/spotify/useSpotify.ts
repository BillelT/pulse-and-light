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
import { getTrackFeatures } from './trackFeatures'
import { getItunesPreview } from './itunesPreview'
import type { AudioAnalysis, AudioFeatures, PlaybackSnapshot, SpotifyTrack } from './types'
import { EMPTY_SNAPSHOT } from './types'

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'
const PLAYER_NAME = 'PULSE & LIGHT'

let sdkPromise: Promise<typeof Spotify> | null = null

/** Loads the Web Playback SDK script only once per page. */
function loadSdk(): Promise<typeof Spotify> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve(window.Spotify)
      return
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify)
      else reject(new Error('Spotify SDK loaded but unavailable.'))
    }
    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.onerror = () => reject(new Error('Could not load the Spotify SDK.'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

/** Playback clock: the SDK only publishes state on events, not at 60 fps. */
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
  /** Live snapshot, read every frame without re-rendering. */
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
  const setFeaturesAvailable = useStore((s) => s.setFeaturesAvailable)

  const [busy, setBusy] = useState(false)

  const tokenRef = useRef<StoredToken | null>(null)
  const playerRef = useRef<Spotify.Player | null>(null)
  const deviceRef = useRef<string | null>(null)
  const clockRef = useRef<Clock>({ positionMs: 0, updatedAt: performance.now(), playing: false })
  const snapshotRef = useRef<PlaybackSnapshot>({ ...EMPTY_SNAPSHOT })
  const trackIdRef = useRef<string | null>(null)
  const analysisRef = useRef<AudioAnalysis | null>(null)

  /** Fresh token on demand — used by the SDK and by every API call. */
  const freshToken = useCallback(async (): Promise<string> => {
    const current = tokenRef.current
    if (!current) throw new Error('Not connected to Spotify.')
    const next = await ensureFresh(current)
    if (next !== current) {
      tokenRef.current = next
      setToken(next)
    }
    return next.accessToken
  }, [setToken])

  /** Copies internal state back into the store (for the React UI). */
  const publish = useCallback(
    (patch: Partial<PlaybackSnapshot>) => {
      snapshotRef.current = { ...snapshotRef.current, ...patch }
      setSnapshot(snapshotRef.current)
    },
    [setSnapshot],
  )

  /** Loads a track's analytical metadata (best effort). */
  const loadTrackAnalysis = useCallback(
    async (trackId: string | null, artistName: string, trackTitle: string) => {
      analysisRef.current = null
      if (!trackId) {
        setAnalysisAvailable(null)
        setFeaturesAvailable(null)
        publish({ analysis: null, tempo: 0, key: -1 })
        return
      }
      let features: AudioFeatures | null = null
      let analysis: AudioAnalysis | null = null
      let isrc: string | null = null
      try {
        const token = await freshToken()
        ;[features, analysis, isrc] = await Promise.all([
          api.getAudioFeatures(token, trackId),
          api.getAudioAnalysis(token, trackId),
          api.getTrackIsrc(token, trackId),
        ])
      } catch {
        // Deprecated / restricted endpoints: fall back to the Deezer path anyway.
      }
      if (trackIdRef.current !== trackId) return
      analysisRef.current = analysis
      // The ISRC arrives after the fact (the SDK doesn't provide it): patch
      // the already-published track, used by the iTunes preview source to
      // match the exact master rather than an approximate artist/title search.
      if (isrc && snapshotRef.current.track?.id === trackId) {
        publish({ track: { ...snapshotRef.current.track, isrc } })
      }
      setAnalysisAvailable(Boolean(analysis))
      setFeaturesAvailable(Boolean(features))

      let tempo = features?.tempo ?? analysis?.track.tempo ?? 0
      let loudness = features?.loudness ?? analysis?.track.loudness ?? -12
      let energy = features?.energy ?? null
      let danceability = features?.danceability ?? null
      let valence = features?.valence ?? null
      let acousticness = features?.acousticness ?? null
      let instrumentalness = features?.instrumentalness ?? null
      let speechiness = features?.speechiness ?? null
      let key = features?.key ?? analysis?.track.key ?? null
      let mode = features?.mode ?? analysis?.track.mode ?? null
      let timeSignature = features?.time_signature ?? analysis?.track.time_signature ?? null
      let tempoSource: PlaybackSnapshot['tempoSource'] = tempo > 0 ? (features ? 'features' : 'analysis') : 'inconnu'

      // Spotify closed off audio-features/audio-analysis to most new apps:
      // when tempo is completely unknown, we look for it elsewhere.
      // ReccoBeats reconstructs the same features schema from the Spotify ID
      // (the most complete when it finds the track); Deezer, as a fallback,
      // only has tempo/loudness but covers more tracks.
      if (tempo <= 0) {
        const alt = await getTrackFeatures(trackId, artistName, trackTitle)
        if (trackIdRef.current !== trackId) return
        if (alt.found) {
          if (alt.tempo && alt.source !== 'none') {
            tempo = alt.tempo
            tempoSource = alt.source
          }
          if (alt.loudness !== null) loudness = alt.loudness
          energy ??= alt.energy
          danceability ??= alt.danceability
          valence ??= alt.valence
          acousticness ??= alt.acousticness
          instrumentalness ??= alt.instrumentalness
          speechiness ??= alt.speechiness
          key ??= alt.key
          mode ??= alt.mode
          timeSignature ??= alt.timeSignature
        }
      }

      publish({
        analysis,
        tempo,
        loudness,
        tempoSource,
        energy: energy ?? 0.6,
        danceability: danceability ?? 0.6,
        valence: valence ?? 0.5,
        key: key ?? -1,
        mode: mode ?? 1,
        timeSignature: timeSignature ?? 4,
        acousticness: acousticness ?? 0.3,
        instrumentalness: instrumentalness ?? 0.1,
        speechiness: speechiness ?? 0.05,
      })
    },
    [freshToken, publish, setAnalysisAvailable, setFeaturesAvailable],
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
        isrc: null,
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
        void loadTrackAnalysis(t.id, t.artists[0]?.name ?? '', t.name)
      }
      // Pre-analysis (zero latency): as soon as the SDK announces the next
      // track, warm up the iTunes preview cache in the background. Without
      // an ISRC (the SDK doesn't provide one), but the artist/title search
      // is enough to fill the cache before the track becomes active.
      const next = state.track_window.next_tracks[0]
      if (next?.id) {
        void getItunesPreview(next.id, null, next.artists[0]?.name ?? '', next.name, next.duration_ms)
      }
    },
    [loadTrackAnalysis, publish],
  )

  // --- Token retrieval on mount (redirect return or storage) ---
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
            'The Web Playback SDK requires a Spotify Premium account. Connecting is still useful for reading metadata, but playback must happen from another app.',
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

  // --- Player initialization once the token is in place ---
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
          // Transfer without starting playback: the user stays in control.
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
          setSpotifyError(`Authentication refused: ${e.message}`)
        })
        player.addListener('account_error', () => {
          setSdkStatus('needs-premium')
          setSpotifyError('Non-Premium account: in-app playback is unavailable.')
        })
        player.addListener('playback_error', (e) => setSpotifyError(e.message))

        const ok = await player.connect()
        if (!ok && !disposed) {
          setSdkStatus('error')
          setSpotifyError('The Spotify player could not connect.')
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

  // --- Position extrapolation between two SDK events ---
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
    // Only the position is replaced: the rest of the object stays stable.
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
        if (!player) throw new Error('Player unavailable.')
        // Required by autoplay policies: ties playback to a user gesture.
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
        if (!device) throw new Error('No active Spotify device.')
        await playerRef.current?.activateElement().catch(() => {})
        const t = await freshToken()
        await api.play(t, device, [uri])
      }),
  }
}

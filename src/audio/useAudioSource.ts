import { useCallback, useEffect, useRef } from 'react'
import { useStore, readState, type SourceKind } from '../state/store'
import type { PlaybackSnapshot } from '../spotify/types'
import { engine } from './engine'
import { createMicSource, createTabAudioSource } from './sources/captureSource'
import { createFileSource, type FileAudioProvider } from './sources/fileSource'
import { SpotifyTimelineProvider } from './sources/spotifyTimelineSource'
import { createItunesPreviewSource } from './sources/itunesPreviewProvider'
import { BlendedSpotifyProvider } from './sources/blendedSpotifyProvider'
import { getItunesPreview } from '../spotify/itunesPreview'
import { EMPTY_SNAPSHOT } from '../spotify/types'

/** Fictional demo-mode track: 124 BPM, high energy, key of A minor. */
const DEMO_START = performance.now()
const demoSnapshot = (): PlaybackSnapshot => ({
  ...EMPTY_SNAPSHOT,
  connected: true,
  playing: true,
  positionSec: (performance.now() - DEMO_START) / 1000,
  durationSec: 600,
  tempo: 124,
  energy: 0.82,
  danceability: 0.78,
  valence: 0.45,
  key: 9,
  mode: 0,
})

export interface AudioSourceController {
  select: (kind: Exclude<SourceKind, 'none' | 'file'>) => Promise<void>
  selectFile: (file: File) => Promise<void>
  stop: () => void
  /** <audio> element for the file source, to control playback from the UI. */
  fileElement: () => HTMLAudioElement | null
}

/**
 * Selection and lifecycle of the audio source.
 *
 * Only one source is active at a time: the analysis engine automatically
 * disposes of the previous one when given a new one.
 */
export function useAudioSource(readSnapshot: () => PlaybackSnapshot): AudioSourceController {
  const setSource = useStore((s) => s.setSource)
  const setAudioError = useStore((s) => s.setAudioError)
  const fileRef = useRef<FileAudioProvider | null>(null)
  const snapshotRef = useRef(readSnapshot)
  snapshotRef.current = readSnapshot

  useEffect(() => () => engine.dispose(), [])

  const apply = useCallback(
    (provider: Parameters<typeof engine.setProvider>[0], kind: SourceKind, label: string) => {
      if (kind !== 'file') fileRef.current = null
      engine.setProvider(provider)
      setSource(kind, label)
    },
    [setSource],
  )

  const select = useCallback(
    async (kind: Exclude<SourceKind, 'none' | 'file'>) => {
      try {
        setAudioError(null)
        if (kind === 'tab') {
          const p = await createTabAudioSource()
          apply(p, 'tab', p.label)
        } else if (kind === 'mic') {
          const p = await createMicSource()
          apply(p, 'mic', p.label)
        } else if (kind === 'demo') {
          // Demo mode: the same procedural source, but fed by a fictional
          // timeline. Lets you see the scene come alive without credentials.
          const p = new SpotifyTimelineProvider(demoSnapshot)
          apply(p, 'demo', 'Procedural demo — 124 BPM')
        } else {
          // Procedural source: it reads the Spotify timeline every frame,
          // so it must query the live snapshot, not a frozen copy.
          const p = new SpotifyTimelineProvider(() => snapshotRef.current())
          apply(p, 'spotify', p.label)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // A user closing the share picker isn't an error.
        setAudioError(/permission|denied|dismissed|NotAllowed/i.test(message)
          ? 'Capture refused or canceled.'
          : message)
      }
    },
    [apply, setAudioError],
  )

  // --- iTunes preview pivot: real FFT blended with the procedural one -----
  //
  // On each track change (as long as the active source is 'spotify'),
  // we start with a provider that blends procedural resynthesis (rhythm
  // always locked to the real Spotify tempo/position, zero latency)
  // and — as soon as an iTunes preview is found — the real FFT of that
  // preview, capped by the track's energy and modulated by the volume
  // chosen by the user (see LIMITE_SYNCHRONISATION_ITUNES.md for why we
  // blend rather than do a pure replacement). If nothing is found, the
  // blend stays 100% procedural — silently.
  const sourceKind = useStore((s) => s.sourceKind)
  const trackId = useStore((s) => s.snapshot.track?.id ?? null)
  useEffect(() => {
    if (sourceKind !== 'spotify' || !trackId) return
    let cancelled = false

    const blended = new BlendedSpotifyProvider(
      () => snapshotRef.current(),
      () => readState().spotifyVolume,
    )
    engine.setProvider(blended)
    setSource('spotify', blended.label)

    const track = snapshotRef.current().track
    if (track) {
      void (async () => {
        const preview = await getItunesPreview(
          track.id,
          track.isrc,
          track.artists[0]?.name ?? '',
          track.name,
          track.duration_ms,
        )
        if (cancelled || !preview.previewUrl) return
        try {
          const p = await createItunesPreviewSource(
            preview.previewUrl,
            `iTunes — ${track.name}`,
            () => snapshotRef.current(),
          )
          if (cancelled) {
            p.dispose()
            return
          }
          blended.attachReal(p)
          setSource('spotify', blended.label)
        } catch {
          // Preview found but unplayable (network, format): stay 100% procedural.
        }
      })()
    }

    return () => {
      cancelled = true
    }
  }, [sourceKind, trackId, setSource])

  const selectFile = useCallback(
    async (file: File) => {
      try {
        setAudioError(null)
        const p = await createFileSource(file)
        fileRef.current = p
        engine.setProvider(p)
        setSource('file', file.name)
      } catch (err) {
        setAudioError(err instanceof Error ? err.message : String(err))
      }
    },
    [setAudioError, setSource],
  )

  const stop = useCallback(() => {
    engine.setProvider(null)
    fileRef.current = null
    setSource('none', 'No source')
  }, [setSource])

  return { select, selectFile, stop, fileElement: () => fileRef.current?.element ?? null }
}

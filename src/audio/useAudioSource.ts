import { useCallback, useEffect, useRef } from 'react'
import { useStore, type SourceKind } from '../state/store'
import type { PlaybackSnapshot } from '../spotify/types'
import { engine } from './engine'
import { createMicSource, createTabAudioSource } from './sources/captureSource'
import { createFileSource, type FileAudioProvider } from './sources/fileSource'
import { SpotifyTimelineProvider } from './sources/spotifyTimelineSource'
import { EMPTY_SNAPSHOT } from '../spotify/types'

/** Morceau fictif du mode demo : 124 BPM, energie haute, tonalite La mineur. */
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
  /** Element <audio> de la source fichier, pour piloter la lecture depuis l'UI. */
  fileElement: () => HTMLAudioElement | null
}

/**
 * Selection et cycle de vie de la source audio.
 *
 * Une seule source est active a la fois : le moteur d'analyse dispose
 * automatiquement la precedente quand on lui en donne une nouvelle.
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
          // Mode demo : la meme source procedurale, mais alimentee par une
          // timeline fictive. Permet de voir la scene vivre sans credentials.
          const p = new SpotifyTimelineProvider(demoSnapshot)
          apply(p, 'demo', 'Demo procedurale — 124 BPM')
        } else {
          // Source procedurale : elle lit la timeline Spotify a chaque frame,
          // donc elle doit interroger le snapshot vivant, pas une copie figee.
          const p = new SpotifyTimelineProvider(() => snapshotRef.current())
          apply(p, 'spotify', p.label)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // L'utilisateur qui ferme le selecteur de partage n'est pas une erreur.
        setAudioError(/permission|denied|dismissed|NotAllowed/i.test(message)
          ? 'Capture refusee ou annulee.'
          : message)
      }
    },
    [apply, setAudioError],
  )

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
    setSource('none', 'Aucune source')
  }, [setSource])

  return { select, selectFile, stop, fileElement: () => fileRef.current?.element ?? null }
}

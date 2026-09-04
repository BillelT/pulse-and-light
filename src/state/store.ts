import { create } from 'zustand'
import { DEFAULT_ANALYSIS, type AnalysisSettings } from '../audio/AudioEngine'
import { EMPTY_SNAPSHOT, type PlaybackSnapshot, type SpotifyUser } from '../spotify/types'
import type { StoredToken } from '../spotify/auth'

export type SourceKind = 'none' | 'tab' | 'mic' | 'file' | 'spotify' | 'demo'

/**
 * Purely scenographic settings (the lighting designer's "playground").
 * The scene has a single art direction — a pen sketch on white paper — so
 * these are all that direction's own knobs, nothing toggles it on or off.
 */
export interface VisualSettings {
  /** Camera shake amplitude on kicks, 0..1. */
  shake: number
  /** Automatic camera movement. */
  autoCamera: boolean

  /** Ink line width, in pixels. Constant whatever the distance. */
  inkLine: number
  /** Hand-drawn wobble of the line, in pixels. 0 = vector-clean line. */
  inkWobble: number
  /** Hatching density on grazing surfaces. Off by default: the page stays white. */
  inkHatch: number
  /** Contour sensitivity: how eagerly a depth step becomes a line. */
  inkContour: number

  /** Ink wall: concentration of the faint wash haloing the strokes. */
  inkWashDensity: number
  /** Ink wall: how far wet paper drags the pigment around. */
  inkWashBleed: number
  /** Ink wall: presence of the coloured pen strokes — the image itself. */
  inkWashPenwork: number
}

export const DEFAULT_VISUAL: VisualSettings = {
  shake: 0.4,
  autoCamera: true,

  inkLine: 1.2,
  inkWobble: 1.6,
  inkHatch: 0,
  inkContour: 14,

  inkWashDensity: 0.11,
  inkWashBleed: 0.22,
  inkWashPenwork: 0.9,
}

/** Scene debugger settings: visual aids only — there's no lighting left to tune. */
export interface DebugSettings {
  showAxes: boolean
  showGrid: boolean
}

export const DEFAULT_DEBUG: DebugSettings = {
  showAxes: false,
  showGrid: false,
}

export type SdkStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'unsupported'
  | 'needs-premium'
  | 'error'

interface AppState {
  analysis: AnalysisSettings
  visual: VisualSettings
  debug: DebugSettings
  setAnalysis: (patch: Partial<AnalysisSettings>) => void
  setVisual: (patch: Partial<VisualSettings>) => void
  setDebug: (patch: Partial<DebugSettings>) => void
  resetSettings: () => void

  sourceKind: SourceKind
  sourceLabel: string
  audioError: string | null
  setSource: (kind: SourceKind, label: string) => void
  setAudioError: (message: string | null) => void

  token: StoredToken | null
  user: SpotifyUser | null
  deviceId: string | null
  sdkStatus: SdkStatus
  spotifyError: string | null
  snapshot: PlaybackSnapshot
  /** Volume chosen by the user (0..1) — read by the audio engine to modulate
   *  the wall's intensity on what it actually hears, not just the spectral content. */
  spotifyVolume: number
  setSpotifyVolume: (v: number) => void
  /** true if the Audio Analysis endpoint responded for the current track. */
  analysisAvailable: boolean | null
  /** true if the Audio Features endpoint responded for the current track. */
  featuresAvailable: boolean | null
  setToken: (token: StoredToken | null) => void
  setUser: (user: SpotifyUser | null) => void
  setDeviceId: (id: string | null) => void
  setSdkStatus: (status: SdkStatus) => void
  setSpotifyError: (message: string | null) => void
  setSnapshot: (snapshot: PlaybackSnapshot) => void
  setAnalysisAvailable: (value: boolean | null) => void
  setFeaturesAvailable: (value: boolean | null) => void

  panelOpen: boolean
  togglePanel: () => void
}

export const useStore = create<AppState>((set) => ({
  analysis: { ...DEFAULT_ANALYSIS },
  visual: { ...DEFAULT_VISUAL },
  debug: { ...DEFAULT_DEBUG },
  setAnalysis: (patch) => set((s) => ({ analysis: { ...s.analysis, ...patch } })),
  setVisual: (patch) => set((s) => ({ visual: { ...s.visual, ...patch } })),
  setDebug: (patch) => set((s) => ({ debug: { ...s.debug, ...patch } })),
  resetSettings: () =>
    set({ analysis: { ...DEFAULT_ANALYSIS }, visual: { ...DEFAULT_VISUAL }, debug: { ...DEFAULT_DEBUG } }),

  sourceKind: 'none',
  sourceLabel: 'No source',
  audioError: null,
  setSource: (sourceKind, sourceLabel) => set({ sourceKind, sourceLabel, audioError: null }),
  setAudioError: (audioError) => set({ audioError }),

  token: null,
  user: null,
  deviceId: null,
  sdkStatus: 'idle',
  spotifyError: null,
  snapshot: EMPTY_SNAPSHOT,
  spotifyVolume: 0.7,
  setSpotifyVolume: (spotifyVolume) => set({ spotifyVolume }),
  analysisAvailable: null,
  featuresAvailable: null,
  setToken: (token) => set({ token }),
  setUser: (user) => set({ user }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setSdkStatus: (sdkStatus) => set({ sdkStatus }),
  setSpotifyError: (spotifyError) => set({ spotifyError }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setAnalysisAvailable: (analysisAvailable) => set({ analysisAvailable }),
  setFeaturesAvailable: (featuresAvailable) => set({ featuresAvailable }),

  panelOpen: true,
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}))

/**
 * Lecture hors-React des reglages : `useFrame` tourne a 60 fps et ne doit pas
 * declencher de re-render ni traverser le systeme de souscription du store.
 */
export const readState = () => useStore.getState()

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
}

export const DEFAULT_VISUAL: VisualSettings = {
  shake: 0.4,
  autoCamera: true,

  inkLine: 1.2,
  inkWobble: 1.6,
  inkHatch: 0,
  inkContour: 14,
}

/**
 * Ink wall settings.
 *
 * Le shader du mur est reconstruit brique par brique. Chaque brique amene
 * sa propre section de reglages ici et une vue de debug dans `INK_VIEWS` ;
 * chaque vue mappe sur un index passe a l'uniforme `uView` du shader.
 *
 * Etape 1 : la seule brique en place est le pont audio -> DataTexture, on
 * expose donc une seule vue de debug qui affiche cette texture sur le mur.
 */
export const INK_VIEWS = ['off', 'spectrum'] as const
export type InkView = (typeof INK_VIEWS)[number]

export interface InkSettings {
  /** Vue de debug active. 'off' = rendu reel (papier vide pour l'instant). */
  view: InkView
}

export const DEFAULT_INK: InkSettings = {
  view: 'off',
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
  ink: InkSettings
  debug: DebugSettings
  setAnalysis: (patch: Partial<AnalysisSettings>) => void
  setVisual: (patch: Partial<VisualSettings>) => void
  setInk: (patch: Partial<InkSettings>) => void
  setDebug: (patch: Partial<DebugSettings>) => void
  resetSettings: () => void
  resetInk: () => void

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
  ink: { ...DEFAULT_INK },
  debug: { ...DEFAULT_DEBUG },
  setAnalysis: (patch) => set((s) => ({ analysis: { ...s.analysis, ...patch } })),
  setVisual: (patch) => set((s) => ({ visual: { ...s.visual, ...patch } })),
  setInk: (patch) => set((s) => ({ ink: { ...s.ink, ...patch } })),
  setDebug: (patch) => set((s) => ({ debug: { ...s.debug, ...patch } })),
  resetSettings: () =>
    set({ analysis: { ...DEFAULT_ANALYSIS }, visual: { ...DEFAULT_VISUAL }, debug: { ...DEFAULT_DEBUG } }),
  resetInk: () => set({ ink: { ...DEFAULT_INK } }),

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

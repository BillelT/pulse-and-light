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
 * Ink wall settings — everything the sound-to-pigment shader is made of.
 *
 * Kept in its own slice rather than folded into `VisualSettings`: the wall is
 * the visualizer, it has its own debugger tab, and every field here maps to
 * exactly one uniform or one constant of the pigment model. Nothing else in
 * the app reads them.
 */
/**
 * Vues du debugger, DANS L'ORDRE : l'index d'une vue dans ce tableau est la
 * valeur passee a l'uniforme `uView` du shader. Ajouter une vue = ajouter une
 * entree ici ET la brancher dans `InkWall.tsx` sur le meme index.
 */
export const INK_VIEWS = [
  'off',
  'coverage',
  'wet',
  'stain',
  'flash',
  'load',
  'blotch',
  'wash',
  'stroke',
  'warp',
  'palette',
  'grid',
] as const

export type InkView = (typeof INK_VIEWS)[number]

export interface InkSettings {
  // --- Sound to pigment (CPU model, see inkField.ts) ---
  /** How fast the paper soaks up pigment, per second at full energy. */
  deposit: number
  /** Wash drying time constant, in seconds. Long = the track leaves a trail. */
  dryTime: number
  /** How long a transient drop takes to resorb, in seconds. */
  flashTime: number
  /** Lateral migration of pigment, in frequency slots² per second. */
  spread: number

  // --- How the three pigment states add up ---
  weightStain: number
  weightWet: number
  weightFlash: number
  /** Extra load a kick briefly adds. */
  beatLift: number

  // --- Layout, in world units ---
  /** Half-width of the painted window. */
  span: number
  /** Reference height of the wash climb. */
  rise: number
  /** Climb at zero pigment, then how much a full load adds (in `rise` units). */
  reachBase: number
  reachGain: number
  /** Vertical falloff exponent. Higher = denser at the horizon, whiter above. */
  falloff: number
  /** How far below the horizon the ink is allowed to run, in `rise` units. */
  sink: number
  /** Where the lateral dissolve into white starts, in `span` units. */
  sideFade: number

  // --- Wet paper (domain warp) ---
  bleed: number
  /** How much the spectral flux and the kick amplify the warp. */
  fluxWarp: number
  beatWarp: number

  // --- Wash (the halo) ---
  wash: number
  /** Blotch thresholds. Narrow = holes of white paper inside the stain. */
  blotchLow: number
  blotchHigh: number
  /** Wet-edge accumulation at the rim of a puddle. */
  rim: number

  // --- Strokes (the drawing) ---
  stroke: number
  /** Pigment concentration of a stroke, at rest and at full load. */
  strokeInk: number
  strokeInkGain: number
  /** Loops per unit for each of the two crossing pen passes. */
  spacingA: number
  spacingB: number
  /** Stroke thickness, in pixels. */
  weight: number
  /** How much the pen lifts — 0 = closed contour loops, 1 = broken strokes. */
  lift: number
  /** How far the strokes venture out of the wash, in coverage units. */
  reachInk: number
  /** Share of the stroke presence driven by the track's brightness. */
  brightnessMix: number
  /** Drift speed of the loops, in loops per beat. */
  phaseSpeed: number

  // --- Debugger ---
  /** False-colour readout of one intermediate value. 'off' = the real render. */
  view: InkView
  /** Freeze the shader clock: the warp stops, the pigment keeps flowing. */
  freeze: boolean
}

export const DEFAULT_INK: InkSettings = {
  deposit: 0.85,
  dryTime: 8,
  flashTime: 0.3,
  spread: 14,

  weightStain: 0.62,
  weightWet: 0.4,
  weightFlash: 0.4,
  beatLift: 0.25,

  span: 46,
  rise: 11,
  reachBase: 0.12,
  reachGain: 0.88,
  falloff: 3,
  sink: 0.42,
  sideFade: 0.74,

  bleed: 0.22,
  fluxWarp: 0.9,
  beatWarp: 0.7,

  wash: 0.11,
  blotchLow: 0.37,
  blotchHigh: 0.6,
  rim: 0.34,

  stroke: 0.9,
  strokeInk: 0.5,
  strokeInkGain: 0.7,
  spacingA: 10,
  spacingB: 8,
  weight: 1,
  lift: 1,
  reachInk: 0.055,
  brightnessMix: 0.65,
  phaseSpeed: 0.02,

  view: 'off',
  freeze: false,
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

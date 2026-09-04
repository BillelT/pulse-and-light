import { create } from 'zustand'
import { DEFAULT_ANALYSIS, type AnalysisSettings } from '../audio/AudioEngine'
import { EMPTY_SNAPSHOT, type PlaybackSnapshot, type SpotifyUser } from '../spotify/types'
import type { StoredToken } from '../spotify/auth'

export type SourceKind = 'none' | 'tab' | 'mic' | 'file' | 'spotify' | 'demo'

/** Purely scenographic settings (the lighting designer's "playground"). */
export interface VisualSettings {
  paletteId: string
  /** Bloom intensity: this is what makes the neon exist. */
  bloom: number
  /** Weight of the band tint on the vertical ramp, 0..1. */
  bandTint: number
  /** Weight of Scriabin's tonal tint, 0..1. */
  keyTint: number
  /** Volumetric fog density. */
  fog: number
  /** Camera shake amplitude on kicks, 0..1. */
  shake: number
  /** Automatic camera movement. */
  autoCamera: boolean
  /** Number of LED segments per light box. */
  segments: number
  /** Chromatic aberration driven by the bass. */
  chroma: number
  /** Grain driven by spectral flux / timbre. */
  grain: number
  /** Holds each column's peak for a few instants (VU-meter marker). */
  peakHold: boolean
  /** Flat palette colors (true) or continuous gradient (false). */
  quantize: boolean
}

export const DEFAULT_VISUAL: VisualSettings = {
  paletteId: 'arcade',
  bloom: 1.1,
  bandTint: 0.7,
  keyTint: 0.1,
  fog: 0.013,
  shake: 0.4,
  autoCamera: true,
  segments: 22,
  chroma: 0.5,
  grain: 0.35,
  peakHold: true,
  quantize: true,
}

/** Scene debugger settings: lights, fog, visual aids. */
export interface DebugSettings {
  showAxes: boolean
  showGrid: boolean

  fogColor: string

  ambientIntensity: number
  ambientColor: string

  hemiIntensity: number
  hemiSkyColor: string
  hemiGroundColor: string

  dirIntensity: number
  dirColor: string
  dirPos: [number, number, number]

  pointIntensity: number
  pointColor: string
  pointPos: [number, number, number]
  pointDistance: number
  pointDecay: number

  spotIntensity: number
  spotColor: string
  spotPos: [number, number, number]
  spotAngle: number
  spotPenumbra: number
  spotDistance: number
  spotDecay: number

  /** Floor overflow under the side/back walls (negative = under the
   *  walls, flush with no gap; positive = set back, leaves a hole). */
  floorMarginX: number
  floorMarginBack: number
  /** Z position of the floor's front edge (open side, facing the audience). */
  floorFrontZ: number
  /** Wireframe outline of the floor, to see its exact edges over the
   *  mirror (which can't be shown in wireframe). */
  floorShowOutline: boolean
  /** Outline of the walls' footprint (on the floor), to compare with the floor. */
  floorShowWallOutline: boolean
}

export const DEFAULT_DEBUG: DebugSettings = {
  showAxes: false,
  showGrid: false,

  fogColor: 'hsl(255, 48%, 21%)',

  ambientIntensity: 3,
  ambientColor: '#8783ae',

  hemiIntensity: 1.05,
  hemiSkyColor: '#6e6a9e',
  hemiGroundColor: '#1c1530',

  dirIntensity: 1.35,
  dirColor: '#a8aad0',
  dirPos: [6, 16, 10],

  pointIntensity: 52,
  pointColor: '#918cc0',
  pointPos: [0, 7.5, 11],
  pointDistance: 26,
  pointDecay: 1.8,

  spotIntensity: 13,
  spotColor: '#7d84ad',
  spotPos: [-11, 17, 16],
  spotAngle: 0.62,
  spotPenumbra: 1,
  spotDistance: 58,
  spotDecay: 1.2,

  floorMarginX: -16.15,
  floorMarginBack: -14.5,
  floorFrontZ: 47,
  floorShowOutline: false,
  floorShowWallOutline: false,
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

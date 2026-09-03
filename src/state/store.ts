import { create } from 'zustand'
import { DEFAULT_ANALYSIS, type AnalysisSettings } from '../audio/AudioEngine'
import { EMPTY_SNAPSHOT, type PlaybackSnapshot, type SpotifyUser } from '../spotify/types'
import type { StoredToken } from '../spotify/auth'

export type SourceKind = 'none' | 'tab' | 'mic' | 'file' | 'spotify' | 'demo'

/** Reglages purement scenographiques (le "playground" du lighting designer). */
export interface VisualSettings {
  paletteId: string
  /** Intensite du bloom : c'est lui qui fait exister le neon. */
  bloom: number
  /** Poids de la teinte de bande sur la rampe verticale, 0..1. */
  bandTint: number
  /** Poids de la teinte tonale de Scriabine, 0..1. */
  keyTint: number
  /** Densite de la brume volumetrique. */
  fog: number
  /** Amplitude du camera shake sur les kicks, 0..1. */
  shake: number
  /** Mouvement de camera automatique. */
  autoCamera: boolean
  /** Nombre de segments LED par caisson. */
  segments: number
  /** Aberration chromatique pilotee par les basses. */
  chroma: number
  /** Grain pilote par le flux spectral / timbre. */
  grain: number
  /** Retient le pic de chaque colonne quelques instants (marqueur de VU-metre). */
  peakHold: boolean
  /** Aplats de palette (true) ou degrade continu (false). */
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

/** Reglages du debuggeur de scene : lumieres, brouillard, aides visuelles. */
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

  /** Debordement du sol sous les murs lateraux/du fond (negatif = sous les
   *  murs, colle sans joint ; positif = en retrait, laisse un trou). */
  floorMarginX: number
  floorMarginBack: number
  /** Position Z du bord avant du sol (cote ouvert, face public). */
  floorFrontZ: number
  /** Contour du sol en fil de fer, pour voir ses bords exacts par-dessus le
   *  miroir (qui ne peut pas etre affiche en wireframe). */
  floorShowOutline: boolean
  /** Contour de l'empreinte des murs (au sol), pour comparer au sol. */
  floorShowWallOutline: boolean
}

export const DEFAULT_DEBUG: DebugSettings = {
  showAxes: false,
  showGrid: false,

  fogColor: '#191131',

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

  floorMarginX: -0.3,
  floorMarginBack: -0.3,
  floorFrontZ: 45,
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
  /** Volume choisi par l'utilisateur (0..1) — lu par le moteur audio pour moduler
   *  l'intensite du mur sur ce qu'il entend vraiment, pas juste sur le contenu spectral. */
  spotifyVolume: number
  setSpotifyVolume: (v: number) => void
  /** true si l'endpoint Audio Analysis a repondu pour la piste courante. */
  analysisAvailable: boolean | null
  /** true si l'endpoint Audio Features a repondu pour la piste courante. */
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
  sourceLabel: 'Aucune source',
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

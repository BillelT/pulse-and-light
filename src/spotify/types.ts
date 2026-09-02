/** Sous-ensemble des reponses Spotify Web API reellement utilise ici. */

export interface SpotifyImage {
  url: string
  width: number | null
  height: number | null
}

export interface SpotifyArtist {
  id: string
  name: string
}

export interface SpotifyTrack {
  id: string | null
  uri: string
  name: string
  duration_ms: number
  artists: SpotifyArtist[]
  album: { name: string; images: SpotifyImage[] }
}

export interface SpotifyUser {
  id: string
  display_name: string | null
  product?: string
  images?: SpotifyImage[]
}

/** GET /v1/audio-features/{id} — deprecie pour les nouvelles apps depuis fin 2024. */
export interface AudioFeatures {
  tempo: number
  energy: number
  danceability: number
  valence: number
  loudness: number
  key: number
  mode: number
  time_signature: number
}

export interface AnalysisSegment {
  start: number
  duration: number
  confidence: number
  loudness_start: number
  loudness_max: number
  loudness_max_time: number
  /** 12 valeurs 0..1, une par classe de hauteur (Do, Do#, ... Si). */
  pitches: number[]
  /** 12 coefficients de timbre (base MFCC-like). */
  timbre: number[]
}

export interface AnalysisInterval {
  start: number
  duration: number
  confidence: number
}

/** GET /v1/audio-analysis/{id} — deprecie pour les nouvelles apps depuis fin 2024. */
export interface AudioAnalysis {
  track: { tempo: number; key: number; mode: number; time_signature: number; loudness: number }
  beats: AnalysisInterval[]
  bars: AnalysisInterval[]
  tatums: AnalysisInterval[]
  sections: Array<AnalysisInterval & { key: number; mode: number; tempo: number; loudness: number }>
  segments: AnalysisSegment[]
}

/** Etat de lecture consolide, exploite par la scene. */
export interface PlaybackSnapshot {
  connected: boolean
  playing: boolean
  track: SpotifyTrack | null
  /** Position extrapolee en secondes. */
  positionSec: number
  durationSec: number
  tempo: number
  energy: number
  danceability: number
  valence: number
  /** Tonalite Spotify : 0 = Do, 1 = Do#, ... 11 = Si. -1 si inconnue. */
  key: number
  mode: number
  analysis: AudioAnalysis | null
}

export const EMPTY_SNAPSHOT: PlaybackSnapshot = {
  connected: false,
  playing: false,
  track: null,
  positionSec: 0,
  durationSec: 0,
  tempo: 0,
  energy: 0.6,
  danceability: 0.6,
  valence: 0.5,
  key: -1,
  mode: 1,
  analysis: null,
}

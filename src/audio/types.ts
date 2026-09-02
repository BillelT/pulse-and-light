import type { BAND_COUNT } from './bands'

/** Nombre de colonnes (caissons lumineux) du mur. Doit rester impair : le mur est symetrique. */
export const COLUMN_COUNT = 13

/**
 * Une source de spectre. Peut etre un vrai AnalyserNode (micro / audio systeme /
 * fichier local) ou un generateur procedural pilote par la timeline Spotify.
 * Le moteur d'analyse est identique dans les deux cas.
 */
export interface SpectrumProvider {
  readonly id: string
  readonly label: string
  /** true si la donnee provient d'un vrai signal audio, false si elle est simulee. */
  readonly isRealAudio: boolean
  readonly sampleRate: number
  /** Taille du buffer frequentiel (fftSize / 2). */
  readonly binCount: number
  /** Remplit `out` (0..255) et renvoie false si la source n'a rien a donner. */
  read(out: Uint8Array<ArrayBuffer>, dt: number): boolean
  /** Tempo connu a l'avance (Spotify), sinon null : il sera estime par onsets. */
  knownBpm?: () => number | null
  dispose(): void
}

export interface AudioFrame {
  /** Energies lissees des 6 bandes, 0..1. */
  bands: Float32Array
  /** Energies brutes (avant lissage), 0..1. Utile pour les attaques franches. */
  bandsRaw: Float32Array
  /** Energie globale lissee, 0..1. */
  level: number
  levelRaw: number
  /** Energie par colonne du mur (echelle log), 0..1, lissee. */
  columns: Float32Array
  /** Enveloppe de kick : monte a 1 sur un onset puis retombe. */
  beat: number
  /** true uniquement sur la frame ou un onset est detecte. */
  onset: boolean
  /** Compteur d'onsets depuis le demarrage (pour alterner des motifs). */
  onsetCount: number
  /** Tempo estime (ou fourni par Spotify), 0 si inconnu. */
  bpm: number
  /** Flux spectral normalise 0..1 : "ca bouge beaucoup" (utilise pour le grain). */
  flux: number
  /** Centroide spectral normalise 0..1 : brillance / timbre. */
  brightness: number
  /** Temps ecoule en secondes depuis le demarrage du moteur. */
  time: number
  /** true si la donnee vient d'un vrai signal audio. */
  real: boolean
}

export type BandArray = Float32Array & { length: typeof BAND_COUNT }

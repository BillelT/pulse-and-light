import { COLUMN_COUNT } from './types'

/**
 * Decoupage frequentiel des colonnes du mur.
 *
 * Partage entre le moteur d'analyse (qui y lit ses bins FFT) et la scene (qui
 * en deduit la couleur de chaque colonne). C'est ce qui garantit que la teinte
 * d'un caisson correspond bien a la frequence qu'il mesure, et pas a une
 * decoration arbitraire.
 *
 * Repartition logarithmique : une repartition lineaire ecraserait tout le
 * contenu musical dans les deux premieres colonnes.
 */
export const COLUMN_F_LO = 30
export const COLUMN_F_HI = 14000

const LOG_LO = Math.log2(COLUMN_F_LO)
const LOG_HI = Math.log2(COLUMN_F_HI)

/** Bornes basse et haute de la colonne `i`, en Hz. */
export function columnEdges(i: number): [number, number] {
  const a = 2 ** (LOG_LO + ((LOG_HI - LOG_LO) * i) / COLUMN_COUNT)
  const b = 2 ** (LOG_LO + ((LOG_HI - LOG_LO) * (i + 1)) / COLUMN_COUNT)
  return [a, b]
}

/** Frequence centrale (moyenne geometrique) de la colonne `i`, en Hz. */
export function columnCenterHz(i: number): number {
  const [a, b] = columnEdges(i)
  return Math.sqrt(a * b)
}

/** Position de la colonne sur l'axe log-frequentiel, 0 (grave) a 1 (aigu). */
export function columnFrequencyPosition(i: number): number {
  return COLUMN_COUNT > 1 ? i / (COLUMN_COUNT - 1) : 0
}

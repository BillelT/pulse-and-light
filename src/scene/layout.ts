import { COLUMN_COUNT } from '../audio/types'

/**
 * Implantation du mur de caissons, calee sur `ref.jpg` :
 * un arc symetrique de colonnes LED, la plus haute au centre, ouvert vers le
 * spectateur, avec une alternation avant/arriere qui donne la silhouette en
 * "skyline".
 */

export interface TowerLayout {
  index: number
  x: number
  z: number
  rotationY: number
  width: number
  depth: number
  height: number
  /** Decalage de teinte propre a la colonne (evite un degrade trop propre). */
  hueOffset: number
}

const SPACING = 1.44
const CENTER = (COLUMN_COUNT - 1) / 2
export const TOWER_WIDTH = 1.06
export const TOWER_DEPTH = 0.72
export const TOWER_MIN_HEIGHT = 4.2
export const TOWER_MAX_HEIGHT = 10.4
/** Epaisseur du chassis metallique autour de la colonne LED. */
export const FRAME = 0.075

export const TOWERS: readonly TowerLayout[] = Array.from({ length: COLUMN_COUNT }, (_, i) => {
  const dist = Math.abs(i - CENTER) / CENTER // 0 au centre, 1 aux extremites
  // Profil de hauteur : puissance < 1 pour que les colonnes centrales restent
  // groupees en hauteur, comme sur la reference.
  const base = 1 - dist ** 1.45
  // Crenelage : sans lui la silhouette est une parabole trop lisse.
  const notch = i % 2 === 0 ? 0.055 : -0.045
  const height =
    TOWER_MIN_HEIGHT + (TOWER_MAX_HEIGHT - TOWER_MIN_HEIGHT) * Math.max(0, base + notch)

  const x = (i - CENTER) * SPACING
  // L'arc s'ouvre vers la camera : le centre est le point le plus recule.
  const arc = dist ** 1.9 * 3.0
  // Une colonne sur deux recule : c'est ce qui cree les deux plans de la ref.
  const stagger = i % 2 === 1 ? -0.82 : 0
  return {
    index: i,
    x,
    z: -6.2 + arc + stagger,
    rotationY: (x / (CENTER * SPACING)) * 0.26,
    width: TOWER_WIDTH,
    depth: TOWER_DEPTH,
    height,
    hueOffset: ((i * 7) % 5) / 5,
  }
})

/** Nombre maximum de cellules LED allouees (capacite de l'InstancedMesh). */
export const MAX_SEGMENTS_PER_TOWER = 48
export const MAX_LED_INSTANCES = COLUMN_COUNT * MAX_SEGMENTS_PER_TOWER

/**
 * Pas vertical des cellules. Il est constant sur tout le mur : sur la
 * reference, toutes les cellules ont la meme taille, seules les colonnes
 * hautes en contiennent davantage.
 */
export function cellPitch(segmentsInTallest: number): number {
  return (TOWER_MAX_HEIGHT - 2 * FRAME) / segmentsInTallest
}

export function segmentsFor(height: number, pitch: number): number {
  return Math.max(3, Math.min(MAX_SEGMENTS_PER_TOWER, Math.floor((height - 2 * FRAME) / pitch)))
}

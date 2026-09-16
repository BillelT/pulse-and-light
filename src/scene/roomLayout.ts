/**
 * Limites de la camera : empechent l'orbite de s'eloigner indefiniment.
 * Le mur d'encre (InkWall, z = -26) est desormais le seul element de la
 * scene : ces bornes se resserrent tout autour de lui pour que la camera
 * ne puisse jamais le sortir du cadre.
 */
export const CAMERA_BOUNDS = {
  x: 40,
  yMin: 4,
  yMax: 70,
  zMin: -24,
  zMax: 40,
}

/**
 * Limites de la camera : empechent l'orbite de s'eloigner indefiniment ou de
 * plonger sous le sol. La scene n'a plus de murs physiques (DA "ink" : la
 * scenographie flotte dans le blanc), ces bornes ne font que garder la
 * camera a une distance raisonnable de la piste.
 */
export const CAMERA_BOUNDS = {
  x: 30,
  yMin: 1.5,
  yMax: 24,
  zMin: -20,
  zMax: 25,
}

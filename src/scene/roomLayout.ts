/**
 * Limites de la camera : empechent l'orbite de s'eloigner indefiniment ou de
 * plonger sous le sol. La scene n'a plus de murs physiques (DA "ink" : la
 * scenographie flotte dans le blanc), ces bornes ne font que garder la
 * camera a une distance raisonnable de la piste.
 */
export const CAMERA_BOUNDS = {
  x: 45,
  yMin: 1.2,
  yMax: 32,
  // Le mur d'encre est en z = -26, les stacks de caissons en z = -10 : on garde
  // la camera nettement devant les caissons pour ne jamais passer "derriere" le
  // mur ni traverser un stack.
  zMin: -7,
  zMax: 55,
}

/**
 * Geometrie de la piece (murs vitres + plafond) et limites de camera qui en
 * decoulent, partagees entre `Stage` (qui construit les murs) et `Rig` (qui
 * doit empecher la camera de les traverser). Tout au meme endroit : la piece
 * a deja eu un bug ou le mur du fond et son lisere ne s'accordaient pas parce
 * que leurs dimensions vivaient chacune dans leur coin.
 */

/** Hauteur du centre des murs et hauteur totale de la baie vitree. */
export const WALL_Y = 14
export const WALL_HEIGHT = 34
/** Sommet reel du verre — c'est aussi la hauteur du lisere neon et du plafond. */
export const WALL_TOP = WALL_Y + WALL_HEIGHT / 2

/** Mur du fond : sa profondeur en Z, sa largeur DOIT fermer sur les murs lateraux. */
export const BACK_Z = -24
/** Murs lateraux : leur abscisse, leur profondeur en Z et leur longueur. */
export const SIDE_X = 34
export const SIDE_Z = 2
export const SIDE_LEN = 56
/** Largeur du mur du fond : exactement 2 * SIDE_X pour que les coins se referment. */
export const BACK_WIDTH = SIDE_X * 2

/**
 * Marge de securite entre la camera et les murs/plafond/sol, pour qu'on ne
 * puisse jamais voir "les coulisses" (l'exterieur des baies, le dessus du
 * plafond) quel que soit l'angle ou le zoom choisis par l'utilisateur.
 */
export const CAMERA_BOUNDS = {
  x: SIDE_X - 4,
  yMin: 1.5,
  yMax: WALL_TOP - 7,
  zMin: BACK_Z + 4,
  zMax: SIDE_Z + SIDE_LEN / 2 - 5,
}

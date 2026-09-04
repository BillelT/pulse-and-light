/**
 * Direction artistique "ink" — desormais la seule DA de la scene.
 *
 * Toute la scene est un croquis a l'encre : papier blanc, trait fin et
 * regulier, aucun aplat de couleur. Deux mecanismes seulement produisent
 * l'image :
 *  - toutes les surfaces sont rendues en blanc plat (`INK_SURFACE`), sans
 *    lumiere ni ombrage ;
 *  - la passe `InkEffect` derive les traits de la profondeur et des normales.
 */

/** Fond de page. */
export const INK_PAPER = '#ffffff'
/** Encre : jamais un noir pur, une encre reelle tire vers le brun/gris. */
export const INK_LINE = '#14120f'
/**
 * Remplissage des surfaces. Legerement sous le blanc du papier : le trait doit
 * pouvoir se detacher, mais l'objet reste "vide" comme sur un croquis.
 */
export const INK_SURFACE = '#fbfbfa'

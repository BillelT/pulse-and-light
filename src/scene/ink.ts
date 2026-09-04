import { Color } from 'three'

/**
 * Direction artistique "ink".
 *
 * Toute la scene est redessinee comme un croquis a l'encre : papier blanc,
 * trait fin et regulier, presque aucun aplat. La seule couleur autorisee est
 * celle emise par les cellules LED des colonnes — c'est la regle qui donne sa
 * lisibilite a la DA : ce qui est colore, c'est ce qui sonne.
 *
 * Deux mecanismes seulement produisent l'image :
 *  - les surfaces sont rendues en blanc plat (`INK_SURFACE`), sans lumiere ni
 *    ombrage — voir `InkSurfaces` ;
 *  - la passe `InkEffect` derive les traits de la profondeur et des normales,
 *    et laisse passer la couleur la ou l'image d'origine est saturee.
 *
 * Corollaire utile : n'importe quel pixel SOMBRE de la scene (une texture de
 * trait, un fin volume noir) ressort comme un trait d'encre. C'est ainsi que
 * la skyline et les traits de sol sont dessines, sans shader dedie.
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
/**
 * Cellule LED eteinte : quasi blanche, elle disparait dans le papier. Seul le
 * trait du chassis reste, exactement comme une case vide de VU-metre dessinee.
 */
export const INK_LED_OFF = new Color(0.965, 0.965, 0.962)

/** Encre utilisee par les elements dessines en geometrie (traits de sol, skyline). */
export const INK_STROKE = '#1a1713'

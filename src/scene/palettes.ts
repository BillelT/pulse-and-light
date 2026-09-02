import { Color } from 'three'
import { BANDS } from '../audio/bands'

/**
 * PARTIE 3.1 du brief : la traduction litterale frequence -> longueur d'onde
 * donne un arc-en-ciel chaotique. On force donc des palettes restreintes, et
 * la musique ne choisit que *ou* on se trouve dans la palette, pas la teinte
 * elle-meme.
 */
export interface Palette {
  id: string
  label: string
  /**
   * Rampe de VU-metre : couleur en fonction du NIVEAU atteint dans la colonne,
   * du bas (index 0) vers le haut. Convention d'un vrai VU : on part au vert et
   * les dernieres cellules virent au chaud.
   */
  ramp: string[]
  /**
   * Une couleur par bande de frequence (SUB -> AIR), telle que le tableau de la
   * PARTIE 1 du brief. C'est elle qui donne sa teinte a une colonne, en fonction
   * de la frequence que cette colonne mesure.
   */
  bands: string[]
  /** Couleur des faisceaux / wash d'ambiance. */
  ambient: string
  /** Couleur du flash de kick. */
  flash: string
}

export const PALETTES: readonly Palette[] = [
  {
    id: 'arcade',
    label: 'ARCADE (ref.jpg)',
    ramp: ['#12ff5a', '#12ff5a', '#9dff36', '#ffe600', '#ffa300', '#ff4d00', '#ff1f1f', '#ff00c8'],
    bands: ['#ff1f1f', '#ff6a00', '#ffe600', '#12ff5a', '#00e0ff', '#7fb4ff'],
    ambient: '#1e7a8c',
    flash: '#ffffff',
  },
  {
    id: 'cyberpunk',
    label: 'CYBERPUNK',
    ramp: ['#00fff0', '#00fff0', '#00d0ff', '#7b2bff', '#ff2bd6', '#ff2bd6', '#ffd400', '#ffffff'],
    bands: ['#ff2bd6', '#ff4fa8', '#ffd400', '#00fff0', '#00d0ff', '#c8e4ff'],
    ambient: '#2a1b6b',
    flash: '#00fff0',
  },
  {
    id: 'spectrum',
    label: 'SPECTRE (brief)',
    ramp: ['#2f8bff', '#1affc8', '#8cff2b', '#ffe600', '#ffa300', '#ff4d00', '#ff0018', '#ff5ac8'],
    bands: ['#ff0018', '#ff4d00', '#ffc400', '#9dff36', '#1affc8', '#5ec8ff'],
    ambient: '#141a3a',
    flash: '#fff4e0',
  },
  {
    id: 'sodium',
    label: 'SODIUM',
    ramp: ['#3d0a00', '#8a1c00', '#d94100', '#ff7a00', '#ffb03a', '#ffd98a', '#fff0c9', '#ffffff'],
    bands: ['#8a1c00', '#d94100', '#ff7a00', '#ffb03a', '#ffd98a', '#fff0c9'],
    ambient: '#2a1200',
    flash: '#ffd9a0',
  },
] as const

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/**
 * Systeme synesthesique de Scriabine (PARTIE 1.2) : la tonalite du morceau
 * teinte globalement la scene. Index 0 = Do, 11 = Si (numerotation Spotify).
 */
export const SCRIABIN_KEYS: readonly string[] = [
  '#ff0000', // C  — rouge
  '#a01fd0', // C# — violet
  '#ffff00', // D  — jaune
  '#8a8a8a', // D# — acier
  '#a0d0ff', // E  — bleu ciel
  '#c02020', // F  — rouge sombre
  '#3050ff', // F# — bleu vif
  '#ff9000', // G  — orange
  '#c060ff', // G# — lilas
  '#20c060', // A  — vert
  '#606080', // A# — gris acier
  '#60c0ff', // B  — bleu clair
]

/** Couleur de teinte tonale, ou blanc si la tonalite est inconnue. */
export function keyTint(key: number, out: Color): Color {
  if (key < 0 || key > 11) return out.setRGB(1, 1, 1)
  return out.set(SCRIABIN_KEYS[key])
}

const _a = new Color()
const _b = new Color()

/** Echantillonne la rampe verticale a la position `t` (0 = bas, 1 = haut). */
export function sampleRamp(ramp: Color[], t: number, out: Color): Color {
  const clamped = t <= 0 ? 0 : t >= 1 ? 0.9999 : t
  const scaled = clamped * (ramp.length - 1)
  const i = Math.floor(scaled)
  _a.copy(ramp[i])
  _b.copy(ramp[Math.min(ramp.length - 1, i + 1)])
  return out.copy(_a).lerp(_b, scaled - i)
}

const _f = new Color()
const _g = new Color()
const _hslA = { h: 0, s: 0, l: 0 }
const _hslB = { h: 0, s: 0, l: 0 }

/**
 * Melange de deux couleurs en HSL, la teinte suivant le PLUS COURT chemin sur
 * la roue chromatique.
 *
 * `Color.lerpHSL` de three interpole la teinte lineairement, sans gerer le
 * bouclage : passer du magenta (h≈0.87) au vert (h≈0.33) traverse alors le
 * bleu et le cyan, et une colonne se retrouvait cyan au sommet alors qu'elle
 * etait verte partout ailleurs. Le plus court chemin garde la progression
 * monotone a l'interieur d'une colonne.
 */
export function mixHueShortest(a: Color, b: Color, t: number, out: Color): Color {
  a.getHSL(_hslA)
  b.getHSL(_hslB)
  let dh = _hslB.h - _hslA.h
  if (dh > 0.5) dh -= 1
  else if (dh < -0.5) dh += 1
  const h = (((_hslA.h + dh * t) % 1) + 1) % 1
  return out.setHSL(
    h,
    _hslA.s + (_hslB.s - _hslA.s) * t,
    _hslA.l + (_hslB.l - _hslA.l) * t,
  )
}

/**
 * Couleur d'une colonne en fonction de la FREQUENCE qu'elle mesure.
 *
 * C'est la mise en oeuvre directe du tableau de la PARTIE 1 du brief : basses
 * frequences vers le rouge, hautes vers le bleu. Rien n'est tire au hasard —
 * une colonne donnee garde toujours la meme famille de teinte, parce qu'elle
 * mesure toujours la meme bande.
 *
 * `stepped` : la colonne prend la couleur exacte de sa bande (aplats francs,
 * six teintes sur tout le mur). Sinon la teinte glisse continument d'une bande
 * a l'autre le long de l'axe log-frequentiel.
 */
export function frequencyColor(
  bandColors: Color[],
  hz: number,
  stepped: boolean,
  out: Color,
): Color {
  if (stepped) {
    for (let i = 0; i < BANDS.length; i++) {
      if (hz < BANDS[i].to) return out.copy(bandColors[i])
    }
    return out.copy(bandColors[bandColors.length - 1])
  }
  // Position continue sur l'axe log entre le centre de la premiere bande et
  // celui de la derniere.
  const first = Math.log2(Math.sqrt(BANDS[0].from * BANDS[0].to))
  const last = Math.log2(Math.sqrt(BANDS[BANDS.length - 1].from * BANDS[BANDS.length - 1].to))
  const t = clamp01((Math.log2(Math.max(1, hz)) - first) / (last - first)) * (bandColors.length - 1)
  const i = Math.floor(t)
  _f.copy(bandColors[i])
  _g.copy(bandColors[Math.min(bandColors.length - 1, i + 1)])
  return out.copy(_f).lerp(_g, t - i)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Variante quantifiee : la cellule prend EXACTEMENT une couleur de la palette,
 * sans interpolation. C'est ce qui donne les aplats francs de `ref.jpg` — un
 * degrade continu produit des teintes intermediaires boueuses (olive, mauve)
 * qu'on ne voit sur aucun vrai mur de LED.
 */
export function sampleRampStepped(ramp: Color[], t: number, out: Color): Color {
  const clamped = t <= 0 ? 0 : t >= 1 ? 0.9999 : t
  return out.copy(ramp[Math.floor(clamped * ramp.length)])
}

export function toColors(hexes: string[]): Color[] {
  return hexes.map((h) => new Color(h))
}

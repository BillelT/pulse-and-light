import { Color } from 'three'

/**
 * PARTIE 3.1 du brief : la traduction litterale frequence -> longueur d'onde
 * donne un arc-en-ciel chaotique. On force donc des palettes restreintes, et
 * la musique ne choisit que *ou* on se trouve dans la palette, pas la teinte
 * elle-meme.
 */
export interface Palette {
  id: string
  label: string
  /** Rampe verticale du VU-metre, du bas (index 0) vers le haut. */
  ramp: string[]
  /** Une couleur par bande de frequence (SUB -> AIR), pour teinter les colonnes. */
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
    ramp: ['#12ff5a', '#12ff5a', '#00e0ff', '#2f6bff', '#ffe600', '#ff8a00', '#ff1f1f', '#ff00c8'],
    bands: ['#ff1f1f', '#ff8a00', '#ffe600', '#12ff5a', '#00e0ff', '#8ad4ff'],
    ambient: '#1e7a8c',
    flash: '#ffffff',
  },
  {
    id: 'cyberpunk',
    label: 'CYBERPUNK',
    ramp: ['#00fff0', '#00d0ff', '#0a7dff', '#7b2bff', '#ff2bd6', '#ff2bd6', '#ffd400', '#ffffff'],
    bands: ['#ff2bd6', '#ff4fa8', '#ffd400', '#00fff0', '#00d0ff', '#ffffff'],
    ambient: '#2a1b6b',
    flash: '#00fff0',
  },
  {
    id: 'spectrum',
    label: 'SPECTRE (brief)',
    ramp: ['#ff0018', '#ff4d00', '#ffa300', '#ffe600', '#8cff2b', '#1affc8', '#2f8bff', '#a08cff'],
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

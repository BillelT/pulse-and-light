import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace } from 'three'
import { BANDS } from '../audio/bands'
import { COLUMN_F_HI, COLUMN_F_LO } from '../audio/columns'
import { COLUMN_COUNT, type AudioFrame } from '../audio/types'

/**
 * Le modele "son -> encre".
 *
 * Le mur ne dessine pas un spectre : il RECOIT du pigment. La chaine
 * d'analyse (log10(1 + A*K), plancher/plafond, attaque/decroissance
 * asymetriques) ne change pas d'un iota — c'est toujours elle qui produit
 * `frame.columns`, l'energie par tranche log-frequentielle. Ce module ne fait
 * qu'en tirer trois grandeurs, qui sont les trois etats du pigment sur une
 * feuille mouillee :
 *
 *  - `wet`   le pigment qu'on depose MAINTENANT. Suit l'energie instantanee,
 *            donc respire au rythme du morceau.
 *  - `stain` le pigment DEJA BU par le papier. Integrale du depot, avec un
 *            sechage lent : c'est la memoire du morceau, ce qui fait qu'un
 *            refrain laisse une trace au lieu de disparaitre avec sa derniere
 *            croche. Sans lui, le mur redevient un VU-metre.
 *  - `flash` la goutte lachee sur un transitoire. Monte d'un coup sur un
 *            onset et se resorbe en ~0,3 s.
 *
 * Deux phenomenes physiques s'y ajoutent, et ce sont eux qui font la
 * difference entre "un degrade" et "de l'encre" :
 *
 *  - le depot est SUPERLINEAIRE (`wet^2`) : un passage discret n'imbibe
 *    presque rien, un passage fort sature la fibre. C'est ce qui donne du
 *    contraste entre les sections d'un morceau ;
 *  - la tache DIFFUSE lateralement, d'une tranche de frequence a ses
 *    voisines, exactement comme le pigment migre dans le papier humide. Les
 *    frontieres nettes entre bandes s'effacent toutes seules.
 *
 * Le tout est publie dans une texture 1D (R = wet, G = stain, B = flash) lue
 * par le shader du mur. Une texture plutot que des uniformes : le shader
 * echantillonne a une position CONTINUE, deformee par le bruit, et
 * l'interpolation lineaire du sampler est exactement le lissage voulu.
 */

/** Tranches de frequence gravees dans la texture. */
const SLOT_COUNT = 160

/** Vitesse d'imbibition du papier, par seconde et a energie maximale. */
const DEPOSIT = 0.85
/** Constante de sechage du lavis, en secondes. */
const DRY_TIME = 8
/** Constante de resorption d'une goutte, en secondes. */
const FLASH_TIME = 0.3
/** Diffusion laterale du pigment, en tranches^2 par seconde. */
const BLEED = 14
/** Pas de diffusion maximal : au dela le schema explicite diverge (limite 0,5). */
const BLEED_STEP = 0.24

function clampIndex(i: number): number {
  return i < 0 ? 0 : i > COLUMN_COUNT - 1 ? COLUMN_COUNT - 1 : i
}

function byte(v: number): number {
  const x = v * 255
  return x < 0 ? 0 : x > 255 ? 255 : x
}

export class InkField {
  /** Pigment depose a l'instant, par tranche. */
  private readonly wet = new Float32Array(SLOT_COUNT)
  /** Pigment bu par le papier, par tranche. */
  private readonly stain = new Float32Array(SLOT_COUNT)
  /** Goutte lachee sur transitoire, par tranche. */
  private readonly flash = new Float32Array(SLOT_COUNT)
  /** Tampon de travail des passes de flou / diffusion. */
  private readonly scratch = new Float32Array(SLOT_COUNT)

  private readonly data = new Uint8Array(SLOT_COUNT * 4)
  private lastOnset = -1

  readonly texture: DataTexture

  constructor() {
    const texture = new DataTexture(this.data, SLOT_COUNT, 1)
    // Donnee numerique, pas une couleur : aucune conversion d'espace.
    texture.colorSpace = NoColorSpace
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.generateMipmaps = false
    texture.needsUpdate = true
    this.texture = texture
  }

  /**
   * Avance le pigment d'une frame. Aucune allocation : tous les tampons sont
   * alloues une fois, la boucle de rendu ne doit rien laisser au GC.
   */
  update(frame: AudioFrame, dt: number): void {
    const d = dt < 1e-4 ? 1e-4 : dt > 0.05 ? 0.05 : dt

    this.resample(frame)
    this.blurWet()
    this.soak(d)
    this.drop(frame, d)
    this.diffuse(d)
    this.publish()
  }

  dispose(): void {
    this.texture.dispose()
  }

  /**
   * Les 13 colonnes de l'analyse -> les 160 tranches du mur.
   *
   * Meme axe log-frequentiel que `columnCenterHz` : la tranche `u` porte la
   * frequence 2^(LOG_LO + (LOG_HI - LOG_LO) * u), et la colonne `i` est
   * centree en u = (i + 0.5) / COLUMN_COUNT. La palette est construite sur ce
   * meme axe, donc la teinte d'un endroit du mur correspond bien a la
   * frequence qui l'a peint.
   */
  private resample(frame: AudioFrame): void {
    const cols = frame.columns
    for (let j = 0; j < SLOT_COUNT; j++) {
      const c = (j / (SLOT_COUNT - 1)) * COLUMN_COUNT - 0.5
      const i = Math.floor(c)
      const f = c - i
      const a = cols[clampIndex(i)]
      const b = cols[clampIndex(i + 1)]
      this.wet[j] = a + (b - a) * f
    }
  }

  /** Le bord d'une zone humide n'est jamais net : deux passes de 1-2-1. */
  private blurWet(): void {
    const src = this.wet
    const dst = this.scratch
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < SLOT_COUNT; j++) {
        const l = src[j > 0 ? j - 1 : 0]
        const r = src[j < SLOT_COUNT - 1 ? j + 1 : SLOT_COUNT - 1]
        dst[j] = 0.25 * l + 0.5 * src[j] + 0.25 * r
      }
      src.set(dst)
    }
  }

  /** Imbibition : depot superlineaire, sechage exponentiel. */
  private soak(d: number): void {
    const dry = Math.exp(-d / DRY_TIME)
    const gain = DEPOSIT * d
    for (let j = 0; j < SLOT_COUNT; j++) {
      const w = this.wet[j]
      const s = this.stain[j] * dry + w * w * gain
      this.stain[j] = s > 1 ? 1 : s
    }
  }

  /**
   * Goutte sur transitoire. On se cale sur `onsetCount` et non sur `onset` :
   * l'analyse tourne a 125 Hz et le rendu a 60, un booleen valable une seule
   * frame d'analyse serait rate une fois sur deux.
   */
  private drop(frame: AudioFrame, d: number): void {
    const decay = Math.exp(-d / FLASH_TIME)
    for (let j = 0; j < SLOT_COUNT; j++) this.flash[j] *= decay

    if (frame.onsetCount === this.lastOnset) return
    this.lastOnset = frame.onsetCount
    for (let j = 0; j < SLOT_COUNT; j++) {
      // Une goutte tombe la ou l'energie est : un kick tache le grave, un
      // coup de charleston tache l'aigu.
      const v = this.flash[j] + this.wet[j] * 0.9 + 0.08
      this.flash[j] = v > 1 ? 1 : v
    }
  }

  /**
   * Migration laterale du pigment (schema explicite, bords de Neumann : rien
   * ne sort de la feuille). Le pas est subdivise pour rester sous la limite de
   * stabilite quel que soit le framerate.
   */
  private diffuse(d: number): void {
    let remaining = BLEED * d
    const src = this.stain
    const dst = this.scratch
    while (remaining > 1e-6) {
      const k = remaining > BLEED_STEP ? BLEED_STEP : remaining
      remaining -= k
      for (let j = 0; j < SLOT_COUNT; j++) {
        const l = src[j > 0 ? j - 1 : 0]
        const r = src[j < SLOT_COUNT - 1 ? j + 1 : SLOT_COUNT - 1]
        dst[j] = src[j] + k * (l + r - 2 * src[j])
      }
      src.set(dst)
    }
  }

  private publish(): void {
    const data = this.data
    for (let j = 0; j < SLOT_COUNT; j++) {
      const o = j * 4
      data[o] = byte(this.wet[j])
      data[o + 1] = byte(this.stain[j])
      data[o + 2] = byte(this.flash[j])
      data[o + 3] = 255
    }
    this.texture.needsUpdate = true
  }
}

/** Largeur de la rampe de teintes. */
const PALETTE_SIZE = 128

/**
 * Dilution du pigment.
 *
 * Les couleurs du brief sont des couleurs de LED — pensees pour etre EMISES
 * dans le noir. Posees telles quelles sur du papier blanc elles donnent de la
 * gouache : des aplats francs qui ecrasent la feuille et transforment le mur
 * en drapeau arc-en-ciel. Un lavis, c'est du pigment dilue.
 *
 * Diluer, c'est raccourcir le vecteur d'ABSORPTION (1 - couleur) sans changer
 * sa direction : on garde exactement le pigment de la bande, on ne change que
 * la quantite d'eau. C'est aussi ce que fait physiquement un pinceau.
 */
const DILUTION = 0.42

/**
 * Profondeur visee, en luminance perdue, pour toutes les bandes.
 *
 * Une dilution uniforme donnerait un mur desequilibre : a quantite d'eau
 * egale, le rouge (luminance 0,30) mord six fois plus le papier que le vert
 * (0,86). Le grave ressortait donc en aplat franc et l'aigu disparaissait —
 * alors que ce sont deux moities du meme spectre. On corrige la concentration
 * de chaque pigment pour que toutes les bandes creusent le papier a peu pres
 * autant. Les bornes evitent les deux exces : un rouge qui vire au fluo si on
 * le concentre, un vert qui vire au noir.
 */
const REFERENCE_DEPTH = 0.4
const CONCENTRATION_RANGE: [number, number] = [0.5, 1.7]

/** Luminance relative (Rec. 709) : ce que l'oeil lit comme "clair" ou "fonce". */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Rampe frequence -> teinte, construite a partir des couleurs de bande du
 * brief (PARTIE 1) et sur le meme axe log que les tranches d'encre.
 *
 * Chaque bande est ancree a sa frequence centrale GEOMETRIQUE (et non a son
 * milieu arithmetique) : sur un axe logarithmique, c'est le seul point qui
 * tombe visuellement au centre de la bande. Entre deux ancres, interpolation
 * lineaire — c'est deja un fondu de pigment.
 *
 * La texture est stockee telle quelle (`NoColorSpace`) : le shader du mur
 * travaille en sRGB puis convertit une seule fois en sortie, ce qui garde un
 * controle direct sur ce qui est reellement affiche.
 */
export function createInkPalette(): DataTexture {
  const logLo = Math.log2(COLUMN_F_LO)
  const logHi = Math.log2(COLUMN_F_HI)
  const anchors = BANDS.map((band) => {
    const r = ((band.hex >> 16) & 255) / 255
    const g = ((band.hex >> 8) & 255) / 255
    const b = (band.hex & 255) / 255
    const strength =
      DILUTION *
      clamp(REFERENCE_DEPTH / (1 - luminance(r, g, b)), CONCENTRATION_RANGE[0], CONCENTRATION_RANGE[1])
    return {
      u: (Math.log2(Math.sqrt(band.from * band.to)) - logLo) / (logHi - logLo),
      r: clamp(1 - (1 - r) * strength, 0, 1),
      g: clamp(1 - (1 - g) * strength, 0, 1),
      b: clamp(1 - (1 - b) * strength, 0, 1),
    }
  })

  const data = new Uint8Array(PALETTE_SIZE * 4)
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const u = i / (PALETTE_SIZE - 1)
    let hi = 0
    while (hi < anchors.length && anchors[hi].u < u) hi++

    let color: { r: number; g: number; b: number }
    if (hi === 0) color = anchors[0]
    else if (hi === anchors.length) color = anchors[anchors.length - 1]
    else {
      const a = anchors[hi - 1]
      const b = anchors[hi]
      const f = (u - a.u) / (b.u - a.u)
      color = { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f }
    }

    const o = i * 4
    data[o] = byte(color.r)
    data[o + 1] = byte(color.g)
    data[o + 2] = byte(color.b)
    data[o + 3] = 255
  }

  const texture = new DataTexture(data, PALETTE_SIZE, 1)
  texture.colorSpace = NoColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

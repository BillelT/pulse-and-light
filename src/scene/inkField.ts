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
export const SLOT_COUNT = 160

/** Pas de diffusion maximal : au dela le schema explicite diverge (limite 0,5). */
const BLEED_STEP = 0.24

/** Reglages du modele de pigment, exposes dans l'onglet Ink. */
export interface InkFieldSettings {
  /** Vitesse d'imbibition du papier, par seconde et a energie maximale. */
  deposit: number
  /** Constante de sechage du lavis, en secondes. */
  dryTime: number
  /** Constante de resorption d'une goutte, en secondes. */
  flashTime: number
  /** Diffusion laterale du pigment, en tranches^2 par seconde. */
  spread: number
}

function clampIndex(i: number): number {
  return i < 0 ? 0 : i > COLUMN_COUNT - 1 ? COLUMN_COUNT - 1 : i
}

function byte(v: number): number {
  const x = v * 255
  return x < 0 ? 0 : x > 255 ? 255 : x
}

export class InkField {
  /** Pigment depose a l'instant, par tranche. */
  private readonly wetBuf = new Float32Array(SLOT_COUNT)
  /** Pigment bu par le papier, par tranche. */
  private readonly stainBuf = new Float32Array(SLOT_COUNT)
  /** Goutte lachee sur transitoire, par tranche. */
  private readonly flashBuf = new Float32Array(SLOT_COUNT)
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

  /** Lecture seule, pour le traceur de l'onglet Ink. */
  get wet(): Readonly<Float32Array> {
    return this.wetBuf
  }
  get stain(): Readonly<Float32Array> {
    return this.stainBuf
  }
  get flash(): Readonly<Float32Array> {
    return this.flashBuf
  }

  /** Rince la feuille : tout le pigment disparait immediatement. */
  reset(): void {
    this.wetBuf.fill(0)
    this.stainBuf.fill(0)
    this.flashBuf.fill(0)
    this.publish()
  }

  /**
   * Avance le pigment d'une frame. Aucune allocation : tous les tampons sont
   * alloues une fois, la boucle de rendu ne doit rien laisser au GC.
   */
  update(frame: AudioFrame, dt: number, settings: InkFieldSettings): void {
    const d = dt < 1e-4 ? 1e-4 : dt > 0.05 ? 0.05 : dt

    this.resample(frame)
    this.blurWet()
    this.soak(d, settings)
    this.drop(frame, d, settings)
    this.diffuse(d, settings)
    this.publish()
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
      this.wetBuf[j] = a + (b - a) * f
    }
  }

  /** Le bord d'une zone humide n'est jamais net : deux passes de 1-2-1. */
  private blurWet(): void {
    const src = this.wetBuf
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
  private soak(d: number, settings: InkFieldSettings): void {
    const dry = Math.exp(-d / Math.max(0.05, settings.dryTime))
    const gain = settings.deposit * d
    for (let j = 0; j < SLOT_COUNT; j++) {
      const w = this.wetBuf[j]
      const s = this.stainBuf[j] * dry + w * w * gain
      this.stainBuf[j] = s > 1 ? 1 : s
    }
  }

  /**
   * Goutte sur transitoire. On se cale sur `onsetCount` et non sur `onset` :
   * l'analyse tourne a 125 Hz et le rendu a 60, un booleen valable une seule
   * frame d'analyse serait rate une fois sur deux.
   */
  private drop(frame: AudioFrame, d: number, settings: InkFieldSettings): void {
    const decay = Math.exp(-d / Math.max(0.02, settings.flashTime))
    for (let j = 0; j < SLOT_COUNT; j++) this.flashBuf[j] *= decay

    if (frame.onsetCount === this.lastOnset) return
    this.lastOnset = frame.onsetCount
    for (let j = 0; j < SLOT_COUNT; j++) {
      // Une goutte tombe la ou l'energie est : un kick tache le grave, un
      // coup de charleston tache l'aigu.
      const v = this.flashBuf[j] + this.wetBuf[j] * 0.9 + 0.08
      this.flashBuf[j] = v > 1 ? 1 : v
    }
  }

  /**
   * Migration laterale du pigment (schema explicite, bords de Neumann : rien
   * ne sort de la feuille). Le pas est subdivise pour rester sous la limite de
   * stabilite quel que soit le framerate.
   */
  private diffuse(d: number, settings: InkFieldSettings): void {
    let remaining = settings.spread * d
    const src = this.stainBuf
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
      data[o] = byte(this.wetBuf[j])
      data[o + 1] = byte(this.stainBuf[j])
      data[o + 2] = byte(this.flashBuf[j])
      data[o + 3] = 255
    }
    this.texture.needsUpdate = true
  }
}

/**
 * Instance unique, hors React — comme le moteur d'analyse.
 *
 * Elle est lue a 60 fps par le mur ET par le traceur de l'onglet Ink, et sa
 * texture doit survivre au double montage de `StrictMode` : un champ possede
 * par un composant serait detruit par le premier demontage, et le mur
 * repartirait d'une feuille vierge a chaque rechargement a chaud.
 */
export const inkField = new InkField()

/** Largeur de la rampe de pigments. */
const PALETTE_SIZE = 128

/**
 * Profondeur visee, en luminance perdue par unite de concentration.
 *
 * A concentration egale, un pigment jaune mord quatre fois moins le papier
 * qu'un rouge : le grave ressortait en aplat franc et l'aigu disparaissait,
 * alors que ce sont deux moities du meme spectre. On corrige donc la
 * concentration de chaque bande pour que toutes creusent le papier a peu pres
 * autant. Les bornes evitent les deux exces : un rouge qui vire au fluo si on
 * le concentre, un jaune qui vire au brun.
 */
const REFERENCE_LOSS = 0.4
const GAIN_RANGE: [number, number] = [0.4, 2]
/** Le gain est stocke sur un octet : il faut le ramener dans 0..1. */
const GAIN_SCALE = 2

/** Luminance relative (Rec. 709) : ce que l'oeil lit comme "clair" ou "fonce". */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Rampe frequence -> pigment, construite a partir des couleurs de bande du
 * brief (PARTIE 1) et sur le meme axe log que les tranches d'encre.
 *
 * On n'y stocke pas une couleur mais un PIGMENT, c'est a dire deux choses :
 *
 *  - RGB : la direction du vecteur d'ABSORPTION (1 - couleur), normalisee.
 *    C'est l'identite du pigment, ce qui ne change jamais — de l'encre rouge
 *    reste de l'encre rouge, diluee ou pure.
 *  - A   : le gain de concentration propre a cette bande (voir REFERENCE_LOSS).
 *
 * Separer les deux est ce qui permet au mur de tirer DEUX rendus du meme
 * pigment : un lavis presque transparent, et un trait franc — sans jamais
 * dupliquer la palette ni desaccorder les deux. La teinte reste exactement
 * celle du brief dans les deux cas.
 *
 * Chaque bande est ancree a sa frequence centrale GEOMETRIQUE (et non a son
 * milieu arithmetique) : sur un axe logarithmique, c'est le seul point qui
 * tombe visuellement au centre de la bande. Entre deux ancres, interpolation
 * lineaire — c'est deja un fondu de pigment.
 *
 * La texture est stockee telle quelle (`NoColorSpace`) : ce sont des donnees,
 * pas des couleurs, et le shader s'occupe seul de la conversion de sortie.
 */
export function createInkPalette(): DataTexture {
  const logLo = Math.log2(COLUMN_F_LO)
  const logHi = Math.log2(COLUMN_F_HI)
  const anchors = BANDS.map((band) => {
    const absorb = [
      1 - ((band.hex >> 16) & 255) / 255,
      1 - ((band.hex >> 8) & 255) / 255,
      1 - (band.hex & 255) / 255,
    ]
    // Direction du pigment : au moins un canal a 1, sinon un pigment clair
    // (le jaune) plafonnerait bien avant d'avoir l'air d'un trait.
    const peak = Math.max(absorb[0], absorb[1], absorb[2], 1e-4)
    const dir = absorb.map((a) => a / peak)
    const gain = clamp(REFERENCE_LOSS / luminance(dir[0], dir[1], dir[2]), GAIN_RANGE[0], GAIN_RANGE[1])
    return {
      u: (Math.log2(Math.sqrt(band.from * band.to)) - logLo) / (logHi - logLo),
      r: dir[0],
      g: dir[1],
      b: dir[2],
      a: gain / GAIN_SCALE,
    }
  })

  const data = new Uint8Array(PALETTE_SIZE * 4)
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const u = i / (PALETTE_SIZE - 1)
    let hi = 0
    while (hi < anchors.length && anchors[hi].u < u) hi++

    let pigment: { r: number; g: number; b: number; a: number }
    if (hi === 0) pigment = anchors[0]
    else if (hi === anchors.length) pigment = anchors[anchors.length - 1]
    else {
      const a = anchors[hi - 1]
      const b = anchors[hi]
      const f = (u - a.u) / (b.u - a.u)
      pigment = {
        r: a.r + (b.r - a.r) * f,
        g: a.g + (b.g - a.g) * f,
        b: a.b + (b.b - a.b) * f,
        a: a.a + (b.a - a.a) * f,
      }
    }

    const o = i * 4
    data[o] = byte(pigment.r)
    data[o + 1] = byte(pigment.g)
    data[o + 2] = byte(pigment.b)
    data[o + 3] = byte(pigment.a)
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

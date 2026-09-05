import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace } from 'three'
import { BANDS } from '../audio/bands'
import { COLUMN_F_HI, COLUMN_F_LO } from '../audio/columns'

/**
 * Rampe frequence -> couleur BANDS complete, indexee par UV.x du mur.
 *
 * Chaque bande du brief (Sub, Bass, Low-Mid, Mid, High-Mid, Air) est ancree
 * a sa frequence centrale GEOMETRIQUE sur l'axe log qui va de COLUMN_F_LO
 * a COLUMN_F_HI (le meme que celui de `audioTexture`). Entre deux ancres
 * on interpole lineairement — c'est deja un fondu de teintes.
 *
 * On stocke le pigment comme ABSORPTION (1 - couleur) en espace LINEAIRE :
 * la simulation ecrit `absorption * densite` dans le FBO, l'affichage
 * calcule `papier * (1 - fbo)` (Beer-Lambert simplifie), et une bande
 * rouge donne bien du rouge sur du blanc, pas du cyan (ce qu'on aurait en
 * multipliant par la couleur directement).
 *
 * `NoColorSpace` + valeurs pre-converties : le sampler linear du GPU
 * interpole les nombres tels quels, aucune conversion parasite.
 */
const PALETTE_SIZE = 128

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function byte(v: number): number {
  const x = v * 255
  return x < 0 ? 0 : x > 255 ? 255 : Math.round(x)
}

export function createInkPalette(): DataTexture {
  const logLo = Math.log2(COLUMN_F_LO)
  const logHi = Math.log2(COLUMN_F_HI)

  const anchors = BANDS.map((band) => {
    const rLin = srgbToLinear(((band.hex >> 16) & 255) / 255)
    const gLin = srgbToLinear(((band.hex >> 8) & 255) / 255)
    const bLin = srgbToLinear((band.hex & 255) / 255)
    return {
      u: (Math.log2(Math.sqrt(band.from * band.to)) - logLo) / (logHi - logLo),
      // Absorption = 1 - couleur (en lineaire).
      r: 1 - rLin,
      g: 1 - gLin,
      b: 1 - bLin,
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
      color = {
        r: a.r + (b.r - a.r) * f,
        g: a.g + (b.g - a.g) * f,
        b: a.b + (b.b - a.b) * f,
      }
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

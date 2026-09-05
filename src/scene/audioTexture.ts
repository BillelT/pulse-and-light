import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace } from 'three'
import { COLUMN_COUNT, type AudioFrame } from '../audio/types'

/**
 * Pont audio -> GPU.
 *
 * Le moteur d'analyse (`audio/engine.ts`) produit deja `frame.columns`, 13
 * colonnes log-frequentielles lissees en 0..1. On ne les envoie pas telles
 * quelles au shader : 13 texels, ca donne un escalier bien visible des qu'on
 * s'en sert pour piloter un champ. On les reechantillonne lineairement dans
 * une texture 1D de `SLOT_COUNT` texels (canal R = niveau), et le sampler
 * LinearFilter du GPU fait le reste : un fondu propre entre les colonnes.
 *
 * Instance unique, hors React, comme le moteur d'analyse : elle est lue a
 * 60 fps par le shader et doit survivre au double-montage de StrictMode.
 */

/** Resolution de la texture. Assez fin pour lisser 13 colonnes sans crenelage. */
export const SPECTRUM_SLOTS = 128

function clampIndex(i: number): number {
  return i < 0 ? 0 : i > COLUMN_COUNT - 1 ? COLUMN_COUNT - 1 : i
}

function byte(v: number): number {
  const x = v * 255
  return x < 0 ? 0 : x > 255 ? 255 : x
}

class AudioTexture {
  private readonly data = new Uint8Array(SPECTRUM_SLOTS * 4)
  readonly texture: DataTexture

  constructor() {
    const texture = new DataTexture(this.data, SPECTRUM_SLOTS, 1)
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

  /** Rince la texture : tous les slots retombent a 0 immediatement. */
  reset(): void {
    for (let j = 0; j < this.data.length; j++) this.data[j] = 0
    this.texture.needsUpdate = true
  }

  /**
   * Reechantillonne `frame.columns` dans les `SPECTRUM_SLOTS` texels. Aucun
   * lissage temporel supplementaire ici : l'attaque/decroissance est deja
   * appliquee en amont, tout autre lissage se ferait au detriment de la
   * lecture directe des reglages du panneau Light.
   */
  update(frame: AudioFrame): void {
    const cols = frame.columns
    const data = this.data
    for (let j = 0; j < SPECTRUM_SLOTS; j++) {
      // Position continue dans les colonnes, centree sur les texels : la
      // premiere colonne tombe sur le texel 0, la derniere sur le dernier.
      const c = (j / (SPECTRUM_SLOTS - 1)) * (COLUMN_COUNT - 1)
      const i = Math.floor(c)
      const f = c - i
      const a = cols[clampIndex(i)]
      const b = cols[clampIndex(i + 1)]
      const o = j * 4
      data[o] = byte(a + (b - a) * f)
      data[o + 1] = 0
      data[o + 2] = 0
      data[o + 3] = 255
    }
    this.texture.needsUpdate = true
  }
}

export const audioTexture = new AudioTexture()

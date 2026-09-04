import { EffectComposer } from '@react-three/postprocessing'
import { HalfFloatType } from 'three'
import { InkEffect } from './InkEffect'

/**
 * Chaine de post-processing : une seule passe, et aucun effet atmospherique
 * (pas de bloom, pas d'aberration chromatique, pas de vignette — le papier
 * est uniforme). `enableNormalPass` fournit les normales dont le trait a
 * besoin.
 */
export function Effects() {
  return (
    <EffectComposer enableNormalPass multisampling={0} frameBufferType={HalfFloatType}>
      <InkEffect />
    </EffectComposer>
  )
}

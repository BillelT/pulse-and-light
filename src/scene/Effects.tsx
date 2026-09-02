import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import {
  BlendFunction,
  KernelSize,
  ToneMappingMode,
  type BloomEffect,
  type ChromaticAberrationEffect,
  type NoiseEffect,
} from 'postprocessing'
import { HalfFloatType, Vector2 } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { readState, useStore } from '../state/store'

const _offset = new Vector2()

/**
 * Chaine de post-processing.
 *
 * Le bloom n'est pas un effet decoratif ici : c'est lui qui transforme des
 * boites emissives en tubes neon. Les cellules LED sortent avec des valeurs
 * > 1 (`toneMapped: false`), le seuil de luminance ne laisse donc passer
 * qu'elles, et jamais le decor.
 */
export function Effects() {
  const bloomRef = useRef<BloomEffect>(null)
  const chromaRef = useRef<ChromaticAberrationEffect>(null)
  const noiseRef = useRef<NoiseEffect>(null)

  const bloom = useStore((s) => s.visual.bloom)

  useFrame(() => {
    const frame = engine.currentFrame
    const visual = readState().visual

    if (bloomRef.current) {
      // Le bloom respire avec le morceau, sinon la scene parait figee sur les
      // passages calmes et saturee sur les drops.
      bloomRef.current.intensity = visual.bloom * (0.7 + frame.level * 0.5 + frame.beat * 0.25)
    }
    if (chromaRef.current) {
      // Aberration chromatique pilotee par les basses (recommandation du brief).
      const amount = (frame.bands[Band.Sub] * 0.7 + frame.beat * 0.3) * visual.chroma * 0.0022
      _offset.set(amount, amount * 0.6)
      chromaRef.current.offset = _offset
    }
    if (noiseRef.current) {
      // Traduction du timbre (PARTIE 3.4) : plus le son est brillant et agite,
      // plus l'image devient granuleuse.
      const grain = visual.grain * (0.06 + frame.flux * 0.55 + frame.brightness * 0.25)
      noiseRef.current.blendMode.opacity.value = Math.min(0.5, grain)
    }
  })

  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType}>
      <Bloom
        ref={bloomRef}
        intensity={bloom}
        // Seuil eleve : seules les LED (valeurs > 1) declenchent le halo.
        luminanceThreshold={0.62}
        luminanceSmoothing={0.14}
        kernelSize={KernelSize.MEDIUM}
        mipmapBlur
        radius={0.58}
      />
      <ChromaticAberration
        ref={chromaRef}
        blendFunction={BlendFunction.NORMAL}
        offset={[0, 0]}
        radialModulation
        modulationOffset={0.32}
      />
      <Noise ref={noiseRef} premultiply blendFunction={BlendFunction.SCREEN} opacity={0.1} />
      <Vignette eskil={false} offset={0.22} darkness={0.82} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}

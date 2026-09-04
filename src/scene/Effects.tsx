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
import { InkEffect } from './InkEffect'

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
  const ink = useStore((s) => s.visual.ink)
  return ink ? <InkChain /> : <NeonChain />
}

/**
 * Chaine de la DA "ink" : une seule passe, et surtout aucun effet
 * atmospherique. Pas de bloom (le brief supprime les halos), pas d'aberration
 * chromatique (l'image est noire et blanche), pas de vignette (le papier est
 * uniforme). `enableNormalPass` fournit les normales dont le trait a besoin.
 */
function InkChain() {
  return (
    <EffectComposer enableNormalPass multisampling={0} frameBufferType={HalfFloatType}>
      <InkEffect />
    </EffectComposer>
  )
}

function NeonChain() {
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
    // multisampling>0 : le renderer tourne sans antialiasing (`gl.antialias:
    // false` dans Scene.tsx, de toute facon sans effet une fois qu'on passe
    // par ce composer) et les liseres neon (RoomTrim, StageEdge...) sont des
    // aretes fines et tres lumineuses (toneMapped: false, multipliees). Sans
    // MSAA, une arete vue presque de face/dans l'axe alias en un seul pixel
    // a pleine intensite, que le bloom (mipmapBlur) etire alors en un trait
    // lumineux parasite, visible en orbitant la camera.
    <EffectComposer multisampling={4} frameBufferType={HalfFloatType}>
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

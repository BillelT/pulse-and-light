import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { useStore } from '../state/store'
import { AudioDriver } from './AudioDriver'
import { CaissonWall } from './CaissonWall'
import { Crowd } from './Crowd'
import { Effects } from './Effects'
import { INK_PAPER } from './ink'
import { InkSurfaces } from './InkSurfaces'
import { BACKGROUND } from './roomLayout'
import { CameraRig, DebugHelpers, Rig } from './Rig'
import { Stage } from './Stage'
import { SubCabinets } from './SubCabinets'

export function Scene() {
  const fog = useStore((s) => s.visual.fog)
  const fogColor = useStore((s) => s.debug.fogColor)
  const ink = useStore((s) => s.visual.ink)

  return (
    <Canvas
      // En mode encre, aucune surface n'est eclairee (materiaux plats) : les
      // ombres portees seraient calculees pour rien.
      shadows={!ink}
      // `flat` = pas de tone mapping au niveau du renderer : c'est la passe
      // ToneMapping du composer qui s'en charge, apres le bloom.
      flat
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 220, position: [0, 4.4, 18] }}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
    >
      <color attach="background" args={[ink ? INK_PAPER : BACKGROUND]} />
      {/* Brume volumetrique. Violette et non noire : une brume noire ne
          materialise rien, elle se contente d'effacer la scene des qu'on
          recule. Une brume teintee et peu dense laisse lire la profondeur tout
          en donnant un volume aux faisceaux.
          En mode encre : aucune brume. Le brief l'exclut explicitement (pas de
          halo atmospherique), et la profondeur passe par le trait. */}
      {!ink && <fogExp2 attach="fog" args={[fogColor, fog]} />}

      <AudioDriver />
      {ink && <InkSurfaces />}
      <CameraRig />
      <Rig />
      <DebugHelpers />

      <Suspense fallback={null}>
        <Stage />
        <CaissonWall />
        <SubCabinets />
        <Crowd />
        <Preload all />
      </Suspense>

      <Effects />
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { useStore } from '../state/store'
import { AudioDriver } from './AudioDriver'
import { CaissonWall } from './CaissonWall'
import { Effects } from './Effects'
import { BACKGROUND } from './roomLayout'
import { CameraRig, DebugHelpers, Rig } from './Rig'
import { Stage } from './Stage'
import { SubCabinets } from './SubCabinets'

export function Scene() {
  const fog = useStore((s) => s.visual.fog)
  const fogColor = useStore((s) => s.debug.fogColor)

  return (
    <Canvas
      shadows
      // `flat` = pas de tone mapping au niveau du renderer : c'est la passe
      // ToneMapping du composer qui s'en charge, apres le bloom.
      flat
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 220, position: [0, 4.4, 18] }}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
    >
      <color attach="background" args={[BACKGROUND]} />
      {/* Brume volumetrique. Violette et non noire : une brume noire ne
          materialise rien, elle se contente d'effacer la scene des qu'on
          recule. Une brume teintee et peu dense laisse lire la profondeur tout
          en donnant un volume aux faisceaux. */}
      <fogExp2 attach="fog" args={[fogColor, fog]} />

      <AudioDriver />
      <CameraRig />
      <Rig />
      <DebugHelpers />

      <Suspense fallback={null}>
        <Stage />
        <CaissonWall />
        <SubCabinets />
        <Preload all />
      </Suspense>

      <Effects />
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}

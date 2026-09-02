import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { useStore } from '../state/store'
import { AudioDriver } from './AudioDriver'
import { CaissonWall } from './CaissonWall'
import { Effects } from './Effects'
import { CameraRig, Rig } from './Rig'
import { Stage } from './Stage'
import { SubCabinets } from './SubCabinets'

const BACKGROUND = '#05070a'

export function Scene() {
  const fog = useStore((s) => s.visual.fog)

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
      {/* Brume volumetrique : elle materialise les faisceaux et evite que le
          fond ne soit un noir plat. */}
      <fogExp2 attach="fog" args={[BACKGROUND, fog]} />

      <AudioDriver />
      <CameraRig />
      <Rig />

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

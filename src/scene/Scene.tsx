import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { AudioDriver } from './AudioDriver'
import { Crowd } from './Crowd'
import { Effects } from './Effects'
import { INK_PAPER } from './ink'
import { InkWall } from './InkWall'
import { CameraRig, DebugHelpers } from './Rig'
import { Stage } from './Stage'
import { SubCabinets } from './SubCabinets'

export function Scene() {
  return (
    <Canvas
      // Materiaux plats, sans lumiere : aucune ombre a calculer.
      shadows={false}
      // `flat` = pas de tone mapping au niveau du renderer : la DA "ink" ne
      // pousse aucune valeur emissive, ce n'est plus necessaire ici.
      flat
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 220, position: [0, 4.4, 18] }}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
    >
      <color attach="background" args={[INK_PAPER]} />

      <AudioDriver />
      <CameraRig />
      <DebugHelpers />
      

      <Suspense fallback={null}>
        <InkWall />
        <Stage />
        <SubCabinets />
        <Crowd />
        <Preload all />
      </Suspense>

      <Effects />
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}

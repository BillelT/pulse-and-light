import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import { AudioDriver } from './AudioDriver'
import { Effects } from './Effects'
import { INK_PAPER } from './ink'
import { InkWall } from './InkWall'
import { CameraRig, DebugHelpers } from './Rig'
import { CAPTURE_ENABLED } from '../ui/CaptureButton'

export function Scene() {
  return (
    <Canvas
      // Materiaux plats, sans lumiere : aucune ombre a calculer.
      shadows={false}
      // `flat` = pas de tone mapping au niveau du renderer : la DA "ink" ne
      // pousse aucune valeur emissive, ce n'est plus necessaire ici.
      flat
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.01, far: 240, position: [0, 4.4, 18] }}
      // `preserveDrawingBuffer` uniquement quand le bouton de capture est
      // present (dev / preprod) : necessaire pour lire le canvas via
      // `toBlob`, inutile et legerement couteux en production.
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        alpha: false,
        preserveDrawingBuffer: CAPTURE_ENABLED,
      }}
    >
      <color attach="background" args={[INK_PAPER]} />

      <AudioDriver />
      <CameraRig />
      <DebugHelpers />

      <Suspense fallback={null}>
        <InkWall />
        <Preload all />
      </Suspense>

      <Effects />
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}

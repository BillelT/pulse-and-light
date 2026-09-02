import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { Color, Mesh, MeshBasicMaterial } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { useStore } from '../state/store'
import { paletteById } from './palettes'
import { makeGratingTexture, makeTileTexture } from './textures'

/**
 * Le decor : sol reflechissant, podium, regie, bandes lumineuses au sol.
 * Le sol renvoie la lumiere des caissons, c'est lui qui donne la profondeur
 * de la reference.
 */
export function Stage() {
  const paletteId = useStore((s) => s.visual.paletteId)
  const palette = useMemo(() => paletteById(paletteId), [paletteId])

  const grating = useMemo(() => makeGratingTexture(), [])
  const podiumGrating = useMemo(() => {
    const t = makeGratingTexture(18, 3)
    t.repeat.set(6, 6)
    return t
  }, [])
  const tiles = useMemo(() => makeTileTexture(), [])

  const stripMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.ramp[0]) }),
    [palette],
  )
  const rimMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.bands[4]) }),
    [palette],
  )

  useFrame(() => {
    // Les bandes de sol suivent les sub-basses : ancrage au sol, decay lent.
    const frame = engine.currentFrame
    const sub = frame.bands[Band.Sub]
    const air = frame.bands[Band.High]
    stripMaterial.color.set(palette.ramp[0]).multiplyScalar(0.1 + sub * 0.45)
    rimMaterial.color.set(palette.bands[4]).multiplyScalar(0.12 + air * 0.5 + frame.beat * 0.25)
  })

  return (
    <group>
      {/* Sol reflechissant : roughness faible + metalness elevee, comme demande
          dans le brief, pour faire rebondir la lumiere des caissons. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <MeshReflectorMaterial
          resolution={1024}
          mixBlur={1.6}
          mixStrength={22}
          blur={[300, 90]}
          depthScale={1.1}
          minDepthThreshold={0.35}
          maxDepthThreshold={1.35}
          mirror={0.32}
          roughness={1}
          metalness={0}
          color="#0d1013"
          roughnessMap={tiles}
        />
      </mesh>

      {/* Murs : ils ne sont presque jamais eclaires, mais ils recuperent le
          halo et empechent la scene de "fuir" dans le noir absolu. */}
      <mesh position={[0, 12, -16]} receiveShadow>
        <boxGeometry args={[70, 30, 1]} />
        <meshStandardMaterial color="#0c0e11" roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh position={[-24, 12, 2]} rotation-y={Math.PI / 2} receiveShadow>
        <boxGeometry args={[40, 30, 1]} />
        <meshStandardMaterial color="#0b0d10" roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh position={[24, 12, 2]} rotation-y={-Math.PI / 2} receiveShadow>
        <boxGeometry args={[40, 30, 1]} />
        <meshStandardMaterial color="#0b0d10" roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Estrade des caissons. */}
      <mesh position={[0, 0.12, -5.5]} receiveShadow castShadow>
        <boxGeometry args={[36, 0.24, 12]} />
        <meshStandardMaterial
          color="#1d2126"
          roughness={0.9}
          metalness={0.08}
          roughnessMap={grating}
        />
      </mesh>

      {/* Bandes lumineuses encastrees dans le sol (les lignes vertes de la ref). */}
      {[1.1, 1.9].map((z) => (
        <mesh key={z} position={[0, 0.035, z]} material={stripMaterial}>
          <boxGeometry args={[30, 0.05, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 1.5]}>
        <boxGeometry args={[34, 0.06, 0.9]} />
        <meshStandardMaterial
          color="#2c3137"
          roughness={0.88}
          metalness={0.08}
          roughnessMap={grating}
        />
      </mesh>

      {/* Podium de la regie. */}
      <mesh position={[0, 0.25, 4.6]} castShadow receiveShadow>
        <cylinderGeometry args={[2.55, 2.7, 0.5, 48]} />
        <meshStandardMaterial color="#191d22" roughness={0.9} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.52, 4.6]} receiveShadow>
        <cylinderGeometry args={[2.34, 2.34, 0.04, 48]} />
        <meshStandardMaterial
          color="#2c3238"
          roughness={0.88}
          metalness={0.08}
          roughnessMap={podiumGrating}
        />
      </mesh>
      {/* Lisere lumineux du podium : il reagit aux aigus. */}
      <mesh position={[0, 0.52, 4.6]} rotation-x={-Math.PI / 2} material={rimMaterial}>
        <ringGeometry args={[2.37, 2.52, 64]} />
      </mesh>

      <DjBooth />
    </group>
  )
}

/** Regie : table, mixeur, et l'operateur (echelle et point de lecture de la scene). */
function DjBooth() {
  const paletteId = useStore((s) => s.visual.paletteId)
  const palette = useMemo(() => paletteById(paletteId), [paletteId])
  const figureRef = useRef<Mesh>(null)
  const armsRef = useRef<Mesh>(null)
  const ledsMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.bands[3]) }),
    [palette],
  )

  useFrame((state) => {
    const frame = engine.currentFrame
    ledsMaterial.color.set(palette.bands[3]).multiplyScalar(0.3 + frame.bands[Band.Mid] * 1.6)
    // L'operateur respire avec le morceau : petit rebond sur les kicks.
    const t = state.clock.elapsedTime
    if (figureRef.current) {
      figureRef.current.position.y = 1.42 + frame.beat * 0.07 + Math.sin(t * 1.6) * 0.012
    }
    if (armsRef.current) {
      armsRef.current.rotation.z = 0.25 + frame.bands[Band.HighMid] * 0.35
    }
  })

  return (
    <group position={[0, 0.54, 4.6]}>
      {/* Plateau + pietement de la table. */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[2.6, 0.07, 0.95]} />
        <meshStandardMaterial color="#2a3037" roughness={0.8} metalness={0.12} />
      </mesh>
      {[
        [-1.22, -0.4],
        [1.22, -0.4],
        [-1.22, 0.4],
        [1.22, 0.4],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.51, z]} castShadow>
          <boxGeometry args={[0.05, 1.02, 0.05]} />
          <meshStandardMaterial color="#3a4148" roughness={0.8} metalness={0.12} />
        </mesh>
      ))}
      {/* Mixeur + bandeau de LED de la regie. */}
      <mesh position={[0, 1.09, 0.02]} castShadow>
        <boxGeometry args={[1.5, 0.09, 0.55]} />
        <meshStandardMaterial color="#242930" roughness={0.8} metalness={0.12} />
      </mesh>
      <mesh position={[0, 1.142, -0.16]} material={ledsMaterial}>
        <boxGeometry args={[1.32, 0.012, 0.05]} />
      </mesh>

      {/* Operateur, tres stylise : il sert d'echelle, pas de personnage. */}
      <group position={[0, 0, -0.62]}>
        <mesh ref={figureRef} position={[0, 1.42, 0]} castShadow>
          <capsuleGeometry args={[0.23, 0.5, 6, 14]} />
          <meshStandardMaterial color="#9aa0a6" roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh position={[0, 1.94, 0]} castShadow>
          <sphereGeometry args={[0.19, 20, 16]} />
          <meshStandardMaterial color="#b8bec4" roughness={0.8} metalness={0.05} />
        </mesh>
        {/* Casque. */}
        <mesh position={[0, 1.98, 0]} rotation-x={Math.PI / 2} castShadow>
          <torusGeometry args={[0.2, 0.035, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#15181c" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh ref={armsRef} position={[0, 1.62, 0]} castShadow>
          <boxGeometry args={[1.02, 0.11, 0.11]} />
          <meshStandardMaterial color="#9aa0a6" roughness={0.85} metalness={0.05} />
        </mesh>
        {[-0.13, 0.13].map((x) => (
          <mesh key={x} position={[x, 0.72, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.66, 4, 10]} />
            <meshStandardMaterial color="#2b3a5c" roughness={0.9} metalness={0.05} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

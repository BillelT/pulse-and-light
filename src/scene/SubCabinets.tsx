import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, Mesh, MeshBasicMaterial } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { useStore } from '../state/store'
import { paletteById } from './palettes'

/**
 * Implantation des caissons : deux stacks lateraux, comme une vraie sono de
 * salle. Une rangee frontale masquerait le bas des colonnes LED, alors que
 * c'est justement la que la reference est la plus lisible (les cellules
 * vertes du bas).
 */
const CABINETS = [
  { x: -10.6, y: 0.24, z: -1.2, rotationY: 0.34, phase: 0 },
  { x: -10.6, y: 1.48, z: -1.2, rotationY: 0.34, phase: 0.37 },
  { x: 10.6, y: 0.24, z: -1.2, rotationY: -0.34, phase: 0.74 },
  { x: 10.6, y: 1.48, z: -1.2, rotationY: -0.34, phase: 1.11 },
]

/**
 * Rangee de caissons de basses (point 3.1 du brief) : les membranes avancent
 * physiquement sur les frequences < 100 Hz. C'est le seul element de la scene
 * qui bouge en translation — tout le reste ne fait que changer de lumiere,
 * donc ce mouvement porte a lui seul la sensation de pression sonore.
 */
export function SubCabinets() {
  const paletteId = useStore((s) => s.visual.paletteId)
  const palette = useMemo(() => paletteById(paletteId), [paletteId])

  const conesRef = useRef<Mesh[]>([])
  const badgeMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.bands[0]) }),
    [palette],
  )

  useFrame((state) => {
    const frame = engine.currentFrame
    // Sub domine, la basse complete : c'est le "< 100 Hz" du brief, elargi
    // parce qu'un kick reel deborde toujours au dessus de 60 Hz.
    const push = frame.bands[Band.Sub] * 0.75 + frame.bands[Band.Bass] * 0.25
    const t = state.clock.elapsedTime

    for (let i = 0; i < conesRef.current.length; i++) {
      const cone = conesRef.current[i]
      if (!cone) continue
      const phase = CABINETS[(i / 2) | 0]?.phase ?? 0
      // Le leger dephasage entre caissons evite l'effet "un seul gros objet".
      const wobble = 1 + 0.12 * Math.sin(t * 9 + phase * 4)
      cone.position.z = 0.36 + push * 0.2 * wobble
      cone.scale.setScalar(1 + push * 0.05)
    }
    badgeMaterial.color.set(palette.bands[0]).multiplyScalar(0.15 + push * 0.9)
  })

  return (
    <group>
      {CABINETS.map((cab, index) => (
        <group
          key={`${cab.x}:${cab.y}`}
          position={[cab.x, cab.y, cab.z]}
          rotation-y={cab.rotationY}
        >
          {/* Coffre. */}
          <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 1.24, 0.78]} />
            <meshStandardMaterial color="#23282e" roughness={0.72} metalness={0.28} />
          </mesh>
          {/* Renforts d'angle : detail "industriel epure" du brief. */}
          {[-1.19, 1.19].map((x) => (
            <mesh key={x} position={[x, 0.62, 0]} castShadow>
              <boxGeometry args={[0.08, 1.28, 0.84]} />
              <meshStandardMaterial color="#5b636b" roughness={0.42} metalness={0.25} />
            </mesh>
          ))}
          {/* Deux haut-parleurs par caisson. */}
          {[-0.6, 0.6].map((x, sub) => (
            <group key={x} position={[x, 0.62, 0]}>
              <mesh position={[0, 0, 0.34]}>
                <torusGeometry args={[0.46, 0.05, 8, 24]} />
                <meshStandardMaterial color="#464e56" roughness={0.5} metalness={0.25} />
              </mesh>
              <mesh
                ref={(node) => {
                  if (node) conesRef.current[index * 2 + sub] = node
                }}
                position={[0, 0, 0.36]}
                rotation-x={-Math.PI / 2}
                castShadow
              >
                <coneGeometry args={[0.44, 0.2, 24, 1, true]} />
                <meshStandardMaterial
                  color="#0a0c0e"
                  roughness={0.55}
                  metalness={0.3}
                  side={DoubleSide}
                />
              </mesh>
            </group>
          ))}
          {/* Temoin de niveau du caisson. */}
          <mesh position={[0, 0.06, 0.4]} material={badgeMaterial}>
            <boxGeometry args={[0.7, 0.02, 0.02]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

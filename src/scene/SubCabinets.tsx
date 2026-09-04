import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { INK_SURFACE } from './ink'

/**
 * Implantation des caissons : deux stacks lateraux, comme une vraie sono de
 * salle. Une rangee frontale masquerait le bas des colonnes LED, alors que
 * c'est justement la que la reference est la plus lisible (les cellules
 * vertes du bas).
 */
const CABINETS = [
  { x: -15.6, y: 0.24, z: -10, rotationY: 0.34, phase: 0 },
  { x: -15.6, y: 1.48, z: -10, rotationY: 0.34, phase: 0.37 },
  { x: 15.6, y: 0.24, z: -10, rotationY: -0.34, phase: 0.74 },
  { x: 15.6, y: 1.48, z: -10, rotationY: -0.34, phase: 1.11 },
]

/**
 * Seuil de pression a partir duquel les stacks se mettent a vibrer, et
 * amplitude maximale du tremblement en unites monde (quelques centimetres :
 * au dela, le caisson ne tremble plus, il flotte).
 */
const SHAKE_THRESHOLD = 0.55
const SHAKE_AMPLITUDE = 0.055

/**
 * Rangee de caissons de basses (point 3.1 du brief) : les membranes avancent
 * physiquement sur les frequences < 100 Hz. C'est le seul element de la scene
 * qui bouge en translation — tout le reste ne fait que changer de lumiere,
 * donc ce mouvement porte a lui seul la sensation de pression sonore.
 */
export function SubCabinets() {
  const conesRef = useRef<Group[]>([])
  const stacksRef = useRef<(Group | null)[]>([])

  useFrame((state) => {
    const frame = engine.currentFrame
    // Sub domine, la basse complete : c'est le "< 100 Hz" du brief, elargi
    // parce qu'un kick reel deborde toujours au dessus de 60 Hz.
    const push = frame.bands[Band.Sub] * 0.75 + frame.bands[Band.Bass] * 0.25
    const t = state.clock.elapsedTime

    // Tremblement des stacks.
    //
    // Il ne demarre qu'AU DELA d'un seuil de pression : un caisson qui vibre
    // en permanence se lit comme un defaut de rendu, alors qu'un caisson
    // parfaitement immobile qui se met a trembler dans un gros passage se lit
    // comme de la puissance. La vibration est rapide et non harmonique (deux
    // frequences elevees et premieres entre elles), sinon elle oscille au lieu
    // de vibrer.
    const excess = Math.max(0, push - SHAKE_THRESHOLD) / (1 - SHAKE_THRESHOLD)
    const amp = excess * excess * SHAKE_AMPLITUDE
    for (let i = 0; i < stacksRef.current.length; i++) {
      const stack = stacksRef.current[i]
      if (!stack) continue
      const cab = CABINETS[i]
      if (amp < 1e-4) {
        stack.position.set(cab.x, cab.y, cab.z)
        continue
      }
      const phase = cab.phase * 7.3
      stack.position.set(
        cab.x + Math.sin(t * 71 + phase) * amp,
        cab.y + Math.sin(t * 53 + phase * 1.7) * amp * 0.65,
        cab.z + Math.sin(t * 61 + phase * 2.3) * amp * 0.45,
      )
    }

    for (let i = 0; i < conesRef.current.length; i++) {
      const cone = conesRef.current[i]
      if (!cone) continue
      const phase = CABINETS[(i / 2) | 0]?.phase ?? 0
      // Le leger dephasage entre caissons evite l'effet "un seul gros objet".
      const wobble = 1 + 0.12 * Math.sin(t * 9 + phase * 4)
      // La membrane avance depuis sa position de repos ; le groupe parent porte
      // deja le decalage vers la face avant du caisson.
      cone.position.z = push * 0.17 * wobble
    }
  })

  return (
    <group>
      {CABINETS.map((cab, index) => (
        <group
          key={`${cab.x}:${cab.y}`}
          ref={(node) => {
            stacksRef.current[index] = node
          }}
          position={[cab.x, cab.y, cab.z]}
          rotation-y={cab.rotationY}
        >
          {/* Coffre. */}
          <mesh position={[0, 0.62, 0]}>
            <boxGeometry args={[2.5, 1.24, 0.78]} />
            <meshBasicMaterial color={INK_SURFACE} />
          </mesh>
          {/* Renforts d'angle : detail "industriel epure" du brief. */}
          {[-1.19, 1.19].map((x) => (
            <mesh key={x} position={[x, 0.62, 0]}>
              <boxGeometry args={[0.08, 1.28, 0.84]} />
              <meshBasicMaterial color={INK_SURFACE} />
            </mesh>
          ))}
          {/* Deux haut-parleurs par caisson. */}
          {[-0.6, 0.6].map((x, sub) => (
            <group key={x} position={[x, 0.62, 0.36]}>
              {/* Saladier. */}
              <mesh rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.5, 0.5, 0.06, 28]} />
                <meshBasicMaterial color={INK_SURFACE} />
              </mesh>
              {/* Suspension. */}
              <mesh position={[0, 0, 0.03]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.42, 0.05, 10, 28]} />
                <meshBasicMaterial color={INK_SURFACE} />
              </mesh>
              {/* Membrane : troncs de cone FERMES. La version precedente
                  utilisait un cone ouvert en DoubleSide, dont l'interieur
                  apparaissait en creux a travers la suspension. */}
              <group
                ref={(node) => {
                  if (node) conesRef.current[index * 2 + sub] = node
                }}
              >
                <mesh rotation-x={-Math.PI / 2}>
                  <cylinderGeometry args={[0.14, 0.4, 0.16, 28]} />
                  <meshBasicMaterial color={INK_SURFACE} />
                </mesh>
                {/* Cache-noyau. */}
                <mesh position={[0, 0, 0.08]} rotation-x={Math.PI / 2}>
                  <sphereGeometry args={[0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                  <meshBasicMaterial color={INK_SURFACE} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

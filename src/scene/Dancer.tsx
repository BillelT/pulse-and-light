import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'

/**
 * L'operateur derriere la regie.
 *
 * Vrai rig hierarchique — bassin > buste > tete, epaule > coude, hanche >
 * genou — plutot qu'un tas de primitives independantes : c'est ce qui permet
 * qu'une rotation de bassin entraine tout le haut du corps, et donc qu'une
 * danse tienne debout au lieu de ressembler a des morceaux qui vibrent.
 *
 * Le mouvement est cale sur la GRILLE RYTHMIQUE, pas sur l'horloge : la phase
 * avance en battements par seconde (BPM/60), donc le rebond tombe sur le temps
 * quel que soit le tempo du morceau.
 */

const SKIN = '#b9bec6'
const HOODIE = '#8d949c'
const JEANS = '#39445e'
const DARK = '#15181d'

export function Dancer() {
  const root = useRef<Group>(null)
  const hips = useRef<Group>(null)
  const chest = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const foreL = useRef<Group>(null)
  const foreR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const shinL = useRef<Group>(null)
  const shinR = useRef<Group>(null)

  /** Phase en battements. 1.0 = un temps ecoule. */
  const beatPhase = useRef(0)
  /** Enveloppe d'accent, relancee a chaque kick. */
  const accent = useRef(0)
  const lastOnset = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta)
    const frame = engine.currentFrame

    const bpm = frame.bpm > 0 ? frame.bpm : 120
    beatPhase.current += dt * (bpm / 60)

    if (frame.onsetCount !== lastOnset.current) {
      lastOnset.current = frame.onsetCount
      accent.current = 1
    }
    accent.current = Math.max(0, accent.current - dt * 4.5)

    // Amplitude generale : le danseur se calme sur les passages faibles au lieu
    // de s'agiter dans le vide.
    const drive = 0.22 + Math.min(1, frame.level * 1.35) * 0.78
    const p = beatPhase.current * Math.PI
    const half = beatPhase.current * Math.PI * 0.5
    const swing = Math.sin(half)
    const bounce = Math.abs(Math.sin(p))

    if (root.current) {
      // Rebond : le corps descend sur le temps, il ne monte pas. Un rebond vers
      // le haut sur le kick se lit comme un sursaut, pas comme une danse.
      root.current.position.y = -bounce * 0.075 * drive - accent.current * 0.025
      root.current.rotation.y = Math.sin(beatPhase.current * Math.PI * 0.25) * 0.14 * drive
    }
    if (hips.current) {
      hips.current.rotation.y = swing * 0.3 * drive
      hips.current.rotation.z = Math.sin(p) * 0.07 * drive
      hips.current.position.x = swing * 0.05 * drive
    }
    if (chest.current) {
      // Contre-rotation du buste : c'est elle qui donne le dehanche.
      chest.current.rotation.y = -swing * 0.19 * drive
      chest.current.rotation.x = 0.04 + Math.sin(p + 0.9) * 0.08 * drive
      chest.current.rotation.z = -Math.sin(p) * 0.04 * drive
    }
    if (head.current) {
      head.current.rotation.x = Math.sin(p) * 0.16 * drive + accent.current * 0.1
      head.current.rotation.y = Math.sin(half + 1.1) * 0.28 * drive
    }

    // Bras : au repos ils restent sur la regie, ils montent avec l'energie des
    // hauts-mediums et se detendent sur chaque kick.
    const raise = Math.min(
      1,
      frame.bands[Band.HighMid] * 0.9 + frame.level * 0.8 + accent.current * 0.35,
    )
    setArm(armL.current, foreL.current, -1, raise, p, drive)
    setArm(armR.current, foreR.current, 1, raise, p + Math.PI, drive)

    // Jambes en opposition de phase, pieds au sol : seuls les genoux plient.
    setLeg(legL.current, shinL.current, p, drive)
    setLeg(legR.current, shinR.current, p + Math.PI, drive)
  })

  return (
    <group ref={root}>
      <group ref={hips} position={[0, 0.94, 0]}>
        <Limb args={[0.34, 0.24, 0.22]} color={JEANS} />

        <group ref={chest} position={[0, 0.14, 0]}>
          {/* Buste en deux volumes : la cage plus large que la taille. Un seul
              cube donnait une silhouette de bloc, sans lecture des epaules. */}
          <mesh position={[0, 0.14, 0]} castShadow>
            <boxGeometry args={[0.36, 0.26, 0.23]} />
            <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
          </mesh>
          <mesh position={[0, 0.37, 0]} castShadow>
            <boxGeometry args={[0.46, 0.3, 0.28]} />
            <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
          </mesh>
          {/* Epaules : sans ces boules, les bras semblent decroches du buste. */}
          {[-0.25, 0.25].map((x) => (
            <mesh key={x} position={[x, 0.45, 0]} castShadow>
              <sphereGeometry args={[0.085, 14, 12]} />
              <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
            </mesh>
          ))}
          {/* Capuche rabattue dans le dos. */}
          <mesh position={[0, 0.5, -0.11]} castShadow>
            <boxGeometry args={[0.3, 0.16, 0.13]} />
            <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
          </mesh>
          {/* Cou. */}
          <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.065, 0.11, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0.02} />
          </mesh>

          <group ref={head} position={[0, 0.6, 0]}>
            <mesh position={[0, 0.1, 0]} castShadow>
              <capsuleGeometry args={[0.1, 0.07, 6, 16]} />
              <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0.02} />
            </mesh>
            {/* Casque : arceau + oreillettes. */}
            <mesh position={[0, 0.17, 0]} rotation-x={Math.PI / 2} castShadow>
              <torusGeometry args={[0.112, 0.022, 8, 20, Math.PI]} />
              <meshStandardMaterial color={DARK} roughness={0.6} metalness={0.25} />
            </mesh>
            {[-0.118, 0.118].map((x) => (
              <mesh key={x} position={[x, 0.1, 0]} rotation-z={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.055, 0.055, 0.05, 14]} />
                <meshStandardMaterial color={DARK} roughness={0.6} metalness={0.25} />
              </mesh>
            ))}
          </group>

          <Arm groupRef={armL} foreRef={foreL} x={-0.25} />
          <Arm groupRef={armR} foreRef={foreR} x={0.25} />
        </group>

        <Leg groupRef={legL} shinRef={shinL} x={-0.105} />
        <Leg groupRef={legR} shinRef={shinR} x={0.105} />
      </group>
    </group>
  )
}

function Limb({ args, color }: { args: [number, number, number]; color: string }) {
  return (
    <mesh castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.9} metalness={0.02} />
    </mesh>
  )
}

/** Epaule > coude > main. Le pivot de chaque groupe est sur l'articulation. */
function Arm({
  groupRef,
  foreRef,
  x,
}: {
  groupRef: RefObject<Group | null>
  foreRef: RefObject<Group | null>
  x: number
}) {
  return (
    <group ref={groupRef} position={[x, 0.45, 0]}>
      <mesh position={[0, -0.13, 0]} castShadow>
        <capsuleGeometry args={[0.056, 0.2, 4, 12]} />
        <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
      </mesh>
      <group ref={foreRef} position={[0, -0.28, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <capsuleGeometry args={[0.048, 0.19, 4, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.88} metalness={0.02} />
        </mesh>
        <mesh position={[0, -0.29, 0]} castShadow>
          <sphereGeometry args={[0.065, 12, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.88} metalness={0.02} />
        </mesh>
      </group>
    </group>
  )
}

/** Hanche > genou > pied. */
function Leg({
  groupRef,
  shinRef,
  x,
}: {
  groupRef: RefObject<Group | null>
  shinRef: RefObject<Group | null>
  x: number
}) {
  return (
    <group ref={groupRef} position={[x, -0.1, 0]}>
      <mesh position={[0, -0.19, 0]} castShadow>
        <capsuleGeometry args={[0.075, 0.26, 4, 12]} />
        <meshStandardMaterial color={JEANS} roughness={0.94} metalness={0.02} />
      </mesh>
      <group ref={shinRef} position={[0, -0.42, 0]}>
        <mesh position={[0, -0.19, 0]} castShadow>
          <capsuleGeometry args={[0.062, 0.26, 4, 12]} />
          <meshStandardMaterial color={JEANS} roughness={0.94} metalness={0.02} />
        </mesh>
        <mesh position={[0, -0.4, 0.04]} castShadow>
          <boxGeometry args={[0.13, 0.08, 0.27]} />
          <meshStandardMaterial color={DARK} roughness={0.8} metalness={0.05} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * `side` vaut -1 a gauche et +1 a droite : une rotation Z positive amene le
 * bras vers +x, donc il faut l'inverser du cote gauche pour ouvrir vers
 * l'exterieur au lieu de traverser le buste.
 */
function setArm(
  arm: Group | null,
  fore: Group | null,
  side: number,
  raise: number,
  p: number,
  drive: number,
) {
  if (arm) {
    arm.rotation.z = side * (0.16 + raise * 2.0 + Math.sin(p) * 0.22 * drive)
    arm.rotation.x = Math.sin(p + side) * 0.28 * drive - raise * 0.25
  }
  if (fore) {
    // Coude toujours plie vers l'avant, jamais a l'envers.
    fore.rotation.x = -0.28 - raise * 0.45 - Math.max(0, Math.sin(p)) * 0.3 * drive
    fore.rotation.z = side * raise * 0.3
  }
}

function setLeg(leg: Group | null, shin: Group | null, p: number, drive: number) {
  const s = Math.sin(p)
  if (leg) {
    leg.rotation.x = s * 0.11 * drive
    leg.rotation.z = -s * 0.05 * drive
  }
  // Le genou ne plie que dans un sens.
  if (shin) shin.rotation.x = Math.max(0, -s) * 0.34 * drive
}

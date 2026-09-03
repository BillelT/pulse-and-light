import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'

/**
 * L'operateur derriere la regie.
 *
 * Vrai rig hierarchique — bassin > taille > buste > tete, epaule > coude >
 * poignet, hanche > genou — plutot qu'un tas de primitives independantes :
 * c'est ce qui permet qu'une rotation de bassin entraine tout le haut du
 * corps, et donc qu'une danse tienne debout au lieu de ressembler a des
 * morceaux qui vibrent.
 *
 * Le mouvement est cale sur la GRILLE RYTHMIQUE, pas sur l'horloge : la phase
 * avance en battements par seconde (BPM/60), donc le rebond tombe sur le temps
 * quel que soit le tempo du morceau.
 *
 * Plusieurs chorégraphies ("moves") se relaient toutes les CYCLE_BEATS
 * mesures, avec un fondu d'une pulsation entre deux : la danse ne tourne pas
 * en boucle sur un seul motif.
 */

const SKIN = '#dba179'
const HOODIE = '#3b4f7a'
const HOODIE_DARK = '#232d47'
const JEANS = '#39445e'
const DARK = '#15181d'
const CAP = '#232c3c'
const CAP_BRIM = '#12151c'

const CYCLE_BEATS = 8
const MOVE_COUNT = 5

export function Dancer() {
  const root = useRef<Group>(null)
  const hips = useRef<Group>(null)
  const spine = useRef<Group>(null)
  const chest = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const foreL = useRef<Group>(null)
  const foreR = useRef<Group>(null)
  const wristL = useRef<Group>(null)
  const wristR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const shinL = useRef<Group>(null)
  const shinR = useRef<Group>(null)

  /** Phase en battements. 1.0 = un temps ecoule. */
  const beatPhase = useRef(0)
  /** Enveloppe d'accent, relancee a chaque kick. */
  const accent = useRef(0)
  const lastOnset = useRef(0)
  /** Presence de son, lissee : 0 = silence (pas de source, source en pause,
   *  ou piste vide), 1 = du signal arrive. Sert a arreter completement la
   *  danse au lieu de la laisser tourner a vide sur une amplitude plancher. */
  const presence = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta)
    const frame = engine.currentFrame

    const hasSound = frame.level > 0.015 || frame.bpm > 0
    presence.current += ((hasSound ? 1 : 0) - presence.current) * Math.min(1, dt / 0.4)

    const bpm = frame.bpm > 0 ? frame.bpm : 120
    // La phase ne progresse que s'il y a du son : sinon le personnage reste
    // fige au lieu de continuer a defiler les chorégraphies dans le vide.
    beatPhase.current += dt * (bpm / 60) * presence.current

    if (frame.onsetCount !== lastOnset.current) {
      lastOnset.current = frame.onsetCount
      accent.current = 1
    }
    accent.current = Math.max(0, accent.current - dt * 4.5)

    // Amplitude generale : le danseur se calme sur les passages faibles, et
    // s'arrete net (drive nul) des qu'il n'y a plus de son du tout.
    const drive = presence.current * (0.22 + Math.min(1, frame.level * 1.35) * 0.78)
    const p = beatPhase.current * Math.PI
    const half = beatPhase.current * Math.PI * 0.5
    const swing = Math.sin(half)
    const bounce = Math.abs(Math.sin(p))
    const raise = Math.min(
      1,
      frame.bands[Band.HighMid] * 0.9 + frame.level * 0.8 + accent.current * 0.35,
    )

    const ctx: MoveCtx = { p, half, swing, bounce, drive, raise, accent: accent.current }

    // Choix de la chorégraphie : un motif tourne pendant CYCLE_BEATS temps,
    // avec un fondu d'un temps vers le suivant en fin de phrase — sinon le
    // changement de motif se voit comme un a-coup.
    const cyclePos = beatPhase.current % CYCLE_BEATS
    const moveIndex = Math.floor(beatPhase.current / CYCLE_BEATS) % MOVE_COUNT
    const nextIndex = (moveIndex + 1) % MOVE_COUNT
    const blend = Math.max(0, Math.min(1, cyclePos - (CYCLE_BEATS - 1)))

    const pose = blend > 0
      ? lerpPose(computePose(moveIndex, ctx), computePose(nextIndex, ctx), smoothstep(blend))
      : computePose(moveIndex, ctx)

    applyPose(
      { root, hips, spine, chest, head, armL, armR, foreL, foreR, wristL, wristR, legL, legR, shinL, shinR },
      pose,
    )
  })

  return (
    <group ref={root}>
      <group ref={hips} position={[0, 0.94, 0]}>
        <Limb args={[0.34, 0.24, 0.22]} color={JEANS} />

        <group ref={spine} position={[0, 0.14, 0]}>
          <group ref={chest}>
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
            {/* Cordons de la capuche, sur le torse. */}
            {[-0.045, 0.045].map((x) => (
              <mesh key={x} position={[x, 0.36, 0.115]} castShadow>
                <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
                <meshStandardMaterial color={HOODIE_DARK} roughness={0.8} metalness={0.02} />
              </mesh>
            ))}
            {/* Cou. */}
            <mesh position={[0, 0.55, 0]} castShadow>
              <cylinderGeometry args={[0.055, 0.065, 0.11, 12]} />
              <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0.02} />
            </mesh>

            <group ref={head} position={[0, 0.6, 0]}>
              <Head />
            </group>

            <Arm groupRef={armL} foreRef={foreL} wristRef={wristL} x={-0.25} />
            <Arm groupRef={armR} foreRef={foreR} wristRef={wristR} x={0.25} />
          </group>
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

/** Tete : visage, casquette, casque — le trio qui vend le look "DJ" de la reference. */
function Head() {
  return (
    <>
      <mesh position={[0, 0.1, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.07, 6, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0.02} />
      </mesh>

      {/* Sourcils, yeux, bouche : juste assez de traits pour lire une expression
          de face, sans cherecher un visage detaille inutile a cette distance. */}
      {[-0.045, 0.045].map((x) => (
        <mesh key={`brow-${x}`} position={[x, 0.155, 0.093]} rotation-z={x < 0 ? 0.12 : -0.12} castShadow>
          <boxGeometry args={[0.05, 0.012, 0.012]} />
          <meshStandardMaterial color={DARK} roughness={0.7} metalness={0.02} />
        </mesh>
      ))}
      {[-0.045, 0.045].map((x) => (
        <mesh key={`eye-${x}`} position={[x, 0.12, 0.096]} castShadow>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshStandardMaterial color={DARK} roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, 0.07, 0.097]} rotation-x={Math.PI / 2.2} castShadow>
        <torusGeometry args={[0.026, 0.006, 6, 10, Math.PI]} />
        <meshStandardMaterial color="#7a4638" roughness={0.7} metalness={0.02} />
      </mesh>

      {/* Casquette : dome + visiere, portee legerement en arriere pour laisser
          voir le visage et poser le casque par dessus, comme sur la reference. */}
      <mesh position={[0, 0.185, -0.006]} castShadow>
        <sphereGeometry args={[0.107, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={CAP} roughness={0.75} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.165, 0.1]} rotation-x={-0.32} castShadow>
        <boxGeometry args={[0.16, 0.014, 0.09]} />
        <meshStandardMaterial color={CAP_BRIM} roughness={0.55} metalness={0.08} />
      </mesh>

      {/* Casque : arceau + oreillettes, par dessus la casquette. */}
      <mesh position={[0, 0.2, 0]} rotation-x={Math.PI / 2} castShadow>
        <torusGeometry args={[0.118, 0.02, 8, 20, Math.PI]} />
        <meshStandardMaterial color={DARK} roughness={0.6} metalness={0.25} />
      </mesh>
      {[-0.124, 0.124].map((x) => (
        <mesh key={x} position={[x, 0.1, 0]} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 0.05, 14]} />
          <meshStandardMaterial color={DARK} roughness={0.6} metalness={0.25} />
        </mesh>
      ))}
    </>
  )
}

/** Epaule > coude > poignet > main. Le pivot de chaque groupe est sur l'articulation. */
function Arm({
  groupRef,
  foreRef,
  wristRef,
  x,
}: {
  groupRef: RefObject<Group | null>
  foreRef: RefObject<Group | null>
  wristRef: RefObject<Group | null>
  x: number
}) {
  return (
    <group ref={groupRef} position={[x, 0.45, 0]}>
      <mesh position={[0, -0.13, 0]} castShadow>
        <capsuleGeometry args={[0.056, 0.2, 4, 12]} />
        <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
      </mesh>
      <group ref={foreRef} position={[0, -0.28, 0]}>
        <mesh position={[0, -0.11, 0]} castShadow>
          <capsuleGeometry args={[0.048, 0.16, 4, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.88} metalness={0.02} />
        </mesh>
        <group ref={wristRef} position={[0, -0.24, 0]}>
          <mesh position={[0, -0.05, 0]} castShadow>
            <sphereGeometry args={[0.065, 12, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.88} metalness={0.02} />
          </mesh>
        </group>
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

/* ---------------------------------------------------------------------- */
/* Choregraphie                                                            */
/* ---------------------------------------------------------------------- */

interface MoveCtx {
  p: number
  half: number
  swing: number
  bounce: number
  drive: number
  raise: number
  accent: number
}

/** Toutes les valeurs pilotees par la choregraphie, a plat pour permettre un
 *  lerp generique entre deux motifs sans dupliquer la logique de fondu. */
interface Pose {
  rootY: number
  rootX: number
  rootRotY: number
  hipsRotY: number
  hipsRotZ: number
  hipsX: number
  spineRotX: number
  spineRotZ: number
  chestRotY: number
  chestRotX: number
  chestRotZ: number
  headRotX: number
  headRotY: number
  armLRotZ: number
  armLRotX: number
  foreLRotX: number
  foreLRotZ: number
  wristLRotZ: number
  wristLRotX: number
  armRRotZ: number
  armRRotX: number
  foreRRotX: number
  foreRRotZ: number
  wristRRotZ: number
  wristRRotX: number
  legLRotX: number
  legLRotZ: number
  shinLRotX: number
  legRRotX: number
  legRRotZ: number
  shinRRotX: number
}

const POSE_KEYS = [
  'rootY', 'rootX', 'rootRotY',
  'hipsRotY', 'hipsRotZ', 'hipsX',
  'spineRotX', 'spineRotZ',
  'chestRotY', 'chestRotX', 'chestRotZ',
  'headRotX', 'headRotY',
  'armLRotZ', 'armLRotX', 'foreLRotX', 'foreLRotZ', 'wristLRotZ', 'wristLRotX',
  'armRRotZ', 'armRRotX', 'foreRRotX', 'foreRRotZ', 'wristRRotZ', 'wristRRotX',
  'legLRotX', 'legLRotZ', 'shinLRotX',
  'legRRotX', 'legRRotZ', 'shinRRotX',
] as const satisfies readonly (keyof Pose)[]

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = {} as Pose
  for (const key of POSE_KEYS) out[key] = a[key] + (b[key] - a[key]) * t
  return out
}

/** Mouvement de base commun a toutes les jambes : elles restent au sol, seuls
 *  les genoux plient, en opposition de phase. */
function legPose(p: number, drive: number) {
  const s = Math.sin(p)
  return {
    rotX: s * 0.11 * drive,
    rotZ: -s * 0.05 * drive,
    shinRotX: Math.max(0, -s) * 0.34 * drive,
  }
}

/** Motif par defaut : le groove d'origine — dehanche, contre-rotation du
 *  buste, bras qui montent avec l'energie. */
function grooveMove(ctx: MoveCtx): Pose {
  const { p, half, swing, bounce, drive, raise, accent } = ctx
  const legL = legPose(p, drive)
  const legR = legPose(p + Math.PI, drive)
  return {
    rootY: -bounce * 0.075 * drive - accent * 0.025,
    rootX: 0,
    rootRotY: Math.sin(p * 0.25) * 0.14 * drive,
    hipsRotY: swing * 0.3 * drive,
    hipsRotZ: Math.sin(p) * 0.07 * drive,
    hipsX: swing * 0.05 * drive,
    spineRotX: 0,
    spineRotZ: 0,
    chestRotY: -swing * 0.19 * drive,
    chestRotX: 0.04 + Math.sin(p + 0.9) * 0.08 * drive,
    chestRotZ: -Math.sin(p) * 0.04 * drive,
    headRotX: Math.sin(p) * 0.16 * drive + accent * 0.1,
    headRotY: Math.sin(half + 1.1) * 0.28 * drive,
    armLRotZ: -(0.16 + raise * 2.0 + Math.sin(p) * 0.22 * drive),
    armLRotX: Math.sin(p - 1) * 0.28 * drive - raise * 0.25,
    foreLRotX: -0.28 - raise * 0.45 - Math.max(0, Math.sin(p)) * 0.3 * drive,
    foreLRotZ: -raise * 0.3,
    wristLRotZ: 0,
    wristLRotX: 0,
    armRRotZ: 0.16 + raise * 2.0 + Math.sin(p) * 0.22 * drive,
    armRRotX: Math.sin(p + 1) * 0.28 * drive - raise * 0.25,
    foreRRotX: -0.28 - raise * 0.45 - Math.max(0, Math.sin(p)) * 0.3 * drive,
    foreRRotZ: raise * 0.3,
    wristRRotZ: 0,
    wristRRotX: 0,
    legLRotX: legL.rotX,
    legLRotZ: legL.rotZ,
    shinLRotX: legL.shinRotX,
    legRRotX: legR.rotX,
    legRRotZ: legR.rotZ,
    shinRRotX: legR.shinRotX,
  }
}

/** Bras leves, mains en l'air sur chaque temps fort — le geste "hype" de foule. */
function armsUpMove(ctx: MoveCtx): Pose {
  const pose = grooveMove(ctx)
  const { p, drive, accent } = ctx
  const pump = 1.9 + Math.max(0, Math.sin(p)) * 0.5 * drive + accent * 0.3
  pose.armLRotZ = -pump
  pose.armRRotZ = pump
  pose.armLRotX = -0.35 - accent * 0.15
  pose.armRRotX = -0.35 - accent * 0.15
  pose.foreLRotX = -0.1 + Math.sin(p) * 0.12 * drive
  pose.foreRRotX = -0.1 + Math.sin(p) * 0.12 * drive
  pose.wristLRotZ = Math.sin(p * 2) * 0.3 * drive
  pose.wristRRotZ = -Math.sin(p * 2) * 0.3 * drive
  pose.chestRotX = 0.02 - accent * 0.05
  pose.headRotX = -0.08 - accent * 0.08
  return pose
}

/** Point alterne vers la foule, avec un leger deplacement lateral (strut). */
function pointMove(ctx: MoveCtx): Pose {
  const pose = grooveMove(ctx)
  const { p, half, drive, accent } = ctx
  const lead = Math.sin(half) > 0 ? 1 : -1
  pose.rootX = Math.sin(half) * 0.18 * drive
  pose.hipsRotY = Math.sin(half) * 0.22 * drive
  pose.chestRotY = -Math.sin(half) * 0.3 * drive
  const point = 0.55 + accent * 0.25
  pose.armRRotZ = lead > 0 ? point : 0.25 + Math.sin(p) * 0.1 * drive
  pose.armLRotZ = lead < 0 ? -point : -(0.25 + Math.sin(p) * 0.1 * drive)
  pose.armRRotX = lead > 0 ? -0.85 : Math.sin(p) * 0.2 * drive
  pose.armLRotX = lead < 0 ? -0.85 : Math.sin(p) * 0.2 * drive
  pose.foreRRotX = lead > 0 ? -0.1 : -0.4
  pose.foreLRotX = lead < 0 ? -0.1 : -0.4
  pose.headRotY = lead * 0.2 * drive
  return pose
}

/** Motif centre sur la tete : hochements marques, epaules qui roulent, pas
 *  resserre — l'oppose du groove ample. */
function headbangMove(ctx: MoveCtx): Pose {
  const pose = grooveMove(ctx)
  const { p, drive, accent } = ctx
  pose.headRotX = Math.max(0, Math.sin(p)) * 0.42 * drive + accent * 0.22
  pose.headRotY = Math.sin(p * 0.5) * 0.1 * drive
  pose.chestRotZ = Math.sin(p) * 0.09 * drive
  pose.chestRotX = 0.06 + Math.max(0, Math.sin(p)) * 0.05 * drive
  pose.hipsRotY *= 0.4
  pose.hipsX *= 0.4
  pose.armLRotZ = -(0.35 + Math.sin(p) * 0.12 * drive)
  pose.armRRotZ = 0.35 + Math.sin(p) * 0.12 * drive
  pose.foreLRotX = -0.55 - Math.max(0, Math.sin(p)) * 0.2 * drive
  pose.foreRRotX = -0.55 - Math.max(0, Math.sin(p)) * 0.2 * drive
  return pose
}

/** Penche sur la table, une main scratche (rotation de poignet rapide),
 *  l'autre reste posee — colle au contexte "DJ derriere la regie". */
function scratchMove(ctx: MoveCtx): Pose {
  const pose = grooveMove(ctx)
  const { p, drive, accent } = ctx
  pose.spineRotX = 0.14 + accent * 0.05
  pose.chestRotX = 0.16
  pose.headRotX = 0.1 + Math.sin(p * 2) * 0.05 * drive
  pose.armRRotZ = 0.22
  pose.armRRotX = -0.55
  pose.foreRRotX = -0.35
  pose.wristRRotZ = Math.sin(p * 3) * 0.6 * drive + accent * 0.2
  pose.armLRotZ = -0.32 - Math.sin(p) * 0.05 * drive
  pose.armLRotX = -0.6
  pose.foreLRotX = -0.3
  pose.wristLRotZ = 0
  pose.legLRotX *= 0.5
  pose.legRRotX *= 0.5
  return pose
}

const MOVES: ((ctx: MoveCtx) => Pose)[] = [
  grooveMove,
  armsUpMove,
  pointMove,
  headbangMove,
  scratchMove,
]

function computePose(moveIndex: number, ctx: MoveCtx): Pose {
  return MOVES[moveIndex](ctx)
}

interface DancerRefs {
  root: RefObject<Group | null>
  hips: RefObject<Group | null>
  spine: RefObject<Group | null>
  chest: RefObject<Group | null>
  head: RefObject<Group | null>
  armL: RefObject<Group | null>
  armR: RefObject<Group | null>
  foreL: RefObject<Group | null>
  foreR: RefObject<Group | null>
  wristL: RefObject<Group | null>
  wristR: RefObject<Group | null>
  legL: RefObject<Group | null>
  legR: RefObject<Group | null>
  shinL: RefObject<Group | null>
  shinR: RefObject<Group | null>
}

/**
 * `side` vaut -1 a gauche et +1 a droite dans le rig d'origine : une rotation
 * Z positive amene le bras vers +x, donc la pose du bras gauche est deja
 * l'inverse de celle du bras droit — c'est directement code dans chaque
 * motif ci-dessus plutot que factorise, pour rester lisible motif par motif.
 */
function applyPose(refs: DancerRefs, pose: Pose) {
  if (refs.root.current) {
    refs.root.current.position.y = pose.rootY
    refs.root.current.position.x = pose.rootX
    refs.root.current.rotation.y = pose.rootRotY
  }
  if (refs.hips.current) {
    refs.hips.current.rotation.y = pose.hipsRotY
    refs.hips.current.rotation.z = pose.hipsRotZ
    refs.hips.current.position.x = pose.hipsX
  }
  if (refs.spine.current) {
    refs.spine.current.rotation.x = pose.spineRotX
    refs.spine.current.rotation.z = pose.spineRotZ
  }
  if (refs.chest.current) {
    refs.chest.current.rotation.y = pose.chestRotY
    refs.chest.current.rotation.x = pose.chestRotX
    refs.chest.current.rotation.z = pose.chestRotZ
  }
  if (refs.head.current) {
    refs.head.current.rotation.x = pose.headRotX
    refs.head.current.rotation.y = pose.headRotY
  }
  if (refs.armL.current) {
    refs.armL.current.rotation.z = pose.armLRotZ
    refs.armL.current.rotation.x = pose.armLRotX
  }
  if (refs.foreL.current) {
    refs.foreL.current.rotation.x = pose.foreLRotX
    refs.foreL.current.rotation.z = pose.foreLRotZ
  }
  if (refs.wristL.current) {
    refs.wristL.current.rotation.z = pose.wristLRotZ
    refs.wristL.current.rotation.x = pose.wristLRotX
  }
  if (refs.armR.current) {
    refs.armR.current.rotation.z = pose.armRRotZ
    refs.armR.current.rotation.x = pose.armRRotX
  }
  if (refs.foreR.current) {
    refs.foreR.current.rotation.x = pose.foreRRotX
    refs.foreR.current.rotation.z = pose.foreRRotZ
  }
  if (refs.wristR.current) {
    refs.wristR.current.rotation.z = pose.wristRRotZ
    refs.wristR.current.rotation.x = pose.wristRRotX
  }
  if (refs.legL.current) {
    refs.legL.current.rotation.x = pose.legLRotX
    refs.legL.current.rotation.z = pose.legLRotZ
  }
  if (refs.shinL.current) refs.shinL.current.rotation.x = pose.shinLRotX
  if (refs.legR.current) {
    refs.legR.current.rotation.x = pose.legRRotX
    refs.legR.current.rotation.z = pose.legRRotZ
  }
  if (refs.shinR.current) refs.shinR.current.rotation.x = pose.shinRRotX
}

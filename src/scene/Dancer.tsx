import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'

/**
 * The operator behind the mixing desk.
 *
 * A real hierarchical rig — pelvis > waist > chest > head, shoulder > elbow >
 * wrist, hip > knee — rather than a pile of independent primitives: this is
 * what lets a pelvis rotation carry the whole upper body along, so a dance
 * holds together instead of looking like separate parts vibrating.
 *
 * The movement is locked to the RHYTHMIC GRID, not the clock: the phase
 * advances in beats per second (BPM/60), so the bounce lands on the beat
 * regardless of the track's tempo.
 *
 * Several choreographies ("moves") take turns every CYCLE_BEATS bars, with a
 * one-beat crossfade between them: the dance doesn't loop on a single motif.
 *
 * The BODY, on the other hand, is deliberately reduced to simple volumes —
 * capsules, one sphere for the head, no face, no accessories. The character is
 * two thumbs tall on screen: every extra detail turned into a knot of tiny
 * edges that the ink pass could only resolve as a black blob. A sketch states
 * a body with a handful of masses, and the rig above is what makes it alive.
 */

const SKIN = '#dba179'
const HOODIE = '#3b4f7a'
const JEANS = '#39445e'
const DARK = '#15181d'

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

  /** Phase in beats. 1.0 = one beat elapsed. */
  const beatPhase = useRef(0)
  /** Accent envelope, retriggered on each kick. */
  const accent = useRef(0)
  const lastOnset = useRef(0)
  /** Sound presence, smoothed: 0 = silence (no source, source paused,
   *  or empty track), 1 = signal is coming in. Used to fully stop the
   *  dance instead of letting it idle at a floor amplitude. */
  const presence = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta)
    const frame = engine.currentFrame

    // Le tempo n'est pas un signe de presence : le moteur conserve sa derniere
    // estimation quand la source s'arrete, et le personnage continuait donc a
    // danser dans le silence. Seul le niveau fait foi.
    const hasSound = frame.level > 0.015
    presence.current += ((hasSound ? 1 : 0) - presence.current) * Math.min(1, dt / 0.4)

    const bpm = frame.bpm > 0 ? frame.bpm : 120
    // The phase only advances if there's sound: otherwise the character
    // stays frozen instead of continuing to cycle through choreographies in the void.
    beatPhase.current += dt * (bpm / 60) * presence.current

    if (frame.onsetCount !== lastOnset.current) {
      lastOnset.current = frame.onsetCount
      accent.current = 1
    }
    accent.current = Math.max(0, accent.current - dt * 4.5)

    // Overall amplitude: the dancer calms down on quiet passages, and
    // stops dead (zero drive) as soon as there's no sound at all.
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

    // Choreography selection: a motif runs for CYCLE_BEATS beats, with a
    // one-beat crossfade to the next at the end of the phrase — otherwise
    // the motif change shows as a jolt.
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
        <Limb args={[0.3, 0.22, 0.2]} color={JEANS} />

        <group ref={spine} position={[0, 0.14, 0]}>
          <group ref={chest}>
            {/* Buste : UN seul volume, une capsule. La version detaillee
                (cage + bassin + epaules + capuche + cordons + casquette +
                casque) donnait un amas de petites aretes qui, au trait,
                revenait a un paquet noir de la taille d'un pouce. Un croquis
                resume un corps a des volumes simples, et c'est justement ce
                qui le rend lisible a cette echelle. */}
            <mesh position={[0, 0.26, 0]} castShadow>
              <capsuleGeometry args={[0.185, 0.26, 6, 16]} />
              <meshStandardMaterial color={HOODIE} roughness={0.92} metalness={0.02} />
            </mesh>
            {/* Cou : court, il suffit a poser la tete au dessus des epaules. */}
            <mesh position={[0, 0.55, 0]} castShadow>
              <cylinderGeometry args={[0.052, 0.06, 0.1, 12]} />
              <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0.02} />
            </mesh>

            <group ref={head} position={[0, 0.6, 0]}>
              <Head />
            </group>

            {/* Les bras s'accrochent au bord meme de la capsule (x = rayon) :
                un point d'ancrage plus large laissait un vide entre le buste
                et l'epaule, tres visible une fois la silhouette reduite a son
                contour. */}
            <Arm groupRef={armL} foreRef={foreL} wristRef={wristL} x={-0.19} />
            <Arm groupRef={armR} foreRef={foreR} wristRef={wristR} x={0.19} />
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

/**
 * Tete : une sphere, rien d'autre.
 *
 * Aucun visage : a la taille ou le personnage est vu, deux yeux et une bouche
 * ne se lisent jamais comme une expression — ils se lisent comme de la salete
 * sur le papier. La direction du regard passe deja par la rotation de la tete,
 * qui suit la choregraphie.
 */
function Head() {
  return (
    <mesh position={[0, 0.11, 0]} castShadow>
      <sphereGeometry args={[0.115, 20, 16]} />
      <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0.02} />
    </mesh>
  )
}

/** Shoulder > elbow > wrist > hand. Each group's pivot sits on the joint. */
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

/** Hip > knee > foot. */
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
          <boxGeometry args={[0.12, 0.07, 0.22]} />
          <meshStandardMaterial color={DARK} roughness={0.8} metalness={0.05} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------------------------------------------------------------------- */
/* Choreography                                                           */
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

/** All values driven by the choreography, flattened to allow a generic
 *  lerp between two motifs without duplicating the crossfade logic. */
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

/** Base movement shared by both legs: they stay on the ground, only the
 *  knees bend, in phase opposition. */
function legPose(p: number, drive: number) {
  const s = Math.sin(p)
  return {
    rotX: s * 0.11 * drive,
    rotZ: -s * 0.05 * drive,
    shinRotX: Math.max(0, -s) * 0.34 * drive,
  }
}

/** Default motif: the original groove — hip sway, chest counter-rotation,
 *  arms rising with the energy. */
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

/** Arms raised, hands in the air on each strong beat — the crowd-hype gesture. */
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

/** Alternating point toward the crowd, with a slight lateral shift (strut). */
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

/** Head-centered motif: pronounced nods, rolling shoulders, tighter
 *  footwork — the opposite of the loose groove. */
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

/** Leaning over the deck, one hand scratches (fast wrist rotation),
 *  the other stays resting — fits the "DJ at the mixing desk" context. */
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
 * `side` is -1 on the left and +1 on the right in the original rig: a
 * positive Z rotation moves the arm toward +x, so the left arm's pose is
 * already the mirror of the right arm's — this is coded directly in each
 * motif above rather than factored out, to stay readable motif by motif.
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

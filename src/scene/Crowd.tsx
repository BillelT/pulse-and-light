import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshStandardMaterial, type Group } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'

/**
 * Le public.
 *
 * Personne n'apparait ni ne disparait sur place : les silhouettes ENTRENT en
 * marchant depuis l'arriere de la camera, rejoignent une place sur la piste, y
 * dansent, et repartent par le meme chemin quand la musique s'arrete. Un
 * "pop" a l'endroit exact ou quelqu'un va danser trahit immediatement le
 * dispositif ; une marche, meme sommaire, le rend invisible.
 *
 * Le remplissage est une INTEGRALE, pas un seuil : plus le son dure, plus la
 * piste se remplit, et le silence la vide au meme rythme tranquille. Un
 * comptage instantane (n personnes = f(niveau)) ferait clignoter la foule a
 * chaque baisse de niveau, ce qui est exactement ce qu'on ne veut pas.
 *
 * Les corps suivent la meme regle que le DJ : volumes simples, aucun visage.
 */

/** Places disponibles sur la piste — donc nombre maximum de danseurs. */
const MAX_MEMBERS = 12
/** Point d'entree / de sortie, derriere la camera. */
const SPAWN_Z = 34
const WALK_SPEED = 5
/** Vitesse de remplissage, en fraction de piste par seconde a plein niveau. */
const FILL_RATE = 0.06
const EMPTY_RATE = 0.17
/** Duree du fondu d'echelle a l'apparition, en secondes. */
const FADE = 0.35

interface Walker {
  active: boolean
  leaving: boolean
  /** Position au sol. */
  x: number
  z: number
  /** Destination courante (place sur la piste, ou sortie). */
  tx: number
  tz: number
  rot: number
  /** Phase du cycle de marche. */
  step: number
  /** Decalage propre a la silhouette : personne ne danse exactement en phase. */
  seed: number
  scale: number
}

interface MemberRefs {
  root: RefObject<Group | null>
  body: RefObject<Group | null>
  legL: RefObject<Group | null>
  legR: RefObject<Group | null>
  armL: RefObject<Group | null>
  armR: RefObject<Group | null>
}

/** PRNG deterministe : la piste se remplit toujours de la meme facon. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Places sur la piste : devant le mur, derriere la regie, jamais alignees.
 * Les premieres places tirees sont les plus centrales — la piste se garnit
 * donc du centre vers les bords, comme une vraie salle.
 */
const SLOTS = (() => {
  const rand = mulberry32(0x2b91f7)
  return Array.from({ length: MAX_MEMBERS }, (_, i) => {
    const spread = 0.35 + (i / (MAX_MEMBERS - 1)) * 0.65
    // La piste tient entre le nez de scene et la regie, et pas plus loin en
    // avant : au cadrage par defaut la camera est a z ~ 20, quelqu'un place a
    // z = 15 danserait derriere elle.
    const z = 1.6 + rand() * 6 * spread
    let x = (rand() - 0.5) * 32 * spread
    // La regie occupe le centre du plateau : personne ne danse dedans.
    if (Math.abs(z - 4.6) < 3.4 && Math.abs(x) < 4.4) x = Math.sign(x || 1) * (4.4 + rand() * 5)
    return { x, z }
  })
})()

export function Crowd() {
  const refs = useMemo<MemberRefs[]>(
    () =>
      Array.from({ length: MAX_MEMBERS }, () => ({
        root: { current: null },
        body: { current: null },
        legL: { current: null },
        legR: { current: null },
        armL: { current: null },
        armR: { current: null },
      })),
    [],
  )

  const walkers = useMemo<Walker[]>(
    () =>
      SLOTS.map((slot, i) => ({
        active: false,
        leaving: false,
        x: slot.x,
        z: SPAWN_Z,
        tx: slot.x,
        tz: slot.z,
        rot: Math.PI,
        step: i * 1.7,
        seed: (i * 0.618) % 1,
        scale: 0,
      })),
    [],
  )

  /** Remplissage de la piste, 0..1. Integre le son dans le temps. */
  const heat = useRef(0)
  /** Phase rythmique partagee, en temps (1.0 = un temps). */
  const beat = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta)
    const frame = engine.currentFrame
    const level = frame.level
    // Le tempo NE dit PAS qu'il y a du son : le moteur garde sa derniere
    // estimation apres l'arret de la source. Seul le niveau fait foi, sinon la
    // piste ne se viderait jamais une fois qu'un morceau a joue.
    const hasSound = level > 0.02

    heat.current = clamp01(
      heat.current + dt * (hasSound ? FILL_RATE * (0.3 + level * 1.4) : -EMPTY_RATE),
    )
    beat.current += dt * ((frame.bpm > 0 ? frame.bpm : 120) / 60) * (hasSound ? 1 : 0)

    const wanted = Math.round(heat.current * MAX_MEMBERS)
    let staying = 0
    for (const w of walkers) if (w.active && !w.leaving) staying++

    if (staying < wanted) {
      // Une arrivee a la fois : une foule qui apparait par paquets se voit.
      for (let i = 0; i < walkers.length; i++) {
        const w = walkers[i]
        if (w.active) continue
        w.active = true
        w.leaving = false
        w.x = SLOTS[i].x * 0.45
        w.z = SPAWN_Z
        w.tx = SLOTS[i].x
        w.tz = SLOTS[i].z
        w.rot = Math.PI
        w.scale = 0
        break
      }
    } else if (staying > wanted) {
      // Les derniers arrives repartent les premiers.
      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i]
        if (!w.active || w.leaving) continue
        w.leaving = true
        w.tx = SLOTS[i].x * 0.45
        w.tz = SPAWN_Z
        break
      }
    }

    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i]
      const r = refs[i]
      const root = r.root.current
      if (!root) continue
      if (!w.active) {
        root.visible = false
        continue
      }
      root.visible = true

      const dx = w.tx - w.x
      const dz = w.tz - w.z
      const dist = Math.hypot(dx, dz)
      const walking = dist > 0.12

      if (walking) {
        const advance = Math.min(dist, WALK_SPEED * dt)
        w.x += (dx / dist) * advance
        w.z += (dz / dist) * advance
        // Le personnage regarde ou il va ; le virage est lisse, sinon il
        // pivote sur place a la seconde ou il change de cap.
        w.rot = approachAngle(w.rot, Math.atan2(dx, dz), dt * 6)
        w.step += advance * 2.6
      } else if (w.leaving) {
        // Sortie atteinte : la silhouette s'efface, puis se libere.
        w.scale -= dt / FADE
        if (w.scale <= 0) {
          w.active = false
          w.leaving = false
          root.visible = false
          continue
        }
      } else {
        // En place : face au mur, on danse.
        w.rot = approachAngle(w.rot, Math.PI, dt * 5)
      }

      if (!w.leaving) w.scale = Math.min(1, w.scale + dt / FADE)

      const scale = smoothstep(clamp01(w.scale))
      root.position.set(w.x, 0, w.z)
      root.rotation.y = w.rot
      root.scale.setScalar(scale)

      const body = r.body.current
      const legL = r.legL.current
      const legR = r.legR.current
      const armL = r.armL.current
      const armR = r.armR.current
      if (!body || !legL || !legR || !armL || !armR) continue

      if (walking) {
        // Marche : jambes en opposition, bras contre-balances, buste qui
        // monte deux fois par cycle.
        const s = Math.sin(w.step)
        const c = Math.cos(w.step)
        legL.rotation.x = s * 0.55
        legR.rotation.x = -s * 0.55
        armL.rotation.x = -s * 0.42
        armR.rotation.x = s * 0.42
        armL.rotation.z = 0.08
        armR.rotation.z = -0.08
        body.position.y = Math.abs(c) * 0.045
        body.rotation.z = s * 0.03
        body.rotation.x = 0.04
      } else {
        // Danse : rebond sur le temps, bras qui montent avec l'energie. La
        // graine decale chaque silhouette pour qu'aucune ne soit synchrone.
        const p = (beat.current + w.seed) * Math.PI
        const bounce = Math.abs(Math.sin(p))
        const raise = Math.min(1, frame.bands[Band.HighMid] * 0.9 + level * 0.9)
        const drive = 0.35 + level * 0.65
        body.position.y = -bounce * 0.075 * drive
        body.rotation.z = Math.sin(p * 0.5 + w.seed * 6) * 0.09 * drive
        body.rotation.x = 0.03 + Math.sin(p + 1) * 0.05 * drive
        legL.rotation.x = Math.sin(p) * 0.12 * drive
        legR.rotation.x = -Math.sin(p) * 0.12 * drive
        const lift = 0.3 + raise * 1.9 + Math.sin(p + w.seed * 5) * 0.25 * drive
        armL.rotation.z = lift
        armR.rotation.z = -lift
        armL.rotation.x = Math.sin(p - 1) * 0.3 * drive
        armR.rotation.x = Math.sin(p + 1) * 0.3 * drive
      }
    }
  })

  return (
    <group>
      {refs.map((r, i) => (
        <Member key={i} refs={r} />
      ))}
    </group>
  )
}

const SKIN = '#c98f68'
const TOP = '#4a5b7f'
const BOTTOM = '#3a4257'

function Member({ refs }: { refs: MemberRefs }) {
  // Trois materiaux partages par toutes les silhouettes : la foule ne doit pas
  // couter douze fois le prix d'un personnage.
  const materials = useMemo(
    () => ({
      skin: new MeshStandardMaterial({ color: SKIN, roughness: 0.85, metalness: 0.02 }),
      top: new MeshStandardMaterial({ color: TOP, roughness: 0.92, metalness: 0.02 }),
      bottom: new MeshStandardMaterial({ color: BOTTOM, roughness: 0.94, metalness: 0.02 }),
    }),
    [],
  )

  return (
    <group ref={refs.root} visible={false}>
      <group ref={refs.body} position={[0, 0.94, 0]}>
        <mesh position={[0, 0.26, 0]} material={materials.top}>
          <capsuleGeometry args={[0.17, 0.26, 5, 12]} />
        </mesh>
        <mesh position={[0, 0.55, 0]} material={materials.skin}>
          <cylinderGeometry args={[0.048, 0.055, 0.09, 10]} />
        </mesh>
        <mesh position={[0, 0.68, 0]} material={materials.skin}>
          <sphereGeometry args={[0.108, 16, 12]} />
        </mesh>

        <group ref={refs.armL} position={[-0.18, 0.45, 0]}>
          <mesh position={[0, -0.22, 0]} material={materials.top}>
            <capsuleGeometry args={[0.05, 0.34, 4, 10]} />
          </mesh>
        </group>
        <group ref={refs.armR} position={[0.18, 0.45, 0]}>
          <mesh position={[0, -0.22, 0]} material={materials.top}>
            <capsuleGeometry args={[0.05, 0.34, 4, 10]} />
          </mesh>
        </group>
      </group>

      <group ref={refs.legL} position={[-0.1, 0.94, 0]}>
        <mesh position={[0, -0.5, 0]} material={materials.bottom}>
          <capsuleGeometry args={[0.07, 0.64, 4, 10]} />
        </mesh>
      </group>
      <group ref={refs.legR} position={[0.1, 0.94, 0]}>
        <mesh position={[0, -0.5, 0]} material={materials.bottom}>
          <capsuleGeometry args={[0.07, 0.64, 4, 10]} />
        </mesh>
      </group>
    </group>
  )
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Rapproche un angle d'un autre par le plus court chemin sur le cercle. */
function approachAngle(from: number, to: number, t: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return from + d * Math.min(1, t)
}

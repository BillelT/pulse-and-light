import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshBasicMaterial, type Group } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import type { AudioFrame } from '../audio/types'
import { INK_SURFACE } from './ink'

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
const MAX_MEMBERS = 100
/** Point d'entree / de sortie, derriere la camera. */
const SPAWN_Z = 34
const WALK_SPEED = 5
/** Vitesse de remplissage, en fraction de piste par seconde a plein niveau. */
const FILL_RATE = 0.06
const EMPTY_RATE = 0.17
/** Duree du fondu d'echelle a l'apparition, en secondes. */
const FADE = 0.35
/**
 * Hauteur du bassin, donc origine de tout le haut du corps.
 *
 * Le rebond s'AJOUTE a cette hauteur, il ne la remplace pas : ecrire
 * `body.position.y = rebond` ecrasait le decalage pose au montage et faisait
 * tomber buste, tete et bras a hauteur de cheville, imbriques dans les jambes.
 */
const BODY_Y = 0.7

/**
 * Styles de danse.
 *
 * Une foule ou tout le monde execute le meme mouvement au meme moment se lit
 * comme un banc de poissons, pas comme un public : on ne veut pas d'un
 * "programme collectif". Chaque silhouette recoit donc un style FIXE (tire
 * une fois pour toutes a partir de son index) et deux petites nuances
 * personnelles — un decalage de tempo (moitie, plein, un peu plus rapide)
 * et une bande frequentielle preferee — pour que meme deux danseurs du meme
 * style ne soient jamais parfaitement synchrones ni sensibles au meme
 * instrument.
 */
const enum Style {
  /** Rebond sur le temps, bras en l'air : le style "par defaut" du brief. */
  Bounce = 0,
  /** Balancement lateral, sans rebond vertical : le slow / le corps qui roule. */
  Sway = 1,
  /** Bras en haut en permanence, petit pump sur le kick : "hands up". */
  HandsUp = 2,
  /** Tete/buste qui plonge en avant sur le kick, bras plaques : headbang. */
  HeadBang = 3,
  /** Un bras monte pendant que l'autre descend, en alternance : groove. */
  Groove = 4,
  /** Pas de cote, jambes qui basculent alternativement : side-step. */
  StepSide = 5,
}

const STYLE_COUNT = 6

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
  /** Style de danse, tire une fois pour toutes. */
  style: Style
  /** Diviseur/multiplicateur de tempo perso : 0.5, 1.0 ou 1.5. */
  tempoMul: number
  /** Bande frequentielle preferee (0..5). Amplifie la reaction du danseur a ce band. */
  bandBias: number
  /**
   * Etat interne cote danse (evite les allocations). Sens local au style :
   * pour Groove c'est le sens d'alternance des bras (+1/-1) et l'onset
   * auquel il a bascule pour la derniere fois.
   */
  danceState: number
  danceLastOnset: number
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
 * Places sur la piste, jamais alignees. Les premieres places tirees sont les
 * plus centrales — la piste se garnit donc du centre vers les bords, comme
 * une vraie salle.
 */
const SLOTS = (() => {
  const rand = mulberry32(0x2b91f7)
  return Array.from({ length: MAX_MEMBERS }, (_, i) => {
    const spread = 0.5 + (i / (MAX_MEMBERS - 1)) * 0.7
    // Au cadrage par defaut la camera est a z ~ 20 : personne ne danse plus
    // loin en avant qu'elle.
    const z = -9 + rand() * 15 * spread
    const x = (rand() - 0.5) * 30 * spread
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
      SLOTS.map((slot, i) => {
        // Repartition des styles : on parcourt 0..5 en boucle, decale par un
        // pas premier avec 6 pour eviter des blocs contigus de meme style
        // (les silhouettes voisines ont des styles differents).
        const style = ((i * 5) % STYLE_COUNT) as Style
        // Trois vitesses possibles : moitie, plein, un plus rapide. Reparties
        // deterministe sur les entiers pour que le meme index redonne toujours
        // la meme silhouette.
        const tempoChoices = [0.5, 1, 1.5]
        const tempoMul = tempoChoices[i % tempoChoices.length]
        // Bande preferee : chaque danseur reagit un peu plus fort a une
        // frequence donnee. On ecarte deliberement Sub/Bass des styles calmes
        // (Sway, HandsUp) pour qu'ils ne pompent pas sur les kicks.
        const bandBias = (i * 7 + style) % 6
        return {
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
          style,
          tempoMul,
          bandBias,
          danceState: 1,
          danceLastOnset: -1,
        }
      }),
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
        legL.rotation.z = 0
        legR.rotation.z = 0
        armL.rotation.x = -s * 0.42
        armR.rotation.x = s * 0.42
        // Une rotation Z POSITIVE emmene le bras vers +x, donc vers
        // l'interieur pour le bras gauche : les signes sont ceux du miroir,
        // pas ceux du cote. Inverses, les deux bras rentraient dans le buste
        // et ressortaient plus bas — on lisait des membres plantes dans le
        // corps.
        armL.rotation.z = -0.08
        armR.rotation.z = 0.08
        body.position.y = BODY_Y + Math.abs(c) * 0.045
        body.rotation.z = s * 0.03
        body.rotation.x = 0.04
        body.rotation.y = 0
      } else {
        // Danse : la phase rythmique commune est modulee par le tempo perso
        // et le decalage propre a la silhouette. On amplifie discretement la
        // reaction au band prefere du danseur pour qu'un tempo tenu ne
        // produise pas un mouvement identique chez tout le monde.
        const p = (beat.current * w.tempoMul + w.seed) * Math.PI
        const bandBoost = frame.bands[w.bandBias]
        const drive = 0.35 + level * 0.65
        danceMember(w, body, legL, legR, armL, armR, p, drive, level, bandBoost, frame)
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

/**
 * Un seul materiau, partage par toutes les silhouettes ET par tout le reste
 * du decor : DA "ink", aucun aplat de couleur, juste le papier — le trait
 * (InkEffect) est seul responsable de la lisibilite des formes.
 */
const memberMaterial = new MeshBasicMaterial({ color: INK_SURFACE })

function Member({ refs }: { refs: MemberRefs }) {
  // Proportions calquees sur celles du DJ (buste-capsule qui couvre aussi le
  // haut du bassin, cou court, tete-sphere, bras a un seul segment) : la
  // silhouette du public doit se lire comme la meme famille de personnage,
  // juste sans la richesse d'un rig anime en detail.
  //
  // Le bassin n'est pas un volume separe : la capsule du buste (rayon 0.185,
  // longueur 0.28) descend assez bas pour couvrir le haut des cuisses quelle
  // que soit leur rotation — un bassin distinct n'ajouterait un maillage que
  // pour redire ce que cette capsule dit deja.
  return (
    <group ref={refs.root} visible={false}>
      <group ref={refs.body} position={[0, BODY_Y, 0]}>
        {/* Buste. */}
        <mesh position={[0, 0.37, 0]} material={memberMaterial}>
          <capsuleGeometry args={[0.185, 0.28, 5, 12]} />
        </mesh>
        {/* Cou. */}
        <mesh position={[0, 0.66, 0]} material={memberMaterial}>
          <cylinderGeometry args={[0.05, 0.058, 0.09, 10]} />
        </mesh>
        {/* Tete. */}
        <mesh position={[0, 0.8, 0]} material={memberMaterial}>
          <sphereGeometry args={[0.115, 16, 12]} />
        </mesh>

        {/* Epaules a la hauteur du haut du buste, sur son flanc — a son bord
            meme (x = rayon) : un point d'ancrage plus large laisse un vide
            entre le buste et l'epaule, tres visible une fois la silhouette
            reduite a son contour. */}
        <group ref={refs.armL} position={[-0.185, 0.54, 0]}>
          <mesh position={[0, -0.22, 0]} material={memberMaterial}>
            <capsuleGeometry args={[0.052, 0.32, 4, 10]} />
          </mesh>
        </group>
        <group ref={refs.armR} position={[0.185, 0.54, 0]}>
          <mesh position={[0, -0.22, 0]} material={memberMaterial}>
            <capsuleGeometry args={[0.052, 0.32, 4, 10]} />
          </mesh>
        </group>
      </group>

      {/* Hanches : pivot sous le bassin, jamais dans le buste. L'ecartement
          compte autant que la longueur — deux jambes collees a l'axe restent
          dans l'ombre du bassin et la silhouette n'a plus de jambes du tout.
          A +/- 0.12 avec un rayon de 0.065, il reste un vide net entre les
          deux, et c'est ce vide qui les fait exister au trait. */}
      <group ref={refs.legL} position={[-0.12, 0.88, 0]}>
        <mesh position={[0, -0.42, 0]} material={memberMaterial}>
          <capsuleGeometry args={[0.065, 0.6, 4, 10]} />
        </mesh>
      </group>
      <group ref={refs.legR} position={[0.12, 0.88, 0]}>
        <mesh position={[0, -0.42, 0]} material={memberMaterial}>
          <capsuleGeometry args={[0.065, 0.6, 4, 10]} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Applique le mouvement de danse a un walker selon son style.
 *
 * Contrat implicite : chaque branche DOIT ecrire toutes les rotations
 * qu'elle utilise, sinon les valeurs laissees par le style precedent (ou par
 * la marche) trainent d'une frame a l'autre. Aucune allocation ici — c'est
 * appele une fois par danseur, chaque frame.
 */
function danceMember(
  w: Walker,
  body: Group,
  legL: Group,
  legR: Group,
  armL: Group,
  armR: Group,
  p: number,
  drive: number,
  level: number,
  bandBoost: number,
  frame: AudioFrame,
): void {
  const beatEnv = frame.beat
  switch (w.style) {
    case 0 /* Bounce */: {
      // Le style de reference : rebond sur le temps, bras qui montent avec
      // les aigus. Sert d'ancre visuelle pour les autres styles.
      const bounce = Math.abs(Math.sin(p))
      const raise = Math.min(1, frame.bands[Band.HighMid] * 0.9 + level * 0.9)
      body.position.y = BODY_Y - bounce * 0.075 * drive
      body.rotation.z = Math.sin(p * 0.5 + w.seed * 6) * 0.09 * drive
      body.rotation.x = 0.03 + Math.sin(p + 1) * 0.05 * drive
      body.rotation.y = 0
      legL.rotation.x = Math.sin(p) * 0.12 * drive
      legR.rotation.x = -Math.sin(p) * 0.12 * drive
      legL.rotation.z = 0
      legR.rotation.z = 0
      const lift = 0.3 + raise * 1.9 + Math.sin(p + w.seed * 5) * 0.25 * drive
      armL.rotation.z = -lift
      armR.rotation.z = lift
      armL.rotation.x = Math.sin(p - 1) * 0.3 * drive
      armR.rotation.x = Math.sin(p + 1) * 0.3 * drive
      break
    }
    case 1 /* Sway */: {
      // Balancement lateral : le buste s'incline a gauche puis a droite au
      // rythme du morceau, les deux bras suivent le meme sens (comme
      // accroches au corps). Aucun rebond vertical — c'est le style "posé".
      const s = Math.sin(p * 0.5)
      body.position.y = BODY_Y
      body.rotation.z = s * 0.28 * (0.6 + drive * 0.6)
      body.rotation.x = 0.02
      body.rotation.y = s * 0.12
      legL.rotation.x = 0
      legR.rotation.x = 0
      legL.rotation.z = s * 0.05
      legR.rotation.z = s * 0.05
      // Les bras se soulevent doucement en meme temps que l'inclinaison,
      // avec un boost sur la bande preferee du danseur.
      const armSwing = s * (0.6 + bandBoost * 0.6)
      armL.rotation.z = -0.15 + armSwing
      armR.rotation.z = 0.15 + armSwing
      armL.rotation.x = Math.sin(p * 0.5 + 0.4) * 0.15
      armR.rotation.x = Math.sin(p * 0.5 - 0.4) * 0.15
      break
    }
    case 2 /* HandsUp */: {
      // Bras en l'air en permanence, petit pump sur l'enveloppe de kick :
      // silhouette "concert" reconnaissable au premier coup d'oeil.
      const pump = beatEnv * (0.5 + bandBoost * 0.5)
      body.position.y = BODY_Y - pump * 0.06
      body.rotation.z = Math.sin(p + w.seed * 3) * 0.05
      body.rotation.x = 0.05
      body.rotation.y = 0
      legL.rotation.x = 0
      legR.rotation.x = 0
      legL.rotation.z = 0
      legR.rotation.z = 0
      // Base tres haute + agitation legere : les mains restent au-dessus de
      // la tete quoi qu'il arrive.
      const high = 2.1 + pump * 0.35 + Math.sin(p * 2 + w.seed * 4) * 0.15
      armL.rotation.z = -high
      armR.rotation.z = high
      armL.rotation.x = Math.sin(p * 2) * 0.2 + 0.1
      armR.rotation.x = Math.sin(p * 2 + Math.PI) * 0.2 + 0.1
      break
    }
    case 3 /* HeadBang */: {
      // Buste qui plonge en avant sur chaque kick, bras plaques le long du
      // corps qui pompent vers le bas : le mouvement du fond de salle sur un
      // riff rentre-dedans. On utilise l'enveloppe beat (attaque nette)
      // plutot qu'un sinus, sinon le mouvement flotte.
      const kick = frame.bands[Band.Bass] * 0.6 + beatEnv * 0.8
      const nod = Math.min(1, kick) * (0.4 + drive * 0.6)
      body.position.y = BODY_Y - nod * 0.03
      body.rotation.x = 0.06 + nod * 0.55
      body.rotation.z = Math.sin(p + w.seed * 2) * 0.04
      body.rotation.y = 0
      legL.rotation.x = 0
      legR.rotation.x = -nod * 0.15
      legL.rotation.z = 0
      legR.rotation.z = 0
      // Bras colles au corps, poings qui descendent en cadence.
      armL.rotation.z = -0.05
      armR.rotation.z = 0.05
      armL.rotation.x = nod * 0.6
      armR.rotation.x = nod * 0.6
      break
    }
    case 4 /* Groove */: {
      // Un bras monte pendant que l'autre descend, avec bascule d'alternance
      // a chaque temps : c'est cette bascule (pas le sinus) qui donne le
      // sentiment "sur le beat" — un sinus fait un mouvement fluide, un
      // switch discret marque le tempo.
      if (frame.onsetCount !== w.danceLastOnset) {
        w.danceState = -w.danceState
        w.danceLastOnset = frame.onsetCount
      }
      const side = w.danceState
      const roll = Math.sin(p * 0.5) * 0.14 * (0.6 + drive * 0.6)
      body.position.y = BODY_Y - Math.abs(Math.sin(p * 0.5)) * 0.02
      body.rotation.z = roll
      body.rotation.x = 0.04
      // Rotation du buste vers le cote actif : ca "vend" la torsion des hanches.
      body.rotation.y = side * 0.18
      legL.rotation.x = side > 0 ? 0.05 : -0.05
      legR.rotation.x = side > 0 ? -0.05 : 0.05
      legL.rotation.z = 0
      legR.rotation.z = 0
      // Le bras du cote "actif" monte franchement, l'autre reste bas.
      const highArm = 1.4 + bandBoost * 0.6
      const lowArm = 0.1
      armL.rotation.z = side > 0 ? -highArm : -lowArm
      armR.rotation.z = side > 0 ? lowArm : highArm
      armL.rotation.x = Math.sin(p) * 0.15
      armR.rotation.x = Math.sin(p + Math.PI) * 0.15
      break
    }
    case 5 /* StepSide */: {
      // Pas de cote : les deux jambes s'inclinent alternativement dans le
      // meme sens (le corps translate legerement) et le buste suit. Bras
      // bas, coudes qui pompent — plus "danse a deux" que "hands up".
      const s = Math.sin(p * 0.5)
      const shift = s * 0.06
      body.position.y = BODY_Y - Math.abs(s) * 0.03
      body.rotation.z = s * 0.1
      body.rotation.x = 0.05
      body.rotation.y = s * 0.06
      // Les jambes basculent ensemble sur Z (comme si on glissait le pied
      // vers le cote actif).
      legL.rotation.z = s * 0.28
      legR.rotation.z = s * 0.28
      legL.rotation.x = -shift
      legR.rotation.x = shift
      // Bras bas, symetriques, qui font un petit pump sur le beat.
      const pump = 0.2 + beatEnv * 0.25 * (0.6 + bandBoost * 0.6)
      armL.rotation.z = -0.25 - pump * 0.3
      armR.rotation.z = 0.25 + pump * 0.3
      armL.rotation.x = -0.15 + pump * 0.5
      armR.rotation.x = -0.15 + pump * 0.5
      break
    }
  }
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

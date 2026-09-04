import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Spherical, Vector3 } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { CAMERA_BOUNDS } from './roomLayout'
import { readState, useStore } from '../state/store'

const TARGET = new Vector3(0, 4.3, -2.2)
const _pos = new Vector3()
const _look = new Vector3()

const MIN_RADIUS = 9
const MAX_RADIUS = 52
const MIN_PHI = 0.45
const MAX_PHI = 1.6

/** FOV vertical de reference, calibre pour un ecran large (desktop). */
const BASE_FOV = 60
/**
 * En portrait, un FOV vertical fixe donne un FOV horizontal bien plus etroit
 * qu'en paysage (le FOV horizontal depend du ratio largeur/hauteur) : on ne
 * voyait plus qu'une tranche de la piste, jamais la foule en entier.
 * On elargit le FOV vertical quand l'ecran est plus haut que large, borne
 * pour ne pas deformer l'image comme un fisheye.
 */
const MAX_PORTRAIT_FOV = 80

const _dir = new Vector3()

/**
 * Distance maximale, depuis TARGET et dans la direction (phi, theta) donnee,
 * avant de sortir de la boite CAMERA_BOUNDS (plafond, murs lateraux, mur du
 * fond). Remplace un clamp brut de la position finale : celui-ci "aplatissait"
 * la trajectoire des qu'un axe touchait sa limite (la camera se mettait a
 * glisser le long du mur au lieu de continuer son arc), ce qui se sentait
 * comme un mouvement casse. En bornant le RAYON plutot que la position, la
 * camera reste sur une trajectoire spherique lisse et ralentit naturellement
 * en approchant une paroi, quelle que soit la direction visee.
 */
function maxRadiusTo(phi: number, theta: number): number {
  _dir.set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta))
  let t = Infinity
  if (_dir.x > 1e-6) t = Math.min(t, (CAMERA_BOUNDS.x - TARGET.x) / _dir.x)
  else if (_dir.x < -1e-6) t = Math.min(t, (-CAMERA_BOUNDS.x - TARGET.x) / _dir.x)
  if (_dir.y > 1e-6) t = Math.min(t, (CAMERA_BOUNDS.yMax - TARGET.y) / _dir.y)
  else if (_dir.y < -1e-6) t = Math.min(t, (CAMERA_BOUNDS.yMin - TARGET.y) / _dir.y)
  if (_dir.z > 1e-6) t = Math.min(t, (CAMERA_BOUNDS.zMax - TARGET.z) / _dir.z)
  else if (_dir.z < -1e-6) t = Math.min(t, (CAMERA_BOUNDS.zMin - TARGET.z) / _dir.z)
  return t
}

/**
 * Camera maison plutot qu'OrbitControls : il faut pouvoir superposer un
 * mouvement automatique et un camera shake sur les kicks sans que le
 * controleur ne les ecrase a chaque frame.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const spherical = useRef(
    (() => {
      // Meme punition qu'au niveau du FOV : en portrait, on recule un peu la
      // camera par defaut pour que toute la foule tienne dans le cadre des
      // l'ouverture, sans que l'utilisateur ait a dezoomer.
      const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9
      const radius = aspect < 1 ? 22.5 * clamp(1 / aspect, 1, 1.7) : 22.5
      return new Spherical(radius, 1.35, 0)
    })(),
  )
  const drag = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 })
  const pinch = useRef<{ active: boolean; distance: number }>({ active: false, distance: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const shake = useRef(0)
  const lastOnset = useRef(0)
  const sway = useRef(0)

  // FOV responsive : voir le commentaire sur MAX_PORTRAIT_FOV.
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const aspect = size.width / size.height
    camera.fov = aspect < 1 ? clamp(BASE_FOV / aspect, BASE_FOV, MAX_PORTRAIT_FOV) : BASE_FOV
    camera.updateProjectionMatrix()
  }, [camera, size])

  useEffect(() => {
    const el = gl.domElement

    const pinchDistance = () => {
      const pts = Array.from(pointers.current.values())
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    }

    const down = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture(e.pointerId)

      if (pointers.current.size >= 2) {
        // Deux doigts (ou plus) : on bascule en pincement, plus d'orbite.
        drag.current.active = false
        pinch.current = { active: true, distance: pinchDistance() }
        return
      }
      // Bouton gauche uniquement (souris), et pas au dessus de l'UI (elle
      // stoppe l'event) ; en tactile e.button vaut 0 aussi.
      if (e.button !== 0) return
      drag.current = { active: true, x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pinch.current.active && pointers.current.size >= 2) {
        const d = pinchDistance()
        const s = spherical.current
        // Ecarter les doigts rapproche la camera, les rapprocher l'eloigne.
        s.radius = clamp(s.radius * (pinch.current.distance / d), MIN_RADIUS, MAX_RADIUS)
        pinch.current.distance = d
        return
      }

      if (!drag.current.active) return
      const dx = e.clientX - drag.current.x
      const dy = e.clientY - drag.current.y
      drag.current.x = e.clientX
      drag.current.y = e.clientY
      const s = spherical.current
      s.theta -= dx * 0.004
      s.phi = clamp(s.phi - dy * 0.003, MIN_PHI, MAX_PHI)
      // Le mur est frontal : on interdit de passer derriere.
      s.theta = clamp(s.theta, -0.85, 0.85)
    }
    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)

      if (pointers.current.size < 2) pinch.current.active = false
      // Reprendre l'orbite au doigt restant plutot que de rester bloque.
      if (pointers.current.size === 1 && !pinch.current.active) {
        const [remaining] = pointers.current.values()
        drag.current = { active: true, x: remaining.x, y: remaining.y }
      } else if (pointers.current.size === 0) {
        drag.current.active = false
      }
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = spherical.current
      s.radius = clamp(s.radius * (1 + e.deltaY * 0.0012), MIN_RADIUS, MAX_RADIUS)
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  useFrame((state, delta) => {
    const dt = Math.min(0.1, delta)
    const visual = readState().visual
    const frame = engine.currentFrame
    const t = state.clock.elapsedTime

    // Impulsion de shake sur transitoire, amortie ensuite.
    if (frame.onsetCount !== lastOnset.current) {
      lastOnset.current = frame.onsetCount
      shake.current = Math.min(1, shake.current + 0.55 + frame.bands[Band.Sub] * 0.5)
    }
    shake.current = Math.max(0, shake.current - dt * 3.4)

    // Respiration automatique : lente, jamais synchrone avec la musique, sinon
    // le mouvement devient nauseeux.
    if (visual.autoCamera && !drag.current.active) sway.current += dt

    const s = spherical.current
    const swayTheta = visual.autoCamera ? Math.sin(sway.current * 0.17) * 0.19 : 0
    const swayPhi = visual.autoCamera ? Math.sin(sway.current * 0.11 + 1.2) * 0.045 : 0
    // Le morceau "recule" legerement la camera quand il ouvre : on respire avec.
    const zoom = visual.autoCamera ? frame.level * -1.4 : 0

    const phi = clamp(s.phi + swayPhi, MIN_PHI, MAX_PHI)
    const theta = s.theta + swayTheta
    // Le rayon ne peut jamais depasser la distance a laquelle cette direction
    // sort de la piece : la camera ralentit en douceur en approchant un mur
    // ou le plafond, elle ne s'arrete pas net sur un axe.
    const radius = clamp(s.radius + zoom, MIN_RADIUS, Math.min(MAX_RADIUS, maxRadiusTo(phi, theta)))

    _pos.setFromSphericalCoords(radius, phi, theta)
    _pos.add(TARGET)

    const amp = shake.current * shake.current * visual.shake * 0.42
    if (amp > 1e-4) {
      // Deux frequences non harmoniques : un shake sur une seule sinusoide se
      // lit comme une oscillation propre, pas comme un impact.
      _pos.x += Math.sin(t * 61) * amp
      _pos.y += Math.sin(t * 47 + 1.7) * amp * 0.7
    }

    camera.position.lerp(_pos, 2 - Math.exp(-dt / 0.06))
    _look.copy(TARGET)
    _look.y += Math.sin(t * 53) * amp * 0.35
    camera.lookAt(_look)
  })

  return null
}

/**
 * Aides visuelles de debug : axes du monde (rouge/vert/bleu = X/Y/Z) et
 * grille au sol, togglables depuis l'onglet Debug.
 */
export function DebugHelpers() {
  const showAxes = useStore((s) => s.debug.showAxes)
  const showGrid = useStore((s) => s.debug.showGrid)

  return (
    <>
      {showAxes && <axesHelper args={[8]} />}
      {showGrid && <gridHelper args={[80, 40, '#4d5a8f', '#2a2f45']} />}
    </>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Spherical, Vector3 } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { CAMERA_BOUNDS } from './roomLayout'
import { readState, useStore } from '../state/store'

/**
 * Largeur occupee par le panneau lateral (droite, cf. `.panel` dans
 * styles.css : right 18px + width 306px). Sert a recentrer la camera sur la
 * zone visible plutot que sur le canvas entier quand le panneau est ouvert.
 */
const PANEL_WIDTH = 324

const TARGET = new Vector3(0, 4.3, -2.2)
const _pos = new Vector3()
const _look = new Vector3()

const MIN_RADIUS = 11
const MAX_RADIUS = 48
// MIN_PHI releve (vs anciennement 0.55) : plus l'angle est petit, plus la
// camera survole la scene depuis le dessus — au dela on voyait le plafond
// depuis l'exterieur. La marge dure (CAMERA_BOUNDS) reste le vrai filet de
// securite, celle-ci evite surtout de la faire declencher en usage normal.
const MIN_PHI = 0.85
const MAX_PHI = 1.52

/**
 * Camera maison plutot qu'OrbitControls : il faut pouvoir superposer un
 * mouvement automatique et un camera shake sur les kicks sans que le
 * controleur ne les ecrase a chaque frame.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const panelOpen = useStore((s) => s.panelOpen)

  const spherical = useRef(new Spherical(22.5, 1.35, 0))
  const drag = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 })
  const shake = useRef(0)
  const lastOnset = useRef(0)
  const sway = useRef(0)

  // Le panneau lateral masque une bande a droite du canvas : sans correction,
  // la scene reste centree sur le canvas entier et orbiter vers la droite
  // "mange" plus vite dans la zone visible que vers la gauche. On decale
  // l'axe optique de la camera (off-axis projection) pour que le pivot
  // reste centre dans la zone reellement visible.
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const { width, height } = size
    if (!panelOpen || width <= PANEL_WIDTH) {
      camera.clearViewOffset()
      return
    }
    camera.setViewOffset(width + PANEL_WIDTH, height, PANEL_WIDTH, 0, width, height)
    return () => camera.clearViewOffset()
  }, [camera, panelOpen, size])

  useEffect(() => {
    const el = gl.domElement

    const down = (e: PointerEvent) => {
      // Bouton gauche uniquement, et pas au dessus de l'UI (elle stoppe l'event).
      if (e.button !== 0) return
      drag.current = { active: true, x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
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
      drag.current.active = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
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

    _pos.setFromSphericalCoords(
      clamp(s.radius + zoom, MIN_RADIUS, MAX_RADIUS),
      clamp(s.phi + swayPhi, MIN_PHI, MAX_PHI),
      s.theta + swayTheta,
    )
    _pos.add(TARGET)

    // Filet de securite : quels que soient radius/phi/theta (et leurs
    // combinaisons avec le sway et le zoom automatiques), la camera ne doit
    // jamais sortir de la piece ni passer au dessus du plafond — sinon on
    // voit les baies vitrees et le decor depuis "les coulisses".
    _pos.x = clamp(_pos.x, -CAMERA_BOUNDS.x, CAMERA_BOUNDS.x)
    _pos.y = clamp(_pos.y, CAMERA_BOUNDS.yMin, CAMERA_BOUNDS.yMax)
    _pos.z = clamp(_pos.z, CAMERA_BOUNDS.zMin, CAMERA_BOUNDS.zMax)

    const amp = shake.current * shake.current * visual.shake * 0.42
    if (amp > 1e-4) {
      // Deux frequences non harmoniques : un shake sur une seule sinusoide se
      // lit comme une oscillation propre, pas comme un impact.
      _pos.x += Math.sin(t * 61) * amp
      _pos.y += Math.sin(t * 47 + 1.7) * amp * 0.7
    }

    camera.position.lerp(_pos, 1 - Math.exp(-dt / 0.06))
    _look.copy(TARGET)
    _look.y += Math.sin(t * 53) * amp * 0.35
    camera.lookAt(_look)
  })

  return null
}

/**
 * Eclairage de base. Volontairement famelique : dans la reference, presque
 * toute la lumiere vient des caissons eux-memes. Ces sources ne servent qu'a
 * ce que la geometrie non emissive ne disparaisse pas completement.
 *
 * Chaque valeur vient du store (`debug`) pour etre manipulable en direct
 * depuis l'onglet Debug, `DEFAULT_DEBUG` portant les valeurs d'origine.
 */
export function Rig() {
  const debug = useStore((s) => s.debug)

  return (
    <>
      <ambientLight intensity={debug.ambientIntensity} color={debug.ambientColor} />
      <hemisphereLight args={[debug.hemiSkyColor, debug.hemiGroundColor, debug.hemiIntensity]} />
      <directionalLight
        position={debug.dirPos}
        intensity={debug.dirIntensity}
        color={debug.dirColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-14}
        shadow-camera-far={60}
        shadow-bias={-0.0008}
      />
      <pointLight
        position={debug.pointPos}
        intensity={debug.pointIntensity}
        distance={debug.pointDistance}
        decay={debug.pointDecay}
        color={debug.pointColor}
      />
      <spotLight
        position={debug.spotPos}
        angle={debug.spotAngle}
        penumbra={debug.spotPenumbra}
        intensity={debug.spotIntensity}
        distance={debug.spotDistance}
        decay={debug.spotDecay}
        color={debug.spotColor}
      />
    </>
  )
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

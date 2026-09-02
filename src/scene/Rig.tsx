import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Spherical, Vector3 } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { readState } from '../state/store'

const TARGET = new Vector3(0, 4.3, -2.2)
const _pos = new Vector3()
const _look = new Vector3()

const MIN_RADIUS = 11
const MAX_RADIUS = 46
const MIN_PHI = 0.55
const MAX_PHI = 1.52

/**
 * Camera maison plutot qu'OrbitControls : il faut pouvoir superposer un
 * mouvement automatique et un camera shake sur les kicks sans que le
 * controleur ne les ecrase a chaque frame.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const spherical = useRef(new Spherical(22.5, 1.35, 0))
  const drag = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 })
  const shake = useRef(0)
  const lastOnset = useRef(0)
  const sway = useRef(0)

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
 */
export function Rig() {
  return (
    <>
      <ambientLight intensity={0.42} color="#7b76a4" />
      <hemisphereLight args={['#5c5a8a', '#120c1f', 0.8]} />
      <directionalLight
        position={[6, 16, 10]}
        intensity={1.0}
        color="#9fa1c8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-14}
        shadow-camera-far={60}
        shadow-bias={-0.0008}
      />
      <pointLight position={[0, 7.5, 11]} intensity={38} distance={22} decay={2} color="#8580b4" />
      <spotLight
        position={[-11, 17, 16]}
        angle={0.62}
        penumbra={1}
        intensity={9}
        distance={58}
        decay={1.2}
        color="#7d84ad"
      />
    </>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

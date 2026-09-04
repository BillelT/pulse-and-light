import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MeshBasicMaterial, type Material, type Mesh, type Object3D } from 'three'
import { useStore } from '../state/store'
import { INK_SURFACE } from './ink'

/**
 * Aplatit toutes les surfaces de la scene en blanc, pour la DA "ink".
 *
 * Plutot que de dupliquer chaque materiau du decor en version encre (le
 * danseur seul en compte une vingtaine), on remplace en bloc : un croquis n'a
 * de toute facon qu'UN remplissage, le papier. Ce qui donne la forme, ce sont
 * les traits calcules par `InkEffect`, pas les materiaux.
 *
 * Deux exceptions, marquees par `material.userData.inkKeep = true` :
 *  - les cellules LED, seule couleur de la DA ;
 *  - les textures qui peignent deja de l'encre (la skyline).
 *
 * Le balayage est repete (et non fait une seule fois au montage) parce que
 * plusieurs composants recreent leur materiau quand la palette change ; sans
 * ca, une couleur du decor reapparaitrait au premier changement de reglage.
 */

/** Un balayage toutes les N frames : le decor bouge rarement, inutile de payer
 *  une traversee complete a 60 fps. */
const SWEEP_INTERVAL = 15

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true
}

function isKept(material: Material | Material[]): boolean {
  const first = Array.isArray(material) ? material[0] : material
  return first?.userData?.inkKeep === true
}

export function InkSurfaces() {
  const ink = useStore((s) => s.visual.ink)
  const scene = useThree((s) => s.scene)

  const surface = useMemo(
    () => new MeshBasicMaterial({ color: INK_SURFACE, fog: false }),
    [],
  )
  const originals = useRef(new WeakMap<Mesh, Material | Material[]>())
  const frames = useRef(0)

  // Retour a la DA d'origine : on remet a chaque mesh le materiau qu'on lui a
  // pris. Sans ca, quitter le mode encre laisserait toute la scene en blanc.
  useEffect(() => {
    if (ink) return
    const store = originals.current
    scene.traverse((object) => {
      if (!isMesh(object)) return
      const original = store.get(object)
      if (original) {
        object.material = original
        store.delete(object)
      }
    })
  }, [ink, scene])

  useEffect(() => () => surface.dispose(), [surface])

  useFrame(() => {
    if (!ink) return
    if (frames.current++ % SWEEP_INTERVAL !== 0) return

    scene.traverse((object) => {
      if (!isMesh(object)) return
      const material = object.material
      if (material === surface || isKept(material)) return
      originals.current.set(object, material)
      object.material = surface
    })
  })

  return null
}

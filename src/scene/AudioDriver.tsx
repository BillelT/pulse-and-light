import { useEffect } from 'react'
import { engine } from '../audio/engine'
import { readState } from '../state/store'

/** Periode de l'analyse, en ms (~125 Hz). */
const TICK_MS = 8

/**
 * Unique point d'entree de l'analyse audio.
 *
 * Volontairement pilote par un timer et non par `useFrame` : la detection de
 * transitoires a besoin d'un echantillonnage regulier et suffisamment fin. Un
 * morceau a 128 BPM produit un kick toutes les 470 ms ; si la scene tombe a
 * 15 fps (GPU integre, fenetre redimensionnee, onglet charge), une analyse
 * calee sur le rendu rate des kicks et le tempo estime part en vrille.
 *
 * L'AnalyserNode est alimente par le thread audio en continu : l'interroger
 * sur son propre rythme est donc a la fois plus juste et sans surcout notable.
 */
export function AudioDriver() {
  useEffect(() => {
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      // Les reglages du panneau sont relus a chaque tick : le lighting designer
      // doit voir l'effet d'un slider immediatement.
      engine.settings = readState().analysis
      engine.update(dt)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])
  return null
}

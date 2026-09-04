import { useEffect } from 'react'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { Panel } from './ui/Panel'
import { SourceDock } from './ui/SourceDock'
import { useAudioSource } from './audio/useAudioSource'
import { useSpotify } from './spotify/useSpotify'
import { useStore } from './state/store'

/** Panneau lateral (reglages lumiere, debug, recherche Spotify) : reserve au
 *  developpement. En production, seul le dock de source reste visible. */
const DEV = import.meta.env.DEV

export default function App() {
  const spotify = useSpotify()
  const audio = useAudioSource(spotify.readSnapshot)

  const sourceKind = useStore((s) => s.sourceKind)
  const playing = useStore((s) => s.snapshot.playing)
  const ink = useStore((s) => s.visual.ink)

  // La DA "ink" ne s'arrete pas au canvas : le HUD et les panneaux basculent
  // eux aussi en papier/trait (point 4 du brief). Une classe sur <body> suffit,
  // toute la feuille de style est ecrite autour de variables.
  useEffect(() => {
    document.body.classList.toggle('ink', ink)
    return () => document.body.classList.remove('ink')
  }, [ink])

  // Des que Spotify joue, on bascule sur sa timeline : appuyer sur play doit
  // suffire a ce que le mur suive le morceau. Avant ca, la scene reste
  // silencieuse (aucune source demo par defaut) : pas d'animation qui tourne
  // dans le vide avant qu'une vraie source soit branchee.
  useEffect(() => {
    if (playing && sourceKind === 'none') {
      void audio.select('spotify')
    }
  }, [playing, sourceKind, audio])

  // Raccourcis clavier classiques d'un lecteur : espace = play/pause, fleches
  // = precedent/suivant, touches media du clavier si le systeme les expose.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
        return
      }
      switch (e.code) {
        case 'Space':
        case 'MediaPlayPause':
          e.preventDefault()
          void spotify.togglePlay()
          break
        case 'ArrowRight':
        case 'MediaTrackNext':
          e.preventDefault()
          void spotify.next()
          break
        case 'ArrowLeft':
        case 'MediaTrackPrevious':
          e.preventDefault()
          void spotify.previous()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [spotify])

  return (
    <>
      <Scene />
      <Hud />
      <SourceDock audio={audio} spotify={spotify} />
      {DEV && <Panel audio={audio} spotify={spotify} />}
    </>
  )
}

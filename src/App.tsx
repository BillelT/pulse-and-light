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

  // La scene demarre vivante, sur la source procedurale : elle n'ouvre aucun
  // AudioContext ni aucune capture, donc elle ne demande pas de geste
  // utilisateur. Le panneau reste la pour brancher une vraie source.
  useEffect(() => {
    if (sourceKind === 'none') void audio.select('demo')
    // Volontairement au montage seulement : `audio.stop()` doit pouvoir
    // couper la source sans que cet effet ne la relance aussitot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Des que Spotify joue, on bascule sur sa timeline : appuyer sur play doit
  // suffire a ce que le mur suive le morceau.
  useEffect(() => {
    if (playing && (sourceKind === 'none' || sourceKind === 'demo')) {
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

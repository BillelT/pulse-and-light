import { useEffect } from 'react'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { Panel } from './ui/Panel'
import { useAudioSource } from './audio/useAudioSource'
import { useSpotify } from './spotify/useSpotify'
import { useStore } from './state/store'

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

  return (
    <>
      <Scene />
      <Hud spotify={spotify} />
      <Panel audio={audio} spotify={spotify} />
    </>
  )
}

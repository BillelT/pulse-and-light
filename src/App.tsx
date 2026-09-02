import { useEffect, useState } from 'react'
import { Scene } from './scene/Scene'
import { Hud } from './ui/Hud'
import { Panel } from './ui/Panel'
import { Splash } from './ui/Splash'
import { useAudioSource } from './audio/useAudioSource'
import { useSpotify } from './spotify/useSpotify'
import { useStore } from './state/store'

export default function App() {
  const spotify = useSpotify()
  const audio = useAudioSource(spotify.readSnapshot)
  const [splashDone, setSplashDone] = useState(false)

  const sourceKind = useStore((s) => s.sourceKind)
  const playing = useStore((s) => s.snapshot.playing)

  // Si l'utilisateur lance la lecture Spotify sans avoir choisi de source,
  // on branche la timeline : appuyer sur play doit suffire a allumer le mur.
  useEffect(() => {
    if (playing && sourceKind === 'none') void audio.select('spotify')
  }, [playing, sourceKind, audio])

  return (
    <>
      <Scene />
      <Hud spotify={spotify} />
      <Panel audio={audio} spotify={spotify} />
      {!splashDone && sourceKind === 'none' && (
        <Splash audio={audio} spotify={spotify} onDismiss={() => setSplashDone(true)} />
      )}
    </>
  )
}

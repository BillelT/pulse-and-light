import { useState } from 'react'
import { useStore } from '../state/store'
import type { AudioSourceController } from '../audio/useAudioSource'
import type { SpotifyController } from '../spotify/useSpotify'
import { LightingTab } from './LightingTab'
import { SourceTab } from './SourceTab'
import { SpotifyTab } from './SpotifyTab'

type Tab = 'source' | 'spotify' | 'light'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'source', label: 'Source' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'light', label: 'Lumiere' },
]

export function Panel({
  audio,
  spotify,
}: {
  audio: AudioSourceController
  spotify: SpotifyController
}) {
  const [tab, setTab] = useState<Tab>('source')
  const open = useStore((s) => s.panelOpen)
  if (!open) return null

  return (
    <div className="panel">
      <div className="panel-tabs">
        {TABS.map((t) => (
          <button key={t.id} data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'source' && <SourceTab audio={audio} />}
        {tab === 'spotify' && <SpotifyTab spotify={spotify} />}
        {tab === 'light' && <LightingTab />}
      </div>
    </div>
  )
}

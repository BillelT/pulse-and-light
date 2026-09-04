import { useRef } from 'react'
import { useStore } from '../state/store'
import type { AudioSourceController } from '../audio/useAudioSource'
import { Kv, Section } from './controls'

export function SourceTab({ audio }: { audio: AudioSourceController }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const sourceKind = useStore((s) => s.sourceKind)
  const sourceLabel = useStore((s) => s.sourceLabel)
  const audioError = useStore((s) => s.audioError)
  const analysisAvailable = useStore((s) => s.analysisAvailable)
  const spotifyConnected = useStore((s) => Boolean(s.token))

  return (
    <div>
      <Section title="Analysis source">
        <div className="btn-row">
          <button
            className={`btn ${sourceKind === 'tab' ? 'btn-active' : ''}`}
            onClick={() => void audio.select('tab')}
          >
            Tab audio
          </button>
          <div className="field-hint">
            The best rendering: real FFT on the sound actually playing. Pick the Spotify
            tab and check <b>Share tab audio</b>. Chrome / Edge only.
          </div>

          <button
            className={`btn ${sourceKind === 'spotify' ? 'btn-active' : ''}`}
            onClick={() => void audio.select('spotify')}
            disabled={!spotifyConnected}
          >
            Spotify timeline
          </button>
          <div className="field-hint">
            {spotifyConnected
              ? analysisAvailable
                ? 'Spectrum reconstructed from the track’s segments and beat grid: locked to the track, note by note.'
                : 'Spectrum reconstructed from tempo and audio features: the rhythm is accurate, the harmonic content is simulated.'
              : 'Connect to Spotify to enable this source.'}
          </div>

          <button
            className={`btn ${sourceKind === 'mic' ? 'btn-active' : ''}`}
            onClick={() => void audio.select('mic')}
          >
            Microphone
          </button>
          <div className="field-hint">
            Captures what comes out of the speakers. Works everywhere, but the mic
            colors the spectrum and picks up the room.
          </div>

          <button
            className={`btn ${sourceKind === 'file' ? 'btn-active' : ''}`}
            onClick={() => fileInput.current?.click()}
          >
            Local file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void audio.selectFile(file)
              e.target.value = ''
            }}
          />

          {sourceKind !== 'none' && (
            <button className="btn" onClick={audio.stop}>
              Stop source
            </button>
          )}
        </div>

        {audioError && <div className="note note-error" style={{ marginTop: 10 }}>{audioError}</div>}
      </Section>

      <Section title="Status">
        <Kv k="Source" v={sourceLabel} />
        <Kv
          k="Type"
          v={sourceKind === 'tab' || sourceKind === 'mic' || sourceKind === 'file' ? 'Real FFT' : sourceKind === 'spotify' ? 'Procedural' : '—'}
        />
      </Section>

      <Section title="Why several sources?">
        <div className="note">
          Spotify's Web Playback SDK decodes its track behind EME (DRM). This stream is
          <b> never</b> accessible from the Web Audio API, in any browser: hooking an
          AnalyserNode to it returns silence.
          <br />
          <br />
          Two honest paths exist, then: capture the output sound (tab or mic) for a
          real FFT, or reconstruct a spectrum from the timing data Spotify exposes.
          Both feed the exact same analysis engine.
        </div>
      </Section>
    </div>
  )
}

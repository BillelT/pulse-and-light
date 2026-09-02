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
      <Section title="Source d'analyse">
        <div className="btn-row">
          <button
            className={`btn ${sourceKind === 'tab' ? 'btn-active' : ''}`}
            onClick={() => void audio.select('tab')}
          >
            Audio de l&apos;onglet
          </button>
          <div className="field-hint">
            Le meilleur rendu : vraie FFT sur le son reellement joue. Choisis l&apos;onglet
            Spotify et coche <b>Partager l&apos;audio de l&apos;onglet</b>. Chrome / Edge
            uniquement.
          </div>

          <button
            className={`btn ${sourceKind === 'spotify' ? 'btn-active' : ''}`}
            onClick={() => void audio.select('spotify')}
            disabled={!spotifyConnected}
          >
            Timeline Spotify
          </button>
          <div className="field-hint">
            {spotifyConnected
              ? analysisAvailable
                ? 'Spectre reconstruit a partir des segments et de la grille de beats de la piste : cale sur le morceau, note par note.'
                : 'Spectre reconstruit a partir du tempo et des audio-features : le rythme est juste, le contenu harmonique est simule.'
              : 'Connecte-toi a Spotify pour activer cette source.'}
          </div>

          <button
            className={`btn ${sourceKind === 'mic' ? 'btn-active' : ''}`}
            onClick={() => void audio.select('mic')}
          >
            Micro
          </button>
          <div className="field-hint">
            Capte ce qui sort des enceintes. Marche partout, mais le micro colore le
            spectre et capte la piece.
          </div>

          <button
            className={`btn ${sourceKind === 'file' ? 'btn-active' : ''}`}
            onClick={() => fileInput.current?.click()}
          >
            Fichier local
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
              Couper la source
            </button>
          )}
        </div>

        {audioError && <div className="note note-error" style={{ marginTop: 10 }}>{audioError}</div>}
      </Section>

      <Section title="Etat">
        <Kv k="Source" v={sourceLabel} />
        <Kv
          k="Type"
          v={sourceKind === 'tab' || sourceKind === 'mic' || sourceKind === 'file' ? 'FFT reelle' : sourceKind === 'spotify' ? 'Procedural' : '—'}
        />
      </Section>

      <Section title="Pourquoi plusieurs sources ?">
        <div className="note">
          Le Web Playback SDK de Spotify decode sa piste derriere l&apos;EME (DRM). Ce flux
          n&apos;est <b>jamais</b> accessible depuis la Web Audio API, dans aucun navigateur :
          brancher un AnalyserNode dessus renvoie du silence.
          <br />
          <br />
          Deux chemins honnetes existent donc : capturer le son en sortie (onglet ou micro)
          pour une vraie FFT, ou reconstruire un spectre a partir des donnees temporelles que
          Spotify expose. Les deux alimentent exactement le meme moteur d&apos;analyse.
        </div>
      </Section>
    </div>
  )
}

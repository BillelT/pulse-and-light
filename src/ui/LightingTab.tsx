import { useStore } from '../state/store'
import { PALETTES } from '../scene/palettes'
import { Section, Slider, Toggle } from './controls'

const ms = (v: number) => `${(v * 1000).toFixed(0)} ms`
const pct = (v: number) => `${(v * 100).toFixed(0)}%`

/**
 * Le "playground" de la PARTIE 3 du brief : tout ce que la science ne tranche
 * pas est expose ici comme reglage de lighting designer.
 */
export function LightingTab() {
  const analysis = useStore((s) => s.analysis)
  const visual = useStore((s) => s.visual)
  const setAnalysis = useStore((s) => s.setAnalysis)
  const setVisual = useStore((s) => s.setVisual)
  const reset = useStore((s) => s.resetSettings)

  return (
    <div>
      <Section title="Seuils (3.3)">
        <Slider
          label="Gain K"
          value={analysis.gain}
          min={1}
          max={80}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(gain) => setAnalysis({ gain })}
          hint="Facteur K de I = log10(1 + A·K) / log10(1 + K). Monte-le sur un mix discret."
        />
        <Slider
          label="Plancher (noise floor)"
          value={analysis.noiseFloor}
          min={0}
          max={0.6}
          step={0.005}
          format={pct}
          onChange={(noiseFloor) =>
            setAnalysis({ noiseFloor: Math.min(noiseFloor, analysis.ceiling - 0.05) })
          }
          hint="En dessous, c'est du bruit : les LED restent eteintes."
        />
        <Slider
          label="Plafond (clipping)"
          value={analysis.ceiling}
          min={0.3}
          max={1}
          step={0.005}
          format={pct}
          onChange={(ceiling) =>
            setAnalysis({ ceiling: Math.max(ceiling, analysis.noiseFloor + 0.05) })
          }
          hint="Baisse-le sur un master ecrase pour retrouver de la dynamique."
        />
      </Section>

      <Section title="Amortissement (3.2)">
        <Slider
          label="Attaque"
          value={analysis.attack}
          min={0.002}
          max={0.3}
          step={0.002}
          format={ms}
          onChange={(attack) => setAnalysis({ attack })}
          hint="Constante de montee. Court = percussif, long = mou."
        />
        <Slider
          label="Decay"
          value={analysis.decay}
          min={0.02}
          max={1.5}
          step={0.01}
          format={ms}
          onChange={(decay) => setAnalysis({ decay })}
          hint="Constante de descente. C'est elle qui empeche l'effet stroboscopique."
        />
        <Slider
          label="Sensibilite kick"
          value={analysis.beatSensitivity}
          min={0.4}
          max={4}
          step={0.05}
          onChange={(beatSensitivity) => setAnalysis({ beatSensitivity })}
          hint="Seuil en ecarts-types au dessus de la montee d'energie moyenne. Bas = plus de kicks detectes."
        />
        <Slider
          label="Refractaire kick"
          value={analysis.beatCooldown}
          min={0.05}
          max={0.6}
          step={0.01}
          format={ms}
          onChange={(beatCooldown) => setAnalysis({ beatCooldown })}
          hint="Duree minimale entre deux declenchements."
        />
      </Section>

      <Section title="Palette (3.1)">
        <div className="chip-row">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              className={`btn ${visual.paletteId === p.id ? 'btn-active' : ''}`}
              onClick={() => setVisual({ paletteId: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Slider
            label="Teinte de bande"
            value={visual.bandTint}
            min={0}
            max={1}
            step={0.01}
            format={pct}
            onChange={(bandTint) => setVisual({ bandTint })}
            hint="Poids de la couleur de bande du brief sur la rampe verticale."
          />
          <Slider
            label="Teinte tonale (Scriabine)"
            value={visual.keyTint}
            min={0}
            max={1}
            step={0.01}
            format={pct}
            onChange={(keyTint) => setVisual({ keyTint })}
            hint="Teinte globale liee a la tonalite du morceau, si Spotify la donne."
          />
        </div>
      </Section>

      <Section title="Rendu">
        <Slider
          label="Bloom"
          value={visual.bloom}
          min={0}
          max={3}
          step={0.02}
          onChange={(bloom) => setVisual({ bloom })}
          hint="Le halo neon. Sans lui les LED redeviennent des boites."
        />
        <Slider
          label="Aberration chromatique"
          value={visual.chroma}
          min={0}
          max={2}
          step={0.02}
          onChange={(chroma) => setVisual({ chroma })}
          hint="Pilotee par les sub-basses."
        />
        <Slider
          label="Grain (timbre, 3.4)"
          value={visual.grain}
          min={0}
          max={1.5}
          step={0.02}
          onChange={(grain) => setVisual({ grain })}
          hint="Augmente avec le flux spectral et la brillance."
        />
        <Slider
          label="Brume"
          value={visual.fog}
          min={0}
          max={0.12}
          step={0.001}
          format={(v) => v.toFixed(3)}
          onChange={(fog) => setVisual({ fog })}
        />
        <Slider
          label="Camera shake"
          value={visual.shake}
          min={0}
          max={1.5}
          step={0.02}
          onChange={(shake) => setVisual({ shake })}
          hint="Impulsion sur chaque transitoire detectee."
        />
        <Slider
          label="Cellules par caisson"
          value={visual.segments}
          min={8}
          max={40}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(segments) => setVisual({ segments })}
          hint="Nombre de cellules de la colonne la plus haute ; le pas est ensuite constant sur tout le mur."
        />
        <Toggle
          label="Aplats de palette"
          checked={visual.quantize}
          onChange={(quantize) => setVisual({ quantize })}
        />
        <Toggle
          label="Peak hold"
          checked={visual.peakHold}
          onChange={(peakHold) => setVisual({ peakHold })}
        />
        <Toggle
          label="Camera automatique"
          checked={visual.autoCamera}
          onChange={(autoCamera) => setVisual({ autoCamera })}
        />
      </Section>

      <button className="btn" onClick={reset}>
        Reinitialiser les reglages
      </button>
      <div className="field-hint" style={{ marginTop: 10 }}>
        Glisser = orbiter · molette = zoom
      </div>
    </div>
  )
}

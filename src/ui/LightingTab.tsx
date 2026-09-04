import { useStore } from '../state/store'
import { PALETTES } from '../scene/palettes'
import { Section, Slider, Toggle } from './controls'

const ms = (v: number) => `${(v * 1000).toFixed(0)} ms`
const pct = (v: number) => `${(v * 100).toFixed(0)}%`

/**
 * The "playground" for PART 3 of the brief: anything the science doesn't
 * settle is exposed here as a lighting-designer setting.
 */
export function LightingTab() {
  const analysis = useStore((s) => s.analysis)
  const visual = useStore((s) => s.visual)
  const setAnalysis = useStore((s) => s.setAnalysis)
  const setVisual = useStore((s) => s.setVisual)
  const reset = useStore((s) => s.resetSettings)

  return (
    <div>
      <Section title="Thresholds (3.3)">
        <Slider
          label="Gain K"
          value={analysis.gain}
          min={1}
          max={80}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(gain) => setAnalysis({ gain })}
          hint="Factor K in I = log10(1 + A·K) / log10(1 + K). Raise it on a subtle mix."
        />
        <Slider
          label="Floor (noise floor)"
          value={analysis.noiseFloor}
          min={0}
          max={0.6}
          step={0.005}
          format={pct}
          onChange={(noiseFloor) =>
            setAnalysis({ noiseFloor: Math.min(noiseFloor, analysis.ceiling - 0.05) })
          }
          hint="Below this, it's noise: the LEDs stay off."
        />
        <Slider
          label="Ceiling (clipping)"
          value={analysis.ceiling}
          min={0.3}
          max={1}
          step={0.005}
          format={pct}
          onChange={(ceiling) =>
            setAnalysis({ ceiling: Math.max(ceiling, analysis.noiseFloor + 0.05) })
          }
          hint="Lower it on a squashed master to regain dynamic range."
        />
      </Section>

      <Section title="Damping (3.2)">
        <Slider
          label="Attack"
          value={analysis.attack}
          min={0.002}
          max={0.3}
          step={0.002}
          format={ms}
          onChange={(attack) => setAnalysis({ attack })}
          hint="Rise time constant. Short = percussive, long = soft."
        />
        <Slider
          label="Decay"
          value={analysis.decay}
          min={0.02}
          max={1.5}
          step={0.01}
          format={ms}
          onChange={(decay) => setAnalysis({ decay })}
          hint="Fall time constant. This is what prevents the strobe effect."
        />
        <Slider
          label="Kick sensitivity"
          value={analysis.beatSensitivity}
          min={0.4}
          max={4}
          step={0.05}
          onChange={(beatSensitivity) => setAnalysis({ beatSensitivity })}
          hint="Threshold in standard deviations above the average energy rise. Lower = more kicks detected."
        />
        <Slider
          label="Kick refractory"
          value={analysis.beatCooldown}
          min={0.05}
          max={0.6}
          step={0.01}
          format={ms}
          onChange={(beatCooldown) => setAnalysis({ beatCooldown })}
          hint="Minimum duration between two triggers."
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
            label="Color by frequency"
            value={visual.bandTint}
            min={0}
            max={1}
            step={0.01}
            format={pct}
            onChange={(bandTint) => setVisual({ bandTint })}
            hint="100% = the column takes the color of the band it measures (table in the brief). 0% = only the VU-meter level ramp colors the cells."
          />
          <Slider
            label="Key tint (Scriabin)"
            value={visual.keyTint}
            min={0}
            max={1}
            step={0.01}
            format={pct}
            onChange={(keyTint) => setVisual({ keyTint })}
            hint="Global tint tied to the track's key, when Spotify provides it."
          />
        </div>
      </Section>

      <Section title="Rendering">
        <Slider
          label="Bloom"
          value={visual.bloom}
          min={0}
          max={3}
          step={0.02}
          onChange={(bloom) => setVisual({ bloom })}
          hint="The neon glow. Without it the LEDs turn back into boxes."
        />
        <Slider
          label="Chromatic aberration"
          value={visual.chroma}
          min={0}
          max={2}
          step={0.02}
          onChange={(chroma) => setVisual({ chroma })}
          hint="Driven by the sub-bass."
        />
        <Slider
          label="Grain (timbre, 3.4)"
          value={visual.grain}
          min={0}
          max={1.5}
          step={0.02}
          onChange={(grain) => setVisual({ grain })}
          hint="Increases with spectral flux and brightness."
        />
        <Slider
          label="Fog"
          value={visual.fog}
          min={0}
          max={0.05}
          step={0.0005}
          format={(v) => v.toFixed(4)}
          onChange={(fog) => setVisual({ fog })}
          hint="Beyond ~0.03 the back light boxes disappear as soon as you back away."
        />
        <Slider
          label="Camera shake"
          value={visual.shake}
          min={0}
          max={1.5}
          step={0.02}
          onChange={(shake) => setVisual({ shake })}
          hint="Impulse on each transient detected."
        />
        <Slider
          label="Cells per light box"
          value={visual.segments}
          min={8}
          max={40}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(segments) => setVisual({ segments })}
          hint="Number of cells in the tallest column; the pitch is then constant across the whole wall."
        />
        <Toggle
          label="Flat palette colors"
          checked={visual.quantize}
          onChange={(quantize) => setVisual({ quantize })}
        />
        <Toggle
          label="Peak hold"
          checked={visual.peakHold}
          onChange={(peakHold) => setVisual({ peakHold })}
        />
        <Toggle
          label="Auto camera"
          checked={visual.autoCamera}
          onChange={(autoCamera) => setVisual({ autoCamera })}
        />
      </Section>

      <button className="btn" onClick={reset}>
        Reset settings
      </button>
      <div className="field-hint" style={{ marginTop: 10 }}>
        Drag = orbit · scroll = zoom
      </div>
    </div>
  )
}

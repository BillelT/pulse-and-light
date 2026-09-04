import { useStore } from '../state/store'
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
          hint="Below this, it's noise: nothing responds."
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
          hint="Fall time constant."
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

      <Section title="Ink art direction">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
          Pen sketch on white paper: the whole scene, always.
        </div>
        <Slider
          label="Line width"
          value={visual.inkLine}
          min={0.6}
          max={3}
          step={0.05}
          format={(v) => `${v.toFixed(2)} px`}
          onChange={(inkLine) => setVisual({ inkLine })}
          hint="Constant in pixels, whatever the distance — a pen doesn't get thinner far away."
        />
        <Slider
          label="Hand wobble"
          value={visual.inkWobble}
          min={0}
          max={6}
          step={0.1}
          format={(v) => `${v.toFixed(1)} px`}
          onChange={(inkWobble) => setVisual({ inkWobble })}
          hint="0 = clean vector line. A bit of wobble is what kills the 3D look."
        />
        <Slider
          label="Contours"
          value={visual.inkContour}
          min={4}
          max={40}
          step={0.5}
          format={(v) => v.toFixed(1)}
          onChange={(inkContour) => setVisual({ inkContour })}
          hint="How eagerly a depth step becomes a line. Too high and every fold gets drawn."
        />
        <Slider
          label="Hatching"
          value={visual.inkHatch}
          min={0}
          max={1.5}
          step={0.01}
          format={pct}
          onChange={(inkHatch) => setVisual({ inkHatch })}
          hint="Only on grazing surfaces, to detach a volume. Kept low: the page must stay white."
        />
      </Section>

      <Section title="Ink wall (the visualizer)">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
          Sound becomes pigment, not light. Left to right = low to high frequency, and each
          slice keeps the colour its band is given in part 1 of the brief. Height = how much
          ink that frequency has soaked into the paper.
        </div>
        <Slider
          label="Pigment"
          value={visual.inkWashDensity}
          min={0}
          max={1.6}
          step={0.02}
          format={pct}
          onChange={(inkWashDensity) => setVisual({ inkWashDensity })}
          hint="Concentration of the wash. Too high and the paper stops showing through."
        />
        <Slider
          label="Bleed"
          value={visual.inkWashBleed}
          min={0}
          max={0.6}
          step={0.005}
          format={(v) => v.toFixed(3)}
          onChange={(inkWashBleed) => setVisual({ inkWashBleed })}
          hint="How wet the paper is. The spectral flux and the kick push it further."
        />
        <Slider
          label="Pen loops"
          value={visual.inkWashPenwork}
          min={0}
          max={1.2}
          step={0.02}
          format={pct}
          onChange={(inkWashPenwork) => setVisual({ inkWashPenwork })}
          hint="Contour lines drawn over the wash. They tighten with the treble."
        />
      </Section>

      <Section title="Camera">
        <Slider
          label="Camera shake"
          value={visual.shake}
          min={0}
          max={1.5}
          step={0.02}
          onChange={(shake) => setVisual({ shake })}
          hint="Impulse on each transient detected."
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

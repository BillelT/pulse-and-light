import { useStore } from '../state/store'
import { ColorField, Section, Slider, Toggle, Vec3Field } from './controls'

/**
 * Scene debugger: lights, fog, visual aids (axes/grid).
 * Anything not already in the Light tab (the lighting designer's
 * "playground") that instead serves to inspect/tune the scene's raw
 * geometry and R3F lighting.
 */
export function DebugTab() {
  const debug = useStore((s) => s.debug)
  const setDebug = useStore((s) => s.setDebug)
  const reset = useStore((s) => s.resetSettings)

  return (
    <div>
      <Section title="Visual aids">
        <Toggle
          label="World axes (X red, Y green, Z blue)"
          checked={debug.showAxes}
          onChange={(showAxes) => setDebug({ showAxes })}
        />
        <Toggle
          label="Ground grid"
          checked={debug.showGrid}
          onChange={(showGrid) => setDebug({ showGrid })}
        />
      </Section>

      <Section title="Floor">
        <Toggle
          label="Floor outline (red)"
          checked={debug.floorShowOutline}
          onChange={(floorShowOutline) => setDebug({ floorShowOutline })}
        />
        <Toggle
          label="Wall outline (cyan)"
          checked={debug.floorShowWallOutline}
          onChange={(floorShowWallOutline) => setDebug({ floorShowWallOutline })}
        />
        <div className="field-hint">
          Enable both to compare: the red should hug the cyan (or slightly
          overlap it), never sit set back from it.
        </div>
        <Slider
          label="Side margin (X)"
          value={debug.floorMarginX}
          min={-5}
          max={5}
          step={0.1}
          format={(v) => v.toFixed(1)}
          hint="Negative = the floor extends under the side walls. Positive = set back (gap)."
          onChange={(floorMarginX) => setDebug({ floorMarginX })}
        />
        <Slider
          label="Back margin (Z)"
          value={debug.floorMarginBack}
          min={-5}
          max={5}
          step={0.1}
          format={(v) => v.toFixed(1)}
          hint="Negative = the floor extends under the back recess. Positive = set back (gap)."
          onChange={(floorMarginBack) => setDebug({ floorMarginBack })}
        />
        <Slider
          label="Front edge (Z)"
          value={debug.floorFrontZ}
          min={20}
          max={80}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(floorFrontZ) => setDebug({ floorFrontZ })}
        />
      </Section>

      <Section title="Fog">
        <ColorField
          label="Fog color"
          value={debug.fogColor}
          onChange={(fogColor) => setDebug({ fogColor })}
        />
        <div className="field-hint">
          Density is set in the Light tab (the "Fog" setting).
        </div>
      </Section>

      <Section title="Ambient">
        <Slider
          label="Intensity"
          value={debug.ambientIntensity}
          min={0}
          max={3}
          step={0.02}
          onChange={(ambientIntensity) => setDebug({ ambientIntensity })}
        />
        <ColorField
          label="Color"
          value={debug.ambientColor}
          onChange={(ambientColor) => setDebug({ ambientColor })}
        />
      </Section>

      <Section title="Hemisphere">
        <Slider
          label="Intensity"
          value={debug.hemiIntensity}
          min={0}
          max={3}
          step={0.02}
          onChange={(hemiIntensity) => setDebug({ hemiIntensity })}
        />
        <ColorField
          label="Sky color"
          value={debug.hemiSkyColor}
          onChange={(hemiSkyColor) => setDebug({ hemiSkyColor })}
        />
        <ColorField
          label="Ground color"
          value={debug.hemiGroundColor}
          onChange={(hemiGroundColor) => setDebug({ hemiGroundColor })}
        />
      </Section>

      <Section title="Directional (sun + shadows)">
        <Slider
          label="Intensity"
          value={debug.dirIntensity}
          min={0}
          max={5}
          step={0.02}
          onChange={(dirIntensity) => setDebug({ dirIntensity })}
        />
        <ColorField
          label="Color"
          value={debug.dirColor}
          onChange={(dirColor) => setDebug({ dirColor })}
        />
        <Vec3Field
          label="Position"
          value={debug.dirPos}
          min={-40}
          max={40}
          step={0.5}
          onChange={(dirPos) => setDebug({ dirPos })}
        />
      </Section>

      <Section title="Point">
        <Slider
          label="Intensity"
          value={debug.pointIntensity}
          min={0}
          max={150}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(pointIntensity) => setDebug({ pointIntensity })}
        />
        <ColorField
          label="Color"
          value={debug.pointColor}
          onChange={(pointColor) => setDebug({ pointColor })}
        />
        <Vec3Field
          label="Position"
          value={debug.pointPos}
          min={-40}
          max={40}
          step={0.5}
          onChange={(pointPos) => setDebug({ pointPos })}
        />
        <Slider
          label="Distance"
          value={debug.pointDistance}
          min={1}
          max={80}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(pointDistance) => setDebug({ pointDistance })}
        />
        <Slider
          label="Decay"
          value={debug.pointDecay}
          min={0}
          max={3}
          step={0.05}
          onChange={(pointDecay) => setDebug({ pointDecay })}
        />
      </Section>

      <Section title="Spot">
        <Slider
          label="Intensity"
          value={debug.spotIntensity}
          min={0}
          max={60}
          step={0.5}
          onChange={(spotIntensity) => setDebug({ spotIntensity })}
        />
        <ColorField
          label="Color"
          value={debug.spotColor}
          onChange={(spotColor) => setDebug({ spotColor })}
        />
        <Vec3Field
          label="Position"
          value={debug.spotPos}
          min={-40}
          max={40}
          step={0.5}
          onChange={(spotPos) => setDebug({ spotPos })}
        />
        <Slider
          label="Angle"
          value={debug.spotAngle}
          min={0.05}
          max={1.55}
          step={0.01}
          onChange={(spotAngle) => setDebug({ spotAngle })}
        />
        <Slider
          label="Penumbra"
          value={debug.spotPenumbra}
          min={0}
          max={1}
          step={0.01}
          onChange={(spotPenumbra) => setDebug({ spotPenumbra })}
        />
        <Slider
          label="Distance"
          value={debug.spotDistance}
          min={1}
          max={120}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(spotDistance) => setDebug({ spotDistance })}
        />
        <Slider
          label="Decay"
          value={debug.spotDecay}
          min={0}
          max={3}
          step={0.05}
          onChange={(spotDecay) => setDebug({ spotDecay })}
        />
      </Section>

      <button className="btn" onClick={reset}>
        Reset (light, analysis, debug)
      </button>
    </div>
  )
}

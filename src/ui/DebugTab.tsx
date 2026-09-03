import { useStore } from '../state/store'
import { ColorField, Section, Slider, Toggle, Vec3Field } from './controls'

/**
 * Debuggeur de scene : lumieres, brouillard, aides visuelles (axes/grille).
 * Tout ce qui n'est pas deja dans l'onglet Lumiere (le "playground" du
 * lighting designer) et qui sert plutot a inspecter/regler la geometrie et
 * l'eclairage bruts de la scene R3F.
 */
export function DebugTab() {
  const debug = useStore((s) => s.debug)
  const setDebug = useStore((s) => s.setDebug)
  const reset = useStore((s) => s.resetSettings)

  return (
    <div>
      <Section title="Aides visuelles">
        <Toggle
          label="Axes du monde (X rouge, Y vert, Z bleu)"
          checked={debug.showAxes}
          onChange={(showAxes) => setDebug({ showAxes })}
        />
        <Toggle
          label="Grille au sol"
          checked={debug.showGrid}
          onChange={(showGrid) => setDebug({ showGrid })}
        />
      </Section>

      <Section title="Brouillard">
        <ColorField
          label="Couleur du brouillard"
          value={debug.fogColor}
          onChange={(fogColor) => setDebug({ fogColor })}
        />
        <div className="field-hint">
          La densite se regle dans l&apos;onglet Lumiere (reglage &quot;Brume&quot;).
        </div>
      </Section>

      <Section title="Ambiante">
        <Slider
          label="Intensite"
          value={debug.ambientIntensity}
          min={0}
          max={3}
          step={0.02}
          onChange={(ambientIntensity) => setDebug({ ambientIntensity })}
        />
        <ColorField
          label="Couleur"
          value={debug.ambientColor}
          onChange={(ambientColor) => setDebug({ ambientColor })}
        />
      </Section>

      <Section title="Hemisphere">
        <Slider
          label="Intensite"
          value={debug.hemiIntensity}
          min={0}
          max={3}
          step={0.02}
          onChange={(hemiIntensity) => setDebug({ hemiIntensity })}
        />
        <ColorField
          label="Couleur ciel"
          value={debug.hemiSkyColor}
          onChange={(hemiSkyColor) => setDebug({ hemiSkyColor })}
        />
        <ColorField
          label="Couleur sol"
          value={debug.hemiGroundColor}
          onChange={(hemiGroundColor) => setDebug({ hemiGroundColor })}
        />
      </Section>

      <Section title="Directionnelle (soleil + ombres)">
        <Slider
          label="Intensite"
          value={debug.dirIntensity}
          min={0}
          max={5}
          step={0.02}
          onChange={(dirIntensity) => setDebug({ dirIntensity })}
        />
        <ColorField
          label="Couleur"
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

      <Section title="Ponctuelle">
        <Slider
          label="Intensite"
          value={debug.pointIntensity}
          min={0}
          max={150}
          step={1}
          format={(v) => v.toFixed(0)}
          onChange={(pointIntensity) => setDebug({ pointIntensity })}
        />
        <ColorField
          label="Couleur"
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
          label="Intensite"
          value={debug.spotIntensity}
          min={0}
          max={60}
          step={0.5}
          onChange={(spotIntensity) => setDebug({ spotIntensity })}
        />
        <ColorField
          label="Couleur"
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
        Reinitialiser (lumiere, analyse, debug)
      </button>
    </div>
  )
}

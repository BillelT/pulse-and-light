import { inkFluid } from '../scene/inkFluid'
import {
  INK_INJECT_MODES,
  INK_VIEWS,
  useStore,
  type InkInjectMode,
  type InkSettings,
  type InkView,
} from '../state/store'
import { Section, Slider } from './controls'

/**
 * Onglet du mur (visualiseur), reconstruit brique par brique.
 *
 * Regle : un slider ici = un uniforme ou une constante du modele, dans
 * l'ordre ou la frame est calculee. Chaque nouvelle brique du shader
 * amene sa section de reglages et une vue de debug.
 *
 * Etapes en place :
 *  1. pont audio -> DataTexture, vue "Spectrum".
 *  2. flow field (bruit simplex), vue "Flow".
 *  3. ping-pong FBO : le rendu reel affiche enfin quelque chose. Trois
 *     modes d'injection commutables pour choisir a l'oeil laquelle
 *     donne le meilleur rendu (fountain / drops / both).
 */

const VIEW_LABEL: Record<InkView, string> = {
  off: 'Render',
  spectrum: 'Spectrum',
  flow: 'Flow',
}

const VIEW_HELP: Record<InkView, string> = {
  off: 'The real render. Grayscale ink density coming from the fluid FBO. No dissipation yet — the wall saturates over time; step 4 will fix that.',
  spectrum: 'The 13 log-frequency columns straight from the audio engine, drawn as a horizontal spectrum bar. Bass on the left, treble on the right.',
  flow: 'The flow field vector, red = horizontal, green = vertical. Bass pushes the amplitude, treble accelerates the churn. Same field the fluid is advected by.',
}

const INJECT_LABEL: Record<InkInjectMode, string> = {
  fountain: 'Fountain',
  drops: 'Drops',
  both: 'Both',
}

const INJECT_HELP: Record<InkInjectMode, string> = {
  fountain: 'A thin band at the bottom is painted every frame with the audio spectrum. The flow field then carries it up. Continuous life, works on quiet tracks.',
  drops: 'On each onset, a Gaussian drop is dropped at a position tied to the transient\'s peak frequency. Punchy, goes quiet between beats.',
  both: 'Fountain keeps the background alive, drops mark the beats. The mix that looks most like ink in water.',
}

const num = (v: number) => v.toFixed(2)
const pct = (v: number) => `${(v * 100).toFixed(0)}%`

export function InkTab() {
  const ink = useStore((s) => s.ink)
  const setInk = useStore((s) => s.setInk)

  const set = <K extends keyof InkSettings>(key: K) => (value: InkSettings[K]) =>
    setInk({ [key]: value } as Partial<InkSettings>)

  return (
    <div>
      <Section title="View">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          Debug readouts drawn straight from the wall shader. They read the
          same uniforms as the real render — no separate material.
        </div>
        <div className="ink-views">
          {INK_VIEWS.map((v) => (
            <button
              key={v}
              data-active={ink.view === v}
              onClick={() => setInk({ view: v })}
              title={VIEW_HELP[v]}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="field-hint" style={{ marginTop: 6 }}>{VIEW_HELP[ink.view]}</div>
      </Section>

      <Section title="2 · Flow field">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          Simplex noise → 2D vector field. The fluid is now advected by it;
          flip to Flow to see the same field on its own.
        </div>
        <Slider
          label="Scale"
          value={ink.flowScale}
          min={0.4}
          max={8}
          step={0.05}
          format={num}
          onChange={set('flowScale')}
          hint="Bigger = smaller, tighter swirls. Smaller = big lazy volutes that cross the whole wall."
        />
        <Slider
          label="Base speed"
          value={ink.flowSpeed}
          min={0}
          max={1}
          step={0.005}
          format={num}
          onChange={set('flowSpeed')}
          hint="Clock speed of the field with no audio. 0 = the field is frozen in place."
        />
        <Slider
          label="Bass → amplitude"
          value={ink.flowBass}
          min={0}
          max={3}
          step={0.02}
          format={pct}
          onChange={set('flowBass')}
          hint="How much a kick pushes the fluid further in one frame."
        />
        <Slider
          label="Treble → churn"
          value={ink.flowTreble}
          min={0}
          max={3}
          step={0.02}
          format={pct}
          onChange={set('flowTreble')}
          hint="How much the treble speeds up the micro-turbulences."
        />
      </Section>

      <Section title="3 · Fluid">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          Ping-pong FBO, 256 × 384 half-float. Each frame reads the previous
          state, warps it by the flow field, and adds the injection below.
          No dissipation yet.
        </div>

        <div className="field" style={{ marginBottom: 8 }}>
          <div className="field-head">
            <span>Injection mode</span>
            <b>{INJECT_LABEL[ink.injectMode]}</b>
          </div>
          <div className="ink-views" style={{ marginTop: 4 }}>
            {INK_INJECT_MODES.map((m) => (
              <button
                key={m}
                data-active={ink.injectMode === m}
                onClick={() => setInk({ injectMode: m })}
                title={INJECT_HELP[m]}
              >
                {INJECT_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="field-hint" style={{ marginTop: 6 }}>{INJECT_HELP[ink.injectMode]}</div>
        </div>

        <Slider
          label="Advection strength"
          value={ink.advectStrength}
          min={0}
          max={5}
          step={0.02}
          format={num}
          onChange={set('advectStrength')}
          hint="How far the flow field displaces each pixel per frame. Too low = the fluid barely drifts; too high = smearing artifacts."
        />
        <Slider
          label="Injection size"
          value={ink.injectSize}
          min={0.005}
          max={0.2}
          step={0.001}
          format={num}
          onChange={set('injectSize')}
          hint="Fountain: band height. Drops: Gaussian radius. Both in UV units."
        />

        <button className="btn" onClick={() => inkFluid.reset()}>
          Rinse the wall (clear FBO)
        </button>
      </Section>

      <Section title="Where we are">
        <div className="field-hint" style={{ marginTop: 4 }}>
          Step 3 · the ping-pong FBO is alive. Ink accumulates and eventually
          saturates the wall — expected until step 4 (colorimetry +
          dissipation) is in.
        </div>
      </Section>
    </div>
  )
}

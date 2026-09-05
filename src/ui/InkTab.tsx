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
 *  2. flow field simplex, vue "Flow".
 *  3. ping-pong FBO avec integrateur leaky, spectre lisse, plafond doux.
 *  4. colorimetrie palette BANDS + Beer-Lambert.
 *  5. masque rectangulaire (fenetre d'affichage).
 */

const VIEW_LABEL: Record<InkView, string> = {
  off: 'Render',
  spectrum: 'Spectrum',
  flow: 'Flow',
}

const VIEW_HELP: Record<InkView, string> = {
  off: 'The real render. Colored fluid density coming from the FBO, framed by the rectangular mask. Fades to white when the music stops.',
  spectrum: 'The 13 log-frequency columns straight from the audio engine (smoothed 5-tap), drawn as a horizontal spectrum bar. Bass on the left, treble on the right.',
  flow: 'The flow field vector, red = horizontal, green = vertical. Bass pushes the amplitude, treble accelerates the churn. Same field the fluid is advected by.',
}

const INJECT_LABEL: Record<InkInjectMode, string> = {
  fountain: 'Fountain',
  drops: 'Drops',
  both: 'Both',
}

const INJECT_HELP: Record<InkInjectMode, string> = {
  fountain: 'Leaky integrator toward the current spectrum along a thin band at the bottom. Continuous life, tracks the audio faithfully — no ghost spikes.',
  drops: 'On each onset, a Gaussian drop is dropped at a position tied to the transient\'s peak frequency. Punchy, goes quiet between beats.',
  both: 'Fountain keeps the background alive, drops mark the beats. The mix that looks most like ink in water.',
}

const num = (v: number) => v.toFixed(2)
const num3 = (v: number) => v.toFixed(3)
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
        <Slider
          label="Scale"
          value={ink.flowScale}
          min={0.4}
          max={8}
          step={0.05}
          format={num}
          onChange={set('flowScale')}
          hint="Bigger = tighter swirls. Smaller = big lazy volutes."
        />
        <Slider
          label="Base speed"
          value={ink.flowSpeed}
          min={0}
          max={1}
          step={0.005}
          format={num}
          onChange={set('flowSpeed')}
          hint="Clock speed of the field with no audio. 0 = field frozen."
        />
        <Slider
          label="Bass → amplitude"
          value={ink.flowBass}
          min={0}
          max={3}
          step={0.02}
          format={pct}
          onChange={set('flowBass')}
          hint="How much a kick pushes the fluid further per frame."
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
          Ping-pong FBO, 256 × 384 half-float, RGB (linear absorption). Each
          frame reads the previous state, advects it by the flow field, blends
          in the injection, then applies dissipation and the ceiling.
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
          hint="How far the flow field displaces each pixel. Too low = the fluid barely drifts; too high = smearing artifacts."
        />
        <Slider
          label="Rise"
          value={ink.rise}
          min={0}
          max={2}
          step={0.01}
          format={num}
          onChange={set('rise')}
          hint="Extra upward push per unit of local intensity (UV/s). Loud bands push their pigment higher — the wave height reflects the frequency intensity."
        />
        <Slider
          label="Injection size"
          value={ink.injectSize}
          min={0.005}
          max={0.2}
          step={0.001}
          format={num3}
          onChange={set('injectSize')}
          hint="Fountain: band height. Drops: Gaussian radius."
        />
        <Slider
          label="Injection rate"
          value={ink.injectionRate}
          min={0.5}
          max={30}
          step={0.1}
          format={num}
          onChange={set('injectionRate')}
          hint="Leaky-integrator speed toward the current spectrum, in 1/s. Higher = fluid tracks the audio faster (sharper response). Lower = smoother, more painterly."
        />
        <Slider
          label="Dissipation"
          value={ink.dissipation}
          min={0}
          max={4}
          step={0.02}
          format={num}
          onChange={set('dissipation')}
          hint="Fade rate per second, exp(-rate·dt). 1.1 ≈ 0.63s half-life. Higher = ink clears faster. Balance with the injection rate so peaks don't linger."
        />
        <Slider
          label="Ceiling"
          value={ink.ceiling}
          min={0.05}
          max={1}
          step={0.005}
          format={num}
          onChange={set('ceiling')}
          hint="UV height where the fluid starts fading to zero. Keep near the spectrum bar's max (~0.25) to frame the visualizer."
        />
        <Slider
          label="Ceiling softness"
          value={ink.ceilingSoftness}
          min={0}
          max={0.5}
          step={0.005}
          format={num}
          onChange={set('ceilingSoftness')}
          hint="Fade width above the ceiling. 0 = hard cut, 0.15 = soft smoke-like dissolve."
        />

        <button className="btn" onClick={() => inkFluid.reset()}>
          Rinse the wall (clear FBO)
        </button>
      </Section>

      <Section title="5 · Display rectangle">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          Frames the fluid to a bounded window on the wall. Outside the rect →
          paper white. Soft edges avoid the "sticker on a wall" look.
        </div>
        <Slider
          label="Center X"
          value={ink.rectCenterX}
          min={0}
          max={1}
          step={0.005}
          format={num}
          onChange={set('rectCenterX')}
        />
        <Slider
          label="Center Y"
          value={ink.rectCenterY}
          min={0}
          max={1}
          step={0.005}
          format={num}
          onChange={set('rectCenterY')}
        />
        <Slider
          label="Half width"
          value={ink.rectHalfW}
          min={0.05}
          max={0.5}
          step={0.005}
          format={num}
          onChange={set('rectHalfW')}
          hint="In UV. 0.5 = full width of the wall."
        />
        <Slider
          label="Half height"
          value={ink.rectHalfH}
          min={0.05}
          max={0.5}
          step={0.005}
          format={num}
          onChange={set('rectHalfH')}
        />
        <Slider
          label="Edge softness"
          value={ink.rectSoftness}
          min={0}
          max={0.2}
          step={0.002}
          format={num3}
          onChange={set('rectSoftness')}
          hint="Smoothstep width at the rectangle border. 0 = hard cut, ~0.05 = ink-fringed print, higher = misty vignette."
        />
      </Section>

      <Section title="6 · Ink render">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          Turns the raw Beer-Lambert fluid into ink on paper: pigment curve,
          paper grain, wet edge on pool boundaries, hand-drawn wobble on the
          sample UV. Applied only inside the display rectangle.
        </div>
        <Slider
          label="Contrast"
          value={ink.inkContrast}
          min={0.4}
          max={3}
          step={0.02}
          format={num}
          onChange={set('inkContrast')}
          hint="Power curve on absorption. 1 = original watercolour gradient, 1.4..2 = tightens the mid-range, deepens the pigment. Higher = sharper stains."
        />
        <Slider
          label="Wet edge"
          value={ink.inkWetEdge}
          min={0}
          max={4}
          step={0.02}
          format={num}
          onChange={set('inkWetEdge')}
          hint="Darkens the boundary of ink pools where absorption gradient is high — the mark of drying ink. 0 = flat, 1..2 = clear ink signature."
        />
        <Slider
          label="Grain"
          value={ink.inkGrain}
          min={0}
          max={1.5}
          step={0.01}
          format={num}
          onChange={set('inkGrain')}
          hint="Paper fibres. Multiplicative noise on absorption, gated by density so the paper stays clean."
        />
        <Slider
          label="Grain scale"
          value={ink.inkGrainScale}
          min={30}
          max={400}
          step={5}
          format={(v) => v.toFixed(0)}
          onChange={set('inkGrainScale')}
          hint="How fine the paper fibres are, in cells across the wall. High = tight linen, low = coarse cardstock."
        />
        <Slider
          label="Sample wobble"
          value={ink.inkWobble}
          min={0}
          max={4}
          step={0.05}
          format={num}
          onChange={set('inkWobble')}
          hint="Micro jitter of the FBO sample UV, in texels. Breaks the perfect bilinear smoothness — the same trick the InkEffect pass uses for silhouettes."
        />
      </Section>

      <Section title="Where we are">
        <div className="field-hint" style={{ marginTop: 4 }}>
          Steps 1–5 in place. Palette follows BANDS (Sub, Bass, Low-Mid, Mid,
          High-Mid, Air) on the log-frequency axis common to the whole
          project — pigment keeps the colour of the frequency that laid it
          down even as advection carries it around.
        </div>
      </Section>
    </div>
  )
}

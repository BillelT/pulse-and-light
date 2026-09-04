import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'
import { inkField, SLOT_COUNT } from '../scene/inkField'
import { DEFAULT_INK, INK_VIEWS, useStore, type InkSettings, type InkView } from '../state/store'
import { Kv, Section, Slider, Toggle } from './controls'

/**
 * Debugger of the ink wall — the visualizer, and the only shader in the app.
 *
 * Deliberately its own tab rather than a section of "Light": the wall has ~30
 * knobs and three readouts of its own, and mixing them with the analysis
 * settings made both unreadable. The rule here is that every control maps to
 * exactly one uniform or one constant of the pigment model, in the order the
 * frame is actually computed — sound in at the top, pixels out at the bottom.
 * Reading the tab top to bottom is reading the shader.
 */

const pct = (v: number) => `${(v * 100).toFixed(0)}%`
const sec = (v: number) => `${v.toFixed(2)} s`
const num = (v: number) => v.toFixed(2)
const world = (v: number) => `${v.toFixed(0)} m`

/** What each false-colour view actually shows, in the order of INK_VIEWS. */
const VIEW_HELP: Record<InkView, string> = {
  off: 'The real render.',
  coverage: 'Pigment × vertical profile × side fade — where the wall can draw at all (×6).',
  wet: 'Ink being laid right now. Follows the spectrum instantly.',
  stain: 'Ink already soaked in. The memory of the track — the slow one.',
  flash: 'Drops thrown by transients. Should blink on every kick.',
  load: 'The three states combined, as the layout reads them.',
  blotch: 'Puddle mask. Dark holes = white paper breathing inside the stain.',
  wash: 'Wash concentration alone, strokes excluded (×4).',
  stroke: 'Stroke alpha alone. This is the drawing, with no colour and no wash.',
  warp: 'How far wet paper displaces the read, in art units (×6).',
  palette: 'Frequency → pigment ramp at full strength, model bypassed.',
  grid: 'Art coordinates. One cell = 0.1; red lines = x 0 and the horizon.',
}

const VIEW_LABEL: Record<InkView, string> = {
  off: 'Render',
  coverage: 'Coverage',
  wet: 'Wet',
  stain: 'Stain',
  flash: 'Flash',
  load: 'Load',
  blotch: 'Blotch',
  wash: 'Wash',
  stroke: 'Stroke',
  warp: 'Warp',
  palette: 'Palette',
  grid: 'Grid',
}

export function InkTab() {
  const ink = useStore((s) => s.ink)
  const setInk = useStore((s) => s.setInk)
  const resetInk = useStore((s) => s.resetInk)

  const set = <K extends keyof InkSettings>(key: K) => (value: InkSettings[K]) =>
    setInk({ [key]: value } as Partial<InkSettings>)

  return (
    <div>
      <Section title="View">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          False-colour readout of one intermediate value, straight from the shader. The ramp
          runs blue → cyan → yellow → red for 0 → 1.
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
        <Toggle
          label="Freeze warp clock"
          checked={ink.freeze}
          onChange={set('freeze')}
        />
        <div className="field-hint">
          Stops the paper deforming; the pigment keeps flowing. Lets you watch a puddle form
          without the noise sliding underneath it.
        </div>
      </Section>

      <Section title="Live">
        <InkScope />
        <InkReadout />
        <button className="btn" onClick={() => inkField.reset()}>
          Rinse the paper (clear pigment)
        </button>
      </Section>

      <Section title="1 · Sound to pigment">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          The CPU model, on 160 log-frequency slices. Analysis itself is untouched — tune it
          in the Light tab.
        </div>
        <Slider
          label="Deposit"
          value={ink.deposit}
          min={0}
          max={4}
          step={0.01}
          format={num}
          onChange={set('deposit')}
          hint="Soak-up speed per second at full energy. Superlinear: a quiet passage barely stains."
        />
        <Slider
          label="Dry time"
          value={ink.dryTime}
          min={0.2}
          max={30}
          step={0.1}
          format={sec}
          onChange={set('dryTime')}
          hint="How long the stain remembers. Short = a VU-meter again; long = the whole track accumulates."
        />
        <Slider
          label="Drop resorb"
          value={ink.flashTime}
          min={0.02}
          max={2}
          step={0.01}
          format={sec}
          onChange={set('flashTime')}
          hint="Lifetime of a transient drop."
        />
        <Slider
          label="Lateral spread"
          value={ink.spread}
          min={0}
          max={60}
          step={0.5}
          format={(v) => v.toFixed(1)}
          onChange={set('spread')}
          hint="Diffusion between neighbouring frequency slices, in slots² per second. What blurs the band boundaries."
        />
      </Section>

      <Section title="2 · Pigment load">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          How the three states add up into the one number the layout reads.
        </div>
        <Slider label="Stain" value={ink.weightStain} min={0} max={1.5} step={0.01} format={num}
          onChange={set('weightStain')} hint="The slow one. Dominates by default." />
        <Slider label="Wet" value={ink.weightWet} min={0} max={1.5} step={0.01} format={num}
          onChange={set('weightWet')} hint="The instantaneous one. Makes the wall breathe." />
        <Slider label="Flash" value={ink.weightFlash} min={0} max={1.5} step={0.01} format={num}
          onChange={set('weightFlash')} hint="The transient one." />
        <Slider label="Kick lift" value={ink.beatLift} min={0} max={1.5} step={0.01} format={num}
          onChange={set('beatLift')} hint="Extra load the kick envelope briefly adds on top." />
      </Section>

      <Section title="3 · Layout">
        <Slider label="Span (half-width)" value={ink.span} min={10} max={120} step={1} format={world}
          onChange={set('span')} hint="Width of the painted window, in world units. Beyond it, white paper." />
        <Slider label="Rise" value={ink.rise} min={3} max={40} step={0.5} format={world}
          onChange={set('rise')} hint="Reference height of the climb. The unit of everything below." />
        <Slider label="Reach at rest" value={ink.reachBase} min={0} max={1} step={0.01} format={num}
          onChange={set('reachBase')} hint="Climb with no pigment at all, in rise units." />
        <Slider label="Reach gain" value={ink.reachGain} min={0} max={3} step={0.01} format={num}
          onChange={set('reachGain')} hint="What a full load adds to the climb." />
        <Slider label="Falloff" value={ink.falloff} min={0.5} max={8} step={0.1} format={num}
          onChange={set('falloff')} hint="Vertical exponent. Higher = dense at the horizon, white above. Below 2 the wall fills the frame." />
        <Slider label="Sink below horizon" value={ink.sink} min={0} max={1.5} step={0.01} format={num}
          onChange={set('sink')} hint="How far the ink runs under the horizon line before the terrace cuts it." />
        <Slider label="Side fade" value={ink.sideFade} min={0.2} max={1.2} step={0.01} format={num}
          onChange={set('sideFade')} hint="Where the lateral dissolve starts, in span units. Keep under 1 or the plane shows an edge." />
      </Section>

      <Section title="4 · Wet paper">
        <Slider label="Bleed" value={ink.bleed} min={0} max={0.8} step={0.005} format={(v) => v.toFixed(3)}
          onChange={set('bleed')} hint="Domain warp amplitude. 0 = a clean gradient, no ink at all." />
        <Slider label="Flux → warp" value={ink.fluxWarp} min={0} max={3} step={0.02} format={num}
          onChange={set('fluxWarp')} hint="How much a busy mix makes the ink run." />
        <Slider label="Kick → warp" value={ink.beatWarp} min={0} max={3} step={0.02} format={num}
          onChange={set('beatWarp')} hint="How much a transient jolts the paper." />
      </Section>

      <Section title="5 · Wash (the halo)">
        <div className="field-hint" style={{ marginTop: 4, marginBottom: 8 }}>
          Keep it low. The page has to stay white — what fills it is the stroke.
        </div>
        <Slider label="Wash" value={ink.wash} min={0} max={1.2} step={0.005} format={pct}
          onChange={set('wash')} hint="Concentration of the halo around the strokes." />
        <Slider label="Blotch low" value={ink.blotchLow} min={0} max={1} step={0.005} format={num}
          onChange={set('blotchLow')} hint="Below this the puddle is empty paper. The fbm really lives in 0.3–0.65." />
        <Slider label="Blotch high" value={ink.blotchHigh} min={0} max={1} step={0.005} format={num}
          onChange={set('blotchHigh')} hint="Above this the puddle is full. Widen the pair and the wash turns back into a smooth gradient." />
        <Slider label="Wet edge" value={ink.rim} min={0} max={1.5} step={0.01} format={num}
          onChange={set('rim')} hint="Pigment piling up at the rim of a puddle — the watercolour signature." />
      </Section>

      <Section title="6 · Strokes (the drawing)">
        <Slider label="Presence" value={ink.stroke} min={0} max={1.5} step={0.01} format={pct}
          onChange={set('stroke')} hint="Overall opacity of the pen. 0 = wash only." />
        <Slider label="Ink at rest" value={ink.strokeInk} min={0} max={1} step={0.01} format={num}
          onChange={set('strokeInk')} hint="Stroke concentration with no pigment load." />
        <Slider label="Ink gain" value={ink.strokeInkGain} min={0} max={1.5} step={0.01} format={num}
          onChange={set('strokeInkGain')} hint="What a full load adds. Same pigment as the wash, just far more concentrated." />
        <Slider label="Loops · pass A" value={ink.spacingA} min={1} max={30} step={0.5} format={(v) => v.toFixed(1)}
          onChange={set('spacingA')} hint="Contour count of the first pen pass. More = tighter loops." />
        <Slider label="Loops · pass B" value={ink.spacingB} min={1} max={30} step={0.5} format={(v) => v.toFixed(1)}
          onChange={set('spacingB')} hint="Second pass, crossing the first. One pass alone reads as a contour map." />
        <Slider label="Thickness" value={ink.weight} min={0.2} max={4} step={0.02} format={num}
          onChange={set('weight')} hint="Line width in pixels, constant whatever the distance." />
        <Slider label="Pen lift" value={ink.lift} min={0} max={1} step={0.01} format={pct}
          onChange={set('lift')} hint="0 = closed contour loops. Raise it and the stroke breaks and restarts — the hand breathing." />
        <Slider label="Reach out of wash" value={ink.reachInk} min={0.004} max={0.4} step={0.002} format={(v) => v.toFixed(3)}
          onChange={set('reachInk')} hint="Coverage at which the stroke is at full strength. Low = loops venture far into the white." />
        <Slider label="Brightness mix" value={ink.brightnessMix} min={0} max={1} step={0.01} format={pct}
          onChange={set('brightnessMix')} hint="Share of the stroke presence driven by the track's treble." />
        <Slider label="Loop drift" value={ink.phaseSpeed} min={0} max={0.2} step={0.001} format={(v) => v.toFixed(3)}
          onChange={set('phaseSpeed')} hint="Loops per beat. Too high and the wall strobes." />
      </Section>

      <button className="btn" onClick={resetInk}>
        Reset ink wall
      </button>
      <div className="field-hint" style={{ marginTop: 8 }}>
        Defaults: wash {pct(DEFAULT_INK.wash)}, strokes {pct(DEFAULT_INK.stroke)}, dry{' '}
        {sec(DEFAULT_INK.dryTime)}.
      </div>
    </div>
  )
}

/**
 * The three pigment states across the frequency axis, drawn straight from the
 * CPU field. It is the one readout that shows WHY the wall looks like it does:
 * the shader can only draw what this curve carries.
 */
function InkScope() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = 224
    const h = 72
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    // Une courbe = une des trois grandeurs. Traits pleins, pas d'aplat : le
    // panneau est en DA encre lui aussi.
    const curve = (values: Readonly<Float32Array>, dash: number[], alpha: number) => {
      ctx.beginPath()
      ctx.setLineDash(dash)
      ctx.strokeStyle = `rgba(20,18,15,${alpha})`
      ctx.lineWidth = 1
      for (let j = 0; j < SLOT_COUNT; j++) {
        const x = (j / (SLOT_COUNT - 1)) * w
        const y = h - 2 - values[j] * (h - 6)
        if (j === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, w, h)
      curve(inkField.stain, [], 0.85)
      curve(inkField.wet, [2, 2], 0.45)
      curve(inkField.flash, [1, 3], 0.3)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="ink-scope">
      <canvas ref={canvasRef} />
      <div className="ink-scope-legend">
        <span>— stain</span>
        <span>-- wet</span>
        <span>·· flash</span>
      </div>
      <div className="ink-scope-axis">
        <span>30 Hz</span>
        <span>14 kHz</span>
      </div>
    </div>
  )
}

/** Ce que le mur recoit reellement du moteur d'analyse, cette frame. */
function InkReadout() {
  const refs = {
    level: useRef<HTMLElement>(null),
    flux: useRef<HTMLElement>(null),
    brightness: useRef<HTMLElement>(null),
    beat: useRef<HTMLElement>(null),
    bpm: useRef<HTMLElement>(null),
    stain: useRef<HTMLElement>(null),
  }

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const f = engine.currentFrame
      let peak = 0
      for (let j = 0; j < SLOT_COUNT; j++) {
        if (inkField.stain[j] > peak) peak = inkField.stain[j]
      }
      const put = (el: HTMLElement | null, v: string) => {
        if (el && el.textContent !== v) el.textContent = v
      }
      put(refs.level.current, f.level.toFixed(3))
      put(refs.flux.current, f.flux.toFixed(3))
      put(refs.brightness.current, f.brightness.toFixed(3))
      put(refs.beat.current, f.beat.toFixed(3))
      put(refs.bpm.current, f.bpm > 0 ? `${f.bpm}` : '--')
      put(refs.stain.current, peak.toFixed(3))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // Les refs sont stables : l'effet ne doit tourner qu'une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="results" style={{ maxHeight: 'none', marginBottom: 8 }}>
      <Kv k="level" v={<span ref={refs.level}>0.000</span>} />
      <Kv k="flux (→ warp)" v={<span ref={refs.flux}>0.000</span>} />
      <Kv k="brightness (→ strokes)" v={<span ref={refs.brightness}>0.000</span>} />
      <Kv k="beat" v={<span ref={refs.beat}>0.000</span>} />
      <Kv k="bpm (→ loop drift)" v={<span ref={refs.bpm}>--</span>} />
      <Kv k="peak stain" v={<span ref={refs.stain}>0.000</span>} />
    </div>
  )
}

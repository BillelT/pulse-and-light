import { INK_VIEWS, useStore, type InkSettings, type InkView } from '../state/store'
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
 *  2. flow field (bruit simplex), vue "Flow". Pas encore CONSOMME : le
 *     champ existe et se voit en debug, mais le rendu reel reste papier
 *     tant que l'etape 3 (ping-pong FBO) n'est pas la.
 */

const VIEW_LABEL: Record<InkView, string> = {
  off: 'Render',
  spectrum: 'Spectrum',
  flow: 'Flow',
}

const VIEW_HELP: Record<InkView, string> = {
  off: 'The real render. For now the wall is just plain paper — bricks are being added one at a time.',
  spectrum: 'The 13 log-frequency columns straight from the audio engine, drawn as a horizontal spectrum bar. Bass on the left, treble on the right.',
  flow: 'The flow field vector, red = horizontal, green = vertical. Bass pushes the amplitude, treble accelerates the churn. Nothing consumes it yet.',
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
          Simplex noise → 2D vector field. Not consumed yet; flip to Flow to see
          what step 3's fluid will be pushed around by.
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
          hint="How much a kick pushes the fluid further in one frame. 0 = the field ignores the bass."
        />
        <Slider
          label="Treble → churn"
          value={ink.flowTreble}
          min={0}
          max={3}
          step={0.02}
          format={pct}
          onChange={set('flowTreble')}
          hint="How much the treble speeds up the micro-turbulences (as if you shook the liquid faster)."
        />
      </Section>

      <Section title="Where we are">
        <div className="field-hint" style={{ marginTop: 4 }}>
          Step 2 · a simplex-noise flow field is computed but not yet used.
          Next brick (step 3) is a ping-pong FBO that will read the previous
          frame, warp it by this field, and add a fresh injection each frame.
        </div>
      </Section>
    </div>
  )
}

import { INK_VIEWS, useStore, type InkView } from '../state/store'
import { Section } from './controls'

/**
 * Onglet du mur (visualiseur), reconstruit brique par brique.
 *
 * Regle : un slider ici = un uniforme ou une constante du modele, dans
 * l'ordre ou la frame est calculee. Chaque nouvelle brique du shader
 * amene sa section de reglages et une vue de debug.
 *
 * Etape 1 : le pont audio -> DataTexture est en place, on expose la vue
 * "Spectrum" pour verifier a l'oeil que le son arrive au shader.
 */

const VIEW_LABEL: Record<InkView, string> = {
  off: 'Render',
  spectrum: 'Spectrum',
}

const VIEW_HELP: Record<InkView, string> = {
  off: 'The real render. For now the wall is just plain paper — bricks are being added one at a time.',
  spectrum: 'The 13 log-frequency columns straight from the audio engine, drawn as a horizontal spectrum bar. Bass on the left, treble on the right.',
}

export function InkTab() {
  const view = useStore((s) => s.ink.view)
  const setInk = useStore((s) => s.setInk)

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
              data-active={view === v}
              onClick={() => setInk({ view: v })}
              title={VIEW_HELP[v]}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="field-hint" style={{ marginTop: 6 }}>{VIEW_HELP[view]}</div>
      </Section>

      <Section title="Where we are">
        <div className="field-hint" style={{ marginTop: 4 }}>
          Step 1 · audio → DataTexture. The engine's 13 log-frequency columns
          are resampled to 128 texels and published as a 1D texture the shader
          can read. Nothing is drawn with it yet — flip to Spectrum to confirm
          the signal is live. Analysis knobs (smoothing, attack/decay) stay in
          the Light tab.
        </div>
      </Section>
    </div>
  )
}

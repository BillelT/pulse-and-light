import { useStore } from '../state/store'
import { Section, Toggle } from './controls'

/**
 * Scene debugger: visual aids only. There's no lighting or fog left to tune
 * (DA "ink" is unlit, flat surfaces) and no walls/floor margins to align.
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

      <button className="btn" onClick={reset}>
        Reset (light, analysis, debug)
      </button>
    </div>
  )
}

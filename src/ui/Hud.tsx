import { useStore } from '../state/store'
import { Analyzer } from './Analyzer'

const DEV = import.meta.env.DEV

export function Hud() {
  const panelOpen = useStore((s) => s.panelOpen)
  const togglePanel = useStore((s) => s.togglePanel)

  return (
    <div className="hud">
      {DEV && (
        <div className="hud-tr">
          <button
            className="icon-btn"
            onClick={togglePanel}
            title={panelOpen ? 'Masquer le panneau debug' : 'Afficher le panneau debug'}
            aria-label={panelOpen ? 'Masquer le panneau debug' : 'Afficher le panneau debug'}
          >
            {panelOpen ? '×' : '⋯'}
          </button>
        </div>
      )}

      <Analyzer />
    </div>
  )
}

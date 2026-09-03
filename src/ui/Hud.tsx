import { useStore } from '../state/store'
import { Analyzer } from './Analyzer'
import { CloseIcon, MoreIcon } from './icons'

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
            {panelOpen ? <CloseIcon size={13} /> : <MoreIcon size={13} />}
          </button>
        </div>
      )}

      <Analyzer />
    </div>
  )
}

import { useStore } from '../state/store'
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
            title={panelOpen ? 'Hide debug panel' : 'Show debug panel'}
            aria-label={panelOpen ? 'Hide debug panel' : 'Show debug panel'}
          >
            {panelOpen ? <CloseIcon size={13} /> : <MoreIcon size={13} />}
          </button>
        </div>
      )}

      <a
        className="signature"
        href="https://x.com/billel_tighidet"
        target="_blank"
        rel="noopener noreferrer"
      >
        by <span className="signature-name">billelt</span>
      </a>
    </div>
  )
}

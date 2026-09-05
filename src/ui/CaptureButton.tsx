/**
 * Bouton de capture de l'og:image (dev + preprod uniquement).
 *
 * Objectif : cadrer la scene 3D a la main (source audio, zoom, densite de la
 * foule) puis exporter EXACTEMENT le canvas WebGL en une image, prete a
 * remplacer `public/og-image.jpg`.
 *
 * Deux conditions techniques :
 *  - le rendu WebGL doit garder son back-buffer (`preserveDrawingBuffer`),
 *    sinon `canvas.toBlob` renvoie une image vide : ce flag est active sous la
 *    meme condition que le bouton (cf. `Scene`), jamais en production ou il
 *    couterait un peu de perf pour rien.
 *  - on lit le canvas tel quel : les overlays HTML (dock, HUD, panneau, ce
 *    bouton) ne sont pas dans le back-buffer WebGL, donc l'image ne contient
 *    que la scene 3D.
 */

/** Domaine de production : le bouton y reste masque. */
const PROD_HOST = 'pulse-and-light.vercel.app'

/**
 * Actif en developpement local et sur tout deploiement de preprod, jamais sur
 * le domaine de production.
 */
export const CAPTURE_ENABLED =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && window.location.hostname !== PROD_HOST)

function captureCanvas() {
  const canvas = document.querySelector('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) return
  canvas.toBlob(
    (blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'og-image.jpg'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
    'image/jpeg',
    0.95,
  )
}

export function CaptureButton() {
  if (!CAPTURE_ENABLED) return null
  return (
    <button
      type="button"
      onClick={captureCanvas}
      title="Exporter le canvas 3D en og:image (og-image.jpg)"
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        zIndex: 50,
        padding: '8px 12px',
        font: '600 12px ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: '0.02em',
        color: '#111',
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(0, 0, 0, 0.35)',
        borderRadius: 10,
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.12)',
      }}
    >
      📸 Capture OG
    </button>
  )
}

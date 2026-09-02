import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'
import { BANDS } from '../audio/bands'
import { COLUMN_COUNT } from '../audio/types'

/**
 * Analyseur du HUD. Il tourne sur son propre `requestAnimationFrame` et dessine
 * en canvas 2D : le faire en React couterait un re-render par frame pour
 * afficher des chiffres.
 */
export function Analyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barsRef = useRef<(HTMLSpanElement | null)[]>([])
  const bpmRef = useRef<HTMLSpanElement>(null)
  const levelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = 250
    const h = 62
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const frame = engine.currentFrame

      ctx.clearRect(0, 0, w, h)
      const gap = 2
      const bw = (w - gap * (COLUMN_COUNT + 1)) / COLUMN_COUNT
      for (let i = 0; i < COLUMN_COUNT; i++) {
        const v = frame.columns[i]
        const bh = Math.max(1, v * (h - 8))
        const x = gap + i * (bw + gap)
        const hue = 150 - (i / COLUMN_COUNT) * 150
        ctx.fillStyle = `hsl(${hue} 90% ${28 + v * 34}%)`
        ctx.fillRect(x, h - 4 - bh, bw, bh)
      }

      // Marqueur de kick : une ligne qui flashe en bas du graphe.
      if (frame.beat > 0.02) {
        ctx.fillStyle = `rgba(255,255,255,${frame.beat * 0.8})`
        ctx.fillRect(0, h - 2, w, 2)
      }

      for (let i = 0; i < BANDS.length; i++) {
        const bar = barsRef.current[i]
        if (bar) bar.style.transform = `scaleX(${Math.max(0.02, frame.bands[i]).toFixed(3)})`
      }
      if (bpmRef.current) {
        bpmRef.current.textContent = frame.bpm > 0 ? `${frame.bpm} BPM` : '-- BPM'
      }
      if (levelRef.current) {
        levelRef.current.textContent = `LVL ${(frame.level * 100).toFixed(0).padStart(3, '0')}`
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="analyzer">
      <canvas ref={canvasRef} />
      <div className="analyzer-bands">
        {BANDS.map((band, i) => (
          <div className="analyzer-band" key={band.key} title={`${band.from}-${band.to} Hz — ${band.target}`}>
            {band.label}
            <span
              ref={(node) => {
                barsRef.current[i] = node
              }}
              style={
                { '--band-color': `#${band.hex.toString(16).padStart(6, '0')}` } as React.CSSProperties
              }
            />
          </div>
        ))}
      </div>
      <div className="analyzer-meta">
        <span ref={levelRef}>LVL 000</span>
        <span ref={bpmRef}>-- BPM</span>
      </div>
    </div>
  )
}

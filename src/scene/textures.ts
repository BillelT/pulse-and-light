import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/** Caillebotis metallique du podium et des bandes de sol (genere, zero asset). */
export function makeGratingTexture(cell = 32, line = 5): Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#07090c'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#4a5057'
  for (let x = 0; x < size; x += cell) ctx.fillRect(x, 0, line, size)
  for (let y = 0; y < size; y += cell) ctx.fillRect(0, y, size, line)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Dalles du sol : joints sombres sur beton clair, tres discrets. */
export function makeTileTexture(): Texture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1a1d21'
  ctx.fillRect(0, 0, size, size)
  // Grain : casse le look "plastique" du sol reflechissant.
  const grain = ctx.createImageData(size, size)
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = 26 + Math.random() * 12
    grain.data[i] = v
    grain.data[i + 1] = v + 2
    grain.data[i + 2] = v + 5
    grain.data[i + 3] = 255
  }
  ctx.putImageData(grain, 0, 0)
  ctx.strokeStyle = '#0a0c0f'
  ctx.lineWidth = 4
  ctx.strokeRect(0, 0, size, size)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  tex.repeat.set(12, 12)
  return tex
}

/**
 * Skyline de nuit, vue au loin derriere les baies vitrees. Simple decor de
 * fond : une texture peinte sur un plan, jamais de vraie geometrie — la
 * silhouette est floutee par la brume et le verre bien avant d'etre lisible
 * en detail.
 */
export function makeCityTexture(): Texture {
  const width = 1024
  const height = 512
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Ciel : nuit profonde en haut, lueur violette de pollution lumineuse pres
  // de l'horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#050414')
  sky.addColorStop(0.55, '#0b0c26')
  sky.addColorStop(0.82, '#241636')
  sky.addColorStop(1, '#2e1a3e')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  // Lueur de ville : bande de pollution lumineuse a l'horizon, la seule
  // source de couleur vive de l'image — tout le reste reste tres sombre et
  // flou, comme une skyline vue a plusieurs kilometres a travers la brume.
  const horizon = height * 0.76
  const cityGlow = ctx.createLinearGradient(0, horizon - height * 0.22, 0, horizon + 10)
  cityGlow.addColorStop(0, 'rgba(130,100,210,0)')
  cityGlow.addColorStop(0.7, 'rgba(160,120,220,0.28)')
  cityGlow.addColorStop(1, 'rgba(100,150,230,0.4)')
  ctx.fillStyle = cityGlow
  ctx.fillRect(0, horizon - height * 0.22, width, height * 0.22 + 10)

  // Silhouette de tours : des blocs flous et peu contrastes, jamais des
  // aretes nettes — a cette distance, sous la brume, on ne lit qu'une masse
  // sombre, pas des facades.
  const rand = mulberry32(0x9e3779)
  ctx.filter = 'blur(7px)'
  let x = -30
  while (x < width + 30) {
    const w = 40 + rand() * 90
    const h = 30 + rand() * height * 0.22
    ctx.fillStyle = `rgba(6,7,16,${0.55 + rand() * 0.3})`
    ctx.fillRect(x, horizon - h, w, h + 30)
    x += w + rand() * 24
  }
  ctx.filter = 'none'

  // Poignee de feux distants (avions, antennes) : quelques points nets,
  // jamais une nuee — c'est ce qui vend l'echelle "tres loin" de la ref.
  const lights: Array<[number, number, number]> = [
    [0.62, 0.32, 3],
    [0.655, 0.33, 2.4],
    [0.9, 0.4, 2],
    [0.2, 0.42, 1.6],
  ]
  for (const [fx, fy, r] of lights) {
    const px = width * fx
    const py = height * fy
    const dot = ctx.createRadialGradient(px, py, 0, px, py, r * 6)
    dot.addColorStop(0, 'rgba(195,235,255,0.95)')
    dot.addColorStop(0.35, 'rgba(160,210,255,0.35)')
    dot.addColorStop(1, 'rgba(160,210,255,0)')
    ctx.fillStyle = dot
    ctx.fillRect(px - r * 6, py - r * 6, r * 12, r * 12)
  }

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  // Mipmaps actives (filtre par defaut) : sans eux, la grille fine des
  // fenetres aliase en moire des que le plan est vu de loin.
  tex.anisotropy = 4
  return tex
}

/**
 * Skyline au trait, pour la DA "ink" : des immeubles dessines en contour
 * uniquement, sur fond blanc. Le gris moyen du trait n'est pas un hasard —
 * `InkEffect` transforme un pixel sombre en encre proportionnellement a sa
 * noirceur, donc dessiner la ville en gris suffit a la reculer derriere la
 * scenographie sans changer l'epaisseur du trait (brief, point 4 : contraste
 * attenue, pas trait plus fin).
 */
export function makeCitySketchTexture(): Texture {
  const width = 2048
  const height = 1024
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const rand = mulberry32(0x51f0a3)
  const horizon = height * 0.78
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'

  /** Trait legerement tremble : une ligne droite parfaite trahit le vectoriel. */
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 42))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const jitter = (rand() - 0.5) * 2.2
      ctx.lineTo(x0 + (x1 - x0) * t + jitter, y0 + (y1 - y0) * t + jitter)
    }
    ctx.stroke()
  }

  // Deux plans : les tours du fond sont plus claires, comme sur un croquis ou
  // l'arriere-plan est simplement moins appuye.
  for (const plane of [
    { shade: '#b4b4b4', lw: 2.4, minH: 60, maxH: 210, count: 26, offset: -18 },
    { shade: '#8a8a8a', lw: 3.1, minH: 90, maxH: 330, count: 20, offset: 0 },
  ]) {
    ctx.strokeStyle = plane.shade
    ctx.lineWidth = plane.lw
    let x = -40
    for (let i = 0; i < plane.count && x < width + 40; i++) {
      const w = 34 + rand() * 96
      const h = plane.minH + rand() * (plane.maxH - plane.minH)
      const top = horizon - h + plane.offset
      // Contour : montants + toit. Pas de base — elle est mangee par
      // l'horizon, exactement comme sur la reference.
      stroke(x, horizon, x, top)
      stroke(x, top, x + w, top)
      stroke(x + w, top, x + w, horizon)

      // Quelques etages suggeres, jamais une grille complete de fenetres.
      if (h > 150 && rand() > 0.45) {
        const floors = 1 + Math.floor(rand() * 3)
        for (let f = 1; f <= floors; f++) {
          const y = top + (h * f) / (floors + 1)
          stroke(x + 4, y, x + w - 4, y)
        }
      }
      x += w + 6 + rand() * 46
    }
  }

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** PRNG deterministe, pour que la skyline ne change pas a chaque hot-reload. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

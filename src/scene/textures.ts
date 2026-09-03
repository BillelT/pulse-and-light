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

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

  // Lueur douce (lune / halo), decalee pour ne pas etre centree.
  const glow = ctx.createRadialGradient(
    width * 0.78,
    height * 0.28,
    0,
    width * 0.78,
    height * 0.28,
    height * 0.5,
  )
  glow.addColorStop(0, 'rgba(150,190,255,0.16)')
  glow.addColorStop(1, 'rgba(150,190,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // Silhouettes de tours, en deux plans (loin/pres) pour la profondeur.
  const horizon = height * 0.74
  const rand = mulberry32(0x9e3779)
  const drawSkyline = (baseline: number, maxRise: number, tint: string, windowAlpha: number) => {
    let x = -20
    while (x < width + 20) {
      const w = 26 + rand() * 60
      const h = 40 + rand() * maxRise
      ctx.fillStyle = tint
      ctx.fillRect(x, baseline - h, w, h + 40)
      // Fenetres eclairees : quadrillage clairseme, jamais toute la facade.
      const cols = Math.max(1, Math.floor(w / 9))
      const rows = Math.max(1, Math.floor(h / 12))
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (rand() > 0.16) continue
          const wx = x + 3 + cx * 9
          const wy = baseline - h + 4 + cy * 12
          const warm = rand() > 0.82
          ctx.fillStyle = warm
            ? `rgba(255,214,150,${windowAlpha})`
            : `rgba(150,225,255,${windowAlpha})`
          ctx.fillRect(wx, wy, 3, 5)
        }
      }
      x += w + 4 + rand() * 10
    }
  }

  drawSkyline(horizon, height * 0.3, '#0a0a18', 0.55)
  drawSkyline(horizon + 18, height * 0.5, '#050509', 0.85)

  // Quelques feux distants (avions, antennes) : points doux qui accrochent le
  // bloom sans dessiner de vraie geometrie.
  for (let i = 0; i < 5; i++) {
    const px = width * (0.55 + rand() * 0.4)
    const py = height * (0.2 + rand() * 0.35)
    const r = 3 + rand() * 3
    const dot = ctx.createRadialGradient(px, py, 0, px, py, r * 5)
    dot.addColorStop(0, 'rgba(190,240,255,0.9)')
    dot.addColorStop(1, 'rgba(190,240,255,0)')
    ctx.fillStyle = dot
    ctx.fillRect(px - r * 5, py - r * 5, r * 10, r * 10)
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

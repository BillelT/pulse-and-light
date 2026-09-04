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
  const height = 1152
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const rand = mulberry32(0x51f0a3)
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'

  /** Trait legerement tremble : une ligne droite parfaite trahit le vectoriel. */
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 44))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const jitter = (rand() - 0.5) * 1.6
      ctx.lineTo(x0 + (x1 - x0) * t + jitter, y0 + (y1 - y0) * t + jitter)
    }
    ctx.stroke()
  }

  // Les tours PLONGENT sous le bord bas de l'image : le plan qui porte cette
  // texture descend sous le plateau, donc aucune base d'immeuble n'est
  // visible. C'est ce qui installe la scenographie en hauteur — on regarde la
  // ville depuis un etage eleve, pas depuis le trottoir d'en face.
  //
  // Trois plans de profondeur, du plus clair (le plus loin) au plus appuye.
  for (const plane of [
    { shade: '#dcdcdc', lw: 2.0, minH: 0.42, maxH: 0.78, minW: 40, maxW: 92, gap: 16 },
    { shade: '#c2c2c2', lw: 2.4, minH: 0.5, maxH: 0.95, minW: 48, maxW: 116, gap: 26 },
    { shade: '#a6a6a6', lw: 2.8, minH: 0.34, maxH: 0.74, minW: 60, maxW: 142, gap: 40 },
  ]) {
    ctx.strokeStyle = plane.shade
    ctx.lineWidth = plane.lw
    let x = -60 - rand() * 80
    while (x < width + 60) {
      const w = plane.minW + rand() * (plane.maxW - plane.minW)
      const top = height * (1 - (plane.minH + rand() * (plane.maxH - plane.minH)))

      // Contour : deux montants qui descendent hors cadre, et le toit.
      stroke(x, height + 20, x, top)
      stroke(x, top, x + w, top)
      stroke(x + w, top, x + w, height + 20)

      // Parapet : le double trait du couronnement, juste sous le toit.
      if (rand() > 0.4) stroke(x + 3, top + 9 + rand() * 6, x + w - 3, top + 9 + rand() * 6)

      // Trame d'etages : un trait toutes les ~40 px, jamais jusqu'en bas —
      // le dessin s'epuise vers le bas de l'immeuble, comme un croquis reel.
      const floorGap = 26 + rand() * 18
      const drawnHeight = (height - top) * (0.45 + rand() * 0.5)
      for (let y = top + floorGap * 2; y < top + drawnHeight; y += floorGap) {
        stroke(x + 5, y, x + w - 5, y)
      }

      // Refends verticaux : c'est eux qui donnent l'elancement.
      const mullions = 1 + Math.floor(rand() * 3)
      for (let m = 1; m <= mullions; m++) {
        const mx = x + (w * m) / (mullions + 1)
        stroke(mx, top + 6, mx, top + drawnHeight * (0.6 + rand() * 0.4))
      }

      // Couronnement : retrait plus etroit, ou simple antenne.
      if (rand() > 0.62) {
        const cw = w * (0.32 + rand() * 0.3)
        const cx = x + (w - cw) / 2
        const ch = 26 + rand() * 70
        stroke(cx, top, cx, top - ch)
        stroke(cx, top - ch, cx + cw, top - ch)
        stroke(cx + cw, top - ch, cx + cw, top)
      } else if (rand() > 0.5) {
        const ax = x + w * (0.3 + rand() * 0.4)
        stroke(ax, top, ax, top - (34 + rand() * 90))
      }

      x += w + plane.gap + rand() * 58
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

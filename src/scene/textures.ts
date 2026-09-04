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
 * Skyline au trait, pour la DA "ink".
 *
 * Le gris du trait n'est pas un hasard — `InkEffect` transforme un pixel sombre
 * en encre proportionnellement a sa noirceur, donc dessiner la ville en gris
 * suffit a la reculer derriere la scenographie sans changer l'epaisseur du
 * trait (brief, point 4 : contraste attenue, pas trait plus fin).
 *
 * Deux regles portent toute la profondeur :
 *
 *  1. Chaque immeuble est REMPLI en blanc avant d'etre cerne. Sans ce
 *     remplissage, les trois plans se traversaient : on lisait une seule
 *     nappe de traits enchevetres, pas trois rangees d'immeubles l'une
 *     derriere l'autre. Le blanc opaque est ce qui rend l'occlusion — donc la
 *     profondeur — lisible.
 *  2. Un plan lointain est plus PETIT, plus CLAIR et moins detaille que le
 *     plan devant lui. Les trois varient ensemble : la taille seule se lit
 *     comme un immeuble bas, pas comme un immeuble loin.
 *
 * Les tours partent du bord bas de l'image, qui est cale sur le niveau du sol :
 * toutes les bases sont donc alignees sur la ligne du plateau.
 */
export function makeCitySketchTexture(aspect: number): Texture {
  const width = 5120
  const height = Math.max(64, Math.round(width / aspect))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const rand = mulberry32(0x51f0a3)
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'

  // Tout est exprime en fraction de la HAUTEUR de l'image, jamais en pixels :
  // la hauteur correspond a une hauteur monde fixe, la largeur varie avec le
  // perimetre de la terrasse. Un immeuble garde donc les memes proportions
  // reelles quelle que soit la resolution choisie ici.
  const u = height

  /** Trait legerement tremble : une ligne droite parfaite trahit le vectoriel. */
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (0.06 * u)))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const jitter = (rand() - 0.5) * 0.0022 * u
      ctx.lineTo(x0 + (x1 - x0) * t + jitter, y0 + (y1 - y0) * t + jitter)
    }
    ctx.stroke()
  }

  /** Boite pleine (blanche) puis cernee : le remplissage porte l'occlusion. */
  const box = (x: number, top: number, w: number, bottom: number) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x, top, w, bottom - top)
    stroke(x, bottom, x, top)
    stroke(x, top, x + w, top)
    stroke(x + w, top, x + w, bottom)
  }

  // Trois rangees, de la plus lointaine a la plus proche. Chacune est dessinee
  // PAR DESSUS la precedente, remplissage compris : c'est l'ordre de dessin qui
  // fait l'occlusion, donc la profondeur.
  //
  // Les hauteurs sont des fractions de l'image ENTIERE, dont le bas passe sous
  // le niveau du sol et disparait derriere la terrasse : une tour a 0.40 ne
  // montre donc qu'un peu plus de la moitie de son trace.
  //
  // Gris et epaisseurs ne sont pas des valeurs "au trait" naives :
  //  - `InkEffect` convertit un pixel sombre en encre sur une plage etroite, et
  //    le fait en LINEAIRE, ou un gris sRGB clair est deja tres proche du
  //    blanc : au dela de ~#c0c0c0 un trait ne s'imprime plus du tout ;
  //  - la texture est vue tres reduite, donc chaque trait est moyenne avec le
  //    blanc par le mipmapping — un trait fin sort deux fois plus clair que sa
  //    couleur.
  const planes = [
    // Loin : petites silhouettes claires, serrees, presque sans detail.
    { shade: '#b0b0b0', lw: 0.0035, minH: 0.3, maxH: 0.44, minW: 0.037, maxW: 0.085, gap: 0.007, spread: 0.028, detail: 0 },
    // Distance moyenne.
    { shade: '#949494', lw: 0.0043, minH: 0.34, maxH: 0.6, minW: 0.05, maxW: 0.113, gap: 0.019, spread: 0.067, detail: 1 },
    // Premier plan de la ville : les seules tours vraiment dessinees.
    { shade: '#6f6f6f', lw: 0.0054, minH: 0.4, maxH: 0.78, minW: 0.067, maxW: 0.164, gap: 0.038, spread: 0.067, detail: 2 },
  ]

  const bottom = height + 0.03 * u

  for (const plane of planes) {
    ctx.lineWidth = plane.lw * u
    ctx.strokeStyle = plane.shade
    let x = -0.1 * u - rand() * 0.1 * u
    while (x < width + 0.1 * u) {
      const w = (plane.minW + rand() * (plane.maxW - plane.minW)) * u
      // Progression non lineaire : la plupart des tours restent basses, une sur
      // quelques unes monte franchement. Une distribution uniforme donne une
      // skyline en peigne, toutes les tours a la meme hauteur moyenne.
      const t = rand() ** 2.1
      const top = height * (1 - (plane.minH + t * (plane.maxH - plane.minH)))

      box(x, top, w, bottom)

      if (plane.detail >= 1) {
        // Parapet : le double trait du couronnement, juste sous le toit.
        if (rand() > 0.35) {
          const py = top + (0.008 + rand() * 0.007) * u
          stroke(x + 0.004 * u, py, x + w - 0.004 * u, py)
        }

        // Trois ecritures de facade, plutot qu'une trame unique repetee d'un
        // immeuble a l'autre : c'est la variete d'ECRITURE, pas seulement de
        // taille, qui empeche la rangee de se lire comme un peigne.
        const style = rand()
        const drawn = (height - top) * (0.4 + rand() * 0.5)
        const floorGap = (plane.detail === 2 ? 0.019 : 0.026) * u * (1 + rand() * 0.6)

        if (style < 0.42) {
          // Bandes horizontales : etages marques, immeuble ancien.
          for (let y = top + floorGap * 1.6; y < top + drawn; y += floorGap) {
            stroke(x + 0.006 * u, y, x + w - 0.006 * u, y)
          }
        } else if (style < 0.78) {
          // Mur-rideau : refends verticaux dominants, tour de bureaux.
          const mullions = 2 + Math.floor(rand() * 4)
          for (let m = 1; m <= mullions; m++) {
            const mx = x + (w * m) / (mullions + 1)
            stroke(mx, top + 0.008 * u, mx, top + drawn)
          }
          if (rand() > 0.5) {
            const y = top + drawn * (0.4 + rand() * 0.3)
            stroke(x + 0.006 * u, y, x + w - 0.006 * u, y)
          }
        } else if (plane.detail === 2) {
          // Trame croisee, reservee au premier plan : trop dense au loin, elle
          // se refermerait en aplat gris.
          for (let y = top + floorGap * 1.6; y < top + drawn; y += floorGap) {
            stroke(x + 0.006 * u, y, x + w - 0.006 * u, y)
          }
          const mullions = 1 + Math.floor(rand() * 2)
          for (let m = 1; m <= mullions; m++) {
            const mx = x + (w * m) / (mullions + 1)
            stroke(mx, top + 0.008 * u, mx, top + drawn * (0.7 + rand() * 0.3))
          }
        }
      }

      if (plane.detail === 2) {
        // Couronnement : retrait plus etroit, ou antenne.
        if (rand() > 0.55) {
          const cw = w * (0.3 + rand() * 0.34)
          const cx = x + (w - cw) / 2
          const ch = (0.026 + rand() * 0.07) * u
          box(cx, top - ch, cw, top)
          // Chateau d'eau / edicule technique pose sur le retrait.
          if (rand() > 0.6) {
            const bw = cw * (0.3 + rand() * 0.3)
            box(cx + (cw - bw) / 2, top - ch - 0.02 * u, bw, top - ch)
          }
        } else if (rand() > 0.45) {
          const ax = x + w * (0.3 + rand() * 0.4)
          stroke(ax, top, ax, top - (0.034 + rand() * 0.08) * u)
        } else if (rand() > 0.4) {
          // Toit en pente : deux pans, pour casser la file d'immeubles plats.
          const rh = (0.02 + rand() * 0.035) * u
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.moveTo(x, top)
          ctx.lineTo(x + w / 2, top - rh)
          ctx.lineTo(x + w, top)
          ctx.closePath()
          ctx.fill()
          stroke(x, top, x + w / 2, top - rh)
          stroke(x + w / 2, top - rh, x + w, top)
        }

        // Decrochement lateral : une aile plus basse, collee au corps
        // principal. C'est ce qui evite la rangee de boites identiques.
        if (rand() > 0.55) {
          const aw = w * (0.3 + rand() * 0.45)
          const ax = rand() > 0.5 ? x + w : x - aw
          const atop = top + (height - top) * (0.2 + rand() * 0.4)
          box(ax, atop, aw, bottom)
        }
      }

      x += w + (plane.gap + rand() * plane.spread) * u
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

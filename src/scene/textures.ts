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

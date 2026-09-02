import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
} from 'three'
import { engine } from '../audio/engine'
import { columnCenterHz } from '../audio/columns'
import { COLUMN_COUNT } from '../audio/types'
import { readState, useStore } from '../state/store'
import {
  frequencyColor,
  keyTint,
  mixHueShortest,
  paletteById,
  sampleRamp,
  sampleRampStepped,
  toColors,
} from './palettes'
import {
  FRAME,
  MAX_LED_INSTANCES,
  TOWERS,
  cellPitch,
  segmentsFor,
} from './layout'

/** Objets de travail au niveau module : aucune allocation dans la boucle de rendu. */
const _dummy = new Object3D()
const _color = new Color()
const _ramp = new Color()
const _key = new Color()
const _light = new Color()
const _acc = new Color()
const _freq = new Color()
/**
 * Cellule eteinte : gris fonce neutre, jamais teintee. Un caisson au repos est
 * une grille de plastique gris sur fond noir — la couleur n'apparait que quand
 * la cellule s'allume, et elle vient alors de la frequence mesuree.
 */
const OFF_COLOR = new Color(0x2a2f36)

/** Nombre de projecteurs qui reprennent la lumiere du mur pour la jeter au sol. */
const SPILL_LIGHTS = 5

/** Cellule LED : boite tres plate, la profondeur donne l'epaisseur du bandeau. */
const LED_GEOMETRY = new BoxGeometry(1, 1, 1)
const BOX_GEOMETRY = new BoxGeometry(1, 1, 1)

interface TowerRuntime {
  /** Index de la premiere cellule de cette colonne dans l'InstancedMesh. */
  offset: number
  count: number
  /** Hauteur du bas de la premiere cellule. */
  baseY: number
}

/**
 * Le mur de caissons lumineux : chaque colonne est un VU-metre a cellules
 * discretes, exactement comme sur `ref.jpg`.
 *
 * Trois InstancedMesh seulement (cellules / corps / chassis) : le mur complet
 * coute 3 draw calls, ce qui laisse tout le budget au bloom.
 */
export function CaissonWall() {
  const ledsRef = useRef<InstancedMesh>(null)
  const bodiesRef = useRef<InstancedMesh>(null)
  const bezelsRef = useRef<InstancedMesh>(null)
  const lightsRef = useRef<(PointLight | null)[]>([])

  const segments = useStore((s) => s.visual.segments)
  const paletteId = useStore((s) => s.visual.paletteId)

  const quantize = useStore((s) => s.visual.quantize)

  const palette = useMemo(() => paletteById(paletteId), [paletteId])
  const rampColors = useMemo(() => toColors(palette.ramp), [palette])
  const bandColors = useMemo(() => toColors(palette.bands), [palette])

  /**
   * Une couleur par colonne, deduite une fois pour toutes de la frequence
   * centrale que cette colonne analyse. Deterministe : la colonne 0 mesure les
   * graves, elle sera rouge ; la derniere mesure l'air, elle sera bleue.
   */
  const columnColors = useMemo(
    () =>
      Array.from({ length: COLUMN_COUNT }, (_, i) =>
        frequencyColor(bandColors, columnCenterHz(i), quantize, new Color()),
      ),
    [bandColors, quantize],
  )

  /** Materiaux : recrees jamais, seules les couleurs d'instance changent. */
  const ledMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        // toneMapped: false laisse passer les valeurs > 1 vers le bloom.
        toneMapped: false,
        color: 0xffffff,
      }),
    [],
  )
  const bodyMaterial = useMemo(
    () => new MeshStandardMaterial({ color: 0x30363d, roughness: 0.62, metalness: 0.18 }),
    [],
  )
  const bezelMaterial = useMemo(
    () => new MeshStandardMaterial({ color: 0x9ea6ae, roughness: 0.44, metalness: 0.22 }),
    [],
  )

  /** Decoupage des colonnes en cellules — recalcule seulement si `segments` change. */
  const runtime = useMemo<{ towers: TowerRuntime[]; total: number; pitch: number; cell: number }>(
    () => {
      const pitch = cellPitch(segments)
      // La cellule ne remplit pas tout le pas : le jeu entre cellules dessine
      // les lignes noires visibles sur la reference.
      const cell = pitch * 0.76
      const towers: TowerRuntime[] = []
      let offset = 0
      for (const t of TOWERS) {
        const count = segmentsFor(t.height, pitch)
        towers.push({ offset, count, baseY: FRAME + pitch * 0.5 })
        offset += count
      }
      return { towers, total: offset, pitch, cell }
    },
    [segments],
  )

  // --- Placement statique des instances ---
  useEffect(() => {
    const leds = ledsRef.current
    const bodies = bodiesRef.current
    const bezels = bezelsRef.current
    if (!leds || !bodies || !bezels) return

    const { towers, pitch, cell } = runtime
    const ledDepth = 0.1

    for (let i = 0; i < TOWERS.length; i++) {
      const t = TOWERS[i]
      const rt = towers[i]

      // Corps du caisson.
      _dummy.position.set(t.x, t.height / 2, t.z)
      _dummy.rotation.set(0, t.rotationY, 0)
      _dummy.scale.set(t.width, t.height, t.depth)
      _dummy.updateMatrix()
      bodies.setMatrixAt(i, _dummy.matrix)

      // Chassis : quatre montants fins sur la face avant.
      const front = t.depth / 2 + 0.012
      const bars: Array<[number, number, number, number]> = [
        // [offsetX, offsetY, scaleX, scaleY]
        [-(t.width / 2 - FRAME / 2), t.height / 2, FRAME, t.height],
        [t.width / 2 - FRAME / 2, t.height / 2, FRAME, t.height],
        [0, FRAME / 2, t.width, FRAME],
        [0, t.height - FRAME / 2, t.width, FRAME],
      ]
      for (let b = 0; b < bars.length; b++) {
        const [ox, oy, sx, sy] = bars[b]
        const cos = Math.cos(t.rotationY)
        const sin = Math.sin(t.rotationY)
        _dummy.position.set(
          t.x + ox * cos + front * sin,
          oy,
          t.z - ox * sin + front * cos,
        )
        _dummy.rotation.set(0, t.rotationY, 0)
        _dummy.scale.set(sx, sy, 0.09)
        _dummy.updateMatrix()
        bezels.setMatrixAt(i * 4 + b, _dummy.matrix)
      }

      // Cellules LED, empilees sur la face avant.
      const ledZ = t.depth / 2 + 0.03
      const cos = Math.cos(t.rotationY)
      const sin = Math.sin(t.rotationY)
      for (let s = 0; s < rt.count; s++) {
        _dummy.position.set(
          t.x + ledZ * sin,
          rt.baseY + s * pitch,
          t.z + ledZ * cos,
        )
        _dummy.rotation.set(0, t.rotationY, 0)
        _dummy.scale.set(t.width - FRAME * 2.6, cell, ledDepth)
        _dummy.updateMatrix()
        leds.setMatrixAt(rt.offset + s, _dummy.matrix)
      }
    }

    // Les instances au dela du compte utile sont repoussees hors champ.
    _dummy.position.set(0, -999, 0)
    _dummy.scale.set(0.001, 0.001, 0.001)
    _dummy.rotation.set(0, 0, 0)
    _dummy.updateMatrix()
    for (let i = runtime.total; i < MAX_LED_INSTANCES; i++) leds.setMatrixAt(i, _dummy.matrix)

    // Initialise instanceColor des maintenant : sans ca, three compile d'abord
    // un programme sans couleur d'instance et la premiere frame sort blanche.
    _color.setRGB(0, 0, 0)
    for (let i = 0; i < MAX_LED_INSTANCES; i++) leds.setColorAt(i, _color)
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true

    leds.count = runtime.total
    leds.instanceMatrix.needsUpdate = true
    bodies.instanceMatrix.needsUpdate = true
    bezels.instanceMatrix.needsUpdate = true
    leds.computeBoundingSphere()
  }, [runtime])

  // --- Etat persistant entre frames (peak-hold, flash) ---
  const peaks = useMemo(() => new Float32Array(COLUMN_COUNT), [])
  const flashRef = useRef(0)
  // L'analyse tourne plus vite que le rendu : on detecte un kick en comparant
  // le compteur d'onsets, jamais le booleen `onset` d'une seule frame.
  const lastOnsetRef = useRef(0)

  useFrame((_, delta) => {
    const leds = ledsRef.current
    if (!leds) return
    const dt = Math.min(0.1, delta)

    const state = readState()
    const visual = state.visual
    const frame = engine.currentFrame

    keyTint(state.snapshot.key, _key)
    if (frame.onsetCount !== lastOnsetRef.current) {
      lastOnsetRef.current = frame.onsetCount
      flashRef.current = 1
    }
    flashRef.current = Math.max(0, flashRef.current - dt / 0.09)

    const { towers } = runtime

    for (let i = 0; i < TOWERS.length; i++) {
      const rt = towers[i]
      const level = frame.columns[i]

      // Peak-hold : le marqueur de crete du VU-metre retombe lentement.
      if (level > peaks[i]) peaks[i] = level
      else peaks[i] = Math.max(level, peaks[i] - dt * 0.55)
      const peakSeg = visual.peakHold ? Math.round(peaks[i] * (rt.count - 1)) : -1

      // Nombre de cellules allumees, avec une cellule de tete a intensite
      // fractionnaire : sans ca l'allumage sautille d'un cran a l'autre.
      const lit = level * rt.count
      const fullCells = Math.floor(lit)
      const partial = lit - fullCells

      _freq.copy(columnColors[i])

      for (let s = 0; s < rt.count; s++) {
        // Position de la cellule dans SA colonne : c'est l'axe du VU-metre.
        // Les dernieres cellules virent au chaud, comme sur un vrai bargraphe.
        const vuPos = rt.count > 1 ? s / (rt.count - 1) : 0
        if (visual.quantize) sampleRampStepped(rampColors, vuPos, _ramp)
        else sampleRamp(rampColors, vuPos, _ramp)

        // Couleur finale = teinte de la frequence mesuree, temperee par la
        // rampe de niveau. Aucun terme aleatoire : deux ecoutes du meme passage
        // donnent exactement la meme image.
        //
        // Melange en HSL par le plus court chemin : un lerp RGB entre deux
        // teintes saturees passe par le gris et delave le haut des colonnes,
        // et un lerp lineaire de teinte traverse la roue a l'envers.
        mixHueShortest(_ramp, _freq, visual.bandTint, _color)
        if (state.snapshot.key >= 0) _color.lerp(_key, visual.keyTint * 0.5)

        // Le gain reste modere : au dela de ~2, le tone mapping desature les
        // teintes vers le blanc et on perd le neon sature de la reference.
        // C'est le bloom, pas l'intensite brute, qui doit produire le halo.
        const litGain = 1.3 + level * 0.55
        let intensity: number
        if (s < fullCells) {
          intensity = litGain
        } else if (s === fullCells) {
          intensity = 0.07 + partial * litGain
        } else {
          // Cellule eteinte : gris fonce pur, sans aucune teinte residuelle.
          _color.copy(OFF_COLOR)
          intensity = 1
        }

        if (s === peakSeg && level > 0.03) intensity = Math.max(intensity, litGain * 1.35)

        // Strobe sur transitoire : uniquement le haut des colonnes, comme un
        // vrai rack de strobes place en hauteur.
        if (flashRef.current > 0 && s >= fullCells - 3 && s < fullCells) {
          const strobe = flashRef.current * frame.bandsRaw[5] * 4
          _color.lerp(_light.set(palette.flash), Math.min(0.8, strobe))
          intensity += strobe * 0.8
        }

        _color.multiplyScalar(intensity)
        leds.setColorAt(rt.offset + s, _color)
      }
    }

    if (leds.instanceColor) leds.instanceColor.needsUpdate = true

    // Retombee de lumiere : quelques projecteurs reprennent la couleur moyenne
    // des colonnes voisines pour eclairer reellement le sol et la regie.
    for (let l = 0; l < SPILL_LIGHTS; l++) {
      const light = lightsRef.current[l]
      if (!light) continue
      const from = Math.floor((l * COLUMN_COUNT) / SPILL_LIGHTS)
      const to = Math.floor(((l + 1) * COLUMN_COUNT) / SPILL_LIGHTS)
      let sum = 0
      _light.setRGB(0, 0, 0)
      for (let c = from; c < to; c++) {
        const lv = frame.columns[c]
        sum += lv
        // Meme couleur de frequence que les cellules : la retombee au sol est
        // coherente avec ce qu'on voit sur le mur.
        _light.add(_acc.copy(columnColors[c]).multiplyScalar(lv))
      }
      const n = Math.max(1, to - from)
      const avg = sum / n
      if (sum > 1e-4) _light.multiplyScalar(1 / sum)
      else _light.set(palette.ambient)
      light.color.copy(_light)
      light.intensity = 4 + avg * 34 + flashRef.current * 12
    }
  })

  return (
    <group>
      <instancedMesh
        ref={bodiesRef}
        args={[BOX_GEOMETRY, bodyMaterial, TOWERS.length]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={bezelsRef}
        args={[BOX_GEOMETRY, bezelMaterial, TOWERS.length * 4]}
        castShadow
      />
      <instancedMesh ref={ledsRef} args={[LED_GEOMETRY, ledMaterial, MAX_LED_INSTANCES]} />

      {Array.from({ length: SPILL_LIGHTS }, (_, l) => {
        const spread = (l / (SPILL_LIGHTS - 1) - 0.5) * 2
        return (
          <pointLight
            key={l}
            ref={(node) => {
              lightsRef.current[l] = node
            }}
            position={[spread * 8.4, 11.5, -6.4 + Math.abs(spread) * 2.4]}
            distance={34}
            decay={1.6}
            intensity={6}
          />
        )
      })}
    </group>
  )
}

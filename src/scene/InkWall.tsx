import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useFBO } from '@react-three/drei'
import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene as ThreeScene,
  ShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  type WebGLRenderTarget,
} from 'three'
import { engine } from '../audio/engine'
import { COLUMN_COUNT } from '../audio/types'
import { INK_INJECT_MODES, INK_VIEWS, readState } from '../state/store'
import { audioTexture } from './audioTexture'
import {
  FLOW_FIELD_GLSL,
  FLUID_FBO_HEIGHT,
  FLUID_FBO_WIDTH,
  inkFluid,
} from './inkFluid'
import { INK_LINE, INK_PAPER } from './ink'

/**
 * Le mur — visualiseur en cours de reconstruction, brique par brique.
 *
 * Etapes en place :
 *  1. pont audio -> `DataTexture` (voir `audioTexture.ts`), vue "spectrum".
 *  2. flow field (bruit simplex, voir `inkFluid.ts`), vue "flow".
 *  3. ping-pong FBO : la simulation avance dans deux `WebGLRenderTarget`
 *     qui s'echangent chaque frame. Le shader de simulation lit la frame
 *     precedente a des UVs deformees par le flow field (advection
 *     semi-Lagrangienne) et rajoute une INJECTION. Trois modes commutables
 *     pour choisir a l'oeil laquelle donne le meilleur rendu :
 *       - fountain : bande audio en bas, alimentation continue.
 *       - drops   : goutte lachee sur chaque onset a la frequence du kick.
 *       - both    : les deux, la fontaine tient la vie, les gouttes marquent.
 *
 * Le mur affiche la sortie du FBO en niveaux de gris (papier <-> encre
 * foncee). Aucune dissipation ici : l'ecran finit par saturer. C'est le
 * point que l'etape 4 va corriger, et c'est exactement ce que le MD
 * demandait de voir avant d'ajouter la dissipation.
 */

const WALL_Z = -26
const WALL_WIDTH = 100
const WALL_HEIGHT = 150
/** Centre du plan : sa moitie basse passe sous le sol, elle n'est jamais peinte. */
const WALL_CENTER_Y = 75

function srgb(hex: string): Vector3 {
  const v = parseInt(hex.slice(1), 16)
  return new Vector3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255)
}

// --- Wall (display) shader --------------------------------------------------

const wallVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`

const wallFragment = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform vec3 uPaper;
uniform vec3 uInk;
uniform sampler2D uSpectrum;
uniform sampler2D uFluid;
uniform int uView;

// Flow field uniforms (partages avec la simulation).
uniform float uTime;
uniform float uBass;
uniform float uTreble;
uniform float uFlowScale;
uniform float uFlowSpeed;
uniform float uFlowBass;
uniform float uFlowTreble;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

${FLOW_FIELD_GLSL}

void main() {
  vec3 col = uPaper;

  if (uView == 1) {
    // Spectrum debug : barre horizontale en bas, grave a gauche, aigu a droite.
    float level = texture2D(uSpectrum, vec2(vUv.x, 0.5)).r;
    float fill = step(vUv.y, level * 0.25);
    col = mix(uPaper, vec3(0.08, 0.07, 0.06), fill);
  } else if (uView == 2) {
    // Flow debug : le vecteur du champ en fausses couleurs.
    vec2 f = flowField(vUv, uTime, uFlowScale, uFlowSpeed, uFlowBass, uFlowTreble, uBass, uTreble);
    f = clamp(f, -1.0, 1.0);
    col = vec3(0.5 + 0.5 * f.x, 0.5 + 0.5 * f.y, 0.5);
  } else {
    // Rendu reel (uView == 0) : le canal R du FBO = densite d'encre 0..1.
    // Papier a 0, encre foncee a 1. La couleur arrive a l'etape 4.
    float density = texture2D(uFluid, vUv).r;
    col = mix(uPaper, uInk, density);
  }

  gl_FragColor = vec4(srgbToLinear(col), 1.0);
}
`

// --- Simulation shader ------------------------------------------------------

const simVertex = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const simFragment = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform sampler2D uPrev;
uniform sampler2D uSpectrum;

// Flow field.
uniform float uTime;
uniform float uBass;
uniform float uTreble;
uniform float uFlowScale;
uniform float uFlowSpeed;
uniform float uFlowBass;
uniform float uFlowTreble;

// Fluide.
uniform float uDt;
uniform float uAdvectStrength;
uniform int uInjectMode;
uniform float uInjectSize;
uniform vec2 uDropUv;
uniform float uDropStrength;

${FLOW_FIELD_GLSL}

void main() {
  vec2 uv = vUv;

  // Advection semi-Lagrangienne : "ou etait ce pixel un dt plus tot ?".
  // On lit le passe a l'endroit dont il PROVIENT, ce qui evite les stries
  // qu'on aurait avec une advection avant (Euler explicite).
  vec2 flow = flowField(uv, uTime, uFlowScale, uFlowSpeed, uFlowBass, uFlowTreble, uBass, uTreble);
  vec2 prevUv = uv - flow * uAdvectStrength * uDt;
  vec4 prev = texture2D(uPrev, clamp(prevUv, 0.0, 1.0));

  float inject = 0.0;

  // Fountain : bande audio en bas de l'ecran, hauteur = uInjectSize.
  // Chaque colonne de la texture audio alimente sa tranche verticale.
  if (uInjectMode == 0 || uInjectMode == 2) {
    float band = 1.0 - smoothstep(0.0, uInjectSize, uv.y);
    float level = texture2D(uSpectrum, vec2(uv.x, 0.5)).r;
    inject += band * level;
  }

  // Drops : goutte gaussienne a uDropUv, seulement quand uDropStrength > 0
  // (frame ou un onset vient d'etre detecte).
  if ((uInjectMode == 1 || uInjectMode == 2) && uDropStrength > 0.001) {
    vec2 d = uv - uDropUv;
    float r2 = dot(d, d);
    float sigma2 = uInjectSize * uInjectSize;
    float blob = exp(-r2 / (sigma2 + 1e-6));
    inject += blob * uDropStrength;
  }

  // Cumul : additif borne. Sans dissipation, la scene finit par saturer,
  // c'est le point que l'etape 4 corrigera.
  float value = clamp(prev.r + inject, 0.0, 1.0);

  gl_FragColor = vec4(value, 0.0, 0.0, 1.0);
}
`

// --- Helpers audio ----------------------------------------------------------

function tailAverage(cols: Float32Array, count: number): number {
  const n = Math.min(count, cols.length)
  let s = 0
  for (let i = cols.length - n; i < cols.length; i++) s += cols[i]
  return n > 0 ? s / n : 0
}

function headAverage(cols: Float32Array, count: number): number {
  const n = Math.min(count, cols.length)
  let s = 0
  for (let i = 0; i < n; i++) s += cols[i]
  return n > 0 ? s / n : 0
}

/** Position (en UV) du pic d'energie. Sert a placer les gouttes sur onsets. */
function peakColumnUv(cols: Float32Array): number {
  let peak = 0
  let idx = 0
  for (let i = 0; i < cols.length; i++) {
    if (cols[i] > peak) {
      peak = cols[i]
      idx = i
    }
  }
  return cols.length > 1 ? idx / (cols.length - 1) : 0.5
}

const BAND_TAP = Math.max(1, Math.floor(COLUMN_COUNT / 4))

/** Scratch alloue une fois : sert au sauvegarde/restauration du clear color. */
const clearColorScratch = new Color()

// --- Composant --------------------------------------------------------------

export function InkWall() {
  const clock = useRef(0)
  const lastOnset = useRef(-1)
  const lastResetSignal = useRef(inkFluid.resetSignal)

  // Deux FBOs half-float qui vont s'echanger. Half-float suffit largement
  // pour du 0..1, byte donnerait un banding visible aux faibles densites.
  const fboOpts = useMemo(
    () => ({
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  )
  const fboA = useFBO(FLUID_FBO_WIDTH, FLUID_FBO_HEIGHT, fboOpts)
  const fboB = useFBO(FLUID_FBO_WIDTH, FLUID_FBO_HEIGHT, fboOpts)
  const targets = useRef({
    read: fboA as WebGLRenderTarget,
    write: fboB as WebGLRenderTarget,
  })

  // Materiau et scene de simulation : une petite scene isolee, pas dans le
  // graphe R3F principal, avec un unique quad plein-ecran. On la rend
  // manuellement dans useFrame vers l'un ou l'autre des FBOs.
  const simMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: simVertex,
        fragmentShader: simFragment,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uPrev: new Uniform<WebGLRenderTarget['texture'] | null>(null),
          uSpectrum: new Uniform(audioTexture.texture),
          uTime: new Uniform(0),
          uBass: new Uniform(0),
          uTreble: new Uniform(0),
          uFlowScale: new Uniform(2.4),
          uFlowSpeed: new Uniform(0.18),
          uFlowBass: new Uniform(1),
          uFlowTreble: new Uniform(0.8),
          uDt: new Uniform(0),
          uAdvectStrength: new Uniform(1),
          uInjectMode: new Uniform(2),
          uInjectSize: new Uniform(0.04),
          uDropUv: new Uniform(new Vector2(0.5, 0.5)),
          uDropStrength: new Uniform(0),
        },
      }),
    [],
  )

  const simScene = useMemo(() => new ThreeScene(), [])
  const simCamera = useMemo(() => new OrthographicCamera(-1, 1, 1, -1, 0, 1), [])

  useEffect(() => {
    const mesh = new Mesh(new PlaneGeometry(2, 2), simMaterial)
    simScene.add(mesh)
    return () => {
      simScene.remove(mesh)
      mesh.geometry.dispose()
    }
  }, [simMaterial, simScene])

  const wallMaterial = useMemo(
    () =>
      new ShaderMaterial({
        side: DoubleSide,
        vertexShader: wallVertex,
        fragmentShader: wallFragment,
        // Voir le commentaire dans le commit "Mur : ne pas ecrire la
        // profondeur" — sur ce plan lointain, InkEffect peindrait un
        // motif si on ecrivait la profondeur.
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uPaper: new Uniform(srgb(INK_PAPER)),
          uInk: new Uniform(srgb(INK_LINE)),
          uSpectrum: new Uniform(audioTexture.texture),
          uFluid: new Uniform<WebGLRenderTarget['texture'] | null>(null),
          uView: new Uniform(0),
          uTime: new Uniform(0),
          uBass: new Uniform(0),
          uTreble: new Uniform(0),
          uFlowScale: new Uniform(2.4),
          uFlowSpeed: new Uniform(0.18),
          uFlowBass: new Uniform(1),
          uFlowTreble: new Uniform(0.8),
        },
      }),
    [],
  )

  useEffect(
    () => () => {
      wallMaterial.dispose()
      simMaterial.dispose()
    },
    [wallMaterial, simMaterial],
  )

  useFrame(({ gl }, delta) => {
    const frame = engine.currentFrame
    audioTexture.update(frame)

    const dt = Math.min(0.05, delta)
    clock.current += dt

    const ink = readState().ink
    const bass = headAverage(frame.columns, BAND_TAP)
    const treble = tailAverage(frame.columns, BAND_TAP)

    // Detection d'onset : on se cale sur onsetCount (pas sur le booleen
    // `onset`) parce que l'analyse tourne a 125 Hz et le rendu a 60 : un
    // booleen d'une seule frame d'analyse serait rate une fois sur deux.
    let dropStrength = 0
    if (frame.onsetCount !== lastOnset.current) {
      lastOnset.current = frame.onsetCount
      dropStrength = 1
      // La goutte tombe la ou l'energie est : un kick tache le grave, un
      // charleston tache l'aigu. On repartit verticalement autour du bas
      // pour eviter d'empiler toutes les gouttes au meme endroit.
      const x = peakColumnUv(frame.columns)
      const y = 0.12 + Math.random() * 0.28
      ;(simMaterial.uniforms.uDropUv.value as Vector2).set(x, y)
    }

    // Reset a la demande : on vide les DEUX FBOs. On sauvegarde /
    // restaure la couleur de clear du renderer, sinon le prochain rendu
    // de la scene principale demarrerait sur du noir a la place du papier.
    if (inkFluid.resetSignal !== lastResetSignal.current) {
      lastResetSignal.current = inkFluid.resetSignal
      const savedClear = gl.getClearColor(clearColorScratch)
      const savedAlpha = gl.getClearAlpha()
      gl.setClearColor(0x000000, 0)
      gl.setRenderTarget(targets.current.read)
      gl.clear(true, false, false)
      gl.setRenderTarget(targets.current.write)
      gl.clear(true, false, false)
      gl.setRenderTarget(null)
      gl.setClearColor(savedClear, savedAlpha)
    }

    // Uniformes de la simulation.
    const s = simMaterial.uniforms
    s.uPrev.value = targets.current.read.texture
    s.uTime.value = clock.current
    s.uDt.value = dt
    s.uBass.value = bass
    s.uTreble.value = treble
    s.uFlowScale.value = ink.flowScale
    s.uFlowSpeed.value = ink.flowSpeed
    s.uFlowBass.value = ink.flowBass
    s.uFlowTreble.value = ink.flowTreble
    s.uAdvectStrength.value = ink.advectStrength
    s.uInjectMode.value = INK_INJECT_MODES.indexOf(ink.injectMode)
    s.uInjectSize.value = ink.injectSize
    s.uDropStrength.value = dropStrength

    // Rendu de la simulation dans le FBO d'ecriture.
    gl.setRenderTarget(targets.current.write)
    gl.render(simScene, simCamera)
    gl.setRenderTarget(null)

    // Swap : le FBO qu'on vient d'ecrire devient le FBO a LIRE (a la fois
    // pour le mur cette frame et pour la simulation la frame suivante).
    const tmp = targets.current.read
    targets.current.read = targets.current.write
    targets.current.write = tmp

    // Uniformes du mur.
    const w = wallMaterial.uniforms
    w.uView.value = INK_VIEWS.indexOf(ink.view)
    w.uTime.value = clock.current
    w.uBass.value = bass
    w.uTreble.value = treble
    w.uFlowScale.value = ink.flowScale
    w.uFlowSpeed.value = ink.flowSpeed
    w.uFlowBass.value = ink.flowBass
    w.uFlowTreble.value = ink.flowTreble
    w.uFluid.value = targets.current.read.texture
  })

  return (
    // renderOrder tres bas : le fond est dessine en premier, tout le reste le
    // recouvre — on ne paie pas deux fois le remplissage de l'ecran.
    <mesh position={[0, WALL_CENTER_Y, WALL_Z]} renderOrder={-10} material={wallMaterial}>
      <planeGeometry args={[WALL_WIDTH, WALL_HEIGHT]} />
    </mesh>
  )
}

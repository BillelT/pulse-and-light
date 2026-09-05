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
  NoColorSpace,
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
import { createInkPalette } from './inkPalette'
import { INK_PAPER } from './ink'

/**
 * Le mur — visualiseur en cours de reconstruction, brique par brique.
 *
 * Etapes en place :
 *  1. pont audio -> DataTexture (voir `audioTexture.ts`), vue "spectrum".
 *  2. flow field (bruit simplex, voir `inkFluid.ts`), vue "flow".
 *  3. ping-pong FBO : la simulation avance dans deux WebGLRenderTarget qui
 *     s'echangent chaque frame. Advection semi-Lagrangienne par le flow
 *     field, injection au choix (fountain / drops / both), dissipation
 *     exponentielle et plafond doux.
 *     La fontaine est un VISUALIZER DE COLONNES : le spectre pilote une
 *     ligne de hauteur par colonne (base du mur -> plafond), le pigment est
 *     injecte a PLEINE intensite sous la ligne et efface au-dessus, via un
 *     integrateur leaky qui lisse la montee/descente. L'intensite audio
 *     commande donc la HAUTEUR de l'encre, jamais son opacite — la densite
 *     reste une affaire de variables d'encre (contraste, dissipation,
 *     plafond). Silence -> mur vide : a niveau nul la ligne passe d'un
 *     demi-pas SOUS la base, le flanc doux du masque n'emerge plus dans la
 *     zone visible (aucune encre residuelle au sol). Quand le son coupe
 *     apres avoir ete la, la ligne redescend en suivant le spectre via le
 *     meme integrateur : la colonne tombe progressivement, comme un vrai
 *     visualizer. Les piques culminent a 90% de la course pour rester dans
 *     la fenetre visible du mur. Le spectre est lisse horizontalement
 *     (5 taps ponderes).
 *  4. colorimetrie : le FBO stocke l'ABSORPTION en espace lineaire (Beer-
 *     Lambert simplifie), la palette BANDS complete (Sub -> Air) est lue
 *     dans `inkPalette.ts` et tient sur l'axe log-frequence commun au reste
 *     du projet. Un pigment tache donc a la couleur de la frequence qui l'a
 *     depose et garde cette couleur meme quand l'advection le deplace.
 *  5. masque rectangulaire : fenetre d'affichage bornee (centre + demi-taille
 *     + adoucissement des bords) pour cadrer le fluide comme un "ecran" au
 *     milieu du mur. Le bas de cette fenetre (le bas du mur, au niveau du
 *     sol) sert de base d'ancrage des colonnes.
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

// --- Shared GLSL ------------------------------------------------------------

/**
 * Echantillonnage lisse du spectre : 5 taps ponderes 1-2-3-2-1 (somme 9)
 * autour de x. Le sampler linear fait deja de l'interpolation entre texels,
 * mais 13 colonnes reechantillonnees en 128 slots laissent quand meme des
 * pointes visibles cellule par cellule quand une seule colonne est forte.
 * Ce petit box blur arrondit les pointes en douceur.
 */
const SPECTRUM_SAMPLER_GLSL = /* glsl */ `
float sampleSpectrum(sampler2D tex, float x) {
  const float du = 2.0 / 128.0;
  float s = 0.0;
  s += texture2D(tex, vec2(x - 2.0 * du, 0.5)).r * 1.0;
  s += texture2D(tex, vec2(x -       du, 0.5)).r * 2.0;
  s += texture2D(tex, vec2(x           , 0.5)).r * 3.0;
  s += texture2D(tex, vec2(x +       du, 0.5)).r * 2.0;
  s += texture2D(tex, vec2(x + 2.0 * du, 0.5)).r * 1.0;
  return s / 9.0;
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
`

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
uniform sampler2D uSpectrum;
uniform sampler2D uFluid;
uniform vec2 uFluidTexel;
uniform int uView;

// Flow field uniforms.
uniform float uTime;
uniform float uBass;
uniform float uTreble;
uniform float uFlowScale;
uniform float uFlowSpeed;
uniform float uFlowBass;
uniform float uFlowTreble;

// Masque rectangulaire.
uniform vec2 uRectCenter;
uniform vec2 uRectHalfSize;
uniform float uRectSoftness;

// Rendu encre.
uniform float uInkContrast;
uniform float uInkGrain;
uniform float uInkGrainScale;
uniform float uInkWetEdge;
uniform float uInkWobble;

${SPECTRUM_SAMPLER_GLSL}
${FLOW_FIELD_GLSL}

// Hash rapide (Dave Hoskins, MIT). Sert au grain et au bruit de wobble.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Bruit de valeur 2 octaves, lisse — grain de papier / trace de main.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/**
 * Rendu "encre sur papier" a partir de l'absorption stockee dans le FBO.
 *
 * Le FBO contient des colonnes a pleine intensite (voir la fontaine du sim) :
 * la densite vient du contraste/grain ici, pas du volume audio.
 *
 *  - wobble : micro-decalage de l'UV d'echantillonnage par un bruit fixe a
 *    l'ecran. Casse la douceur bilineaire parfaite, comme la passe encre
 *    de la scene (InkEffect) le fait pour les silhouettes.
 *  - contraste : courbe puissance sur l'absorption. Un exposant < 1 renforce
 *    la saturation et resserre la plage centrale, sortant du degrade "gaz".
 *  - wet edge : la ou le gradient d'absorption est fort (bord de flaque),
 *    on assombrit legerement — c'est la marque que l'encre s'accumule quand
 *    elle seche. Un simple Sobel sur la luminance suffit.
 *  - grain : bruit fbm multiplicatif sur l'absorption. En zone dense il
 *    donne le "fibre" du papier, en zone claire il disparait (pas de bruit
 *    parasite sur le papier vide).
 *
 * L'ordre importe : on wobble AVANT de lire les voisins pour le wet-edge,
 * puis on applique contraste + grain sur l'absorption elle-meme, et enfin
 * on convertit en couleur (Beer-Lambert) — grain et contraste travaillent
 * dans le meme espace lineaire d'absorption que le FBO.
 */
vec3 renderInk(vec2 uv, vec3 paperLin) {
  vec2 wob = vec2(0.0);
  if (uInkWobble > 0.0) {
    vec2 wp = uv * 220.0;
    wob = vec2(vnoise(wp) - 0.5, vnoise(wp + 19.7) - 0.5) * uFluidTexel * uInkWobble;
  }
  vec2 suv = clamp(uv + wob, vec2(0.0), vec2(1.0));

  vec3 absorb = clamp(texture2D(uFluid, suv).rgb, 0.0, 1.0);

  // Wet edge : gradient de luminance du fluide sur 4 taps voisins.
  if (uInkWetEdge > 0.0) {
    vec2 o = uFluidTexel * 1.5;
    float lc = dot(absorb, vec3(0.299, 0.587, 0.114));
    float lr = dot(texture2D(uFluid, suv + vec2(o.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float ll = dot(texture2D(uFluid, suv - vec2(o.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float lu = dot(texture2D(uFluid, suv + vec2(0.0, o.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ld = dot(texture2D(uFluid, suv - vec2(0.0, o.y)).rgb, vec3(0.299, 0.587, 0.114));
    float grad = abs(lr - ll) + abs(lu - ld);
    // Cadence l'accentuation sur des flaques deja existantes : sur du blanc,
    // grad est nul et rien ne s'active.
    float edge = smoothstep(0.02, 0.30, grad) * step(0.02, lc);
    absorb = min(absorb * (1.0 + uInkWetEdge * edge), vec3(1.0));
  }

  // Courbe : renforce la saturation du pigment sans toucher au papier.
  absorb = pow(absorb, vec3(1.0 / max(uInkContrast, 0.05)));

  // Grain : bruit multiplicatif, actif proportionnellement a la densite.
  if (uInkGrain > 0.0) {
    float g = vnoise(uv * uInkGrainScale) - 0.5;
    float density = clamp(dot(absorb, vec3(0.333)), 0.0, 1.0);
    absorb *= 1.0 + g * uInkGrain * density;
    absorb = clamp(absorb, 0.0, 1.0);
  }

  return paperLin * (1.0 - absorb);
}

void main() {
  vec3 paperLin = srgbToLinear(uPaper);
  vec3 col = paperLin;

  if (uView == 1) {
    // Spectrum debug : barre horizontale, spectre lisse.
    float level = sampleSpectrum(uSpectrum, vUv.x);
    float fill = step(vUv.y, level * 0.25);
    col = mix(paperLin, srgbToLinear(vec3(0.08, 0.07, 0.06)), fill);
  } else if (uView == 2) {
    // Flow debug : vecteur en fausses couleurs.
    vec2 f = flowField(vUv, uTime, uFlowScale, uFlowSpeed, uFlowBass, uFlowTreble, uBass, uTreble);
    f = clamp(f, -1.0, 1.0);
    col = srgbToLinear(vec3(0.5 + 0.5 * f.x, 0.5 + 0.5 * f.y, 0.5));
  } else {
    // Rendu reel : masque rectangulaire d'abord, on ne paie le pipeline
    // encre (5 taps + noise) que dans la fenetre visible.
    vec2 d = abs(vUv - uRectCenter) - uRectHalfSize;
    float outside = length(max(d, 0.0));
    float rectMask = 1.0 - smoothstep(0.0, max(uRectSoftness, 1e-4), outside);

    if (rectMask > 0.001) {
      vec3 fluidCol = renderInk(vUv, paperLin);
      col = mix(paperLin, fluidCol, rectMask);
    }
  }

  // Sortie directe en lineaire : Three convertira en sRGB pour l'affichage.
  gl_FragColor = vec4(col, 1.0);
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
uniform sampler2D uPalette;

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
uniform float uRise;
uniform int uInjectMode;
uniform float uInjectSize;
uniform float uInjectionRate;
uniform vec2 uDropUv;
uniform float uDropStrength;
uniform float uDissipation;
uniform float uCeiling;
uniform float uCeilingSoftness;

// Base des colonnes : bas du mur visible (bas du rect, au niveau du sol).
uniform float uBaseY;

${SPECTRUM_SAMPLER_GLSL}
${FLOW_FIELD_GLSL}

/** Palette : absorption lineaire deja pre-calculee dans inkPalette.ts. */
vec3 sampleAbsorption(float x) {
  return texture2D(uPalette, vec2(x, 0.5)).rgb;
}

void main() {
  vec2 uv = vUv;
  float localLevel = clamp(sampleSpectrum(uSpectrum, uv.x), 0.0, 1.0);

  // 1. Advection semi-Lagrangienne. La hauteur etant pilotee directement par
  //    la fontaine, le flow field ne sert plus qu'a faire VIVRE les bords :
  //    ondulation organique de la trace, derive douce. Garder advect/rise
  //    bas au HUD, sinon les colonnes s'etalent en nappe (look aquarelle).
  vec2 flow = flowField(uv, uTime, uFlowScale, uFlowSpeed, uFlowBass, uFlowTreble, uBass, uTreble);
  flow.y += uRise * localLevel;
  vec2 prevUv = uv - flow * uAdvectStrength * uDt;
  vec3 value = texture2D(uPrev, clamp(prevUv, 0.0, 1.0)).rgb;

  // 2. Fontaine "visualizer" : l'intensite commande la HAUTEUR, pas
  //    l'opacite. Le spectre local donne une ligne de hauteur ; sous la
  //    ligne le pigment est injecte a PLEINE intensite (couleur saturee de
  //    la bande), au-dessus il retombe a zero. Deux reglages fins :
  //      - a silence la ligne descend d'un demi-pas SOUS la base : le flanc
  //        doux du masque (± uInjectSize) est alors entierement sous la zone
  //        visible, plus aucune encre residuelle au sol. Quand le son coupe
  //        apres avoir ete la, la ligne redescend en suivant le spectre via
  //        l'integrateur leaky — la colonne tombe progressivement, comme un
  //        vrai visualizer.
  //      - la course est bornee a 90% entre la base et le plafond : les
  //        piques gardent une marge sous le haut de la fenetre visible.
  if (uInjectMode == 0 || uInjectMode == 2) {
    float span = max(uCeiling - uBaseY, 1e-4) * 0.9;
    float line = uBaseY - uInjectSize + localLevel * (span + uInjectSize);
    float heightMask = 1.0 - smoothstep(line - uInjectSize, line + uInjectSize, uv.y);
    vec3 target = sampleAbsorption(uv.x) * heightMask;
    float alpha = 1.0 - exp(-uInjectionRate * uDt);
    value = mix(value, target, alpha);
  }

  // 3. Gouttes : additif borne (jamais > 1) pour un coup net sur onset.
  //    La couleur suit la frequence de pic du transitoire (uDropUv.x).
  if ((uInjectMode == 1 || uInjectMode == 2) && uDropStrength > 0.001) {
    vec2 d = uv - uDropUv;
    float sigma2 = uInjectSize * uInjectSize;
    float blob = exp(-dot(d, d) / (sigma2 + 1e-6)) * uDropStrength;
    vec3 dropAbs = sampleAbsorption(uDropUv.x);
    value += dropAbs * blob * clamp(1.0 - value, 0.0, 1.0);
  }

  // 4. Dissipation exponentielle + plafond doux. Sans son la valeur retombe
  //    a zero (la ligne descend sous la base), au-dessus du plafond le
  //    pigment s'eteint comme de la fumee — la pointe d'une colonne a fond
  //    s'affine au sommet au lieu de se couper net.
  float fade = exp(-uDissipation * uDt);
  float ceilFactor = 1.0 - smoothstep(uCeiling, uCeiling + uCeilingSoftness, uv.y);
  value = clamp(value * fade * ceilFactor, 0.0, 1.0);

  gl_FragColor = vec4(value, 1.0);
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
const clearColorScratch = new Color()

// --- Composant --------------------------------------------------------------

export function InkWall() {
  const clock = useRef(0)
  const lastOnset = useRef(-1)
  const lastResetSignal = useRef(inkFluid.resetSignal)
  const palette = useMemo(() => createInkPalette(), [])

  const fboOpts = useMemo(
    () => ({
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      colorSpace: NoColorSpace,
    }),
    [],
  )
  const fboA = useFBO(FLUID_FBO_WIDTH, FLUID_FBO_HEIGHT, fboOpts)
  const fboB = useFBO(FLUID_FBO_WIDTH, FLUID_FBO_HEIGHT, fboOpts)
  const targets = useRef({
    read: fboA as WebGLRenderTarget,
    write: fboB as WebGLRenderTarget,
  })

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
          uPalette: new Uniform(palette),
          uTime: new Uniform(0),
          uBass: new Uniform(0),
          uTreble: new Uniform(0),
          uFlowScale: new Uniform(5.0),
          uFlowSpeed: new Uniform(0.18),
          uFlowBass: new Uniform(1),
          uFlowTreble: new Uniform(0.8),
          uDt: new Uniform(0),
          uAdvectStrength: new Uniform(0.3),
          uRise: new Uniform(0.35),
          uInjectMode: new Uniform(2),
          uInjectSize: new Uniform(0.045),
          uInjectionRate: new Uniform(8),
          uDropUv: new Uniform(new Vector2(0.5, 0.15)),
          uDropStrength: new Uniform(0),
          uDissipation: new Uniform(1.1),
          uCeiling: new Uniform(0.28),
          uCeilingSoftness: new Uniform(0.15),
          uBaseY: new Uniform(0),
        },
      }),
    [palette],
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
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uPaper: new Uniform(srgb(INK_PAPER)),
          uSpectrum: new Uniform(audioTexture.texture),
          uFluid: new Uniform<WebGLRenderTarget['texture'] | null>(null),
          uFluidTexel: new Uniform(
            new Vector2(1 / FLUID_FBO_WIDTH, 1 / FLUID_FBO_HEIGHT),
          ),
          uView: new Uniform(0),
          uTime: new Uniform(0),
          uBass: new Uniform(0),
          uTreble: new Uniform(0),
          uFlowScale: new Uniform(5.0),
          uFlowSpeed: new Uniform(0.08),
          uFlowBass: new Uniform(1),
          uFlowTreble: new Uniform(0.8),
          uRectCenter: new Uniform(new Vector2(0.5, 0.15)),
          uRectHalfSize: new Uniform(new Vector2(0.5, 0.28)),
          uRectSoftness: new Uniform(0.04),
          uInkContrast: new Uniform(1.4),
          uInkGrain: new Uniform(0.35),
          uInkGrainScale: new Uniform(180),
          uInkWetEdge: new Uniform(1.2),
          uInkWobble: new Uniform(1.5),
        },
      }),
    [],
  )

  useEffect(
    () => () => {
      wallMaterial.dispose()
      simMaterial.dispose()
      palette.dispose()
    },
    [wallMaterial, simMaterial, palette],
  )

  useFrame(({ gl }, delta) => {
    const frame = engine.currentFrame
    audioTexture.update(frame)

    const dt = Math.min(0.05, delta)
    clock.current += dt

    const ink = readState().ink
    const bass = headAverage(frame.columns, BAND_TAP)
    const treble = tailAverage(frame.columns, BAND_TAP)

    // Detection d'onset via onsetCount : le booleen d'analyse est valable
    // une seule frame d'analyse (125 Hz) et serait rate une fois sur deux
    // au rendu (60 Hz).
    let dropStrength = 0
    if (frame.onsetCount !== lastOnset.current) {
      lastOnset.current = frame.onsetCount
      dropStrength = 1
      const x = peakColumnUv(frame.columns)
      // On contraint y sous le plafond, sinon la goutte serait dessinee
      // dans la zone qui va la faire fondre immediatement.
      const yTop = Math.max(0.06, ink.ceiling * 0.75)
      const y = 0.05 + Math.random() * (yTop - 0.05)
      ;(simMaterial.uniforms.uDropUv.value as Vector2).set(x, y)
    }

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

    // Base des colonnes = bas de la fenetre visible, callee sur le bas du
    // mur (le plan passe sous le sol, on borne a 0 = ligne de sol).
    const baseY = Math.max(0, ink.rectCenterY - ink.rectHalfH)

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
    s.uRise.value = ink.rise
    s.uInjectMode.value = INK_INJECT_MODES.indexOf(ink.injectMode)
    s.uInjectSize.value = ink.injectSize
    s.uInjectionRate.value = ink.injectionRate
    s.uDropStrength.value = dropStrength
    s.uDissipation.value = ink.dissipation
    s.uCeiling.value = ink.ceiling
    s.uCeilingSoftness.value = ink.ceilingSoftness
    s.uBaseY.value = baseY

    gl.setRenderTarget(targets.current.write)
    gl.render(simScene, simCamera)
    gl.setRenderTarget(null)

    const tmp = targets.current.read
    targets.current.read = targets.current.write
    targets.current.write = tmp

    const w = wallMaterial.uniforms
    w.uView.value = INK_VIEWS.indexOf(ink.view)
    w.uTime.value = clock.current
    w.uBass.value = bass
    w.uTreble.value = treble
    w.uFlowScale.value = ink.flowScale
    w.uFlowSpeed.value = ink.flowSpeed
    w.uFlowBass.value = ink.flowBass
    w.uFlowTreble.value = ink.flowTreble
    ;(w.uRectCenter.value as Vector2).set(ink.rectCenterX, ink.rectCenterY)
    ;(w.uRectHalfSize.value as Vector2).set(ink.rectHalfW, ink.rectHalfH)
    w.uRectSoftness.value = ink.rectSoftness
    w.uInkContrast.value = ink.inkContrast
    w.uInkGrain.value = ink.inkGrain
    w.uInkGrainScale.value = ink.inkGrainScale
    w.uInkWetEdge.value = ink.inkWetEdge
    w.uInkWobble.value = ink.inkWobble
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
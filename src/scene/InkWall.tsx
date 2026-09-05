import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, Uniform, Vector3, DoubleSide } from 'three'
import { engine } from '../audio/engine'
import { COLUMN_COUNT } from '../audio/types'
import { INK_VIEWS, readState } from '../state/store'
import { audioTexture } from './audioTexture'
import { INK_PAPER } from './ink'

/**
 * Le mur — visualiseur en cours de reconstruction, brique par brique.
 *
 * Etapes en place :
 *  1. pont audio -> `DataTexture` (voir `audioTexture.ts`), vue debug "spectrum".
 *  2. flow field (bruit simplex), vue debug "flow" — pas encore CONSOMME.
 *     L'etape 3 (ping-pong FBO) l'utilisera pour deformer la frame
 *     precedente ; ici on se contente de le CALCULER et de le VOIR.
 *
 * En rendu reel (`view = off`), le mur reste papier : rien de definitif ne
 * sera dessine tant que le fluide (etape 3) n'est pas en place.
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

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`

/**
 * Fragment : papier plein par defaut, plus les vues de debug.
 *
 * Les vues de debug lisent EXACTEMENT les memes uniformes que le rendu
 * reel, sinon elles debuggent autre chose que ce qui tourne. C'est aussi
 * pour ca que le flow field est calcule par une fonction, appelable depuis
 * la vue debug ET (plus tard) depuis l'etape 3 sans dupliquer le code.
 */
const fragmentShader = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform vec3 uPaper;
uniform sampler2D uSpectrum;
uniform int uView;

// Etape 2 : flow field.
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

// --- Simplex noise 2D (Ashima, MIT) --------------------------------------
// Bruit continu, sans direction preferentielle, gratuit sur GPU. Retourne
// approximativement [-1, 1]. On l'anime avec un OFFSET du domaine plutot
// qu'en passant t comme coordonnee : plus rapide, et le "flow" a l'air
// d'un courant qui derive plutot que d'un ecran qui scintille.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

/**
 * Champ vectoriel a l'endroit p, en date t.
 *
 * Deux echantillons decorreles (offset different) forment le vecteur (dx, dy).
 * L'audio pilote deux choses distinctes :
 *   - les basses AMPLIFIENT l'ecart au repos : sur un kick, le fluide sera
 *     pousse plus loin d'un coup ;
 *   - les aigus ACCELERENT l'horloge : les micro-turbulences deviennent plus
 *     nerveuses, comme un liquide agite au chalumeau.
 *
 * On ne fait PAS de curl-noise ici (4 samples au lieu de 2). Pour un fluide
 * strict il vaudrait mieux — pas de sources ni de puits — mais le rendu ink
 * en tolere largement la divergence, et 2 samples suffisent tant que
 * l'etape 3 n'est pas en place pour juger.
 */
vec2 flowField(vec2 p, float t) {
  float dt = t * uFlowSpeed * (1.0 + uTreble * uFlowTreble);
  vec2 q = p * uFlowScale;
  float a = snoise(q + vec2(dt, 0.0));
  float b = snoise(q + vec2(17.3, dt));
  float amp = 1.0 + uBass * uFlowBass;
  return vec2(a, b) * amp;
}

void main() {
  vec3 col = uPaper;

  // 1 = spectrum debug view. On trace la texture audio comme une barre
  // horizontale en bas du mur : grave a gauche, aigu a droite.
  if (uView == 1) {
    float level = texture2D(uSpectrum, vec2(vUv.x, 0.5)).r;
    float fill = step(vUv.y, level * 0.25);
    col = mix(uPaper, vec3(0.08, 0.07, 0.06), fill);
  }

  // 2 = flow debug view. Le vecteur du champ, encode en fausses couleurs :
  //   rouge  = composante horizontale (droite = +1, gauche = -1)
  //   vert   = composante verticale   (haut  = +1, bas   = -1)
  //   bleu   = 0.5 fixe, sert de fond neutre
  // Les valeurs sont clampees car les basses fortes peuvent depasser [-1,1].
  else if (uView == 2) {
    vec2 f = flowField(vUv, uTime);
    f = clamp(f, -1.0, 1.0);
    col = vec3(0.5 + 0.5 * f.x, 0.5 + 0.5 * f.y, 0.5);
  }

  gl_FragColor = vec4(srgbToLinear(col), 1.0);
}
`

/** Moyenne des trois colonnes de la queue de spectre. */
function tailAverage(cols: Float32Array, count: number): number {
  const n = Math.min(count, cols.length)
  let s = 0
  for (let i = cols.length - n; i < cols.length; i++) s += cols[i]
  return n > 0 ? s / n : 0
}

/** Moyenne des trois colonnes de la tete de spectre. */
function headAverage(cols: Float32Array, count: number): number {
  const n = Math.min(count, cols.length)
  let s = 0
  for (let i = 0; i < n; i++) s += cols[i]
  return n > 0 ? s / n : 0
}

/** Fraction des colonnes utilisees pour "grave" et "aigu". */
const BAND_TAP = Math.max(1, Math.floor(COLUMN_COUNT / 4))

export function InkWall() {
  const clock = useRef(0)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: DoubleSide,
        vertexShader,
        fragmentShader,
        // Le mur ne participe PAS au depth buffer. C'est un fond, pas un
        // objet : sa profondeur (~0.996 avec far=220) tombe pile dans la
        // plage instable de la passe `InkEffect`, ou le rapport
        // courbure/pente amplifie le bruit de quantification 24 bits en
        // motif visible (blobs facon aquarelle). En laissant depth = 1.0
        // aux pixels du mur, `InkEffect` les traite comme de l'arriere-plan
        // et coupe la detection des traits (`background` masque
        // `normalEdge`, la courbure s'annule sur profondeur uniforme).
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uPaper: new Uniform(srgb(INK_PAPER)),
          uSpectrum: new Uniform(audioTexture.texture),
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
      material.dispose()
    },
    [material],
  )

  useFrame((_, delta) => {
    // La texture audio est publiee ici (et pas dans un composant dedie) :
    // elle est mise a jour a la frequence du rendu, jamais plus vite, donc
    // pas de reveil de composant inutile.
    const frame = engine.currentFrame
    audioTexture.update(frame)

    const dt = Math.min(0.05, delta)
    clock.current += dt

    const ink = readState().ink
    const u = material.uniforms
    u.uView.value = INK_VIEWS.indexOf(ink.view)
    u.uTime.value = clock.current
    // Grave et aigu extraits DIRECTEMENT de columns : plus stable qu'un
    // sampling GPU de la texture audio et coherent avec le HUD.
    u.uBass.value = headAverage(frame.columns, BAND_TAP)
    u.uTreble.value = tailAverage(frame.columns, BAND_TAP)
    u.uFlowScale.value = ink.flowScale
    u.uFlowSpeed.value = ink.flowSpeed
    u.uFlowBass.value = ink.flowBass
    u.uFlowTreble.value = ink.flowTreble
  })

  return (
    // renderOrder tres bas : le fond est dessine en premier, tout le reste le
    // recouvre — on ne paie pas deux fois le remplissage de l'ecran.
    <mesh position={[0, WALL_CENTER_Y, WALL_Z]} renderOrder={-10} material={material}>
      <planeGeometry args={[WALL_WIDTH, WALL_HEIGHT]} />
    </mesh>
  )
}

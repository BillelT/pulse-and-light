/**
 * Fluide d'encre — simulation ping-pong FBO.
 *
 * On garde ici le SEUL bout de code partage strictement entre le shader du
 * mur (qui affiche le fluide et le debug flow field) et le shader de
 * simulation (qui advecte la frame precedente et rajoute l'injection) :
 * la definition du bruit simplex 2D et la fonction `flowField`. Dupliquer
 * ces ~60 lignes de GLSL couterait cher a maintenir et surtout, un jour ou
 * l'autre, la vue debug "flow" du mur montrerait une chose et le fluide en
 * consommerait une autre.
 *
 * Le singleton `inkFluid` porte le seul etat mutable dont on a besoin en
 * dehors du composant : un compteur qu'on incremente pour dire "vide les
 * deux FBOs a la prochaine frame". Meme pattern que l'ancien `inkField`.
 */

/**
 * Resolution des FBOs. Aspect 2:3 du mur (100x150). La moitie haute est quasi
 * toujours vide (ceiling ~0.34) mais on garde la resolution verticale pleine :
 * la baisser rend visible le grain de la texture dans la zone d'affichage.
 */
export const FLUID_FBO_WIDTH = 256
export const FLUID_FBO_HEIGHT = 384

export const INK_INJECT_MODES = ['fountain', 'drops', 'both'] as const
export type InkInjectMode = (typeof INK_INJECT_MODES)[number]

export const inkFluid = {
  /** Incremente pour demander la remise a zero des deux FBOs. */
  resetSignal: 0,
  reset(): void {
    this.resetSignal++
  },
}

/**
 * Bruit simplex 2D d'Ashima (MIT) et champ vectoriel qui en decoule.
 *
 * Le champ est le MEME que celui affiche par la vue debug "flow" du mur :
 * mettre ce code dans un include GLSL commun garantit qu'on debug ce
 * qu'on rend. Deux echantillons decorreles forment le vecteur (dx, dy).
 * Les basses gonflent l'amplitude, les aigus accelerent l'horloge du
 * champ (voir le commentaire de `flowField`).
 */
export const FLOW_FIELD_GLSL = /* glsl */ `
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
 * flowField : bruit simplex 2D, anime par un offset du domaine plutot que
 * par une coordonnee temporelle (plus rapide, et le champ derive comme un
 * courant au lieu de scintiller). L'amplitude est gonflee par les basses,
 * la vitesse de l'offset par les aigus.
 */
vec2 flowField(
  vec2 p,
  float t,
  float scale,
  float speed,
  float bassGain,
  float trebleGain,
  float bass,
  float treble
) {
  float dt = t * speed * (1.0 + treble * trebleGain);
  vec2 q = p * scale;
  float a = snoise(q + vec2(dt, 0.0));
  float b = snoise(q + vec2(17.3, dt));
  float amp = 1.0 + bass * bassGain;
  return vec2(a, b) * amp;
}
`

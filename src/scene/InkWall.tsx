import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, Uniform, Vector2, Vector3 } from 'three'
import { engine } from '../audio/engine'
import { readState } from '../state/store'
import { createInkPalette, InkField } from './inkField'
import { INK_LINE, INK_PAPER } from './ink'

/**
 * Le mur d'encre — le visualiseur.
 *
 * Il remplace le mur de caissons LED : au lieu de traduire le son en niveaux
 * lumineux sur des cellules alignees (ce que fait n'importe quel VU-metre), il
 * le traduit en PIGMENT sur du papier mouille. La formule d'analyse ne change
 * pas — meme compression logarithmique, meme plancher/plafond, memes
 * constantes d'attaque et de decroissance, meme correspondance bande de
 * frequence -> couleur du brief. Seul le rendu de sortie change : son -> encre
 * plutot que son -> lumiere. Le detail du modele de pigment est dans
 * `inkField.ts`.
 *
 * Ce qui se passe ici, c'est la mise en page :
 *
 *  - l'axe HORIZONTAL est l'axe des frequences (grave a gauche, aigu a
 *    droite) : chaque endroit du mur appartient a une tranche du spectre et
 *    porte sa teinte ;
 *  - l'axe VERTICAL est celui de l'energie : le lavis monte depuis la ligne
 *    d'horizon d'autant plus haut que la tranche a recu de pigment ;
 *  - la deformation du papier (double warp de bruit fractal) porte le flux
 *    spectral et le kick : un morceau dense fait baver l'encre, un kick la
 *    fait exploser ;
 *  - par dessus le lavis courent des BOUCLES A LA PLUME : les lignes de
 *    niveau d'un champ de bruit, d'epaisseur constante en pixels, qui se
 *    densifient avec la brillance du morceau. C'est ce qui empeche le mur de
 *    se lire comme un degrade de fond et le raccroche au trait du reste de la
 *    scene.
 *
 * Le plan est volontairement enorme : ses bords ne doivent jamais entrer dans
 * le cadre, quelle que soit l'orbite de la camera, sinon la passe `InkEffect`
 * les cernerait d'un contour et le "papier" deviendrait un objet pose dans la
 * scene. Le lavis, lui, ne vit que dans une fenetre bornee (`INK_SPAN` /
 * `INK_RISE`) et se dissout dans le blanc bien avant les bords.
 */

/** Plan de fond : plus loin que tout le reste, avant le plan lointain (220). */
const WALL_Z = -26
const WALL_WIDTH = 300
const WALL_HEIGHT = 150
/** Centre du plan : sa moitie basse passe sous le sol, elle n'est jamais peinte. */
const WALL_CENTER_Y = 30

/** Demi-largeur de la fenetre peinte, en unites monde. */
const INK_SPAN = 46
/** Hauteur de reference de la montee du lavis, en unites monde. */
const INK_RISE = 11
/**
 * Base du lavis. Legerement au dessus du sol : la ou le plan du mur croise
 * y = 0, il se confond avec la ligne de fuite de la terrasse — l'encre part
 * donc pile de l'horizon.
 */
const INK_BASE_Y = 0

function srgb(hex: string): Vector3 {
  const v = parseInt(hex.slice(1), 16)
  return new Vector3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255)
}

const vertexShader = /* glsl */ `
uniform vec2 uOrigin;
uniform vec2 uSpan;
varying vec2 vArt;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Coordonnees "atelier" : x = -1..1 sur la largeur peinte, y = 0 a la ligne
  // d'horizon et 1 en haut de la montee de reference.
  vArt = (world.xy - uOrigin) / uSpan;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vArt;

uniform sampler2D uSpectrum;
uniform sampler2D uPalette;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uTime;
uniform float uPhase;
uniform float uFlux;
uniform float uBeat;
uniform float uBrightness;
uniform float uDensity;
uniform float uBleed;
uniform float uPenwork;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

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
 * Bruit fractal.
 *
 * Deux variantes, et le choix entre les deux n'est pas cosmetique : ce shader
 * couvre tout l'ecran et le bruit represente l'essentiel de son cout. Quatre
 * octaves la ou la FORME compte (les flaques, les boucles a la plume), trois
 * la ou seule une deformation douce est demandee — la quatrieme octave y est
 * invisible et coute pourtant un quart du budget.
 */
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, -3.1);
    a *= 0.5;
  }
  return v * 1.143;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, -3.1);
    a *= 0.5;
  }
  return v;
}

/** Champ de deplacement : c'est lui qui fait "couler" l'encre. */
vec2 flow(vec2 p, float t) {
  return vec2(
    fbm3(p + vec2(0.0, t * 0.05)) - 0.5,
    fbm3(p + vec2(4.7, -2.1) - vec2(t * 0.04, 0.0)) - 0.5
  );
}

/** Papier nu : le blanc de la feuille, plus le tramage qui evite les bandes. */
vec3 paper(vec3 tint) {
  return tint + (hash12(gl_FragCoord.xy) - 0.5) * 0.012;
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void main() {
  vec2 p = vArt;

  // --- Papier mouille -------------------------------------------------------
  // Deux echelles de deformation : une longue, qui promene des masses de
  // pigment sur toute la largeur, une courte, qui decoupe les flaques et rend
  // leur bord irregulier. Le flux spectral et le kick les amplifient : un
  // morceau qui bouge beaucoup fait baver l'encre, un morceau calme la laisse
  // se reposer.
  float turb = uBleed * (0.6 + 0.9 * uFlux + 0.7 * uBeat);
  vec2 w1 = flow(p * vec2(0.75, 1.1), uTime);
  vec2 w2 = flow(p * vec2(2.4, 3.2) + 11.0, uTime * 1.6);
  vec2 q = p + (w1 * 1.5 + w2 * 0.8) * turb;

  // --- Etat du pigment a cette frequence ------------------------------------
  float u = clamp(q.x * 0.5 + 0.5, 0.0, 1.0);
  vec3 sp = texture2D(uSpectrum, vec2(u, 0.5)).rgb;
  float wet = sp.r;
  float stain = sp.g;
  float flash = sp.b;

  // Quantite de pigment disponible : la tache bue domine (c'est la memoire du
  // morceau), le depot courant et la goutte la font respirer.
  float pigmentLoad = clamp(stain * 0.62 + wet * 0.4 + flash * 0.4, 0.0, 1.0);
  pigmentLoad *= 1.0 + 0.25 * uBeat;

  // --- Montee du lavis ------------------------------------------------------
  // Le pigment est dense au ras de l'horizon et s'epuise en montant ; sa
  // portee est proportionnelle a ce qu'il a recu.
  float reach = 0.12 + 0.88 * pigmentLoad;
  float climb = max(q.y, 0.0);
  float profile = 1.0 - smoothstep(0.0, reach, climb);
  // Au cube : le lavis s'evanouit bien avant sa portee nominale, ce qui lui
  // donne une forme de nuage plutot que de barre et laisse du blanc en haut
  // du cadre. Sans ca le mur remplit toute l'image : il n'y a plus de papier,
  // donc plus de dessin.
  profile = profile * profile * profile;
  // Sous l'horizon, le lavis s'eteint — mais pas net : il redescend un peu et
  // c'est la terrasse qui le coupe. Un arret pile sur y = 0 dessinerait le
  // bord du plan, et le fond redeviendrait un objet pose dans la scene.
  profile *= smoothstep(-0.42, -0.04, q.y);

  // Le lavis se dissout dans le blanc sur les cotes : le mur n'a pas de bord.
  float sides = 1.0 - smoothstep(0.74, 1.05, abs(q.x));

  // Sortie anticipee sur le papier nu. Le mur couvre tout l'ecran et, sur un
  // morceau normal, la majorite de ses pixels ne portent aucun pigment : tout
  // ce qui suit (flaques, granulation, plume) n'aurait rien a y dessiner.
  float coverage = pigmentLoad * profile * sides;
  if (coverage < 0.004) {
    gl_FragColor = vec4(srgbToLinear(clamp(paper(uPaper), 0.0, 1.0)), 1.0);
    return;
  }

  // Flaques : sans elles le lavis serait un degrade regulier, donc une image
  // de synthese. Le seuil suit la charge de pigment, si bien qu'un passage
  // fort "referme" les trous au lieu de simplement les eclaircir. C'est aussi
  // ce qui laisse respirer le blanc du papier a l'interieur de la tache.
  // Les seuils sont cales sur la plage REELLE du fbm (~0,3 a 0,65) : plus
  // large, le masque vaut 1 partout et le lavis redevient un degre lisse.
  float cloud = fbm(q * vec2(1.9, 2.6) + vec2(0.0, -uTime * 0.02));
  float blotch = smoothstep(0.37, 0.60, cloud + 0.13 * pigmentLoad);

  float conc = coverage * blotch * uDensity;

  // Bord humide : le pigment migre vers la limite de la flaque et s'y
  // accumule en un lisere plus dense. C'est la signature de l'aquarelle, et
  // ce qui distingue une tache d'encre d'un simple degrade.
  float rim = smoothstep(0.02, 0.13, conc) * (1.0 - smoothstep(0.13, 0.38, conc));
  conc += rim * 0.34 * uDensity;

  // Granulation : le pigment ne seche pas uniformement, il se depose dans le
  // creux de la fibre et deserte la bosse. C'est ce qui donne a une aquarelle
  // son grain irregulier — et c'est une modulation de la QUANTITE de pigment,
  // pas un assombrissement de la couleur : un voile gris par dessus rendrait
  // le papier sale au lieu de le rendre vivant.
  conc *= 0.82 + 0.36 * fbm3(p * vec2(9.0, 12.0) + 37.0);
  // Plafonne sous 1 : la fibre du papier doit toujours transparaitre, meme au
  // plus fort du morceau.
  conc = clamp(conc, 0.0, 0.92);

  // --- Teinte ---------------------------------------------------------------
  // La couleur est echantillonnee sur une deformation BEAUCOUP plus ample que
  // celle de la densite : les teintes voyagent d'une flaque a l'autre sans que
  // la forme de la tache ne bouge, ce qui est exactement le comportement du
  // mouille-sur-mouille. Sans ca, le mur reste un degrade horizontal propre —
  // lisible, mais ce n'est plus de l'encre.
  float cu = clamp((q.x + (w1.x * 2.2 + w2.x * 1.1) * max(turb, 0.06)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 pigment = texture2D(uPalette, vec2(cu, 0.5)).rgb;

  // Loi de Beer-Lambert simplifiee : le pigment ABSORBE, il n'emet pas. Sur du
  // papier blanc c'est ce qui donne des pastels francs sans jamais griser.
  vec3 col = uPaper * (1.0 - (1.0 - pigment) * conc);


  // --- Boucles a la plume ---------------------------------------------------
  if (uPenwork > 0.001 && conc > 0.02) {
    // Lignes de niveau d'un champ de bruit deforme : des boucles fermees et
    // irregulieres, pas des rayures. uPhase avance avec le tempo, donc les
    // boucles migrent au rythme du morceau.
    // L'ecart entre deux boucles varie lentement dans l'espace : des lignes de
    // niveau regulierement espacees se lisent comme une carte topographique,
    // pas comme une plume. En faisant respirer l'ecart, on retrouve les
    // pleins et les delies d'un trait fait a la main.
    float spacing = 9.0 + 11.0 * fbm3(p * 0.65 + 5.0);
    float g = fbm(p * vec2(1.6, 2.2) + w1 * 1.4) * spacing + uPhase;
    float ff = fract(g);
    float dd = min(ff, 1.0 - ff);
    // Epaisseur constante en PIXELS, comme le trait du reste de la scene : un
    // stylo ne s'affine pas parce que la surface s'eloigne.
    float aa = clamp(fwidth(g), 0.0008, 0.35);
    float line = 1.0 - smoothstep(aa * 0.45, aa * 1.55, dd);
    // Quand les boucles se resserrent au dela du pixel, on les efface plutot
    // que de les laisser former un aplat gris.
    line *= 1.0 - smoothstep(0.14, 0.34, aa);
    // Le trait n'existe que sur l'encre, et se densifie avec l'aigu.
    float where = smoothstep(0.025, 0.22, conc) * (0.28 + 0.72 * uBrightness);
    col = mix(col, uInk, clamp(line, 0.0, 1.0) * where * uPenwork);
  }

  gl_FragColor = vec4(srgbToLinear(clamp(paper(col), 0.0, 1.0)), 1.0);
}
`

export function InkWall() {
  const field = useMemo(() => new InkField(), [])
  const palette = useMemo(() => createInkPalette(), [])
  const phase = useRef(0)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        depthWrite: true,
        fog: false,
        uniforms: {
          uSpectrum: new Uniform(field.texture),
          uPalette: new Uniform(palette),
          uPaper: new Uniform(srgb(INK_PAPER)),
          uInk: new Uniform(srgb(INK_LINE)),
          uOrigin: new Uniform(new Vector2(0, INK_BASE_Y)),
          uSpan: new Uniform(new Vector2(INK_SPAN, INK_RISE)),
          uTime: new Uniform(0),
          uPhase: new Uniform(0),
          uFlux: new Uniform(0),
          uBeat: new Uniform(0),
          uBrightness: new Uniform(0),
          uDensity: new Uniform(1),
          uBleed: new Uniform(0.22),
          uPenwork: new Uniform(0.55),
        },
      }),
    [field, palette],
  )

  useEffect(
    () => () => {
      material.dispose()
      palette.dispose()
      field.dispose()
    },
    [material, palette, field],
  )

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta)
    const frame = engine.currentFrame
    field.update(frame, dt)

    // Phase des boucles a la plume. Elle avance au tempo quand il est connu,
    // sinon a une allure de fond : les boucles doivent deriver, jamais
    // clignoter, sinon le mur redevient un stroboscope.
    const beatsPerSecond = frame.bpm > 0 ? frame.bpm / 60 : 2
    phase.current += dt * (0.06 + beatsPerSecond * 0.02 * (0.25 + frame.level))

    // Les reglages sont relus a chaque frame : un slider doit s'entendre tout
    // de suite (convention du panneau Lighting Designer).
    const visual = readState().visual
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uPhase.value = phase.current
    u.uFlux.value = frame.flux
    u.uBeat.value = frame.beat
    u.uBrightness.value = frame.brightness
    u.uDensity.value = visual.inkWashDensity
    u.uBleed.value = visual.inkWashBleed
    u.uPenwork.value = visual.inkWashPenwork
  })

  return (
    // renderOrder tres bas : le fond est dessine en premier, tout le reste le
    // recouvre — on ne paie pas deux fois le remplissage de l'ecran.
    <mesh position={[0, WALL_CENTER_Y, WALL_Z]} renderOrder={-10} material={material}>
      <planeGeometry args={[WALL_WIDTH, WALL_HEIGHT]} />
    </mesh>
  )
}

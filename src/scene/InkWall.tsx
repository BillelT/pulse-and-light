import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, Uniform, Vector2, Vector3 } from 'three'
import { engine } from '../audio/engine'
import { INK_VIEWS, readState } from '../state/store'
import { createInkPalette, inkField } from './inkField'
import { INK_PAPER } from './ink'

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
 *  - l'image, c'est le TRAIT. Des boucles a la plume — les lignes de niveau
 *    d'un champ de bruit deforme — courent la ou la musique a depose du
 *    pigment, et elles sont ENCREES DE LA COULEUR DE LEUR FREQUENCE. Le lavis
 *    n'est qu'un halo tres dilue autour d'elles : la page doit rester blanche,
 *    ce qui la remplit est le trait, pas l'aplat.
 *
 * Rien n'est jamais dessine en gris : un trait gris sur une tache coloree se
 * lit comme une carte de niveaux, pas comme de l'encre. Le trait et le lavis
 * sont le MEME pigment a deux concentrations — c'est ce que fait un pinceau
 * qu'on charge plus ou moins, et c'est pour ca que la palette stocke une
 * direction d'absorption plutot qu'une couleur (cf. `inkField.ts`).
 *
 * Le plan est volontairement enorme : ses bords ne doivent jamais entrer dans
 * le cadre, quelle que soit l'orbite de la camera, sinon la passe `InkEffect`
 * les cernerait d'un contour et le "papier" deviendrait un objet pose dans la
 * scene. Le lavis, lui, ne vit que dans une fenetre bornee (`span` / `rise`,
 * reglables) et se dissout dans le blanc bien avant les bords.
 *
 * Tous les nombres du modele sont pilotes par le store (onglet Ink) : ce
 * fichier ne contient plus de constante d'aspect, seulement la geometrie du
 * plan porteur. Voir `uView` en fin de shader pour les vues de debug.
 */

/** Plan de fond : plus loin que tout le reste, avant le plan lointain (220). */
const WALL_Z = -26
const WALL_WIDTH = 300
const WALL_HEIGHT = 150
/** Centre du plan : sa moitie basse passe sous le sol, elle n'est jamais peinte. */
const WALL_CENTER_Y = 30
/**
 * Base du lavis. La ou le plan du mur croise y = 0, il se confond avec la
 * ligne de fuite de la terrasse — l'encre part donc pile de l'horizon.
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
uniform float uTime;
uniform float uPhase;

// Descripteurs audio.
uniform float uFlux;
uniform float uBeat;
uniform float uBrightness;

// Charge de pigment.
uniform float uWeightStain;
uniform float uWeightWet;
uniform float uWeightFlash;
uniform float uBeatLift;

// Mise en page.
uniform float uReachBase;
uniform float uReachGain;
uniform float uFalloff;
uniform float uSink;
uniform float uSideFade;

// Papier mouille.
uniform float uBleed;
uniform float uFluxWarp;
uniform float uBeatWarp;

// Lavis.
uniform float uWash;
uniform float uBlotchLow;
uniform float uBlotchHigh;
uniform float uRim;

// Trait.
uniform float uStroke;
uniform float uStrokeInk;
uniform float uStrokeInkGain;
uniform float uSpacingA;
uniform float uSpacingB;
uniform float uWeight;
uniform float uLift;
uniform float uReachInk;
uniform float uBrightnessMix;

// Debug.
uniform float uView;

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

/**
 * Une passe de plume : l'alpha du trait en un point.
 *
 * Le trait est une ligne de niveau d'un champ de bruit deforme — des boucles
 * fermees et irregulieres, jamais des rayures. Son epaisseur est constante en
 * PIXELS (via fwidth), comme le trait du reste de la scene : un stylo ne
 * s'affine pas parce que la surface s'eloigne.
 */
float penStroke(vec2 p, vec2 scale, vec2 warp, float spacing, float phase, float weight) {
  float g = fbm(p * scale + warp) * spacing + phase;
  float ff = fract(g);
  float dd = min(ff, 1.0 - ff);
  float aa = clamp(fwidth(g), 0.0008, 0.35);
  float hw = aa * weight;
  float line = 1.0 - smoothstep(hw, hw * 2.3, dd);
  // Quand les boucles se resserrent au dela du pixel, on les efface plutot
  // que de les laisser former un aplat.
  return line * (1.0 - smoothstep(0.14, 0.34, aa));
}

/** Papier nu : le blanc de la feuille, plus le tramage qui evite les bandes. */
vec3 paper(vec3 tint) {
  return tint + (hash12(gl_FragCoord.xy) - 0.5) * 0.012;
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

/**
 * Rampe de fausses couleurs des vues de debug.
 *
 * Volontairement TRES saturee sur toute sa longueur, zero compris. Un degrade
 * de gris serait plus lisible dans l'absolu, mais la passe InkEffect repeint
 * en encre tout pixel sombre ET desature : une vue de debug en niveaux de gris
 * ressortirait en aplat noir uniforme. Une rampe saturee la traverse intacte.
 */
vec3 heat(float v) {
  v = clamp(v, 0.0, 1.0);
  vec3 c0 = vec3(0.10, 0.05, 0.50);
  vec3 c1 = vec3(0.00, 0.72, 0.92);
  vec3 c2 = vec3(0.85, 0.90, 0.00);
  vec3 c3 = vec3(1.00, 0.15, 0.10);
  if (v < 0.3333) return mix(c0, c1, v / 0.3333);
  if (v < 0.6667) return mix(c1, c2, (v - 0.3333) / 0.3333);
  return mix(c2, c3, (v - 0.6667) / 0.3333);
}

/** true si la vue de debug demandee est celle d'indice id. */
bool view(float id) {
  return abs(uView - id) < 0.5;
}

void main() {
  vec2 p = vArt;

  // --- Papier mouille -------------------------------------------------------
  // Deux echelles de deformation : une longue, qui promene des masses de
  // pigment sur toute la largeur, une courte, qui decoupe les flaques et rend
  // leur bord irregulier. Le flux spectral et le kick les amplifient : un
  // morceau qui bouge beaucoup fait baver l'encre, un morceau calme la laisse
  // se reposer.
  float turb = uBleed * (0.6 + uFluxWarp * uFlux + uBeatWarp * uBeat);
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
  float pigmentLoad = clamp(stain * uWeightStain + wet * uWeightWet + flash * uWeightFlash, 0.0, 1.0);
  pigmentLoad *= 1.0 + uBeatLift * uBeat;

  // --- Montee du lavis ------------------------------------------------------
  // Le pigment est dense au ras de l'horizon et s'epuise en montant ; sa
  // portee est proportionnelle a ce qu'il a recu.
  float reach = uReachBase + uReachGain * pigmentLoad;
  float climb = max(q.y, 0.0);
  float profile = 1.0 - smoothstep(0.0, reach, climb);
  // L'exposant fait que le lavis s'evanouit bien avant sa portee nominale : il
  // prend une forme de nuage plutot que de barre, et laisse du blanc en haut
  // du cadre. Sans lui le mur remplit toute l'image : il n'y a plus de papier,
  // donc plus de dessin.
  profile = pow(profile, uFalloff);
  // Sous l'horizon, le lavis s'eteint — mais pas net : il redescend un peu et
  // c'est la terrasse qui le coupe. Un arret pile sur y = 0 dessinerait le
  // bord du plan, et le fond redeviendrait un objet pose dans la scene.
  profile *= smoothstep(-uSink, -uSink * 0.1, q.y);

  // Le lavis se dissout dans le blanc sur les cotes : le mur n'a pas de bord.
  float sides = 1.0 - smoothstep(uSideFade, uSideFade + 0.31, abs(q.x));

  float coverage = pigmentLoad * profile * sides;

  // --- Vues de debug qui n'ont pas besoin de la suite -----------------------
  if (uView > 0.5) {
    if (view(2.0)) { gl_FragColor = vec4(srgbToLinear(heat(wet)), 1.0); return; }
    if (view(3.0)) { gl_FragColor = vec4(srgbToLinear(heat(stain)), 1.0); return; }
    if (view(4.0)) { gl_FragColor = vec4(srgbToLinear(heat(flash)), 1.0); return; }
    if (view(5.0)) { gl_FragColor = vec4(srgbToLinear(heat(pigmentLoad)), 1.0); return; }
    if (view(1.0)) { gl_FragColor = vec4(srgbToLinear(heat(coverage * 6.0)), 1.0); return; }
    if (view(9.0)) {
      // Amplitude du warp : ou et de combien le papier deforme la lecture.
      gl_FragColor = vec4(srgbToLinear(heat(length(q - p) * 6.0)), 1.0);
      return;
    }
    if (view(10.0)) {
      // La rampe de pigment seule, a concentration pleine — pour verifier la
      // correspondance frequence -> teinte sans le reste du modele.
      vec4 pl = texture2D(uPalette, vec2(clamp(p.x * 0.5 + 0.5, 0.0, 1.0), 0.5));
      gl_FragColor = vec4(srgbToLinear(uPaper * (1.0 - pl.rgb * clamp(pl.a * 2.0, 0.0, 1.0))), 1.0);
      return;
    }
    if (view(11.0)) {
      // Grille des coordonnees atelier : une case = 0,1 en x comme en y, et un
      // trait franc sur x = 0 et sur la ligne d'horizon y = 0.
      vec2 g = abs(fract(p * 10.0) - 0.5) / fwidth(p * 10.0);
      float grid = 1.0 - min(min(g.x, g.y), 1.0);
      float axes = 1.0 - min(min(abs(p.x) / fwidth(p.x), abs(p.y) / fwidth(p.y)), 1.0);
      vec3 c = mix(uPaper, vec3(0.0, 0.55, 0.95), grid * 0.5);
      c = mix(c, vec3(0.95, 0.1, 0.35), axes);
      gl_FragColor = vec4(srgbToLinear(c), 1.0);
      return;
    }
  }

  // Sortie anticipee sur le papier nu. Le mur couvre tout l'ecran et, sur un
  // morceau normal, la majorite de ses pixels ne portent aucun pigment : tout
  // ce qui suit (flaques, trait) n'aurait rien a y dessiner. Le seuil passe
  // SOUS celui du trait, sinon les boucles seraient coupees net la ou elles
  // doivent justement s'evanouir dans le blanc.
  if (coverage < 0.0025) {
    gl_FragColor = vec4(srgbToLinear(clamp(paper(uPaper), 0.0, 1.0)), 1.0);
    return;
  }

  // Flaques : sans elles le lavis serait un degrade regulier, donc une image
  // de synthese. Le seuil suit la charge de pigment, si bien qu'un passage
  // fort "referme" les trous au lieu de simplement les eclaircir. C'est aussi
  // ce qui laisse respirer le blanc du papier a l'interieur de la tache.
  // Les seuils par defaut sont cales sur la plage REELLE du fbm (~0,3 a 0,65) :
  // plus large, le masque vaut 1 partout et le lavis redevient un degrade lisse.
  float cloud = fbm(q * vec2(1.9, 2.6) + vec2(0.0, -uTime * 0.02));
  float blotch = smoothstep(uBlotchLow, max(uBlotchHigh, uBlotchLow + 0.01), cloud + 0.13 * pigmentLoad);

  float conc = coverage * blotch * uWash;

  // Bord humide : le pigment migre vers la limite de la flaque et s'y
  // accumule en un lisere plus dense. C'est la signature de l'aquarelle, et
  // ce qui distingue une tache d'encre d'un simple degrade.
  float rim = smoothstep(0.02, 0.13, conc) * (1.0 - smoothstep(0.13, 0.38, conc));
  conc += rim * uRim * uWash;
  // Plafonne sous 1 : la fibre du papier doit toujours transparaitre, meme au
  // plus fort du morceau.
  conc = clamp(conc, 0.0, 0.92);

  // --- Pigment --------------------------------------------------------------
  // Il est echantillonne sur une deformation BEAUCOUP plus ample que celle de
  // la densite : les teintes voyagent d'une flaque a l'autre sans que la forme
  // de la tache ne bouge, ce qui est exactement le comportement du
  // mouille-sur-mouille. Sans ca, le mur reste un degrade horizontal propre —
  // lisible, mais ce n'est plus de l'encre.
  float cu = clamp((q.x + (w1.x * 2.2 + w2.x * 1.1) * max(turb, 0.06)) * 0.5 + 0.5, 0.0, 1.0);
  vec4 pal = texture2D(uPalette, vec2(cu, 0.5));
  vec3 absorb = pal.rgb;
  float pigmentGain = pal.a * 2.0;

  // Loi de Beer-Lambert simplifiee : le pigment ABSORBE, il n'emet pas. Sur du
  // papier blanc c'est ce qui donne des teintes franches sans jamais griser —
  // et la meme formule sert au halo comme au trait, seule la concentration
  // change.
  vec3 col = uPaper * (1.0 - absorb * clamp(conc * pigmentGain, 0.0, 0.9));

  if (view(6.0)) { gl_FragColor = vec4(srgbToLinear(heat(blotch)), 1.0); return; }
  if (view(7.0)) { gl_FragColor = vec4(srgbToLinear(heat(conc * 4.0)), 1.0); return; }

  // --- Le trait -------------------------------------------------------------
  // C'est lui qui porte l'image, pas le lavis.
  float lineAlpha = 0.0;
  if (uStroke > 0.001 || view(8.0)) {
    // DEUX passes de plume, a des echelles et des orientations differentes.
    // Une seule donne des boucles concentriques et bien rangees — une carte de
    // niveaux. Deux qui se croisent donnent ce qu'on veut : un trait qui
    // repasse sur lui-meme, comme une main qui boucle sans lever le stylo.
    //
    // L'ecart entre boucles et l'epaisseur varient lentement dans l'espace :
    // c'est ce qui donne les pleins et les delies. Les deux passes lisent le
    // meme champ lent, l'une a l'endroit l'autre a l'envers, pour ne pas
    // enfler et maigrir au meme endroit.
    float slow = fbm3(p * 0.65 + 5.0);
    float weight = uWeight * (0.32 + 0.8 * slow + 0.6 * (w1.y + 0.5));

    float a = penStroke(p, vec2(1.3, 1.8), w1 * 1.9, uSpacingA * (0.55 + 0.55 * slow), uPhase, weight);
    float b = penStroke(p, vec2(2.3, 1.05), w2 * 1.6 + 23.0, uSpacingB * (0.55 + 0.55 * (1.0 - slow)), uPhase * 0.7 + 4.0, weight * 0.85);

    // La plume se leve. Sans ca, une ligne de niveau est une boucle FERMEE :
    // elle revient toujours sur elle-meme et l'oeil y lit une courbe de niveau,
    // pas un geste. En coupant chaque passe sur un champ different, le trait
    // s'interrompt et repart ailleurs — c'est la main qui respire.
    a *= mix(1.0, smoothstep(-0.22, 0.06, w2.y + 0.1 * slow), uLift);
    b *= mix(1.0, smoothstep(-0.20, 0.08, w1.x - 0.1 * slow), uLift);
    float line = max(a, b);

    // Le trait suit le pigment depose, mais il deborde du lavis : c'est lui
    // qui doit s'aventurer dans le blanc, pas la tache.
    float where = smoothstep(0.003, max(uReachInk, 0.004), coverage)
      * (1.0 - uBrightnessMix + uBrightnessMix * uBrightness);
    lineAlpha = clamp(line * where * uStroke, 0.0, 1.0);

    // Meme pigment que le lavis, simplement beaucoup plus charge. Jamais
    // d'encre grise par dessus : le trait EST la couleur de sa frequence.
    float strokeConc = clamp((uStrokeInk + uStrokeInkGain * pigmentLoad) * pigmentGain, 0.0, 1.0);
    vec3 stroke = uPaper * (1.0 - absorb * strokeConc);
    col = mix(col, stroke, lineAlpha);
  }

  if (view(8.0)) { gl_FragColor = vec4(srgbToLinear(heat(lineAlpha)), 1.0); return; }

  gl_FragColor = vec4(srgbToLinear(clamp(paper(col), 0.0, 1.0)), 1.0);
}
`

export function InkWall() {
  const palette = useMemo(() => createInkPalette(), [])
  const phase = useRef(0)
  const clock = useRef(0)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        depthWrite: true,
        fog: false,
        uniforms: {
          uSpectrum: new Uniform(inkField.texture),
          uPalette: new Uniform(palette),
          uPaper: new Uniform(srgb(INK_PAPER)),
          uOrigin: new Uniform(new Vector2(0, INK_BASE_Y)),
          uSpan: new Uniform(new Vector2(1, 1)),
          uTime: new Uniform(0),
          uPhase: new Uniform(0),
          uFlux: new Uniform(0),
          uBeat: new Uniform(0),
          uBrightness: new Uniform(0),
          uWeightStain: new Uniform(0),
          uWeightWet: new Uniform(0),
          uWeightFlash: new Uniform(0),
          uBeatLift: new Uniform(0),
          uReachBase: new Uniform(0),
          uReachGain: new Uniform(0),
          uFalloff: new Uniform(3),
          uSink: new Uniform(0),
          uSideFade: new Uniform(0),
          uBleed: new Uniform(0),
          uFluxWarp: new Uniform(0),
          uBeatWarp: new Uniform(0),
          uWash: new Uniform(0),
          uBlotchLow: new Uniform(0),
          uBlotchHigh: new Uniform(1),
          uRim: new Uniform(0),
          uStroke: new Uniform(0),
          uStrokeInk: new Uniform(0),
          uStrokeInkGain: new Uniform(0),
          uSpacingA: new Uniform(1),
          uSpacingB: new Uniform(1),
          uWeight: new Uniform(1),
          uLift: new Uniform(1),
          uReachInk: new Uniform(0.05),
          uBrightnessMix: new Uniform(0),
          uView: new Uniform(0),
        },
      }),
    [palette],
  )

  useEffect(
    () => () => {
      material.dispose()
      palette.dispose()
    },
    [material, palette],
  )

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta)
    const frame = engine.currentFrame
    const ink = readState().ink

    // Le champ de pigment continue de tourner meme horloge figee : `freeze`
    // arrete la DEFORMATION du papier, pas la musique. C'est ce qui permet de
    // regarder une flaque se former sans que le bruit ne glisse dessous.
    inkField.update(frame, dt, ink)
    if (!ink.freeze) clock.current += dt

    // Phase des boucles a la plume. Elle avance au tempo quand il est connu,
    // sinon a une allure de fond : les boucles doivent deriver, jamais
    // clignoter, sinon le mur redevient un stroboscope.
    const beatsPerSecond = frame.bpm > 0 ? frame.bpm / 60 : 2
    if (!ink.freeze) {
      phase.current += dt * (0.06 + beatsPerSecond * ink.phaseSpeed * (0.25 + frame.level))
    }

    // Les reglages sont relus a chaque frame : un slider doit s'entendre tout
    // de suite (convention du panneau Lighting Designer).
    const u = material.uniforms
    ;(u.uSpan.value as Vector2).set(Math.max(1, ink.span), Math.max(1, ink.rise))
    u.uTime.value = clock.current
    u.uPhase.value = phase.current
    u.uFlux.value = frame.flux
    u.uBeat.value = frame.beat
    u.uBrightness.value = frame.brightness
    u.uWeightStain.value = ink.weightStain
    u.uWeightWet.value = ink.weightWet
    u.uWeightFlash.value = ink.weightFlash
    u.uBeatLift.value = ink.beatLift
    u.uReachBase.value = ink.reachBase
    u.uReachGain.value = ink.reachGain
    u.uFalloff.value = ink.falloff
    u.uSink.value = ink.sink
    u.uSideFade.value = ink.sideFade
    u.uBleed.value = ink.bleed
    u.uFluxWarp.value = ink.fluxWarp
    u.uBeatWarp.value = ink.beatWarp
    u.uWash.value = ink.wash
    u.uBlotchLow.value = ink.blotchLow
    u.uBlotchHigh.value = ink.blotchHigh
    u.uRim.value = ink.rim
    u.uStroke.value = ink.stroke
    u.uStrokeInk.value = ink.strokeInk
    u.uStrokeInkGain.value = ink.strokeInkGain
    u.uSpacingA.value = ink.spacingA
    u.uSpacingB.value = ink.spacingB
    u.uWeight.value = ink.weight
    u.uLift.value = ink.lift
    u.uReachInk.value = ink.reachInk
    u.uBrightnessMix.value = ink.brightnessMix
    u.uView.value = INK_VIEWS.indexOf(ink.view)
  })

  return (
    // renderOrder tres bas : le fond est dessine en premier, tout le reste le
    // recouvre — on ne paie pas deux fois le remplissage de l'ecran.
    <mesh position={[0, WALL_CENTER_Y, WALL_Z]} renderOrder={-10} material={material}>
      <planeGeometry args={[WALL_WIDTH, WALL_HEIGHT]} />
    </mesh>
  )
}

import { useContext, useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposerContext } from '@react-three/postprocessing'
import { Effect, EffectAttribute } from 'postprocessing'
import { Color, Uniform, type Texture } from 'three'
import { readState } from '../state/store'
import { INK_LINE } from './ink'

/**
 * Passe "encre".
 *
 * Elle ne stylise pas une image coloree : elle la REDESSINE. Toutes les
 * surfaces de la scene sont rendues en blanc plat, donc l'image d'entree ne
 * porte pratiquement aucune information de forme — tout le dessin est deduit
 * de la profondeur et des normales :
 *
 *  - un saut de profondeur = une silhouette (contour exterieur) ;
 *  - un saut de normale = une arete (les aretes d'un caisson, le bord d'un
 *    cone de haut-parleur), y compris quand les deux faces sont a la meme
 *    distance de la camera.
 *
 * Le trait a une largeur constante en PIXELS (`lineWidth`), quelle que soit la
 * distance : c'est la regle du croquis a l'encre, un stylo ne s'affine pas
 * parce que l'objet est loin. Les points d'echantillonnage sont decales par un
 * bruit lisse (`wobble`), ce qui suffit a casser l'aspect vectoriel et a
 * donner le tremblement d'un trait a la main.
 *
 * Trois regles de couleur, dans cet ordre :
 *  1. pixel colore => c'est du pigment (le mur d'encre), on le garde tel quel,
 *     teinte et densite (seule couleur de la DA) ;
 *  2. pixel sombre et desature => c'est de l'encre peinte directement dans la
 *     scene (traits de sol, boucles a la plume) ;
 *  3. sinon => papier.
 */

const fragmentShader = /* glsl */ `
uniform sampler2D normalBuffer;
uniform vec3 inkColor;
uniform float lineWidth;
uniform float depthSensitivity;
uniform float normalSensitivity;
uniform float wobbleAmount;
uniform float wobbleScale;
uniform float hatchStrength;
uniform float colorBoost;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Bruit de valeur lisse : c'est lui qui fait trembler le trait. */
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

/** Distance a la camera, en unites monde (positive). */
float viewDistance(const in vec2 uv) {
  return -getViewZ(readDepth(uv));
}

vec3 viewNormal(const in vec2 uv) {
  return texture2D(normalBuffer, uv).xyz * 2.0 - 1.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  // --- Tremblement du trait -------------------------------------------------
  // Deux octaves : une longue ondulation (le trait n'est jamais parfaitement
  // droit) et un grain plus fin (la main n'est pas stable).
  vec2 p = uv * vec2(aspect, 1.0);
  vec2 wob = vec2(
    vnoise(p * wobbleScale) - 0.5 + (vnoise(p * wobbleScale * 4.3 + 11.0) - 0.5) * 0.45,
    vnoise(p * wobbleScale + 19.0) - 0.5 + (vnoise(p * wobbleScale * 4.3 + 71.0) - 0.5) * 0.45
  );
  vec2 suv = uv + wob * texelSize * wobbleAmount;

  // --- Detection des traits -------------------------------------------------
  vec2 o = texelSize * lineWidth;
  float dc = viewDistance(suv);
  float d1 = viewDistance(suv + o);
  float d2 = viewDistance(suv - o);
  float d3 = viewDistance(suv + vec2(o.x, -o.y));
  float d4 = viewDistance(suv + vec2(-o.x, o.y));

  // Courbure de la profondeur (derivee seconde) RAPPORTEE a sa pente
  // (derivee premiere).
  //
  // Un simple gradient de profondeur depend de tout : la distance, l'angle
  // d'incidence, la taille du saut. Deux colonnes separees de 80 cm passaient
  // le seuil de face et le rataient de trois quarts — d'ou des traits qui
  // apparaissaient et disparaissaient pendant un mouvement de camera. Une
  // surface simplement inclinee (l'estrade vue de bas) le franchissait au
  // contraire toute seule.
  //
  // Le rapport courbure / pente vaut ~1 sur TOUTE discontinuite, quelle que
  // soit son amplitude et sa distance, et ~0 sur une surface lisse, meme vue
  // en incidence rasante. Le terme en dc au denominateur n'est qu'un garde
  // fou : sur une surface plate, courbure et pente valent zero toutes les
  // deux, et sans lui le bruit de quantification du depth buffer se
  // retrouverait divise par lui-meme.
  float curvature = abs(d1 + d2 - 2.0 * dc) + abs(d3 + d4 - 2.0 * dc);
  float slope = abs(d1 - d2) + abs(d3 - d4);
  float depthEdge = curvature / (slope + dc * 0.002 + 1e-5) * depthSensitivity * 0.07;

  // Le fond (aucune geometrie) n'a pas de normale exploitable : la passe de
  // normales y renvoie du noir, qui se decoderait en (-1,-1,-1) et cernerait
  // le ciel de traits parasites.
  float background = step(0.9995, readDepth(suv));
  vec3 n = viewNormal(suv);
  float normalEdge = (
    distance(viewNormal(suv + o), viewNormal(suv - o)) +
    distance(viewNormal(suv + vec2(o.x, -o.y)), viewNormal(suv + vec2(-o.x, o.y)))
  ) * normalSensitivity * (1.0 - background);

  float line = smoothstep(0.35, 0.85, max(depthEdge, normalEdge));

  // --- Couleur --------------------------------------------------------------
  vec3 c = texture2D(inputBuffer, suv).rgb;
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = mx > 1e-4 ? (mx - mn) / mx : 0.0;

  // 1. Pigment : la teinte ET sa densite passent telles quelles.
  //
  //    L'ancienne regle ramenait le pixel vers le papier proportionnellement a
  //    sa saturation (mix(paper, hue, sat * k)). La saturation de sortie
  //    valait donc sat x colored, c'est a dire sat AU CARRE : sans consequence
  //    pour une LED (petite source deja tres saturee, qui ressortait intacte),
  //    fatal pour un lavis. Le mur d'encre est fait de degrades doux, et une
  //    zone peinte a 20 % de saturation en ressortait a 7 %, donc blanche.
  //    On remappe desormais la saturation LINEAIREMENT en gardant la luminance
  //    du pixel : une LED reste une LED, un lavis reste un lavis.
  vec3 hue = c / max(mx, 1e-4);
  vec3 base = clamp(1.0 - (1.0 - hue) * colorBoost, 0.0, 1.0) * mx;
  // Sert uniquement de masque aux deux regles suivantes : "ce pixel porte de
  // la couleur, ne le passe pas a l'encre".
  float colored = clamp(sat * 3.0, 0.0, 1.0);

  // 2. Encre peinte dans la scene : uniquement les pixels sombres ET
  //    desatures, pour ne jamais noircir une LED de faible niveau.
  float painted = (1.0 - smoothstep(0.16, 0.60, mx)) * (1.0 - smoothstep(0.05, 0.25, sat));
  base = mix(base, inkColor, painted * (1.0 - colored));

  // 3. Hachures : uniquement sur les surfaces vues en incidence rasante, la
  //    ou un volume a besoin d'etre detache. Partout ailleurs, blanc pur.
  if (hatchStrength > 0.001) {
    // Seuil haut et trait espace : une hachure dense noircit les volumes
    // courbes (membranes, silhouette du danseur) et l'image perd son blanc.
    float grazing = smoothstep(0.80, 0.995, 1.0 - abs(n.z)) * (1.0 - background);
    float stripes = step(0.72, fract((p.x + p.y * 0.75) * 150.0 + vnoise(p * 40.0) * 0.5));
    base = mix(base, inkColor, grazing * stripes * hatchStrength * (1.0 - colored));
  }

  outputColor = vec4(mix(base, inkColor, line), inputColor.a);
}
`

class InkEffectImpl extends Effect {
  constructor() {
    super('InkEffect', fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform<unknown>>([
        ['normalBuffer', new Uniform<Texture | null>(null)],
        ['inkColor', new Uniform(new Color(INK_LINE))],
        ['lineWidth', new Uniform(1.2)],
        ['depthSensitivity', new Uniform(14)],
        // Volontairement basse : une surface COURBE (membrane, epaule du
        // danseur) fait varier sa normale continument, et une sensibilite
        // elevee la noircit de traits jointifs. Une arete franche (90 deg)
        // donne un ecart de ~1.41 et passe largement le seuil, elle.
        ['normalSensitivity', new Uniform(0.5)],
        // Le tremblement est fixe a l'ECRAN : trop marque, il "glisse" sur la
        // geometrie des que la camera bouge (effet porte de douche). Une
        // ondulation longue et peu ample tient le trait sans se voir bouger.
        ['wobbleAmount', new Uniform(1.6)],
        ['wobbleScale', new Uniform(9)],
        ['hatchStrength', new Uniform(0)],
        ['colorBoost', new Uniform(1.35)],
      ]) as Map<string, Uniform<unknown>>,
    })
  }

  set<T>(name: string, value: T) {
    const uniform = this.uniforms.get(name) as Uniform<T> | undefined
    if (uniform) uniform.value = value
  }
}

export function InkEffect() {
  const { normalPass } = useContext(EffectComposerContext)
  const effect = useMemo(() => new InkEffectImpl(), [])

  useLayoutEffect(() => () => effect.dispose(), [effect])

  useFrame(() => {
    // La cible de la passe de normales est recreee a chaque redimensionnement :
    // on relit sa texture chaque frame plutot que de la capturer une fois.
    effect.set('normalBuffer', normalPass ? normalPass.texture : null)

    const visual = readState().visual
    effect.set('lineWidth', visual.inkLine)
    effect.set('wobbleAmount', visual.inkWobble)
    effect.set('hatchStrength', visual.inkHatch)
    effect.set('depthSensitivity', visual.inkContour)
  })

  return <primitive object={effect} dispose={null} />
}

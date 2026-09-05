import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, Uniform, Vector3, DoubleSide } from 'three'
import { engine } from '../audio/engine'
import { INK_VIEWS, readState } from '../state/store'
import { audioTexture } from './audioTexture'
import { INK_PAPER } from './ink'

/**
 * Le mur — visualiseur en cours de reconstruction, brique par brique.
 *
 * Etape 1 : la seule brique en place est le pont audio -> `DataTexture`
 * (voir `audioTexture.ts`). Le shader ne l'utilise que dans la vue debug
 * "spectrum" : il y trace, sur toute la largeur du mur, une barre dont la
 * hauteur suit l'energie de la colonne log-frequence sous le pixel. C'est
 * l'equivalent visuel d'un "affichage de la texture audio" — sur du papier,
 * plus lisible qu'un ruban plat, et une confirmation immediate que le son
 * arrive au GPU.
 *
 * Le rendu reel (`view = off`) reste le papier nu : on ne dessinera rien de
 * definitif tant que le flow field (etape 2) n'est pas en place.
 */

const WALL_Z = -26
const WALL_WIDTH = 300
const WALL_HEIGHT = 150
/** Centre du plan : sa moitie basse passe sous le sol, elle n'est jamais peinte. */
const WALL_CENTER_Y = 50

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
 * Fragment : papier plein par defaut, plus une vue de debug pour l'audio.
 * On garde volontairement les vues de debug dans le shader plutot que dans
 * un materiau separe : elles doivent lire exactement les MEMES uniformes
 * que le rendu reel, sinon elles debuggent autre chose que ce qui tourne.
 */
const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec3 uPaper;
uniform sampler2D uSpectrum;
uniform int uView;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void main() {
  vec3 col = uPaper;

  // 1 = spectrum debug view. On trace la texture audio comme une barre
  // verticale sous chaque colonne, encre pleine sous le niveau, papier
  // au-dessus. C'est la maniere la plus directe de verifier que le son
  // arrive au shader et que la correspondance x -> frequence est bonne.
  if (uView == 1) {
    float level = texture2D(uSpectrum, vec2(vUv.x, 0.5)).r;
    // vUv.y va de 0 en bas a 1 en haut sur le plan. On plafonne le
    // remplissage a 40% de la hauteur pour laisser du papier autour.
    float fill = step(vUv.y, level * 0.4);
    col = mix(uPaper, vec3(0.08, 0.07, 0.06), fill);
  }

  gl_FragColor = vec4(srgbToLinear(col), 1.0);
}
`

export function InkWall() {
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

  useFrame(() => {
    // La texture audio est publiee ici (et pas dans un composant dedie) :
    // elle est mise a jour a la frequence du rendu, jamais plus vite, donc
    // pas de reveil de composant inutile.
    audioTexture.update(engine.currentFrame)
    const ink = readState().ink
    material.uniforms.uView.value = INK_VIEWS.indexOf(ink.view)
  })

  return (
    // renderOrder tres bas : le fond est dessine en premier, tout le reste le
    // recouvre — on ne paie pas deux fois le remplissage de l'ecran.
    <mesh position={[0, WALL_CENTER_Y, WALL_Z]} renderOrder={-10} material={material}>
      <planeGeometry args={[WALL_WIDTH, WALL_HEIGHT]} />
    </mesh>
  )
}

import { useEffect, useMemo } from 'react'
import { ShaderMaterial, Uniform, Vector3, DoubleSide } from 'three'
import { INK_PAPER } from './ink'

/**
 * Le mur — base de depart.
 *
 * On repart d'une feuille blanche : un grand plan a l'arriere de la scene, un
 * shader qui ne fait rien d'autre que poser la couleur du papier. C'est le
 * canevas sur lequel les briques du visualiseur (papier mouille, pigment,
 * trait...) viendront se poser une par une.
 *
 * Le plan reste enorme : ses bords ne doivent jamais entrer dans le cadre,
 * sinon la passe `InkEffect` les cernerait d'un contour et le "papier"
 * deviendrait un objet pose dans la scene.
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
void main() {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uPaper;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void main() {
  gl_FragColor = vec4(srgbToLinear(uPaper), 1.0);
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

  return (
    // renderOrder tres bas : le fond est dessine en premier, tout le reste le
    // recouvre — on ne paie pas deux fois le remplissage de l'ecran.
    <mesh position={[0, WALL_CENTER_Y, WALL_Z]} renderOrder={-10} material={material}>
      <planeGeometry args={[WALL_WIDTH, WALL_HEIGHT]} />
    </mesh>
  )
}

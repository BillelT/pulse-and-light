import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import { Color, DoubleSide, MeshBasicMaterial } from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { useStore } from '../state/store'
import { Dancer } from './Dancer'
import { paletteById } from './palettes'
import { makeCityTexture, makeGratingTexture, makeTileTexture } from './textures'

/** Hauteur du plateau de la regie, en coordonnees monde. */
const PODIUM_TOP = 0.54
const PODIUM_Z = 4.6

/** Geometrie des murs vitres, partagee par le rendu du verre et son habillage. */
const WALL_HEIGHT = 30
const WALL_TOP = 24 // hauteur du haut des baies (WALL_HEIGHT/2 + y du mur)
const BACK_Z = -16
const SIDE_X = 24
const SIDE_Z = 2
const SIDE_LEN = 40

/** Verre des baies : teinte nocturne froide, transmission quasi totale mais
 *  avec une legere absorption qui bleuit ce qu'on voit au travers — un vrai
 *  vitrage epais n'est jamais parfaitement neutre. */
function GlassMaterial() {
  return (
    <meshPhysicalMaterial
      color="#dff5ea"
      transmission={1}
      thickness={0.6}
      attenuationColor="#3a5fae"
      attenuationDistance={6}
      roughness={0.045}
      ior={1.52}
      metalness={0}
      clearcoat={1}
      clearcoatRoughness={0.08}
      envMapIntensity={1.4}
      transparent
      side={DoubleSide}
    />
  )
}

/**
 * Le decor : sol reflechissant, marche lumineuse, podium, regie.
 * Le sol renvoie la lumiere des caissons, c'est lui qui donne la profondeur
 * de la reference.
 */
export function Stage() {
  const paletteId = useStore((s) => s.visual.paletteId)
  const palette = useMemo(() => paletteById(paletteId), [paletteId])

  const grating = useMemo(() => makeGratingTexture(), [])
  const podiumGrating = useMemo(() => {
    const t = makeGratingTexture(18, 3)
    t.repeat.set(6, 6)
    return t
  }, [])
  const tiles = useMemo(() => makeTileTexture(), [])

  const stripMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.ramp[0]) }),
    [palette],
  )
  const rimMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.bands[4]) }),
    [palette],
  )

  useFrame(() => {
    const frame = engine.currentFrame
    // La marche suit les sub-basses : ancrage au sol, decay lent.
    stripMaterial.color.set(palette.ramp[0]).multiplyScalar(0.22 + frame.bands[Band.Sub] * 0.8)
    rimMaterial.color
      .set(palette.bands[4])
      .multiplyScalar(0.3 + frame.bands[Band.High] * 0.8 + frame.beat * 0.3)
  })

  return (
    <group>
      {/* Sol reflechissant. Mat cote PBR : la reflexion vient du miroir, pas du
          lobe speculaire, sinon chaque projecteur laisse une pastille brillante
          au milieu du plateau. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <MeshReflectorMaterial
          resolution={1024}
          mixBlur={1.6}
          mixStrength={18}
          blur={[300, 90]}
          depthScale={1.1}
          minDepthThreshold={0.35}
          maxDepthThreshold={1.35}
          mirror={0.4}
          roughness={1}
          metalness={0}
          color="#211c33"
          roughnessMap={tiles}
        />
      </mesh>

      {/* Ville de nuit au loin : simple texture peinte sur un plan, derriere
          les baies vitrees. Decor de fond, jamais de vraie geometrie. */}
      <CityBackdrop />

      {/* Murs en verre : la transmission laisse voir le fond/la brume au
          travers (plus de noir absolu quand la camera orbite devant la
          scene) tout en gardant un effet de vitre, avec reflets et fresnel. */}
      <mesh position={[0, WALL_HEIGHT / 2, BACK_Z]}>
        <boxGeometry args={[70, WALL_HEIGHT, 0.25]} />
        <GlassMaterial />
      </mesh>
      {[-SIDE_X, SIDE_X].map((x) => (
        <mesh key={x} position={[x, WALL_HEIGHT / 2, SIDE_Z]} rotation-y={(x < 0 ? 1 : -1) * (Math.PI / 2)}>
          <boxGeometry args={[SIDE_LEN, WALL_HEIGHT, 0.25]} />
          <GlassMaterial />
        </mesh>
      ))}

      <RoomTrim />

      {/* Plafond : plan mat sombre, juste assez pour fermer la piece — la
          reference ne montre jamais sa texture, seul le lisere neon compte. */}
      <mesh position={[0, WALL_TOP + 0.3, -7]} rotation-x={Math.PI / 2}>
        <planeGeometry args={[68, 44]} />
        <meshStandardMaterial color="#050408" roughness={1} metalness={0} side={DoubleSide} />
      </mesh>

      {/* Estrade des caissons. */}
      <mesh position={[0, 0.12, -5.5]} receiveShadow castShadow>
        <boxGeometry args={[36, 0.24, 12]} />
        <meshStandardMaterial
          color="#1c1b28"
          roughness={0.85}
          metalness={0.1}
          roughnessMap={grating}
        />
      </mesh>

      <StageEdge stripMaterial={stripMaterial} grating={grating} />

      {/* Podium de la regie. */}
      <mesh position={[0, 0.26, PODIUM_Z]} castShadow receiveShadow>
        <cylinderGeometry args={[2.55, 2.7, 0.52, 48]} />
        <meshStandardMaterial color="#1c1b28" roughness={0.9} metalness={0.08} />
      </mesh>
      <mesh position={[0, PODIUM_TOP, PODIUM_Z]} receiveShadow>
        <cylinderGeometry args={[2.34, 2.34, 0.05, 48]} />
        <meshStandardMaterial
          color="#2c2b3a"
          roughness={0.88}
          metalness={0.08}
          roughnessMap={podiumGrating}
        />
      </mesh>
      {/* Lisere du podium, sur la tranche : une bague posee a plat sur le
          plateau disparaissait en une ligne aliasee vue de face. */}
      <mesh position={[0, 0.42, PODIUM_Z]} material={rimMaterial}>
        <cylinderGeometry args={[2.62, 2.62, 0.06, 48, 1, true]} />
      </mesh>

      <DjBooth />
    </group>
  )
}

/**
 * Nez de scene lumineux.
 *
 * La bande est portee par la face VERTICALE d'une marche, et non couchee sur
 * le sol : une bande horizontale de quelques centimetres vue en incidence
 * rasante se reduit a une ligne d'un pixel qui scintille et bave sur toute la
 * largeur de l'image. Sur une face verticale elle reste nette et lisible.
 */
function StageEdge({
  stripMaterial,
  grating,
}: {
  stripMaterial: MeshBasicMaterial
  grating: ReturnType<typeof makeGratingTexture>
}) {
  return (
    <group position={[0, 0, 0.55]}>
      <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
        <boxGeometry args={[24, 0.22, 1.1]} />
        <meshStandardMaterial
          color="#211f2e"
          roughness={0.86}
          metalness={0.1}
          roughnessMap={grating}
        />
      </mesh>
      {/* Bandeau encastre dans la face avant de la marche. */}
      <mesh position={[0, 0.115, 0.552]} material={stripMaterial}>
        <boxGeometry args={[23.4, 0.075, 0.02]} />
      </mesh>
    </group>
  )
}

/** Regie : table, mixeur, operateur. */
function DjBooth() {
  const paletteId = useStore((s) => s.visual.paletteId)
  const palette = useMemo(() => paletteById(paletteId), [paletteId])
  const ledsMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.bands[3]) }),
    [palette],
  )

  useFrame(() => {
    const frame = engine.currentFrame
    ledsMaterial.color.set(palette.bands[3]).multiplyScalar(0.4 + frame.bands[Band.Mid] * 1.8)
  })

  return (
    <group position={[0, PODIUM_TOP, PODIUM_Z]}>
      {/* Table pleine plutot que quatre pieds isoles : de face, les pieds fins
          se lisaient comme des traits flottants au dessus du podium. */}
      <mesh position={[0, 1.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.7, 0.08, 1]} />
        <meshStandardMaterial color="#2a2836" roughness={0.8} metalness={0.14} />
      </mesh>
      <mesh position={[0, 0.5, 0.42]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.98, 0.09]} />
        <meshStandardMaterial color="#1a1926" roughness={0.86} metalness={0.1} />
      </mesh>
      {[-1.28, 1.28].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]} castShadow>
          <boxGeometry args={[0.08, 0.98, 0.92]} />
          <meshStandardMaterial color="#232231" roughness={0.84} metalness={0.12} />
        </mesh>
      ))}

      {/* Mixeur. */}
      <mesh position={[0, 1.11, 0.04]} castShadow>
        <boxGeometry args={[1.5, 0.1, 0.56]} />
        <meshStandardMaterial color="#2e2d3d" roughness={0.78} metalness={0.16} />
      </mesh>
      <mesh position={[0, 1.163, -0.15]} material={ledsMaterial}>
        <boxGeometry args={[1.3, 0.014, 0.05]} />
      </mesh>

      <group position={[0, 0, -0.72]}>
        <Dancer />
      </group>
    </group>
  )
}

/**
 * Ville de nuit derriere le mur du fond et la baie de droite : deux plans
 * texture, immobiles. Le mur de gauche reste sombre et reflechissant, comme
 * sur la reference — seul un cote de la piece ouvre sur la ville.
 */
function CityBackdrop() {
  const city = useMemo(() => makeCityTexture(), [])

  return (
    <>
      <mesh position={[0, WALL_TOP * 0.7, BACK_Z - 38]}>
        <planeGeometry args={[150, 64]} />
        <meshBasicMaterial map={city} toneMapped fog />
      </mesh>
      <mesh position={[SIDE_X + 38, WALL_TOP * 0.7, SIDE_Z]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[130, 64]} />
        <meshBasicMaterial map={city} toneMapped fog />
      </mesh>
    </>
  )
}

/**
 * Lisere neon qui souligne la jonction murs/plafond, comme sur la reference.
 * Fixe (pas de reactivite audio ici) : c'est un trait d'architecture, pas un
 * element du visualiseur.
 */
function RoomTrim() {
  const paletteId = useStore((s) => s.visual.paletteId)
  const palette = useMemo(() => paletteById(paletteId), [paletteId])
  const trimMaterial = useMemo(
    () => new MeshBasicMaterial({ toneMapped: false, color: new Color(palette.bands[4]).multiplyScalar(1.6) }),
    [palette],
  )

  return (
    <group>
      {/* Lisere haut du mur du fond. */}
      <mesh position={[0, WALL_TOP, BACK_Z + 0.14]} material={trimMaterial}>
        <boxGeometry args={[70, 0.05, 0.05]} />
      </mesh>
      {/* Liseres hauts des murs lateraux. */}
      {[-SIDE_X, SIDE_X].map((x) => (
        <mesh
          key={x}
          position={[x + (x < 0 ? 0.14 : -0.14), WALL_TOP, SIDE_Z]}
          material={trimMaterial}
        >
          <boxGeometry args={[0.05, 0.05, SIDE_LEN]} />
        </mesh>
      ))}
      {/* Angles verticaux ou le fond rencontre les cotes. */}
      {[-35, 35].map((x) => (
        <mesh key={x} position={[x, WALL_TOP / 2, BACK_Z + 0.14]} material={trimMaterial}>
          <boxGeometry args={[0.05, WALL_TOP, 0.05]} />
        </mesh>
      ))}
    </group>
  )
}

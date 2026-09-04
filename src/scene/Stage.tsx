import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshReflectorMaterial } from '@react-three/drei'
import {
  Color,
  DoubleSide,
  LinearFilter,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import { engine } from '../audio/engine'
import { Band } from '../audio/bands'
import { useStore } from '../state/store'
import { Dancer } from './Dancer'
import { INK_SURFACE } from './ink'
import { paletteById } from './palettes'
import { BACK_WIDTH, BACK_Z, SIDE_LEN, SIDE_X, SIDE_Z, WALL_HEIGHT, WALL_TOP, WALL_Y } from './roomLayout'
import { makeCityTexture, makeGratingTexture, makeTileTexture } from './textures'

/**
 * Feuille de sprites ville de nuit, optionnelle : 4 bandes empilees (FRONT,
 * RIGHT, BACK, LEFT, dans cet ordre de haut en bas), chacune 1536x256. On
 * n'utilise que 3 bandes : FRONT derriere le mur du fond, LEFT/RIGHT derriere
 * les murs lateraux — BACK ne sert pas, la piece n'a pas de quatrieme baie.
 * Tant qu'aucun fichier n'existe a ce chemin, la skyline generee en canvas
 * (`makeCityTexture`) reste affichee automatiquement — aucun crash.
 */
const CITY_SHEET_URL = '/test.png'
const CITY_SHEET_BAND_ASPECT = 1536 / 256
const CITY_SHEET_BANDS = { front: 0.75, right: 0.5, left: 0 } as const
const CITY_SHEET_BAND_HEIGHT = 0.25

/** Hauteur du plateau de la regie, en coordonnees monde. */
const PODIUM_TOP = 0.54
const PODIUM_Z = 4.6

/**
 * Empreinte reelle des murs au sol (marge 0) : sert de reference fixe pour
 * comparer visuellement au sol reglable (contour "murs" du debuggeur).
 * Les murs lateraux vont plus loin vers le fond (SIDE_Z - SIDE_LEN / 2) que
 * le mur du fond lui-meme (BACK_Z), d'ou le min().
 */
const WALL_FOOTPRINT_BACK_Z = Math.min(BACK_Z, SIDE_Z - SIDE_LEN / 2)
const WALL_FOOTPRINT_WIDTH = BACK_WIDTH

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
  const ink = useStore((s) => s.visual.ink)

  const floorMarginX = useStore((s) => s.debug.floorMarginX)
  const floorMarginBack = useStore((s) => s.debug.floorMarginBack)
  const floorFrontZ = useStore((s) => s.debug.floorFrontZ)
  const floorShowOutline = useStore((s) => s.debug.floorShowOutline)
  const floorShowWallOutline = useStore((s) => s.debug.floorShowWallOutline)

  // Sol reflechissant : cale sur l'empreinte reelle de la piece plutot qu'un
  // carre arbitraire. Un sol plus grand que les murs debordait derriere le
  // mur du fond et au-dela des murs lateraux ; le miroir y reflechissait
  // quand meme le lisere neon du plafond (tres lumineux), qui apparaissait
  // comme un trait flottant sans aucun mur pour l'expliquer. A l'inverse, une
  // marge positive laisse un joint sans sol NI mur entre le bord du miroir et
  // les murs (visible a angle rasant) : d'ou des marges reglables ici, en
  // debug, plutot que figees — floorMarginX/floorMarginBack negatifs font
  // mordre le sol sous les murs pour coller sans joint.
  const floorBackZ = WALL_FOOTPRINT_BACK_Z + floorMarginBack
  const floorWidth = WALL_FOOTPRINT_WIDTH - floorMarginX * 2
  const floorDepth = floorFrontZ - floorBackZ
  const floorCenterZ = (floorFrontZ + floorBackZ) / 2

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
      {/* Sol de la DA encre : la dalle de la terrasse. */}
      {ink && <InkTerrace />}

      {/* Sol reflechissant. Mat cote PBR : la reflexion vient du miroir, pas du
          lobe speculaire, sinon chaque projecteur laisse une pastille brillante
          au milieu du plateau. */}
      {!ink && (
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, floorCenterZ]} receiveShadow>
        <planeGeometry args={[floorWidth, floorDepth]} />
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
      )}

      {/* Contour du sol reglable, en fil de fer : le miroir ne peut pas
          s'afficher en wireframe, ce contour donne quand meme ses bords
          exacts pour regler les marges a l'oeil (debuggeur, onglet Debug). */}
      {floorShowOutline && (
        <lineSegments position={[0, 0.02, floorCenterZ]} rotation-x={-Math.PI / 2}>
          <edgesGeometry args={[new PlaneGeometry(floorWidth, floorDepth)]} />
          <lineBasicMaterial color="#ff2f6d" toneMapped={false} />
        </lineSegments>
      )}
      {/* Contour de l'empreinte des murs (marge 0), pour comparer au contour
          du sol ci-dessus pendant le reglage. */}
      {floorShowWallOutline && (
        <lineSegments
          position={[0, 0.03, (45 + WALL_FOOTPRINT_BACK_Z) / 2]}
          rotation-x={-Math.PI / 2}
        >
          <edgesGeometry
            args={[new PlaneGeometry(WALL_FOOTPRINT_WIDTH, 45 - WALL_FOOTPRINT_BACK_Z)]}
          />
          <lineBasicMaterial color="#2fe6ff" toneMapped={false} />
        </lineSegments>
      )}

      {/* Ville de nuit au loin : simple texture peinte sur un plan, derriere
          les baies vitrees. Decor de fond, jamais de vraie geometrie. */}
      <CityBackdrop />

      {/* Murs en verre, lisere neon et plafond : toute la boite disparait en
          mode encre. Le croquis de reference ne montre aucune piece — la
          scenographie flotte dans le blanc, devant la skyline. Les limites de
          camera, elles, restent celles de la piece. */}
      {!ink && (
        <>
          <mesh position={[0, WALL_Y, BACK_Z]}>
            <boxGeometry args={[BACK_WIDTH, WALL_HEIGHT, 0.25]} />
            <GlassMaterial />
          </mesh>
          {[-SIDE_X, SIDE_X].map((x) => (
            <mesh
              key={x}
              position={[x, WALL_Y, SIDE_Z]}
              rotation-y={(x < 0 ? 1 : -1) * (Math.PI / 2)}
            >
              <boxGeometry args={[SIDE_LEN, WALL_HEIGHT, 0.25]} />
              <GlassMaterial />
            </mesh>
          ))}

          <RoomTrim />

          {/* Plafond : plan mat sombre, juste assez pour fermer la piece — la
              reference ne montre jamais sa texture, seul le lisere neon compte. */}
          <mesh position={[0, WALL_TOP + 0.3, SIDE_Z]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[BACK_WIDTH + 4, SIDE_LEN + 4]} />
            <meshStandardMaterial color="#050408" roughness={1} metalness={0} side={DoubleSide} />
          </mesh>
        </>
      )}

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

      <StageEdge stripMaterial={stripMaterial} grating={grating} ink={ink} />

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
          plateau disparaissait en une ligne aliasee vue de face.
          En encre, tous les liseres lumineux du decor tombent : la seule
          couleur autorisee est celle des colonnes. */}
      {!ink && (
        <mesh position={[0, 0.42, PODIUM_Z]} material={rimMaterial}>
          <cylinderGeometry args={[2.62, 2.62, 0.06, 48, 1, true]} />
        </mesh>
      )}

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
  ink,
}: {
  stripMaterial: MeshBasicMaterial
  grating: ReturnType<typeof makeGratingTexture>
  ink: boolean
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
      {!ink && (
        <mesh position={[0, 0.115, 0.552]} material={stripMaterial}>
          <boxGeometry args={[23.4, 0.075, 0.02]} />
        </mesh>
      )}
    </group>
  )
}

/** Regie : table, mixeur, operateur. */
function DjBooth() {
  const paletteId = useStore((s) => s.visual.paletteId)
  const palette = useMemo(() => paletteById(paletteId), [paletteId])
  const ink = useStore((s) => s.visual.ink)
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
      {!ink && (
        <mesh position={[0, 1.163, -0.15]} material={ledsMaterial}>
          <boxGeometry args={[1.3, 0.014, 0.05]} />
        </mesh>
      )}

      <group position={[0, 0, -0.72]}>
        <Dancer />
      </group>
    </group>
  )
}

/**
 * Charge la feuille de sprites ville si elle existe, sinon garde la skyline
 * generee. Chargement manuel (pas useLoader/useTexture de drei) : ces hooks
 * suspendent et font planter l'arbre R3F quand le fichier est absent, alors
 * qu'ici l'absence de fichier est un cas normal — pas une erreur.
 */
function useCitySheet(url: string): { texture: Texture; isSheet: boolean } {
  const fallback = useMemo(() => makeCityTexture(), [])
  const [state, setState] = useState<{ texture: Texture; isSheet: boolean }>({
    texture: fallback,
    isSheet: false,
  })

  useEffect(() => {
    let cancelled = false
    const loader = new TextureLoader()
    loader.load(
      url,
      (loaded) => {
        if (cancelled) return
        loaded.colorSpace = SRGBColorSpace
        loaded.anisotropy = 4
        // Mipmaps disabled: each plane only shows a thin strip (25% of the
        // height) via repeat/offset, but mipmaps are computed on the WHOLE
        // image. At coarse levels, the white borders separating the strips
        // in the sprite sheet started bleeding into the displayed strip —
        // a stray bright line, visible from afar on the side walls. The
        // plane is already blurry enough (fog, glass) that the lack of
        // mipmaps doesn't create moiré.
        loaded.generateMipmaps = false
        loaded.minFilter = LinearFilter
        loaded.magFilter = LinearFilter
        setState({ texture: loaded, isSheet: true })
      },
      undefined,
      () => {
        /* pas de feuille fournie : on garde la skyline generee, silencieusement. */
      },
    )
    return () => {
      cancelled = true
    }
  }, [url])

  return state
}

/**
 * Cadre une bande de la feuille de sprites sur un plan d'aspect donne, sans
 * jamais l'etirer : on rogne la largeur de la bande (elle est bien plus large
 * que haute) au lieu de la comprimer verticalement, sinon les points
 * lumineux ronds de la photo deviennent des ellipses.
 */
function fitSheetBand(tex: Texture, band: keyof typeof CITY_SHEET_BANDS, planeAspect: number) {
  const uSpan = Math.min(1, planeAspect / CITY_SHEET_BAND_ASPECT)
  tex.repeat.set(uSpan, CITY_SHEET_BAND_HEIGHT)
  tex.offset.set((1 - uSpan) / 2, CITY_SHEET_BANDS[band])
  tex.needsUpdate = true
}

/** Cadrage "cover" de secours pour la skyline generee (pas une bande a rogner). */
function fitFallback(tex: Texture) {
  tex.repeat.set(1, 1)
  tex.offset.set(0, 0)
  tex.needsUpdate = true
}

const BACKDROP_BACK_SIZE: [number, number] = [110, 56]
const BACKDROP_SIDE_SIZE: [number, number] = [90, 56]

/**
 * La terrasse de la DA "ink".
 *
 * La scenographie est posee sur une dalle finie, qui flotte dans le blanc :
 * ni murs, ni ville, ni horizon dessine. C'est le parti pris de la DA — le
 * decor tient dans ce que la scene elle-meme raconte, tout le reste est du
 * papier.
 */
const INK_TERRACE_X = 78
const INK_TERRACE_BACK_Z = BACK_Z - 70
const INK_TERRACE_FRONT_Z = 70
const INK_TERRACE_THICKNESS = 0.8

/**
 * Ville de nuit derriere les trois baies (fond, gauche, droite) : trois plans
 * texture, immobiles, chacun montrant la bande correspondante de la feuille
 * de sprites (ou la skyline generee tant qu'elle n'est pas fournie).
 */
function CityBackdrop() {
  const ink = useStore((s) => s.visual.ink)
  const { texture: base, isSheet } = useCitySheet(CITY_SHEET_URL)
  // Trois plans, trois cadrages : chacun a besoin de son propre repeat/offset,
  // donc de son propre clone plutot que de partager l'instance de texture.
  const backTex = useMemo(() => base.clone(), [base])
  const leftTex = useMemo(() => base.clone(), [base])
  const rightTex = useMemo(() => base.clone(), [base])

  useEffect(() => {
    if (isSheet) fitSheetBand(backTex, 'front', BACKDROP_BACK_SIZE[0] / BACKDROP_BACK_SIZE[1])
    else fitFallback(backTex)
  }, [backTex, isSheet])
  useEffect(() => {
    if (isSheet) fitSheetBand(leftTex, 'left', BACKDROP_SIDE_SIZE[0] / BACKDROP_SIDE_SIZE[1])
    else fitFallback(leftTex)
  }, [leftTex, isSheet])
  useEffect(() => {
    if (isSheet) fitSheetBand(rightTex, 'right', BACKDROP_SIDE_SIZE[0] / BACKDROP_SIDE_SIZE[1])
    else fitFallback(rightTex)
  }, [rightTex, isSheet])

  // En DA encre, il n'y a pas de ville : la scenographie flotte dans le blanc.
  // Les hooks au dessus tournent quand meme — ils ne coutent rien et evitent de
  // rendre le composant conditionnel a l'appelant.
  if (ink) return null

  const y = WALL_TOP * 0.75

  return (
    <>
      <mesh position={[0, y, BACK_Z - 16]}>
        <planeGeometry args={BACKDROP_BACK_SIZE} />
        <meshBasicMaterial map={backTex} toneMapped fog />
      </mesh>
      <mesh position={[-(SIDE_X + 16), y, SIDE_Z]} rotation-y={Math.PI / 2}>
        <planeGeometry args={BACKDROP_SIDE_SIZE} />
        <meshBasicMaterial map={leftTex} toneMapped fog />
      </mesh>
      <mesh position={[SIDE_X + 16, y, SIDE_Z]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={BACKDROP_SIDE_SIZE} />
        <meshBasicMaterial map={rightTex} toneMapped fog />
      </mesh>
    </>
  )
}

/**
 * La dalle sur laquelle tout repose.
 *
 * Une VRAIE dalle, pas un plan infini : ses trois bords arriere coincident
 * exactement avec les trois plans de ville, si bien que les tours partent du
 * bord du sol au lieu de flotter. Son epaisseur est visible sur la tranche
 * avant — c'est elle qui dit qu'on est sur une terrasse en hauteur, et non sur
 * un sol qui continuerait a l'infini.
 */
function InkTerrace() {
  const depth = INK_TERRACE_FRONT_Z - INK_TERRACE_BACK_Z
  const centerZ = (INK_TERRACE_FRONT_Z + INK_TERRACE_BACK_Z) / 2
  return (
    <mesh position={[0, -INK_TERRACE_THICKNESS / 2, centerZ]}>
      <boxGeometry args={[INK_TERRACE_X * 2, INK_TERRACE_THICKNESS, depth]} />
      <meshBasicMaterial color={INK_SURFACE} fog={false} />
    </mesh>
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
        <boxGeometry args={[BACK_WIDTH, 0.05, 0.05]} />
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
      {/* Angles verticaux ou le fond rencontre les cotes : memes abscisses que
          les murs lateraux, sinon le poste flotte hors de tout mur. */}
      {[-SIDE_X, SIDE_X].map((x) => (
        <mesh key={x} position={[x, WALL_TOP / 2, BACK_Z + 0.14]} material={trimMaterial}>
          <boxGeometry args={[0.05, WALL_TOP, 0.05]} />
        </mesh>
      ))}
    </group>
  )
}

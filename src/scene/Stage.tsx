import { INK_SURFACE } from './ink'

/**
 * Le decor.
 *
 * DA "ink" : la scenographie flotte dans le blanc, sur une dalle finie — ni
 * murs, ni ville, ni horizon dessine, ni podium, ni regie. Une seule surface,
 * la terrasse sur laquelle la foule danse.
 */

const TERRACE_X = 50
const TERRACE_BACK_Z = -26.1
const TERRACE_FRONT_Z = 53
const TERRACE_THICKNESS = 0.2

export function Stage() {
  const depth = TERRACE_FRONT_Z - TERRACE_BACK_Z
  const centerZ = (TERRACE_FRONT_Z + TERRACE_BACK_Z) / 2
  return (
    <mesh position={[0, -TERRACE_THICKNESS / 2, centerZ]}>
      <boxGeometry args={[TERRACE_X * 2, TERRACE_THICKNESS, depth]} />
      <meshBasicMaterial color={INK_SURFACE} fog={false} />
    </mesh>
  )
}

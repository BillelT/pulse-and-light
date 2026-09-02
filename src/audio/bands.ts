/**
 * Decoupage frequentiel issu de la PARTIE 1 du brief (correspondance
 * frequence sonore -> cible scenographique -> couleur).
 *
 * Les couleurs sont volontairement "tirees" vers une palette restreinte
 * (cf. PARTIE 3.1 : forcer une palette plutot que de mapper tout le spectre
 * visible, qui rend un resultat arc-en-ciel chaotique).
 */

export const BAND_COUNT = 6

export const enum Band {
  Sub = 0,
  Bass = 1,
  LowMid = 2,
  Mid = 3,
  HighMid = 4,
  High = 5,
}

export interface BandSpec {
  readonly id: Band
  readonly key: string
  readonly label: string
  /** Bornes en Hz. */
  readonly from: number
  readonly to: number
  /** Cible scenographique (documentaire, affichee dans le HUD). */
  readonly target: string
  /** Couleur "scientifique" du brief, en hex. */
  readonly hex: number
}

export const BANDS: readonly BandSpec[] = [
  {
    id: Band.Sub,
    key: 'sub',
    label: 'SUB',
    from: 20,
    to: 60,
    target: 'Caissons / sol',
    hex: 0xff1a2e,
  },
  {
    id: Band.Bass,
    key: 'bass',
    label: 'BASS',
    from: 60,
    to: 250,
    target: 'Stacks bas / wash',
    hex: 0xff4d00,
  },
  {
    id: Band.LowMid,
    key: 'lowMid',
    label: 'LOW-MID',
    from: 250,
    to: 500,
    target: 'Ambiance',
    hex: 0xffc400,
  },
  {
    id: Band.Mid,
    key: 'mid',
    label: 'MID',
    from: 500,
    to: 2000,
    target: 'Corps / melodie',
    hex: 0x9dff36,
  },
  {
    id: Band.HighMid,
    key: 'highMid',
    label: 'HIGH-MID',
    from: 2000,
    to: 4000,
    target: 'Beams / lasers',
    hex: 0x1affc8,
  },
  {
    id: Band.High,
    key: 'high',
    label: 'AIR',
    from: 4000,
    to: 16000,
    target: 'Strobes / lignes LED',
    hex: 0x5ec8ff,
  },
] as const

/** Bande de frequence a laquelle appartient une frequence donnee. */
export function bandOfFrequency(hz: number): Band {
  for (const b of BANDS) {
    if (hz < b.to) return b.id
  }
  return Band.High
}

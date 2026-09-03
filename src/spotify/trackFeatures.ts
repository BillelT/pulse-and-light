/**
 * Client du proxy `/api/track-features` — complement quand Spotify audio-features
 * et audio-analysis sont indisponibles (403 pour les apps creees apres nov. 2024).
 * Voir `api/track-features.ts` pour le pourquoi du proxy (CORS) et l'ordre des sources
 * (ReccoBeats en priorite, Deezer en secours).
 */
export interface TrackFeatures {
  found: boolean
  source: 'reccobeats' | 'deezer' | 'none'
  tempo: number | null
  loudness: number | null
  energy: number | null
  danceability: number | null
  valence: number | null
  acousticness: number | null
  instrumentalness: number | null
  speechiness: number | null
  key: number | null
  mode: number | null
  timeSignature: number | null
}

const NOT_FOUND: TrackFeatures = {
  found: false,
  source: 'none',
  tempo: null,
  loudness: null,
  energy: null,
  danceability: null,
  valence: null,
  acousticness: null,
  instrumentalness: null,
  speechiness: null,
  key: null,
  mode: null,
  timeSignature: null,
}

/** Cache en memoire : une piste redemandee (replay, boucle) ne refait pas d'appel reseau. */
const cache = new Map<string, Promise<TrackFeatures>>()

export function getTrackFeatures(
  spotifyId: string,
  artist: string,
  title: string,
): Promise<TrackFeatures> {
  const key = spotifyId || `${artist}::${title}`.toLowerCase()
  let pending = cache.get(key)
  if (!pending) {
    const params = new URLSearchParams({ spotifyId, artist, title })
    pending = fetch(`/api/track-features?${params}`)
      .then((res) => (res.ok ? (res.json() as Promise<TrackFeatures>) : NOT_FOUND))
      .catch(() => NOT_FOUND)
    cache.set(key, pending)
  }
  return pending
}

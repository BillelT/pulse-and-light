/**
 * Client du proxy `/api/deezer-track` — complement quand Spotify audio-features
 * et audio-analysis sont indisponibles (403 pour les apps creees apres nov. 2024).
 * Voir `api/deezer-track.ts` pour le pourquoi du proxy (CORS).
 */
export interface DeezerFeatures {
  found: boolean
  bpm: number | null
  gain: number | null
}

const NOT_FOUND: DeezerFeatures = { found: false, bpm: null, gain: null }

/** Cache en memoire : une piste redemandee (replay, boucle) ne refait pas d'appel reseau. */
const cache = new Map<string, Promise<DeezerFeatures>>()

export function getDeezerFeatures(artist: string, title: string): Promise<DeezerFeatures> {
  const key = `${artist}::${title}`.toLowerCase()
  let pending = cache.get(key)
  if (!pending) {
    const params = new URLSearchParams({ artist, title })
    pending = fetch(`/api/deezer-track?${params}`)
      .then((res) => (res.ok ? (res.json() as Promise<DeezerFeatures>) : NOT_FOUND))
      .catch(() => NOT_FOUND)
    cache.set(key, pending)
  }
  return pending
}

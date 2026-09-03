/**
 * Client du proxy `/api/itunes-preview` — voir `api/itunes-preview.ts` pour
 * le pourquoi (CORS potentiel + rate-limit iTunes) et l'ordre des sources
 * (ISRC en priorite, recherche artiste/titre en secours).
 *
 * Cache double niveau : en memoire (evite un fetch en double dans la meme
 * session, ex. retour arriere sur un morceau deja vu) et en localStorage
 * (survit au rechargement de page — la doc de decision demande explicitement
 * de ne jamais retenter un extrait deja resolu).
 */
export interface ItunesPreviewResult {
  found: boolean
  previewUrl: string | null
  source: 'isrc' | 'search' | 'none'
}

const NOT_FOUND: ItunesPreviewResult = { found: false, previewUrl: null, source: 'none' }
const STORAGE_KEY = 'pulse-itunes-preview-cache-v1'
const memoryCache = new Map<string, Promise<ItunesPreviewResult>>()

function readPersisted(): Record<string, ItunesPreviewResult> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ItunesPreviewResult>) : {}
  } catch {
    return {}
  }
}

function persist(key: string, value: ItunesPreviewResult) {
  try {
    const all = readPersisted()
    all[key] = value
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Quota depasse / navigation privee : le cache memoire suffit pour la session.
  }
}

/**
 * @param spotifyId Cle de cache primaire — dispo meme avant que l'ISRC soit connu
 *   (ex. pre-fetch de la piste suivante annoncee par le Web Playback SDK).
 * @param isrc Si connu, priorise le matching exact cote serveur.
 */
export function getItunesPreview(
  spotifyId: string | null,
  isrc: string | null,
  artist: string,
  title: string,
  durationMs: number,
): Promise<ItunesPreviewResult> {
  const key = spotifyId || `${artist}::${title}`.toLowerCase()
  let pending = memoryCache.get(key)
  if (!pending) {
    const persisted = readPersisted()[key]
    if (persisted) {
      pending = Promise.resolve(persisted)
    } else {
      const params = new URLSearchParams({ artist, title, durationMs: String(durationMs) })
      if (isrc) params.set('isrc', isrc)
      pending = fetch(`/api/itunes-preview?${params}`)
        .then((res) => (res.ok ? (res.json() as Promise<ItunesPreviewResult>) : NOT_FOUND))
        .then((result) => {
          persist(key, result)
          return result
        })
        .catch(() => NOT_FOUND)
    }
    memoryCache.set(key, pending)
  }
  return pending
}

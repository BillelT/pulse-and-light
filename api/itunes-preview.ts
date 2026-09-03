/**
 * Proxy serverless (Vercel Edge Function) vers l'API publique iTunes Search —
 * pivot du mode Spotify : au lieu d'inventer un spectre a partir de scalaires
 * (cf. `spotifyTimelineSource.ts`), on recupere un extrait audio libre de DRM
 * (30s, meme master) pour une vraie analyse FFT cote client.
 *
 * Matching en deux temps :
 *  1. ISRC (`/lookup?isrc=`) — cible directement le master exact, pas de faux
 *     positif remix/live. C'est la source de l'ISRC (`/v1/tracks/{id}`) qui
 *     n'est PAS touchee par la fermeture Spotify de nov. 2024, contrairement
 *     a audio-features/audio-analysis.
 *  2. A defaut (piste sans ISRC transmis, ou absente du catalogue iTunes sous
 *     cet ISRC) : recherche artiste+titre, avec un score de correspondance
 *     (nom normalise + duree) pour ecarter les faux positifs plutot que de
 *     prendre le premier resultat venu.
 *
 * Si rien n'est trouve (catalogue iTunes incomplet sur certaines regions/
 * exclusivites), on renvoie `found: false` : le client retombe alors sur la
 * resynthese procedurale existante, sans jamais d'ecran noir.
 */
export const config = { runtime: 'edge' }

interface ItunesPreviewResult {
  found: boolean
  previewUrl: string | null
  source: 'isrc' | 'search' | 'none'
}

interface ItunesTrack {
  previewUrl?: string
  trackName?: string
  artistName?: string
  trackTimeMillis?: number
  kind?: string
}

const DIACRITICS = /[\u0300-\u036f]/g

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()
}

async function lookupByIsrc(isrc: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?isrc=${encodeURIComponent(isrc)}&entity=song`,
    )
    if (!res.ok) return null
    const body = (await res.json()) as { results?: ItunesTrack[] }
    const hit = body.results?.find((r) => r.kind === 'song' && r.previewUrl)
    return hit?.previewUrl ?? null
  } catch {
    return null
  }
}

/** Score de correspondance artiste/titre/duree — evite de prendre un remix ou un live. */
function matchScore(candidate: ItunesTrack, artist: string, title: string, durationMs: number): number {
  const cArtist = normalize(candidate.artistName ?? '')
  const cTitle = normalize(candidate.trackName ?? '')
  const nArtist = normalize(artist)
  const nTitle = normalize(title)

  let score = 0
  if (cArtist === nArtist) score += 3
  else if (cArtist.includes(nArtist) || nArtist.includes(cArtist)) score += 1.5
  if (cTitle === nTitle) score += 3
  else if (cTitle.includes(nTitle) || nTitle.includes(cTitle)) score += 1.5
  if (durationMs > 0 && candidate.trackTimeMillis) {
    const driftSec = Math.abs(candidate.trackTimeMillis - durationMs) / 1000
    score += Math.max(0, 2 - driftSec / 5)
  }
  return score
}

async function searchByArtistTitle(
  artist: string,
  title: string,
  durationMs: number,
): Promise<string | null> {
  try {
    const term = `${artist} ${title}`
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5`,
    )
    if (!res.ok) return null
    const body = (await res.json()) as { results?: ItunesTrack[] }
    const candidates = (body.results ?? []).filter((r) => r.kind === 'song' && r.previewUrl)
    if (candidates.length === 0) return null

    let best: ItunesTrack | null = null
    let bestScore = -Infinity
    for (const c of candidates) {
      const score = matchScore(c, artist, title, durationMs)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    // Sous ce seuil, la meilleure entree n'est deja plus fiable : mieux vaut
    // le fallback procedural qu'un extrait qui n'a rien a voir.
    return bestScore > 2 ? (best?.previewUrl ?? null) : null
  } catch {
    return null
  }
}

const NOT_FOUND: ItunesPreviewResult = { found: false, previewUrl: null, source: 'none' }

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const isrc = url.searchParams.get('isrc')?.trim()
  const artist = url.searchParams.get('artist')?.trim() ?? ''
  const title = url.searchParams.get('title')?.trim() ?? ''
  const durationMs = Number(url.searchParams.get('durationMs') ?? '0')

  let previewUrl = isrc ? await lookupByIsrc(isrc) : null
  let source: ItunesPreviewResult['source'] = previewUrl ? 'isrc' : 'none'

  if (!previewUrl && artist && title) {
    previewUrl = await searchByArtistTitle(artist, title, durationMs)
    if (previewUrl) source = 'search'
  }

  const result: ItunesPreviewResult = previewUrl ? { found: true, previewUrl, source } : NOT_FOUND

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Un extrait iTunes ne change jamais pour un morceau donne : cache longue duree.
      'cache-control': 'public, max-age=604800, stale-while-revalidate=86400',
    },
  })
}

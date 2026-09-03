/**
 * Proxy serverless (Vercel Edge Function) vers ReccoBeats (primaire) puis
 * Deezer (secours) — les deux exposent cote serveur pour eviter le CORS
 * (aucun des deux n'envoie d'en-tetes CORS utilisables depuis le navigateur).
 *
 * Pourquoi deux sources : Spotify a ferme audio-features/audio-analysis aux
 * apps creees apres nov. 2024. ReccoBeats reconstruit le meme schema de
 * features (energy, danceability, valence, acousticness, instrumentalness,
 * speechiness, loudness, tempo) a partir d'un ID Spotify — c'est la source
 * la plus complete quand elle trouve le morceau. Deezer, en secours, n'a
 * que tempo (bpm, souvent absent) et loudness (gain), mais sa base est
 * plus large.
 *
 * ATTENTION : le contrat exact de l'API ReccoBeats (forme de la reponse)
 * n'a pas pu etre verifie en direct au moment d'ecrire ce fichier (domaine
 * bloque par le reseau de dev). Le parsing ci-dessous est volontairement
 * defensif : si la forme ne correspond pas, on retombe sur Deezer plutot
 * que de planter.
 */
export const config = { runtime: 'edge' }

interface TrackFeatures {
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

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

async function fromReccoBeats(spotifyId: string): Promise<TrackFeatures | null> {
  try {
    const res = await fetch(
      `https://api.reccobeats.com/v1/audio-features?ids=${encodeURIComponent(spotifyId)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const body: unknown = await res.json()
    const list = Array.isArray(body)
      ? body
      : ((body as { content?: unknown[]; data?: unknown[]; items?: unknown[] }).content ??
        (body as { data?: unknown[] }).data ??
        (body as { items?: unknown[] }).items ??
        [])
    const item = (list as Record<string, unknown>[])[0]
    if (!item) return null
    const tempo = num(item.tempo)
    if (tempo === null || tempo <= 0) return null

    return {
      found: true,
      source: 'reccobeats',
      tempo,
      loudness: num(item.loudness),
      energy: num(item.energy),
      danceability: num(item.danceability),
      valence: num(item.valence),
      acousticness: num(item.acousticness),
      instrumentalness: num(item.instrumentalness),
      speechiness: num(item.speechiness),
      key: num(item.key),
      mode: num(item.mode),
      timeSignature: num(item.time_signature),
    }
  } catch {
    return null
  }
}

async function fromDeezer(artist: string, title: string): Promise<TrackFeatures | null> {
  try {
    const query = `artist:"${artist}" track:"${title}"`
    const searchRes = await fetch(
      `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=1`,
    )
    if (!searchRes.ok) return null
    const search = (await searchRes.json()) as { data?: Array<{ id: number }> }
    const hit = search.data?.[0]
    if (!hit) return null

    const trackRes = await fetch(`https://api.deezer.com/track/${hit.id}`)
    if (!trackRes.ok) return null
    const track = (await trackRes.json()) as { bpm?: number; gain?: number }
    const bpm = num(track.bpm)
    const gain = num(track.gain)
    if (bpm === null && gain === null) return null

    return {
      found: true,
      source: 'deezer',
      tempo: bpm && bpm > 0 ? bpm : null,
      loudness: gain,
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
  } catch {
    return null
  }
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

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const spotifyId = url.searchParams.get('spotifyId')?.trim()
  const artist = url.searchParams.get('artist')?.trim()
  const title = url.searchParams.get('title')?.trim()

  const result =
    (spotifyId ? await fromReccoBeats(spotifyId) : null) ??
    (artist && title ? await fromDeezer(artist, title) : null) ??
    NOT_FOUND

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Les features d'un morceau ne changent jamais : cache longue duree cote CDN Vercel.
      'cache-control': 'public, max-age=604800, stale-while-revalidate=86400',
    },
  })
}

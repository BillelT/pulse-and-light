/**
 * Proxy serverless (Vercel Edge Function) vers l'API publique Deezer.
 *
 * Pourquoi ce fichier existe : `api.deezer.com` ne renvoie pas d'en-tetes
 * CORS, donc un `fetch` direct depuis le navigateur est bloque. On fait
 * l'appel cote serveur (pas de CORS entre deux serveurs) et on renvoie au
 * front uniquement ce dont on a besoin : tempo (bpm) et loudness (gain).
 *
 * Spotify reste la source de connexion/lecture affichee a l'utilisateur ;
 * Deezer ne sert qu'a recuperer, en arriere-plan, les donnees que Spotify
 * a fermees (audio-features/audio-analysis) quand elles manquent.
 */
export const config = { runtime: 'edge' }

interface DeezerSearchHit {
  id: number
}

interface DeezerTrack {
  bpm?: number
  gain?: number
  title?: string
  artist?: { name?: string }
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const artist = url.searchParams.get('artist')?.trim()
  const title = url.searchParams.get('title')?.trim()
  if (!artist || !title) {
    return json({ error: 'Parametres "artist" et "title" requis.' }, 400)
  }

  try {
    const query = `artist:"${artist}" track:"${title}"`
    const searchRes = await fetch(
      `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=1`,
    )
    if (!searchRes.ok) return json({ found: false }, 200)
    const search = (await searchRes.json()) as { data?: DeezerSearchHit[] }
    const hit = search.data?.[0]
    if (!hit) return json({ found: false }, 200)

    const trackRes = await fetch(`https://api.deezer.com/track/${hit.id}`)
    if (!trackRes.ok) return json({ found: false }, 200)
    const track = (await trackRes.json()) as DeezerTrack

    return json({
      found: true,
      bpm: typeof track.bpm === 'number' && track.bpm > 0 ? track.bpm : null,
      gain: typeof track.gain === 'number' ? track.gain : null,
    })
  } catch {
    return json({ found: false }, 200)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Le tempo/gain d'un morceau ne change jamais : cache longue duree cote CDN Vercel.
      'cache-control': 'public, max-age=604800, stale-while-revalidate=86400',
    },
  })
}

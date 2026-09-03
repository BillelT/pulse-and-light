import type { AudioAnalysis, AudioFeatures, SpotifyTrack, SpotifyUser } from './types'

const API = 'https://api.spotify.com/v1'

export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SpotifyApiError'
  }
}

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (res.status === 204 || res.status === 202) return null
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: { message?: string } | string }
      const detail = typeof body.error === 'string' ? body.error : body.error?.message
      if (detail) message = detail
    } catch {
      /* corps vide */
    }
    throw new SpotifyApiError(res.status, message)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : null
}

export function getMe(token: string) {
  return request<SpotifyUser>(token, '/me')
}

export interface PlayerState {
  is_playing: boolean
  progress_ms: number | null
  item: SpotifyTrack | null
  device: { id: string | null; name: string; volume_percent: number | null } | null
}

export function getPlayerState(token: string) {
  return request<PlayerState>(token, '/me/player')
}

export function transferPlayback(token: string, deviceId: string, play = false) {
  return request<null>(token, '/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play }),
  })
}

export function play(token: string, deviceId: string, uris?: string[]) {
  return request<null>(token, `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify(uris?.length ? { uris } : {}),
  })
}

export function pause(token: string, deviceId: string) {
  return request<null>(token, `/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
  })
}

export function next(token: string, deviceId: string) {
  return request<null>(token, `/me/player/next?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'POST',
  })
}

export function previous(token: string, deviceId: string) {
  return request<null>(token, `/me/player/previous?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'POST',
  })
}

export interface SearchResult {
  tracks: { items: SpotifyTrack[] }
}

/**
 * Depuis le changement d'API Spotify du 27 novembre 2024, une app en mode
 * "Development" (sans Extended Quota Mode approuve) perd l'acces au
 * catalogue : /search echoue avec 400 "Invalid limit", un message trompeur
 * qui n'a rien a voir avec le parametre limit envoye — c'est en realite un
 * refus d'acces catalogue. Cf. `isCatalogAccessError` dans useSpotify.ts.
 */
export function searchTracks(token: string, query: string, limit = 12) {
  const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) })
  return request<SearchResult>(token, `/search?${params}`)
}

/**
 * Audio Features / Audio Analysis.
 *
 * Ces deux endpoints ont ete restreints par Spotify fin 2024 : une application
 * creee depuis renvoie 403 meme avec un token valide. On ne considere donc
 * jamais leur absence comme une erreur — la scene bascule simplement sur la
 * grille rythmique ou sur la capture audio reelle.
 */
export async function getAudioFeatures(
  token: string,
  trackId: string,
): Promise<AudioFeatures | null> {
  try {
    return await request<AudioFeatures>(token, `/audio-features/${trackId}`)
  } catch (err) {
    if (err instanceof SpotifyApiError && (err.status === 403 || err.status === 404)) return null
    throw err
  }
}

export async function getAudioAnalysis(
  token: string,
  trackId: string,
): Promise<AudioAnalysis | null> {
  try {
    return await request<AudioAnalysis>(token, `/audio-analysis/${trackId}`)
  } catch (err) {
    if (err instanceof SpotifyApiError && (err.status === 403 || err.status === 404)) return null
    throw err
  }
}

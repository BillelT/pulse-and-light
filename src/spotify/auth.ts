import { codeChallenge, randomString } from './pkce'

const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize'
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'

const STORE_KEY = 'pl.spotify.token'
const VERIFIER_KEY = 'pl.spotify.verifier'
const STATE_KEY = 'pl.spotify.state'

export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
] as const

export interface StoredToken {
  accessToken: string
  refreshToken: string | null
  /** Timestamp epoch ms d'expiration. */
  expiresAt: number
  scope: string
}

export function clientId(): string {
  return (import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '').trim()
}

export function redirectUri(): string {
  const override = import.meta.env.VITE_SPOTIFY_REDIRECT_URI
  if (override) return override
  return `${window.location.origin}/callback`
}

export function loadToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    if (!parsed.accessToken) return null
    return parsed
  } catch {
    return null
  }
}

export function saveToken(token: StoredToken | null) {
  if (!token) localStorage.removeItem(STORE_KEY)
  else localStorage.setItem(STORE_KEY, JSON.stringify(token))
}

export function logout() {
  saveToken(null)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
}

/** Redirige vers l'ecran de consentement Spotify. */
export async function beginLogin(): Promise<void> {
  const id = clientId()
  if (!id) throw new Error('VITE_SPOTIFY_CLIENT_ID manquant : renseigne ton .env.')

  const verifier = randomString(96)
  const state = randomString(24)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: id,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
    scope: SCOPES.join(' '),
  })
  window.location.assign(`${AUTH_ENDPOINT}?${params}`)
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
}

function toStored(res: TokenResponse, previousRefresh: string | null): StoredToken {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? previousRefresh,
    // Marge de 60 s : on rafraichit avant que le token ne soit reellement mort.
    expiresAt: Date.now() + (res.expires_in - 60) * 1000,
    scope: res.scope,
  }
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = json as { error_description?: string; error?: string }
    throw new Error(err.error_description ?? err.error ?? `Spotify token error ${res.status}`)
  }
  return json as TokenResponse
}

/**
 * Consomme `?code=` apres le retour de Spotify.
 * Renvoie null si l'URL courante n'est pas un retour d'auth.
 */
export async function consumeRedirect(): Promise<StoredToken | null> {
  const url = new URL(window.location.href)
  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!error && !code) return null

  const expectedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  cleanUrl()

  if (error) throw new Error(`Spotify a refuse la connexion : ${error}`)
  if (!verifier) throw new Error('Verifier PKCE introuvable. Relance la connexion.')
  if (expectedState && state !== expectedState) {
    throw new Error('State OAuth invalide : tentative de rejeu ignoree.')
  }

  const res = await postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      code_verifier: verifier,
    }),
  )
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)

  const token = toStored(res, null)
  saveToken(token)
  return token
}

export async function refreshToken(token: StoredToken): Promise<StoredToken> {
  if (!token.refreshToken) throw new Error('Pas de refresh token : reconnecte-toi.')
  const res = await postToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: clientId(),
    }),
  )
  const next = toStored(res, token.refreshToken)
  saveToken(next)
  return next
}

/** Renvoie un token valide, en le rafraichissant si besoin. */
export async function ensureFresh(token: StoredToken): Promise<StoredToken> {
  if (Date.now() < token.expiresAt) return token
  return refreshToken(token)
}

/** Retire code/state/error de l'URL pour ne pas les laisser dans l'historique. */
function cleanUrl() {
  const clean = `${window.location.origin}${window.location.pathname.replace(/\/callback$/, '/')}`
  window.history.replaceState({}, document.title, clean)
}

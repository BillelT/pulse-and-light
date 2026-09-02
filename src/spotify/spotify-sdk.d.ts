/** Types minimaux du Web Playback SDK (charge dynamiquement depuis sdk.scdn.co). */
declare namespace Spotify {
  interface Image {
    url: string
    height?: number | null
    width?: number | null
  }

  interface Entity {
    uri: string
    name: string
  }

  interface WebPlaybackTrack {
    id: string | null
    uri: string
    name: string
    duration_ms: number
    artists: Entity[]
    album: { uri: string; name: string; images: Image[] }
  }

  interface PlaybackState {
    paused: boolean
    position: number
    duration: number
    track_window: {
      current_track: WebPlaybackTrack
      previous_tracks: WebPlaybackTrack[]
      next_tracks: WebPlaybackTrack[]
    }
  }

  interface Error {
    message: string
  }

  interface PlayerInit {
    name: string
    getOAuthToken: (cb: (token: string) => void) => void
    volume?: number
  }

  class Player {
    constructor(init: PlayerInit)
    connect(): Promise<boolean>
    disconnect(): void
    addListener(event: 'ready' | 'not_ready', cb: (data: { device_id: string }) => void): boolean
    addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): boolean
    addListener(
      event:
        | 'initialization_error'
        | 'authentication_error'
        | 'account_error'
        | 'playback_error',
      cb: (err: Error) => void,
    ): boolean
    removeListener(event: string): boolean
    getCurrentState(): Promise<PlaybackState | null>
    togglePlay(): Promise<void>
    nextTrack(): Promise<void>
    previousTrack(): Promise<void>
    seek(ms: number): Promise<void>
    setVolume(v: number): Promise<void>
    activateElement(): Promise<void>
  }
}

interface Window {
  Spotify?: typeof Spotify
  onSpotifyWebPlaybackSDKReady?: () => void
}

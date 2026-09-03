import type { ReactNode } from 'react'

/**
 * Icones vectorielles, dans l'esprit SF Symbols (traits pleins, geometrie
 * simple) : plus nettes et mieux centrees que des emoji, qui rendent flous
 * et desaxes selon la police du systeme.
 */

function Svg({
  size = 14,
  children,
}: {
  size?: number
  children: ReactNode
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  )
}

export function PlayIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M7 4.5c0-1.1 1.2-1.78 2.16-1.22l10.5 6.5a1.4 1.4 0 0 1 0 2.44l-10.5 6.5C8.2 19.28 7 18.6 7 17.5v-13Z" />
    </Svg>
  )
}

export function PauseIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="6" y="4" width="4.4" height="16" rx="1.6" />
      <rect x="13.6" y="4" width="4.4" height="16" rx="1.6" />
    </Svg>
  )
}

export function PrevIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="4.5" y="5" width="2.4" height="14" rx="1.1" />
      <path d="M19.5 5.9c1-.6 2.3.1 2.3 1.3v9.6c0 1.2-1.3 1.9-2.3 1.3l-8-4.8a1.5 1.5 0 0 1 0-2.6l8-4.8Z" />
    </Svg>
  )
}

export function NextIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="17.1" y="5" width="2.4" height="14" rx="1.1" />
      <path d="M4.5 5.9c-1-.6-2.3.1-2.3 1.3v9.6c0 1.2 1.3 1.9 2.3 1.3l8-4.8a1.5 1.5 0 0 0 0-2.6l-8-4.8Z" />
    </Svg>
  )
}

export function SearchIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path
        d="M11 3.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm7.9 15.4 3.1 3.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )
}

export function CloseIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )
}

export function MoreIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </Svg>
  )
}

export function SpeakerIcon({ size, muted }: { size?: number; muted?: boolean }) {
  return (
    <Svg size={size}>
      <path d="M3 9.5A1.5 1.5 0 0 1 4.5 8H7l4.6-3.9c.9-.76 2.4-.13 2.4 1.05v13.7c0 1.18-1.5 1.81-2.4 1.05L7 16H4.5A1.5 1.5 0 0 1 3 14.5v-5Z" />
      {muted ? (
        <path
          d="M16.2 9.2l5.6 5.6M21.8 9.2l-5.6 5.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M16.3 8.3a5 5 0 0 1 0 7.4M19 6a9 9 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </Svg>
  )
}

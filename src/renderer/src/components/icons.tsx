// MD3 风格线性 SVG 图标（替代 emoji）：统一 24 viewBox、stroke 描边、currentColor
import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10-6.5-10-6.5z" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5v14M17 5v14" />
  </Svg>
)

export const IconPrev = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18.5 6 10 12l8.5 6V6z" fill="currentColor" stroke="none" />
    <path d="M5.5 6v12" />
  </Svg>
)

export const IconNext = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 6 14 12l-8.5 6V6z" fill="currentColor" stroke="none" />
    <path d="M18.5 6v12" />
  </Svg>
)

export const IconShuffle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 3h5v5" />
    <path d="M4 20 21 3" />
    <path d="M21 16v5h-5" />
    <path d="M4 4l4.5 4.5" />
    <path d="M15 15l3.5 3.5" />
  </Svg>
)

export const IconRepeat = (p: IconProps) => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Svg>
)

export const IconRepeatOne = (p: IconProps) => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    <path d="M11 10h1.5l-2 3H12" />
  </Svg>
)

export const IconVolume = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
  </Svg>
)

export const IconLyrics = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h11M4 18h8" />
    <path d="M19 14.5V9l3-1" />
  </Svg>
)

export const IconQueue = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h13M3 12h13M3 18h13" />
    <path d="M19 6v12l3-3-3-3z" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
)

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)

export const IconLibrary = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
)

export const IconHistory = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </Svg>
)

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1.5 14h5M9.5 8h5M17.5 16h5" />
  </Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Svg>
)

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v10M8 11l4 4 4-4M5 19h14" />
  </Svg>
)

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
)

export const IconMusic = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
)

export const IconLoudness = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
  </Svg>
)

export const IconLogo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 15.5V8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" />
  </Svg>
)

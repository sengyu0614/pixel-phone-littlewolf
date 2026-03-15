import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface PixelIconProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  glyph: ReactNode
  label: string
  meta?: ReactNode
}

export function PixelIcon({
  glyph,
  label,
  meta,
  className,
  type = 'button',
  ...props
}: PixelIconProps) {
  const classes = ['pixel-icon-button', className ?? ''].filter(Boolean).join(' ')

  return (
    <button type={type} className={classes} {...props}>
      <span className="pixel-icon" aria-hidden="true">
        {glyph}
      </span>
      <span className="pixel-icon-label">{label}</span>
      {meta ? <span className="pixel-icon-status">{meta}</span> : null}
    </button>
  )
}

import type { ButtonHTMLAttributes } from 'react'

type PixelButtonVariant = 'default' | 'ghost' | 'danger'
type PixelButtonSize = 'sm' | 'md'

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant
  size?: PixelButtonSize
  block?: boolean
}

export function PixelButton({
  className,
  variant = 'default',
  size = 'md',
  block = false,
  ...props
}: PixelButtonProps) {
  const classes = [
    'pixel-btn',
    `pixel-btn--${variant}`,
    `pixel-btn--${size}`,
    block ? 'pixel-btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return <button className={classes} {...props} />
}

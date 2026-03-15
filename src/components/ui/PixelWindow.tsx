import type { ReactNode } from 'react'

export interface PixelWindowProps {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function PixelWindow({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: PixelWindowProps) {
  const classes = ['pixel-window', className ?? ''].filter(Boolean).join(' ')
  const bodyClasses = ['pixel-window-body', bodyClassName ?? ''].filter(Boolean).join(' ')

  return (
    <section className={classes}>
      {title || subtitle || actions ? (
        <header className="pixel-window-header">
          <div className="pixel-window-title-group">
            {subtitle ? <p className="pixel-window-subtitle">{subtitle}</p> : null}
            {title ? <h2 className="pixel-window-title">{title}</h2> : null}
          </div>
          {actions ? <div className="pixel-window-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClasses}>{children}</div>
    </section>
  )
}

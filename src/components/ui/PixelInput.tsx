import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

type PixelInputBaseProps = {
  className?: string
}

type PixelTextInputProps = PixelInputBaseProps &
  InputHTMLAttributes<HTMLInputElement> & {
    as?: 'input'
  }

type PixelTextareaProps = PixelInputBaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: 'textarea'
  }

export type PixelInputProps = PixelTextInputProps | PixelTextareaProps

export function PixelInput(props: PixelInputProps) {
  const classes = ['pixel-input', props.className ?? ''].filter(Boolean).join(' ')

  if (props.as === 'textarea') {
    const { as, className, rows, style, ...restProps } = props
    const normalizedRows = Math.max(1, Number(rows ?? 2))
    const minHeight = `${normalizedRows * 1.35 + 0.9}em`
    void as
    void className
    return (
      <textarea
        className={classes}
        rows={rows}
        style={{
          minHeight,
          lineHeight: 1.35,
          ...style,
        }}
        {...restProps}
      />
    )
  }

  const { as, className, ...restProps } = props
  void as
  void className
  return <input className={classes} {...restProps} />
}

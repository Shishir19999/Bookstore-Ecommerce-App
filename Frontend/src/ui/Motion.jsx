import { useEffect, useRef } from 'react'
import { registerParallax, registerReveal } from '../lib/motion'

// Fades/slides its content in the first time it scrolls into view (opacity + transform only; see App.css).
export function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const ref = useRef(null)
  useEffect(() => registerReveal(ref.current), [])
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={{ ...style, '--reveal-delay': `${Math.min(delay, 8) * 70}ms` }} {...rest}>
      {children}
    </Tag>
  )
}

// Decorative layer that drifts at a fraction of the scroll speed. It is positioned inside a stable parent,
// aria-hidden, and only ever moved with transform. No-op under reduced motion, small screens or low-power devices.
export function Parallax({ speed = 0.15, className = '', style, children }) {
  const ref = useRef(null)
  useEffect(() => registerParallax(ref.current, speed), [speed])
  return (
    <div ref={ref} className={`plx ${className}`} style={style} aria-hidden="true">
      {children}
    </div>
  )
}

// Scroll motion helpers: reveal-on-scroll and parallax. Only transform/opacity are animated, work is driven by
// IntersectionObserver + one requestAnimationFrame loop, and everything is switched off for visitors who prefer
// reduced motion, small screens, data-saver and low-power devices.
const reduceMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const smallMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 720px)') : null

export const motionAllowed = () => {
  if (typeof window === 'undefined') return false
  if (reduceMq?.matches) return false
  const nav = navigator
  if (nav.connection?.saveData) return false
  return true
}

// Parallax is stricter: also off on small screens and on low-power hardware.
export const parallaxAllowed = () => {
  if (!motionAllowed()) return false
  if (smallMq?.matches) return false
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return false
  return true
}

const setFlags = () => {
  const root = document.documentElement
  root.dataset.motion = motionAllowed() ? 'on' : 'off'
  root.dataset.parallax = parallaxAllowed() ? 'on' : 'off'
}

const layers = new Map() // element -> { speed, ref }
const visible = new Set()
let frame = 0
let started = false

function update() {
  frame = 0
  const vh = window.innerHeight
  const on = parallaxAllowed()
  for (const el of visible) {
    const { speed, ref } = layers.get(el) || {}
    if (!ref) continue
    if (!on) {
      el.style.transform = ''
      continue
    }
    const r = ref.getBoundingClientRect()
    const offset = (r.top + r.height / 2 - vh / 2) * speed * -1
    const y = Math.max(-120, Math.min(120, offset))
    el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
  }
}

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(update)
}

export function initMotion() {
  if (started || typeof window === 'undefined') return
  started = true
  setFlags()
  const changed = () => {
    setFlags()
    for (const el of layers.keys()) if (!parallaxAllowed()) el.style.transform = ''
    schedule()
  }
  reduceMq?.addEventListener?.('change', changed)
  smallMq?.addEventListener?.('change', changed)
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })
}

export function registerParallax(el, speed) {
  initMotion()
  const ref = el.parentElement || el // measure the stable parent box, never the moving layer itself
  layers.set(el, { speed, ref })
  let obs = null
  if ('IntersectionObserver' in window) {
    obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(el)
          else visible.delete(el)
        }
        schedule()
      },
      { rootMargin: '120px 0px' }
    )
    obs.observe(ref)
  }
  return () => {
    obs?.disconnect()
    layers.delete(el)
    visible.delete(el)
    el.style.transform = ''
  }
}

// One shared observer for all reveal elements; adds .is-in once and stops observing.
let revealIo = null
export function registerReveal(el) {
  initMotion()
  if (!('IntersectionObserver' in window)) {
    el.classList.add('is-in')
    return () => {}
  }
  if (!revealIo) {
    revealIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            revealIo.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    )
  }
  revealIo.observe(el)
  return () => revealIo?.unobserve(el)
}

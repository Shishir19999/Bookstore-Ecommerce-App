import { useCallback, useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBackwardStep, faForwardStep, faPause, faPlay } from '@fortawesome/free-solid-svg-icons'
import { hoursMin } from '../lib/format'

const RATES = [0.8, 1, 1.25, 1.5, 2]
const SLEEP = [0, 5, 15, 30]
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
const CHARS_PER_SECOND = 15 // typical narration pace at 1x

// Audiobook-style narration of text using the browser's built-in speech synthesis (no audio files are downloaded).
// `paragraphs` is the text to read; `start` the paragraph to begin at; onProgress(index) and onListened(minutes) are optional.
export default function Narration({ paragraphs, title, start = 0, onProgress, onListened, compact = false }) {
  const [index, setIndex] = useState(Math.min(start, Math.max(0, paragraphs.length - 1)))
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [voices, setVoices] = useState([])
  const [voiceUri, setVoiceUri] = useState('')
  const [sleep, setSleep] = useState(0)
  const live = useRef({ playing: false, rate: 1, voiceUri: '', paragraphs })
  const idx = useRef(index)
  const listened = useRef(0)
  const timer = useRef(null)
  const speakRef = useRef(null)

  useEffect(() => {
    live.current = { playing, rate, voiceUri, paragraphs }
  }, [playing, rate, voiceUri, paragraphs])

  useEffect(() => {
    if (!supported) return
    const load = () => {
      const v = window.speechSynthesis.getVoices().filter((x) => /^en/i.test(x.lang))
      setVoices(v)
      setVoiceUri((cur) => cur || v.find((x) => x.default)?.voiceURI || v[0]?.voiceURI || '')
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  const speak = useCallback(
    (i) => {
      const { paragraphs: ps, rate: r, voiceUri: vu } = live.current
      window.speechSynthesis.cancel()
      if (i >= ps.length) {
        setPlaying(false)
        return
      }
      idx.current = i
      setIndex(i)
      onProgress?.(i)
      const u = new SpeechSynthesisUtterance(ps[i])
      u.rate = r
      const voice = window.speechSynthesis.getVoices().find((x) => x.voiceURI === vu)
      if (voice) u.voice = voice
      u.onend = () => {
        listened.current += ps[i].length / CHARS_PER_SECOND / r
        if (live.current.playing) speakRef.current(i + 1)
      }
      u.onerror = (e) => e.error !== 'canceled' && e.error !== 'interrupted' && setPlaying(false)
      window.speechSynthesis.speak(u)
    },
    [onProgress]
  )

  useEffect(() => {
    speakRef.current = speak
  }, [speak])

  const flush = useCallback(() => {
    const min = Math.round(listened.current / 60)
    if (min >= 1) onListened?.(min)
    listened.current = 0
  }, [onListened])

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel()
    clearTimeout(timer.current)
    flush()
  }, [flush])

  const play = () => {
    live.current.playing = true
    setPlaying(true)
    speak(idx.current)
  }
  const pause = () => {
    live.current.playing = false
    setPlaying(false)
    window.speechSynthesis.cancel()
    flush()
  }
  const jump = (i) => {
    const n = Math.min(Math.max(0, i), paragraphs.length - 1)
    idx.current = n
    setIndex(n)
    onProgress?.(n)
    if (live.current.playing) speak(n)
  }
  useEffect(() => {
    clearTimeout(timer.current)
    if (sleep && playing) timer.current = setTimeout(pause, sleep * 60000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleep, playing])
  // rate / voice changes apply from the next paragraph on; restart the current one so it is heard immediately
  const changeRate = (r) => {
    setRate(r)
    live.current.rate = r
    if (live.current.playing) speak(idx.current)
  }
  const changeVoice = (v) => {
    setVoiceUri(v)
    live.current.voiceUri = v
    if (live.current.playing) speak(idx.current)
  }

  if (!supported)
    return <p className="alert alert-info">Narration uses your browser&apos;s built-in text-to-speech, which is not available here. You can still read the text.</p>

  const total = paragraphs.reduce((s, p) => s + p.length, 0)
  const done = paragraphs.slice(0, index).reduce((s, p) => s + p.length, 0)
  const remainingMin = Math.max(1, Math.round((total - done) / CHARS_PER_SECOND / rate / 60))
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className={`player ${compact ? 'player-compact' : ''}`} role="group" aria-label={`Narration of ${title}`}>
      <div className="player-main">
        <button type="button" className="icon-btn" aria-label="Previous paragraph" onClick={() => jump(index - 1)}><FontAwesomeIcon icon={faBackwardStep} /></button>
        <button type="button" className="btn btn-primary player-play" aria-label={playing ? 'Pause narration' : 'Play narration'} onClick={playing ? pause : play}>
          <FontAwesomeIcon icon={playing ? faPause : faPlay} /> {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="icon-btn" aria-label="Next paragraph" onClick={() => jump(index + 1)}><FontAwesomeIcon icon={faForwardStep} /></button>
        <div className="player-bar">
          <input type="range" min="0" max={Math.max(0, paragraphs.length - 1)} value={index} aria-label="Narration position" aria-valuetext={`Paragraph ${index + 1} of ${paragraphs.length}, about ${hoursMin(remainingMin)} left`} onChange={(e) => jump(Number(e.target.value))} />
          <span className="small muted">{pct}% &middot; about {hoursMin(remainingMin)} left</span>
        </div>
      </div>
      <div className="player-opts">
        <label className="row small" style={{ gap: 6 }}>Speed
          <select className="input" style={{ width: 'auto', minHeight: 32 }} value={rate} onChange={(e) => changeRate(Number(e.target.value))}>
            {RATES.map((r) => <option key={r} value={r}>{r}x</option>)}
          </select>
        </label>
        {voices.length > 1 && (
          <label className="row small" style={{ gap: 6 }}>Voice
            <select className="input" style={{ width: 'auto', minHeight: 32, maxWidth: 190 }} value={voiceUri} onChange={(e) => changeVoice(e.target.value)}>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
            </select>
          </label>
        )}
        <label className="row small" style={{ gap: 6 }}>Sleep timer
          <select className="input" style={{ width: 'auto', minHeight: 32 }} value={sleep} onChange={(e) => setSleep(Number(e.target.value))}>
            {SLEEP.map((m) => <option key={m} value={m}>{m ? `${m} min` : 'Off'}</option>)}
          </select>
        </label>
      </div>
      <p className="player-now" aria-live="off">{paragraphs[index]}</p>
      <p className="hint" style={{ margin: 0 }}>Narrated by your browser&apos;s text-to-speech voice. No audio files are downloaded.</p>
    </div>
  )
}

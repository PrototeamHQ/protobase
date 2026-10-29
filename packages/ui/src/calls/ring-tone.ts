import { useEffect } from 'react'

// A phone's ring: two short tones, then a pause, again and again.
const toneHz = [440, 480]
const ringMs = 400
const cycleMs = 3000

/**
 * Plays a ring while `on`, through Web Audio. A browser that has not let the page play sound yet, before the person
 * clicked or typed in it, keeps the context suspended and plays nothing: the ring still shows.
 */
export const useRingTone = (on: boolean) => {
  useEffect(() => {
    if (!on || typeof AudioContext === 'undefined') return
    const context = new AudioContext()
    const ring = () => {
      const gain = context.createGain()
      gain.gain.value = 0.08
      gain.connect(context.destination)
      for (const [index, start] of [0, (ringMs * 1.5) / 1000].entries()) {
        for (const hz of toneHz) {
          const oscillator = context.createOscillator()
          oscillator.frequency.value = hz
          oscillator.connect(gain)
          oscillator.start(context.currentTime + start)
          oscillator.stop(context.currentTime + start + ringMs / 1000 / (index + 1))
        }
      }
    }
    ring()
    const timer = setInterval(ring, cycleMs)
    return () => {
      clearInterval(timer)
      void context.close()
    }
  }, [on])
}

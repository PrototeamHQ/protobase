import { useEffect, useState } from 'react'
import { activeSpeaker } from './call-layout'

// How often the levels are read, and how long the last speaker keeps the ring after they stop, so it does not flicker.
const readEveryMs = 200
const holdMs = 1000

// A level from 0 to 1: the root mean square of the samples.
const levelOf = (analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>) => {
  analyser.getFloatTimeDomainData(samples)
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}

/** Who of these members is speaking, by the sound of their microphone tracks, read in the browser through Web Audio. */
export const useActiveSpeaker = (tracks: ReadonlyMap<string, MediaStreamTrack>) => {
  const [speaker, setSpeaker] = useState<string>()
  const ids = [...tracks].map(([member, track]) => `${member}:${track.id}`).join(',')
  useEffect(() => {
    if (tracks.size === 0 || typeof AudioContext === 'undefined') return
    const context = new AudioContext()
    const analysers = new Map(
      [...tracks].map(([member, track]) => {
        const analyser = context.createAnalyser()
        analyser.fftSize = 512
        context.createMediaStreamSource(new MediaStream([track])).connect(analyser)
        return [member, analyser] as const
      }),
    )
    const samples = new Float32Array(512)
    let last: { member: string; at: number } | undefined
    const timer = setInterval(() => {
      const loudest = activeSpeaker(new Map([...analysers].map(([member, analyser]) => [member, levelOf(analyser, samples)])))
      if (loudest) last = { member: loudest, at: Date.now() }
      setSpeaker(last && Date.now() - last.at < holdMs ? last.member : undefined)
    }, readEveryMs)
    return () => {
      clearInterval(timer)
      void context.close()
    }
    // Keyed by the tracks' ids, which `tracks` changes with, so a new map of the same tracks reads on.
  }, [ids])
  return speaker
}

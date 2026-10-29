import { describe, expect, it } from 'vitest'
import { openDevices } from './devices'

const track = (kind: string) => ({ kind }) as MediaStreamTrack
const stream = (kinds: string[]) => ({ getTracks: () => kinds.map(track), getAudioTracks: () => kinds.filter((kind) => kind === 'audio').map(track), getVideoTracks: () => kinds.filter((kind) => kind === 'video').map(track) }) as unknown as MediaStream

// A browser whose devices answer as `answers` says, by what is asked for.
const media = (answers: { both?: string; audio?: string; video?: string }) =>
  ({
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      const asked = constraints.audio && constraints.video ? 'both' : constraints.audio ? 'audio' : 'video'
      const answer = answers[asked]
      if (answer) throw new DOMException('no', answer)
      return stream(asked === 'both' ? ['audio', 'video'] : [asked])
    },
  }) as unknown as MediaDevices

describe('openDevices', () => {
  it('opens both at once when it may', async () => {
    const devices = await openDevices(media({}))
    expect([devices.microphone?.kind, devices.camera?.kind, devices.blocked, devices.none]).toEqual(['audio', 'video', { microphone: false, camera: false }, false])
  })

  it('tells a blocked camera apart, and keeps the microphone', async () => {
    const devices = await openDevices(media({ both: 'NotAllowedError', video: 'NotAllowedError' }))
    expect([devices.microphone?.kind, devices.camera, devices.blocked]).toEqual(['audio', undefined, { microphone: false, camera: true }])
  })

  it('says when there is no device at all', async () => {
    const devices = await openDevices(media({ both: 'NotFoundError', audio: 'NotFoundError', video: 'NotFoundError' }))
    expect(devices.none).toBe(true)
  })

  it('throws what it does not know', async () => {
    await expect(openDevices(media({ both: 'AbortError' }))).rejects.toThrow('no')
  })
})

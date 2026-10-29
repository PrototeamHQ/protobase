import { describe, expect, it } from 'vitest'
import { midsByTrackId } from './msid-tracks'

describe('the sections of a description by track', () => {
  it('names each section\'s mid by the track id of its msid', () => {
    const sdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=mid:0', 'a=msid:- track-a', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=mid:1', 'a=recvonly', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'a=mid:2', 'a=msid:stream track-v', ''].join('\r\n')
    expect(midsByTrackId(sdp)).toEqual(new Map([['track-a', '0'], ['track-v', '2']]))
  })
})

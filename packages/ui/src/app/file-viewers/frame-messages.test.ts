import { describe, expect, it } from 'vitest'
import { frameMessage } from './frame-messages'

const frame = {} as Window
const other = {} as Window
const from = (source: Window, data: unknown) => ({ source, data }) as Pick<MessageEvent, 'source' | 'data'>

describe('frame messages', () => {
  it("follow a link index of the frame's own window", () => {
    expect(frameMessage(from(frame, { protobase: 'html-frame', link: 1, newTab: false }), frame, 2)).toEqual({ kind: 'link', index: 1, newTab: false })
    expect(frameMessage(from(frame, { protobase: 'html-frame', link: 0, newTab: true }), frame, 2)).toEqual({ kind: 'link', index: 0, newTab: true })
    expect(frameMessage(from(frame, { protobase: 'html-frame', height: 412.5 }), frame, 0)).toEqual({ kind: 'height', height: 413 })
    expect(frameMessage(from(frame, { protobase: 'html-frame', height: 1e12 }), frame, 0)).toEqual({ kind: 'height', height: 100_000 })
  })

  it('ignore another window, an address, a path or an index the frame has no link for', () => {
    expect(frameMessage(from(other, { protobase: 'html-frame', link: 0 }), frame, 2)).toBeUndefined()
    expect(frameMessage(from(frame, { protobase: 'html-frame', link: 0 }), null, 2)).toBeUndefined()
    for (const data of [
      { protobase: 'html-frame', link: 2 },
      { protobase: 'html-frame', link: -1 },
      { protobase: 'html-frame', link: 0.5 },
      { protobase: 'html-frame', link: '0' },
      { protobase: 'html-frame', link: 'https://evil.test' },
      { protobase: 'html-frame', link: '/admin/users' },
      { protobase: 'html-frame', navigate: '/admin/users' },
      { protobase: 'html-frame', height: Number.POSITIVE_INFINITY },
      { link: 0 },
      '/admin/users',
      null,
    ]) {
      expect(frameMessage(from(frame, data), frame, 2)).toBeUndefined()
    }
  })
})

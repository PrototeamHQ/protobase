import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { trackFrameRequests } from './frame-requests.mjs'

const mainFrame = {}
const frame = {}
const fakePage = () => Object.assign(new EventEmitter(), { mainFrame: () => mainFrame })
const request = (url: string, from = frame, errorText?: string) => ({ url: () => url, frame: () => from, failure: () => (errorText === undefined ? null : { errorText }) })

describe('trackFrameRequests', () => {
  it('counts a frame request once issued, one still pending included', () => {
    const page = fakePage()
    const requested = trackFrameRequests(page)
    page.emit('request', request('https://pending.test/a.png'))
    expect(requested()).toEqual(['https://pending.test/a.png'])
  })

  it('keeps finished and failed requests, and drops only those CSP blocked', () => {
    const page = fakePage()
    const requested = trackFrameRequests(page)
    const finished = request('https://finished.test/')
    const failed = request('https://failed.test/', frame, 'net::ERR_FAILED')
    const blocked = request('https://blocked.test/', frame, 'csp')
    for (const each of [finished, failed, blocked]) page.emit('request', each)
    page.emit('requestfinished', finished)
    page.emit('requestfailed', failed)
    page.emit('requestfailed', blocked)
    expect(requested()).toEqual(['https://finished.test/', 'https://failed.test/'])
  })

  it('ignores the page’s own requests and data: URLs', () => {
    const page = fakePage()
    const requested = trackFrameRequests(page)
    page.emit('request', request('https://app.test/', mainFrame))
    page.emit('request', request('data:image/png;base64,AAAA'))
    expect(requested()).toEqual([])
  })
})

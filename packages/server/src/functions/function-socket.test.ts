import type { WSContext } from 'hono/ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notFound, unauthorized } from '../problem'
import { closeAboveBytes, pauseAboveBytes, socketEvents, type FunctionSocket, type RawSocket, type SocketEvents } from './function-socket'

// A raw socket whose writes finish when the test says so.
const fakeRaw = (canPause = true) => {
  const writes: Array<() => void> = []
  const raw = {
    readyState: 1,
    bufferedAmount: 0,
    sent: [] as unknown[],
    send: vi.fn((data: unknown, callback: () => void) => {
      raw.sent.push(data)
      writes.push(callback)
    }),
    close: vi.fn((_code?: number, _reason?: string) => {
      raw.readyState = 3
    }),
    ...(canPause && { pause: vi.fn(), resume: vi.fn() }),
  }
  return { raw: raw as typeof raw & RawSocket, writes }
}

const open = (events: SocketEvents, options: { recheck?: () => Promise<unknown>; canPause?: boolean } = {}) => {
  const report = vi.fn()
  const { raw, writes } = fakeRaw(options.canPause ?? true)
  const hono = socketEvents(events, { report, ...(options.recheck && { recheck: options.recheck }) })
  hono.onOpen!(new Event('open'), { raw } as unknown as WSContext)
  const message = (data: string | ArrayBuffer) => hono.onMessage!({ data } as MessageEvent, {} as WSContext)
  const closed = (code: number, reason: string) => hono.onClose!({ code, reason } as CloseEvent, {} as WSContext)
  return { raw, writes, report, message, closed }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('socketEvents', () => {
  afterEach(() => vi.useRealTimers())

  it('resolves send once the data is written, or at once when closed, and never rejects', async () => {
    let socket!: FunctionSocket
    const { raw, writes } = open({ onOpen: (s) => void (socket = s) })
    await settle()
    let written = false
    const sending = socket.send('hi').then(() => (written = true))
    await settle()
    expect(written).toBe(false)
    writes[0]!()
    await sending
    expect(raw.sent).toEqual(['hi'])
    raw.readyState = 3
    await expect(socket.send(new Uint8Array([1]))).resolves.toBeUndefined()
    expect(raw.send).toHaveBeenCalledTimes(1)
  })

  it('passes text as text and binary as binary, one message at a time and in order', async () => {
    const seen: unknown[] = []
    let release!: () => void
    const { message } = open({
      onMessage: async (data) => {
        seen.push(data)
        if (data === 'first') await new Promise<void>((resolve) => (release = resolve))
      },
    })
    const bytes = new Uint8Array([0, 255, 7]).buffer
    message('first')
    message(bytes)
    message('third')
    await settle()
    expect(seen).toEqual(['first'])
    release()
    await settle()
    expect(seen).toEqual(['first', bytes, 'third'])
  })

  it('pauses reading above 1 MiB of waiting messages and resumes once they are handled', async () => {
    let release!: () => void
    const { raw, message } = open({ onMessage: () => new Promise<void>((resolve) => (release = resolve)) })
    message(new ArrayBuffer(pauseAboveBytes))
    expect(raw.pause).not.toHaveBeenCalled()
    message(new ArrayBuffer(1))
    expect(raw.pause).toHaveBeenCalledTimes(1)
    await settle()
    release()
    await settle()
    expect(raw.resume).not.toHaveBeenCalled()
    release()
    await settle()
    expect(raw.resume).toHaveBeenCalledTimes(1)
  })

  it('closes with 1013 above 16 MiB of waiting messages where reading cannot pause', async () => {
    const onMessage = vi.fn(() => new Promise<void>(() => {}))
    const { raw, message, report } = open({ onMessage }, { canPause: false })
    message(new ArrayBuffer(closeAboveBytes))
    expect(raw.close).not.toHaveBeenCalled()
    message(new ArrayBuffer(1))
    expect(raw.close).toHaveBeenCalledWith(1013, 'Try Again Later')
    expect(report).not.toHaveBeenCalled()
  })

  it('reports a handler that throws or rejects and closes with 1011, handling no message after it', async () => {
    const failure = new Error('boom')
    const onMessage = vi.fn(async () => {
      throw failure
    })
    const { raw, message, report } = open({ onMessage })
    message('a')
    message('b')
    await settle()
    expect(report).toHaveBeenCalledWith(failure)
    expect(raw.close).toHaveBeenCalledWith(1011, 'Internal Error')
    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  it('stops the re-check when onOpen throws, and closes with 1011', async () => {
    vi.useFakeTimers()
    const recheck = vi.fn(async () => {})
    const { raw, report } = open({
      onOpen: () => {
        throw new Error('no')
      },
    }, { recheck })
    await vi.advanceTimersByTimeAsync(0)
    expect(raw.close).toHaveBeenCalledWith(1011, 'Internal Error')
    expect(report).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(recheck).not.toHaveBeenCalled()
  })

  it('tells onClose the peer’s code and reason after the messages before it', async () => {
    const seen: unknown[] = []
    const { message, closed } = open({ onMessage: (data) => void seen.push(data), onClose: (code, reason) => void seen.push([code, reason]) })
    message('last')
    closed(4000, 'bye')
    await settle()
    expect(seen).toEqual(['last', [4000, 'bye']])
  })

  it('closes with the function’s own code and reason', async () => {
    const { raw } = open({ onOpen: (socket) => socket.close(4401, 'Key revoked') })
    await settle()
    expect(raw.close).toHaveBeenCalledWith(4401, 'Key revoked')
  })

  it('re-checks the caller every minute from open until close, closing with 1008 once refused', async () => {
    vi.useFakeTimers()
    const recheck = vi.fn(async () => {})
    const first = open({}, { recheck })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(recheck).toHaveBeenCalledTimes(2)
    first.closed(1000, '')
    await vi.advanceTimersByTimeAsync(300_000)
    expect(recheck).toHaveBeenCalledTimes(2)

    const refused = open({}, { recheck: async () => Promise.reject(unauthorized('Signed out')) })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refused.raw.close).toHaveBeenCalledWith(1008, 'Unauthorized')
  })

  it('runs the function’s own recheck alone, every minute while open', async () => {
    vi.useFakeTimers()
    const recheck = vi.fn()
    const { closed } = open({ recheck })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(recheck).toHaveBeenCalledTimes(2)
    closed(1000, '')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(recheck).toHaveBeenCalledTimes(2)
  })

  it('runs the framework’s check before the function’s, and not the function’s once the framework refused', async () => {
    vi.useFakeTimers()
    const order: string[] = []
    const both = open({ recheck: () => void order.push('function') }, { recheck: async () => void order.push('framework') })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(order).toEqual(['framework', 'function'])
    both.closed(1000, '')

    const own = vi.fn()
    const refused = open({ recheck: own }, { recheck: async () => Promise.reject(unauthorized('Signed out')) })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(own).not.toHaveBeenCalled()
    expect(refused.raw.close.mock.calls).toEqual([[1008, 'Unauthorized']])
  })

  it('closes with 1008 for a 404 from the function’s recheck, and reports any other error with 1011', async () => {
    vi.useFakeTimers()
    const gone = open({ recheck: () => Promise.reject(notFound('No such repair')) })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(gone.raw.close.mock.calls).toEqual([[1008, 'Not Found']])
    expect(gone.report).not.toHaveBeenCalled()

    const bug = new Error('typo')
    const broken = open({
      recheck: () => {
        throw bug
      },
    })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(broken.raw.close.mock.calls).toEqual([[1011, 'Internal Error']])
    expect(broken.report).toHaveBeenCalledWith(bug)
  })

  it('hands no message to onMessage once a re-check refused, though the peer keeps sending', async () => {
    vi.useFakeTimers()
    const onMessage = vi.fn()
    const { raw, message } = open({ onMessage }, { recheck: async () => Promise.reject(unauthorized('Signed out')) })
    message('before')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(raw.close).toHaveBeenCalledWith(1008, 'Unauthorized')
    message('after')
    message('rm -rf /')
    await vi.advanceTimersByTimeAsync(1000)
    expect(onMessage.mock.calls.map(([data]) => data)).toEqual(['before'])
  })
})

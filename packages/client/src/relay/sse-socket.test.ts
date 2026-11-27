import { describe, expect, it, vi } from 'vitest'
import { sseSocket } from './sse-socket'
import { fakeSseRelay, recordedStream } from './testing/fake-sse-relay'

const url = 'https://relay.test/socket/sse?vsn=2.0.0&ticket=t1'

// Lets the stream's reads and the POSTs settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const listen = (fetcher: typeof fetch) => {
  const heard = { opened: 0, messages: [] as unknown[], closes: [] as unknown[] }
  const socket = sseSocket(url, fetcher)
  socket.onopen = () => void (heard.opened += 1)
  socket.onmessage = ({ data }) => void heard.messages.push(data)
  socket.onclose = (event) => void heard.closes.push(event)
  return { socket, heard }
}

const recordedFrames = [
  '["1","1","room","phx_reply",{"response":{},"status":"ok"}]',
  '[null,null,"room","new",{"text":"hello"}]',
  '[null,"2","phoenix","phx_reply",{"response":{},"status":"ok"}]',
  '["1","3","room","phx_reply",{"response":{},"status":"ok"}]',
]

describe('sseSocket', () => {
  it('replays the recorded stream: opens on its connection event, hears each frame, and closes with its close event', async () => {
    const relay = fakeSseRelay()
    const { socket, heard } = listen(relay.fetcher)
    await settle()
    expect(relay.streams[0]!.url).toBe(url)
    relay.write(recordedStream)
    await settle()
    expect(heard.opened).toBe(1)
    expect(heard.messages).toEqual(recordedFrames)
    expect(heard.closes).toEqual([{ code: 1000, reason: 'session closed', wasClean: true }])
    expect(socket.readyState).toBe(3)
  })

  it('reads the recorded stream the same when it comes a character at a time', async () => {
    const relay = fakeSseRelay()
    const { heard } = listen(relay.fetcher)
    await settle()
    for (const character of recordedStream) relay.write(character)
    await settle()
    expect(heard.messages).toEqual(recordedFrames)
    expect(heard.closes).toEqual([{ code: 1000, reason: 'session closed', wasClean: true }])
  })

  it('posts frames to the connection with its secret, in order, those sent while one is on its way together', async () => {
    const relay = fakeSseRelay({ holdPosts: true })
    const { socket } = listen(relay.fetcher)
    await settle()
    expect(() => socket.send('["1","1","room","phx_join",{}]')).toThrow('not open')
    relay.write(recordedStream.slice(0, recordedStream.indexOf('\n\n') + 2))
    await settle()
    socket.send('["1","1","room","phx_join",{}]')
    socket.send('[null,"2","phoenix","heartbeat",{}]')
    socket.send('["1","3","room","typing",{}]')
    await settle()
    expect(relay.posts).toEqual([{ url: 'https://relay.test/socket/sse/%3Cconnection%3E', secret: '<secret>', body: '["1","1","room","phx_join",{}]' }])
    relay.answer()
    await settle()
    expect(relay.posts.map((post) => post.body)).toEqual(['["1","1","room","phx_join",{}]', '[[null,"2","phoenix","heartbeat",{}],["1","3","room","typing",{}]]'])
  })

  it('closes as dropped when the relay refuses a POST, the stream ends without a close event, or no stream opens', async () => {
    const refused = fakeSseRelay({ holdPosts: true })
    const one = listen(refused.fetcher)
    await settle()
    refused.write(recordedStream.slice(0, recordedStream.indexOf('\n\n') + 2))
    await settle()
    one.socket.send('[null,"1","phoenix","heartbeat",{}]')
    refused.answer(404)
    await settle()
    expect(one.heard.closes).toEqual([{ code: 1006, reason: '', wasClean: false }])

    const ended = fakeSseRelay()
    const two = listen(ended.fetcher)
    await settle()
    ended.end()
    await settle()
    expect(two.heard.closes).toEqual([{ code: 1006, reason: '', wasClean: false }])

    const blocked = fakeSseRelay()
    blocked.refuseStreams(403)
    const three = listen(blocked.fetcher)
    await settle()
    expect(three.heard.opened).toBe(0)
    expect(three.heard.closes).toEqual([{ code: 1006, reason: '', wasClean: false }])
  })

  it('closes with the code given and ends the stream, once', async () => {
    const relay = fakeSseRelay()
    const { socket, heard } = listen(relay.fetcher)
    const onclose = vi.fn(socket.onclose!)
    socket.onclose = onclose
    await settle()
    socket.close(1000)
    socket.close(1000)
    await settle()
    expect(onclose).toHaveBeenCalledTimes(1)
    expect(heard.closes).toEqual([{ code: 1000, reason: '', wasClean: true }])
    expect(() => relay.write('data: late\n\n')).toThrow()
  })
})

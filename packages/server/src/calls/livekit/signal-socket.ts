import { Ping, SignalRequest, SignalResponse } from '@livekit/protocol'

export type SignalMessage = SignalResponse['message']
export type SignalRequestMessage = SignalRequest['message']

export type SignalSocketInput = {
  url: string
  onMessage: (message: SignalMessage) => void
  /** Once, when the socket closed or failed to open, unless `close` closed it. */
  onClose: () => void
}

export type SignalSocket = {
  send: (message: SignalRequestMessage) => void
  /** Pings every `intervalSeconds`, and closes the socket when no pong came for `timeoutSeconds`. */
  keepAlive: (intervalSeconds: number, timeoutSeconds: number) => void
  close: () => void
}

/** A WebSocket to LiveKit's signal endpoint speaking its protobuf messages, for one member. */
export const openSignalSocket = ({ url, onMessage, onClose }: SignalSocketInput): SignalSocket => {
  const socket = new WebSocket(url)
  socket.binaryType = 'arraybuffer'
  let pinger: ReturnType<typeof setInterval> | undefined
  let lastPong = Date.now()
  let closed = false
  // What is sent before the socket opened, such as a resume's sync state, goes once it opens.
  const queued: Uint8Array<ArrayBuffer>[] = []

  const stop = () => {
    if (closed) return false
    closed = true
    clearInterval(pinger)
    return true
  }
  const close = () => {
    if (stop()) socket.close()
  }
  socket.onmessage = (event) => {
    const { message } = SignalResponse.fromBinary(new Uint8Array(event.data as ArrayBuffer))
    if (message.case === 'pongResp') lastPong = Date.now()
    onMessage(message)
  }
  socket.onopen = () => {
    for (const data of queued.splice(0)) socket.send(data)
  }
  socket.onclose = () => {
    if (stop()) onClose()
  }
  // A failed open or a broken connection also closes the socket, which onclose reports.
  socket.onerror = () => {}

  const send = (message: SignalRequestMessage) => {
    const data = new SignalRequest({ message }).toBinary() as Uint8Array<ArrayBuffer>
    if (socket.readyState === WebSocket.CONNECTING) queued.push(data)
    else if (socket.readyState === WebSocket.OPEN) socket.send(data)
  }
  return {
    send,
    keepAlive: (intervalSeconds, timeoutSeconds) => {
      clearInterval(pinger)
      lastPong = Date.now()
      pinger = setInterval(() => {
        if (Date.now() - lastPong > timeoutSeconds * 1000) {
          if (stop()) {
            socket.close()
            onClose()
          }
          return
        }
        send({ case: 'pingReq', value: new Ping({ timestamp: BigInt(Date.now()) }) })
      }, intervalSeconds * 1000)
    },
    close,
  }
}

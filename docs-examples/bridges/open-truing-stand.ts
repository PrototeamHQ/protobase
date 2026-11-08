import { createClient } from '@protobase/client'

const client = createClient()

// A page of the app opens the truing stand's bridge and hands its bytes to a viewer of its own, such as a VNC client.
// `open` resolves as soon as the socket exists, so this waits for it to open before handing out its sender.
export const openTruingStand = async (show: (bytes: Uint8Array) => void) => {
  const { socket, expiresAt } = await client.bridges.open('workshop-console', 'truing-stand')
  socket.onmessage = (event) => show(new Uint8Array(event.data as ArrayBuffer))
  socket.onclose = (event) => console.log('closed', event.code, event.reason, 'expires at', expiresAt)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('close', () => reject(new Error('The truing stand could not be reached')), { once: true })
  })
  return (bytes: ArrayBuffer) => socket.send(bytes)
}

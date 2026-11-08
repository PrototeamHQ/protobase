import { createClient } from '@protobase/client'

const client = createClient()

// A page of the app opens the truing stand's bridge and hands its bytes to a viewer of its own, such as a VNC client.
export const openTruingStand = async (show: (bytes: Uint8Array) => void) => {
  const { socket, expiresAt } = await client.bridges.open('workshop-console', 'truing-stand')
  socket.onmessage = (event) => show(new Uint8Array(event.data as ArrayBuffer))
  socket.onclose = (event) => console.log('closed', event.code, event.reason, 'expires at', expiresAt)
  return (bytes: ArrayBuffer) => socket.send(bytes)
}

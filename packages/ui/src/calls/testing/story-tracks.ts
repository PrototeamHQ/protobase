import type { CallPerson } from '../call-person'

/** A video track that shows `label` on a coloured canvas, as a stand-in camera or screen in stories. */
export const canvasTrack = (label: string, hue: number, size = { width: 640, height: 360 }) => {
  const canvas = document.createElement('canvas')
  Object.assign(canvas, size)
  const context = canvas.getContext('2d')!
  context.fillStyle = `hsl(${hue} 45% 35%)`
  context.fillRect(0, 0, size.width, size.height)
  context.fillStyle = 'white'
  context.font = '32px sans-serif'
  context.fillText(label, 24, size.height / 2)
  return canvas.captureStream(5).getVideoTracks()[0]!
}

/** Someone in a story's call, with their camera on unless said otherwise. */
export const storyPerson = (member: string, name: string, hue: number, more: Partial<CallPerson> = {}): CallPerson => ({
  member,
  name,
  camera: canvasTrack(name, hue),
  microphoneOff: false,
  cameraOff: false,
  connection: 'good',
  ...more,
})

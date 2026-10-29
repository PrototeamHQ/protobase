/** The member's microphone and camera as the browser gives them, and why one is missing: blocked, or none found. */
export type Devices = { microphone?: MediaStreamTrack; camera?: MediaStreamTrack; blocked: { microphone: boolean; camera: boolean }; none: boolean }

// What `getUserMedia` rejects with for a device the person or the browser keeps from the page, or that is not there.
const blockedNames = new Set(['NotAllowedError', 'SecurityError'])
const missingNames = new Set(['NotFoundError', 'NotReadableError', 'OverconstrainedError'])

type Kind = 'audio' | 'video'

// One kind of device: its track, or whether it is blocked or missing.
const one = async (media: MediaDevices, kind: Kind): Promise<{ track?: MediaStreamTrack; blocked: boolean }> => {
  try {
    const stream = await media.getUserMedia({ [kind]: true })
    return { track: stream.getTracks()[0]!, blocked: false }
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
    if (blockedNames.has(error.name)) return { blocked: true }
    if (missingNames.has(error.name)) return { blocked: false }
    throw error
  }
}

/**
 * Asks for the microphone and the camera at once, so the browser asks the person once; when that is refused, each on
 * its own, to tell which one is blocked or missing.
 */
export const openDevices = async (media: MediaDevices = navigator.mediaDevices): Promise<Devices> => {
  try {
    const stream = await media.getUserMedia({ audio: true, video: true })
    return { microphone: stream.getAudioTracks()[0], camera: stream.getVideoTracks()[0], blocked: { microphone: false, camera: false }, none: false }
  } catch (error) {
    if (!(error instanceof DOMException) || !(blockedNames.has(error.name) || missingNames.has(error.name))) throw error
  }
  const [audio, video] = [await one(media, 'audio'), await one(media, 'video')]
  return {
    ...(audio.track && { microphone: audio.track }),
    ...(video.track && { camera: video.track }),
    blocked: { microphone: audio.blocked, camera: video.blocked },
    none: !audio.track && !video.track && !audio.blocked && !video.blocked,
  }
}

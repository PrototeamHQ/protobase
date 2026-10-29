import { useCallback, type VideoHTMLAttributes } from 'react'

/** A video element showing the track, muted, inline, playing as soon as it can. */
export const TrackVideo = ({ track, ...rest }: { track: MediaStreamTrack } & VideoHTMLAttributes<HTMLVideoElement>) => {
  const ref = useCallback(
    (element: HTMLVideoElement | null) => {
      if (!element) return
      element.srcObject = new MediaStream([track])
    },
    [track],
  )
  return <video ref={ref} autoPlay playsInline muted {...rest} />
}

/** Plays the track's sound, unseen. */
export const TrackAudio = ({ track }: { track: MediaStreamTrack }) => {
  const ref = useCallback(
    (element: HTMLAudioElement | null) => {
      if (!element) return
      element.srcObject = new MediaStream([track])
    },
    [track],
  )
  return <audio ref={ref} autoPlay />
}

import { useCallback, type VideoHTMLAttributes } from 'react'

// Plays the element again whenever it pauses while its track is live: a media element the page takes out and puts
// back, as React does when it moves a tile, is paused by the browser, and nothing else would play it again. A play the
// browser cut short, or does not allow yet, is left to the next pause.
const keepPlaying = (element: HTMLMediaElement, track: MediaStreamTrack) => {
  element.srcObject = new MediaStream([track])
  const play = () => {
    if (track.readyState !== 'live') return
    element.play().catch((error: unknown) => {
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) return
      throw error
    })
  }
  element.addEventListener('pause', play)
  return () => element.removeEventListener('pause', play)
}

/** A video element showing the track, muted, inline, playing as soon as it can and for as long as the track is live. */
export const TrackVideo = ({ track, ...rest }: { track: MediaStreamTrack } & VideoHTMLAttributes<HTMLVideoElement>) => {
  const ref = useCallback((element: HTMLVideoElement | null) => (element ? keepPlaying(element, track) : undefined), [track])
  return <video ref={ref} autoPlay playsInline muted {...rest} />
}

/** Plays the track's sound, unseen, for as long as the track is live. */
export const TrackAudio = ({ track }: { track: MediaStreamTrack }) => {
  const ref = useCallback((element: HTMLAudioElement | null) => (element ? keepPlaying(element, track) : undefined), [track])
  return <audio ref={ref} autoPlay />
}

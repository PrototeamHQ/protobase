/** Someone in a call as the view draws them: the member themselves too. */
export type CallPerson = {
  member: string
  name: string
  /** The member viewing the call. */
  self?: boolean
  camera?: MediaStreamTrack
  microphone?: MediaStreamTrack
  screen?: MediaStreamTrack
  screenAudio?: MediaStreamTrack
  /** Their microphone sends nothing: muted, or none. */
  microphoneOff: boolean
  /** Their camera sends nothing: turned off, or none. */
  cameraOff: boolean
  speaking?: boolean
  /** How the member's browser's connection to them fares; `failed` when it cannot connect to them. */
  connection?: 'good' | 'poor' | 'failed'
}

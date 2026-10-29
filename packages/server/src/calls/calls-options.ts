/** A LiveKit server, self-hosted or LiveKit Cloud, that carries the calls' media. */
export type LiveKitBackend = {
  kind: 'livekit'
  /** Its address, such as `wss://livekit.example.com` or `ws://127.0.0.1:7880`. */
  url: string
  /** The API key and secret Protobase signs each member's LiveKit token with. */
  apiKey: string
  apiSecret: string
}

/** An ICE server the members' browsers reach each other through, such as a STUN or TURN server. */
export type CallIceServer = { urls: string[]; username?: string; credential?: string }

/**
 * No media server: each member's browser sends its media to every other member's, and Protobase passes their offers,
 * answers and candidates between them. For small calls; members meet only on the same process.
 */
export type PeerBackend = { kind: 'peer'; iceServers?: CallIceServer[] }

/** The media plugin a call's members send and receive their media through. */
export type CallBackend = LiveKitBackend | PeerBackend

/** Calls: the media plugin behind them. Without `calls`, an app loads none of the calls code. */
export type CallsOptions = {
  backend: CallBackend
}

const nonEmpty = (value: unknown) => typeof value === 'string' && value.length > 0

/** The options, or an error naming what is wrong with them: the backend's kind and each of its settings. */
export const checkCallsOptions = (options: CallsOptions) => {
  const backend = options?.backend as Partial<LiveKitBackend> | Partial<PeerBackend> | undefined
  if (backend?.kind === 'peer') {
    const servers = backend.iceServers
    if (servers !== undefined && (!Array.isArray(servers) || servers.some((server) => !Array.isArray(server?.urls) || !server.urls.every(nonEmpty)))) {
      throw new Error('calls.backend.iceServers must be a list of { urls: string[], username?, credential? }')
    }
    return options
  }
  if (backend?.kind !== 'livekit') throw new Error(`calls.backend.kind must be 'livekit' or 'peer', not ${JSON.stringify(backend?.kind)}`)
  for (const key of ['url', 'apiKey', 'apiSecret'] as const) {
    if (!nonEmpty(backend[key])) throw new Error(`calls.backend.${key} must be a non-empty string, such as from an environment variable`)
  }
  if (!/^(wss?|https?):\/\//.test(backend.url!)) throw new Error(`calls.backend.url must start with wss://, ws://, https:// or http://, not ${backend.url}`)
  return options
}

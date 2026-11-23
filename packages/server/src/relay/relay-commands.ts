import type { RealtimeRelaySettings } from './relay-options'

/** One message to a channel's sockets, narrowed to `users` when it has them. */
export type PublishCommand = { kind: 'publish'; id: string; channel: string; users?: string[]; event: string; payload: Record<string, unknown> }

/** People who join or leave a channel on the sockets they have open. */
export type MembersCommand = { kind: 'add' | 'remove'; channel: string; users: string[] }

/** The app commands a dispatch sends the relay, in order. */
export type RelayCommand = PublishCommand | MembersCommand

/** A command the relay refused as malformed (`400`) or too large (`413`): sending it again changes nothing. */
export class RelayRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'RelayRefusal'
  }
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

/**
 * The relay's app API for the app of `options`: each call is one `POST` with the app's API key and answers how many
 * sockets it reached. A refusal throws a `RelayRefusal`; any other failure, such as a relay that is down, an `Error`.
 * Every command is idempotent, so a caller may send it again.
 */
export const relayClient = (options: Pick<RealtimeRelaySettings, 'url' | 'app' | 'apiKey'>, fetcher: Fetch = fetch) => {
  const base = `${options.url.replace(/\/+$/, '')}/apps/${encodeURIComponent(options.app)}`
  const post = async (path: string, body: object) => {
    const response = await fetcher(`${base}/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    if (response.status === 400 || response.status === 413) throw new RelayRefusal(response.status, `The relay refused ${path} (${response.status}): ${text}`)
    if (!response.ok) throw new Error(`The relay answered ${path} with ${response.status}`)
    return (JSON.parse(text) as { sockets: number }).sockets
  }
  return {
    send: (command: RelayCommand) => {
      if (command.kind === 'publish') {
        const { kind: _, ...body } = command
        return post('publish', body)
      }
      return post(command.kind === 'add' ? 'channels/add' : 'channels/remove', { channel: command.channel, users: command.users })
    },
    closeSession: (session: string) => post('sessions/close', { session }),
  }
}

export type RelayClient = ReturnType<typeof relayClient>

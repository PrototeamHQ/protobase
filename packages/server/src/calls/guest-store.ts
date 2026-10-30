import type { Db } from '@protobase/query'
import type { CallGuestLink, CallGuestRefusal, CallLobbyGuest } from '@protobase/schema/internal'
import { guestByToken, guestStillAllowed, type GuestRow } from './guest-checks-sql'
import { createLink, organizationGuests, revokeLink, setOrganizationGuests, type CreateLinkInput, type OrganizationOf } from './guest-links-sql'
import { decideGuest, enterLobby, leaveLobby, lobbies, lobbyState, type DecideInput, type LobbyState } from './guest-lobby-sql'

/** Where guest links, the lobby's guests and the organizations' switch are kept: the `calls` schema. */
export type GuestStore = {
  createLink: (input: CreateLinkInput) => Promise<{ link: CallGuestLink; token: string } | { refused: CallGuestRefusal }>
  revokeLink: (input: { call: string; link: string; member: string }) => Promise<boolean>
  decide: (input: DecideInput) => Promise<{ refused?: CallGuestRefusal }>
  lobbies: (calls: readonly string[]) => Promise<Map<string, { guests: CallLobbyGuest[]; links: CallGuestLink[] }>>
  enter: (input: { link: Buffer; name: string; token: Buffer }) => Promise<{ guest: string } | { refused: 'gone' }>
  state: (token: Buffer) => Promise<LobbyState | undefined>
  leave: (token: Buffer) => Promise<void>
  byToken: (token: Buffer) => Promise<GuestRow | undefined>
  stillAllowed: (guest: string) => Promise<boolean>
  /** The calls whose guests turning guests off took out. */
  setOrganization: (input: { organization: string; allowed: boolean; by: string }) => Promise<string[]>
  organizationAllowed: (organization: string) => Promise<boolean>
}

/** The `calls` schema of the app's database; writes under the API's statement timeout. */
export const sqlGuestStore = (db: Db, timeoutMs: number, organizationOf: OrganizationOf): GuestStore => ({
  createLink: (input) => createLink(db, timeoutMs, organizationOf, input),
  revokeLink: (input) => revokeLink(db, timeoutMs, input),
  decide: (input) => decideGuest(db, timeoutMs, input),
  lobbies: (calls) => lobbies(db, calls),
  enter: (input) => enterLobby(db, timeoutMs, input),
  state: (token) => lobbyState(db, token),
  leave: (token) => leaveLobby(db, token),
  byToken: (token) => guestByToken(db, token),
  stillAllowed: (guest) => guestStillAllowed(db, guest),
  setOrganization: (input) => setOrganizationGuests(db, timeoutMs, input),
  organizationAllowed: (organization) => organizationGuests(db, organization),
})

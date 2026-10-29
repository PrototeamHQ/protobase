/** Whether a person may be reached: `automatic` says nothing, `busy` is a mark only, `do_not_disturb` holds their pushes. */
export const availabilities = ['automatic', 'busy', 'do_not_disturb'] as const
export type Availability = (typeof availabilities)[number]

/** The most characters a custom status holds, counted as a person sees them, an emoji as one. */
export const maxStatusText = 100

/** A person's status as the API answers it: `text` and `clearsAt` are `null` when not set. */
export type PersonStatus = { userId: string; availability: Availability; text: string | null; clearsAt: string | null }

/** What a person sets: an availability, a custom text, and when it clears, an ISO time, `null` for never. */
export type StatusInput = { availability: Availability; text: string | null; clearsAt: string | null }

/** The path of the status endpoints under the API's system path (`/api`): the caller's own, or `people` they share an organization with. */
export const statusPath = (systemPath: string, part?: 'people') => `${systemPath}/status${part === undefined ? '' : `/${part}`}`

// Control characters, line breaks and tabs included: a status is one line of plain text.
const controlCharacter = /\p{Cc}/u

/** What is wrong with a custom status text, as a sentence to show; `undefined` when it may be set. */
export const statusTextProblem = (text: string) => {
  if (controlCharacter.test(text)) return 'A status is one line of text, without control characters'
  if ([...text].length > maxStatusText) return `A status is at most ${maxStatusText} characters`
  return
}

/** The status as it holds at `now`: none once its clear time has passed, or when it says nothing. */
export const heldStatus = <S extends Pick<PersonStatus, 'availability' | 'text' | 'clearsAt'>>(status: S | null | undefined, now = Date.now()): S | undefined => {
  if (!status) return
  if (status.clearsAt !== null && Date.parse(status.clearsAt) <= now) return
  if (status.availability === 'automatic' && status.text === null) return
  return status
}

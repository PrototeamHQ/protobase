---
title: Status
description: People set their own status, busy, do not disturb or a text such as "Having lunch", which the people they share an organization with see beside their name, and do not disturb holds their push notifications.
---

## Turning it on

:::caution[Beta]
A status is the same in every organization; a status per organization and do-not-disturb schedules are not part of it.
:::

A status says whether someone wants to be reached: an availability, busy or do not disturb, and a short text of their own, such as "Having lunch" or "On vacation 🌴". You turn it on in `protobase.config.ts`:

```ts
import { defineConfig } from '@protobase/config'

export default defineConfig({
  auth: { organizations: true },
  status: {},
})
```

Then run `protobase migration`, which writes the statuses table, `status.statuses`, as a migration of the project's own, and apply it with the project's migrations. `status: { schema: 'presence' }` puts the table in another schema. `protobase dev` and `protobase serve` refuse to start while the table is missing. Without `status` there is none of it: no menu item, no endpoints, no table and no migration, and notifications go out as before.

People see the statuses of those they share an [organization](/reference/auth/#organizations) with, so status needs organizations: an app without them stops at startup, and `protobase migration` says why.

## Setting a status

Someone signed in as themselves opens "Set a status" in the [user menu](/reference/user-menu/) and picks:

- an availability: automatic, the default, which says nothing; busy; or do not disturb;
- a text of at most 100 characters, one line of plain text; an emoji typed in it is one character;
- when it clears: never, in 30 minutes, 1 hour or 4 hours, at the end of today or of this week (midnight, Sunday night for the week, in their own time zone), or at a date and time they choose.

Their status then shows by their name at the bottom of the sidebar, and the item shows it; they change it or clear it there at any time. Staff [signed in as the person](/reference/auth/#staff-sign-in) see no item.

Each person has one status, shown in every organization they are in. Only they set it: the server takes the person from the session, never from the request, and refuses staff signed in as them, visitors and outside apps acting for them, such as an MCP client. A text with control characters, a line break among them, or over 100 characters is refused with a `400` that says why, and so is a clear time that has passed. The text is always shown as text, never as HTML.

| Request | |
| --- | --- |
| `GET /api/status` | the caller's own status, `{ status }`, `null` without one |
| `PUT /api/status` | sets it from `{ availability, text, clearsAt }`, each required, `text` and `clearsAt` `null` for none and never; answers `{ status }` |
| `DELETE /api/status` | clears it; answers `204` |
| `GET /api/status/people` | `{ statuses }`, the statuses of everyone who shares an organization with the caller, their own among them |

A status is `{ userId, availability, text, clearsAt }`, with `availability` one of `automatic`, `busy` and `do_not_disturb`, and `clearsAt` an ISO time or `null`.

## Who sees it

The members of every organization the person is in see their status. Someone who shares no organization with them gets nothing, as for a person they cannot see: `GET /api/status/people` leaves them out. A visitor, signed in as no one, is refused with a `401`. <gap>`GET /api/status/people` cannot page because paging statuses is not implemented, so it answers every status set by those who share an organization with the caller, which suits a team, not thousands of people.</gap>

## How it clears

A status ends at its clear time for everyone, also while the person has no page open: the server reads a status whose time has passed as none, and do not disturb ends with it.

A page reads the statuses again every 15 seconds while it is in view, and when it comes back into view, over the connections it already has, so another person's change, or a status whose time has passed, shows within 15 seconds without reloading. It opens no connection of its own: a page near the 6 connections a browser keeps per server under HTTP/1.1 keeps working.

## Do not disturb

While someone is on do not disturb, when a [send](/reference/notifications/#sending)'s job runs, the send pushes to none of their devices, through any sender, built-in or the app's own. A send for the inbox still keeps the notification in their history, so the bell shows it and counts it unread. Nothing of that send is pushed later, when do not disturb ends. The others in the same send are pushed as usual. A send to devices, `{ deviceIds }`, holds the devices of someone on do not disturb too. Busy is a mark only, and holds nothing.

Your own server code asks the same question with `onDoNotDisturb(db, statusNames(options), userIds)` from `@protobase/server`, which answers the set of those on do not disturb now, so whatever else alerts people holds it alike.

## In the app

The members page and the sidebar can show who is online or away beside each person's status. Who is online or away is your app's own, from its [presence](/reference/channels/#presence), and you give it to Protobase once, as `presence` in `protobase.ui.tsx`: a React hook that answers each person's presence, `'online'` or `'away'`, by their user id, and leaves out someone with no page open. Protobase calls it once while the app shows, so it may use your own [channels](/reference/channels/) and live updates, and the marks follow it without a reload; Protobase opens no connection of its own for it, and a channel shares the socket the page already has.

```tsx
// protobase.ui.tsx
import { useEffect, useState } from 'react'
import { defineUi, useClient, type Presence } from '@protobase/ui'

// Each page of the app tracks itself on the channel of its workspace's record: online, or away when the tab is hidden.
const usePeoplePresence = () => {
  const client = useClient()
  const [presence, setPresence] = useState<Record<string, Presence>>()
  useEffect(() => {
    const lobby = client.channel('workspaces', 1)
    const track = () => void lobby.track({ away: document.hidden })
    const stop = lobby.onPresence((entries) => {
      const byUser: Record<string, Presence> = {}
      for (const entry of entries) {
        const user = entry.user === null ? undefined : String(entry.user)
        // Someone with one page in view is online, whatever their other pages say.
        if (user === undefined || byUser[user] === 'online') continue
        byUser[user] = (entry.state as { away: boolean }).away ? 'away' : 'online'
      }
      setPresence(byUser)
    })
    track()
    document.addEventListener('visibilitychange', track)
    return () => {
      document.removeEventListener('visibilitychange', track)
      stop()
      lobby.leave()
    }
  }, [client])
  return presence
}

export default defineUi({ presence: usePeoplePresence })
```

The organization's members page then shows each member as online or away beside their status, and a sidebar record whose mark names a person, such as a direct message, shows that person's presence and status beside its title, with the status text on hover and in the row's name (see [Marks per reader](/reference/sidebar/#marks-per-reader)). Someone the hook leaves out shows no presence, and without the hook nothing shows but the statuses. <gap>A sidebar row cannot show the presence of several people, such as a group conversation's, because a mark naming more than one person is not implemented.</gap>

`useMembers()` from `@protobase/ui` gives each member their `status` when they have one, beside their name and photo, `useStatuses()` the statuses alone, and `usePresence()` the presence your hook gives, by user id. `StatusMark` draws them beside a name: the online or away dot for `presence`, a mark for busy, one for do not disturb, and the text, in full or, with `textShown="hover"`, on hover:

```tsx
import { StatusMark, useMembers, usePresence } from '@protobase/ui'

export const Person = ({ id }: { id: string }) => {
  const person = useMembers().member(id)
  const presence = usePresence()?.[id]
  if (!person) return null
  return (
    <span className="flex items-center gap-1.5">
      {person.name}
      <StatusMark status={person.status} presence={presence} textShown="hover" />
    </span>
  )
}
```

`StatusMark` draws nothing of a status whose clear time has passed, even before the page reads the statuses again.

## The client

`client.status` of `@protobase/client` reads and sets the signed-in person's own status and reads the others':

```ts
const lunch = await client.status.set({ availability: 'busy', text: 'Having lunch', clearsAt: new Date(Date.now() + 3_600_000).toISOString() })
const everyone = await client.status.people()
await client.status.clear()
```

`set` rejects with an `ApiError` whose `slug` is `invalid-status-text`, `invalid-clear-time` or `invalid-status` for what the server refuses, and `own-sign-in-only` for staff signed in as the person.

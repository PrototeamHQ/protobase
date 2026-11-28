import type { Db } from '@protobase/query'
import { peopleEvents, type PeopleEvent } from '@protobase/schema/internal'
import { writeRingNotices } from '../calls/rings-sql'
import { writeRefreshNotices } from './refresh/refresh-notices'

/** The relay's side of telling people: `relayRuntime`'s `tellPeople`. */
export type TellPeople = (db: Db, userIds: readonly string[], event: PeopleEvent) => Promise<void>

/**
 * How the app tells these users' open pages that their access (`refresh`) or the calls ringing them (`rings`) changed:
 * on the relay's `people` channel in an app with the relay, whose pages follow no live stream, else through the live
 * stream's notices in the changes schema `schema`.
 */
export const pageNotices = (schema: string, relay: TellPeople | undefined) => ({
  refresh: (db: Db, userIds: readonly string[]) => (relay ? relay(db, userIds, peopleEvents.refresh) : writeRefreshNotices(db, schema, userIds)),
  rings: (db: Db, userIds: readonly string[]) => (relay ? relay(db, userIds, peopleEvents.rings) : writeRingNotices(db, schema, userIds)),
})

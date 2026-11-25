import type { ResourceModel } from '@protobase/schema'
import { storeNames, type StoreNamesSource } from '../better-auth/store/store-names'
import { changesSchema, type EventsOptions } from '../changes/events-options'
import { computedInput } from '../computed/computed-input'
import { notificationsTargets } from '../notifications/notifications-targets'
import type { NotificationsOptions } from '../notifications/options'
import type { RealtimeRelaySettings } from '../relay/relay-options'
import { relayInput } from '../relay/relay-targets'
import type { StatusOptions } from '../status/options'
import { statusTargets } from '../status/status-targets'
import type { WebhooksOptions } from '../webhooks/table/options'
import { webhooksTargets } from '../webhooks/table/webhooks-targets'
import type { WorkflowsOptions } from '../workflows/options'
import { workflowsTargets } from '../workflows/workflows-targets'
import { modulesSql } from './modules-sql'
import { noInput } from './schema-module'

// Each feature's schema modules as a migration writes them on a database without them, for tests and tools that make a
// feature's tables directly. The jobs schema some of them need is not part of them (`jobsSchemaSql`).

/** The webhooks schema, and its delivery log with `deliveryLog`. */
export const webhooksSchemaSql = (options: WebhooksOptions = {}, events?: EventsOptions) => modulesSql(webhooksTargets(options, events))

/** The workflows schema, and its storage configurations and custom steps while they are on. */
export const workflowsSchemaSql = (options: Pick<WorkflowsOptions, 'schema' | 'storage' | 'customSteps'> = {}) => modulesSql(workflowsTargets(options))

/** The devices and history tables, but for one a store of the app's own replaces; with `auth`, pointing at its users. */
export const notificationsSchemaSql = (options: NotificationsOptions = {}, auth?: StoreNamesSource) => modulesSql(notificationsTargets(options, auth && storeNames(auth)))

/** The statuses table, pointing at the users of `auth`. */
export const statusSchemaSql = (options: StatusOptions, auth: StoreNamesSource) => modulesSql(statusTargets(options, storeNames(auth)))

/** The calls schema, and the notices table rings reach open pages through. */
export const callsSchemaSql = (events?: EventsOptions) => modulesSql({ notices: { names: { schema: changesSchema(events) }, resources: {} }, calls: noInput })

/** The relay's trigger on the sessions table of `auth`, and `realtime.members` with the triggers of `channels`. */
export const relaySchemaSql = (auth: StoreNamesSource, channels: RealtimeRelaySettings['channels'], models: readonly ResourceModel[]) => modulesSql({ relay: relayInput(channels, models, storeNames(auth)) })

/** The `realtime_relay` schema of several processes. */
export const realtimeRelaySchemaSql = () => modulesSql({ realtime_relay: noInput })

/** The `channels` schema of SQL's broadcasts to the record channels. */
export const channelSendsSchemaSql = () => modulesSql({ channel_sends: noInput })

/** The rollups and formulas of `models`, with their values set and their time rollups filled. */
export const computedSchemaSql = (models: readonly ResourceModel[]) => modulesSql({ computed: computedInput(models) })

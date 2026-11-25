import { storeNames, type StoreNamesSource } from '../better-auth/store/store-names'
import type { EventsOptions } from '../changes/events-options'
import { notificationsTargets } from '../notifications/notifications-targets'
import type { NotificationsOptions } from '../notifications/options'
import type { WebhooksOptions } from '../webhooks/table/options'
import { webhooksTargets } from '../webhooks/table/webhooks-targets'
import type { WorkflowsOptions } from '../workflows/options'
import { workflowsTargets } from '../workflows/workflows-targets'
import { modulesSql } from './modules-sql'

// Each feature's schema modules as a migration writes them on a database without them, for tests and tools that make a
// feature's tables directly. The jobs schema some of them need is not part of them (`jobsSchemaSql`).

/** The webhooks schema, and its delivery log with `deliveryLog`. */
export const webhooksSchemaSql = (options: WebhooksOptions = {}, events?: EventsOptions) => modulesSql(webhooksTargets(options, events))

/** The workflows schema, and its storage configurations and custom steps while they are on. */
export const workflowsSchemaSql = (options: Pick<WorkflowsOptions, 'schema' | 'storage' | 'customSteps'> = {}) => modulesSql(workflowsTargets(options))

/** The devices and history tables, but for one a store of the app's own replaces; with `auth`, pointing at its users. */
export const notificationsSchemaSql = (options: NotificationsOptions = {}, auth?: StoreNamesSource) => modulesSql(notificationsTargets(options, auth && storeNames(auth)))

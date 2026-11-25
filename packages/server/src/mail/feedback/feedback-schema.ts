import { feedbackSchema, feedbackTable } from './feedback-store'

/**
 * The table's indexes by name: the unique one a report sent again stands on, a missing recipient counting as one, and
 * those of the admin list's filters and sort: the recipient, the message ids an app looks a send up by, and the type.
 */
export const feedbackIndexes = [
  ['feedback_provider_event_recipient_once', 'unique', '("provider", "event_id", "recipient") nulls not distinct'],
  ['feedback_recipient', '', '("recipient")'],
  ['feedback_message_id', '', '("message_id")'],
  ['feedback_provider_message_id', '', '("provider_message_id")'],
  ['feedback_type', '', '("type")'],
  ['feedback_created_at', '', '("created_at")'],
] as const

const indexesSql = () => feedbackIndexes.map(([name, kind, columns]) => `create ${kind ? `${kind} ` : ''}index if not exists "${name}" on ${feedbackTable} ${columns};`).join('\n')

// A complaint may leave its recipient out, as a provider that hides who complained does, when it names its message.
const namesRecipient = `constraint "feedback_names_recipient" check ("recipient" is not null or ("type" = 'complaint' and "message_id" is not null))`

// Step 1 of `mailFeedbackModule`: frozen once released, as every step is.
/** A row per recipient of each bounce or complaint report; a value the report does not state is NULL. */
export const feedbackTableSql = () => `create schema if not exists "${feedbackSchema}";

create table if not exists ${feedbackTable} (
  "id" bigint generated always as identity primary key,
  "provider" text not null,
  "event_id" text not null,
  "type" text not null check ("type" in ('bounce', 'complaint')),
  "bounce_type" text check ("bounce_type" is null or ("bounce_type" in ('hard', 'soft') and "type" = 'bounce')),
  "recipient" text check ("recipient" = lower("recipient")),
  "message_id" text,
  "provider_message_id" text,
  "reason" text,
  "occurred_at" timestamptz,
  "created_at" timestamptz not null,
  ${namesRecipient}
);

${indexesSql()}`

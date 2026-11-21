import type { PluginMail, PluginMailMessage } from '@protobase/workflows/plugin'

/** The shape of a series' name, the topic its mail is unsubscribed from, as the app's unsubscribe takes a topic; checked by the step's input schema. */
const seriesPattern = /^[a-z][a-z0-9_-]{0,62}$/

/** The `series` argument a mail step takes: a series' mail is bulk mail of the series' own topic. */
export const seriesInput = {
  type: 'string',
  pattern: seriesPattern.source,
  description: 'optional: the email series the mail belongs to, such as welcome; it carries a one-click unsubscribe from the series, and whoever unsubscribed from it gets nothing',
}

/** The fields a mail step with a series adds to its result. */
export const seriesOutput = {
  sent: { type: 'array', items: { type: 'string' }, description: 'with series: the addresses the mail went to' },
  skipped: { type: 'array', items: { type: 'string' }, description: 'with series: the addresses that unsubscribed from the series, sent nothing' },
} as const

/** The series of a step's `series` argument, when it has one; its schema has checked its shape. */
export const seriesOf = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** A mail step's result: the Message-ID it set, when anything went out, and with a series, who it went to and who was skipped. */
export type SeriesResult = { message_id?: string; sent?: string[]; skipped?: string[] }

/**
 * Sends `message` with `messageId` as its Message-ID through `mail`, as bulk mail of `series` when there is one,
 * resolving to the step's result.
 */
export const sendInSeries = async (mail: PluginMail, message: PluginMailMessage, messageId: string, series: string | undefined): Promise<SeriesResult> => {
  const headers = { ...message.headers, 'Message-ID': messageId }
  if (series === undefined) {
    await mail.send({ ...message, headers })
    return { message_id: messageId }
  }
  const { sent = [], skipped = [] } = await mail.send({ ...message, headers, bulk: true, topic: series })
  return { ...(sent.length > 0 && { message_id: messageId }), sent: sent.map((each) => each.to), skipped }
}

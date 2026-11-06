import type { Locale } from '@protobase/schema/internal'
import { messages } from '../../locale/messages'

const catalogue = messages('workflows/connections')

/** The connection texts people read in refusals, runs and triggers, in the app's language (`options.locale`), else English. */
export const connectionTexts = (locale: Locale | undefined) => catalogue(locale ?? 'en')

export type ConnectionTexts = ReturnType<typeof connectionTexts>

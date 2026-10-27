import type { ListParams, RecordPage } from './records'
import { budgetedJson, forcedJson, leadingFit } from './result-budget'

/** How a record tool's result says to read a field it cut. */
export const cutRecordNote = 'The fields in cut_fields were cut to fit the size limit, each with its full length; read the rest of one with get_record and its field, offset and max_chars arguments.'

const fewerNote = (count: number) => `Only ${count} records fit the size limit; pass next_page_token as page_token for the next ones. ${cutRecordNote}`

/**
 * A page of records as JSON within the size budget: its strings trimmed, then, when that does not fit, the page
 * listed again with as many records as fit, so its next_page_token goes on from the last one returned.
 */
export const budgetedPage = async (page: RecordPage, params: ListParams, list: (params: ListParams) => Promise<RecordPage>) => {
  const json = budgetedJson(page, cutRecordNote)
  if (json) return json
  if (page.items.length <= 1) return forcedJson(page, cutRecordNote)
  const fits = (count: number) => budgetedJson({ ...page, items: page.items.slice(0, count), note: fewerNote(count) }, fewerNote(count)) !== undefined
  const count = leadingFit(page.items.length - 1, fits)
  const fewer = await list({ ...params, page_size: count })
  return forcedJson({ ...fewer, note: fewerNote(fewer.items.length) }, fewerNote(fewer.items.length))
}

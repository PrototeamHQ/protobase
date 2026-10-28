import type { RecordMark } from '../../app-shell/nav'

/**
 * A hook a view's `.nav({ recent: { marks: name } })` names: how each record of `resource` stands out in the sidebar
 * for the person reading, by the record's key as its address carries it, such as an unread conversation drawn bold with a
 * count of its mentions. The sidebar group calls it while it shows the records, so it may use the API client, live
 * updates and queries; returning undefined, as while it loads, marks none.
 */
export type MarksHook = (resource: string) => Record<string, RecordMark> | undefined

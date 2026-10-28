import type { ResourceModel, ViewModel } from '@protobase/schema'
import { recordTitle } from '../../live/model-helpers'
import type { TitleReader, TitleRule } from './title-rule'

/** A record's title as the framework shows it, else `fallback`, the record's key. */
export type RecordTitleOf = (model: ResourceModel, view: ViewModel | undefined, record: Record<string, unknown>, fallback: string) => string

/** The fields a record must be read with for its view to title it. */
export const titleFieldsOf = (model: ResourceModel, view: ViewModel | undefined) => view?.titleFrom?.fields ?? []

/**
 * Titles records for this reader: a view's `titleFrom` by its rule, else its stored title as `recordTitle` does. The key
 * shows when the rule returns nothing, is not registered, or a field it reads is unreadable or was not read with the record.
 */
export const recordTitleOf =
  (rules: Record<string, TitleRule>, reader: TitleReader): RecordTitleOf =>
  (model, view, record, fallback) => {
    const from = view?.titleFrom
    if (!from) return recordTitle(model, view, record, fallback)
    const rule = rules[from.rule]
    if (!rule || from.unreadable || from.fields.some((name) => record[name] === undefined)) return fallback
    return rule(record, reader) || fallback
  }

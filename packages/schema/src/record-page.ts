import { fillText, textPlaceholders, valueText } from './address-template'
import type { RecordPageModel, ResourceModel, TitleFromModel } from './model'
import { recordValueAt } from './template-path'

/** The title rule that names a record after the people in a field of user ids other than the reader. */
export const membersRule = 'members'

/** What is wrong with the record page's own fields, those a conversation's header reads of the record; empty when nothing is. */
export const recordPageErrors = (page: RecordPageModel | undefined, resource: ResourceModel): string[] => {
  if (!page || !('conversation' in page)) return []
  const { subtitle, members, placeholder, empty } = page.conversation
  const unknown = (prop: string, text: string | undefined) =>
    textPlaceholders(text ?? '').filter((name) => !Object.hasOwn(resource.fields, name)).map((name) => `conversation ${prop} names field "${name}", which the resource does not have`)
  return [
    ...unknown('placeholder', placeholder),
    ...unknown('empty', empty),
    ...(subtitle === undefined || Object.hasOwn(resource.fields, subtitle) ? [] : [`conversation subtitle names field "${subtitle}", which the resource does not have`]),
    ...(members === undefined || Object.hasOwn(resource.fields, members) ? [] : [`conversation members names field "${members}", which the resource does not have`]),
  ]
}

/** The title a conversation page with `members` gives its record, after the people in it other than the reader. */
export const membersTitle = (page: RecordPageModel | undefined): { titleFrom: TitleFromModel } | undefined => {
  if (!page || !('conversation' in page) || page.conversation.members === undefined) return
  return { titleFrom: { rule: membersRule, fields: [page.conversation.members] } }
}

/** A conversation page's text, its `placeholder` or `empty`, with each `{{field}}` filled from the record: an empty value fills as an empty string. */
export const recordText = (text: string, record: Record<string, unknown>) => fillText(text, (path) => valueText(recordValueAt(record, path)))

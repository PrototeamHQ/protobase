import type { RecordPageModel, ResourceModel, TitleFromModel } from './model'

/** The title rule that names a record after the people in a field of user ids other than the reader. */
export const membersRule = 'members'

/** What is wrong with the record page's own fields, those a conversation's header reads of the record; empty when nothing is. */
export const recordPageErrors = (page: RecordPageModel | undefined, resource: ResourceModel): string[] => {
  if (!page || !('conversation' in page)) return []
  const { subtitle, members } = page.conversation
  return [
    ...(subtitle === undefined || Object.hasOwn(resource.fields, subtitle) ? [] : [`conversation subtitle names field "${subtitle}", which the resource does not have`]),
    ...(members === undefined || Object.hasOwn(resource.fields, members) ? [] : [`conversation members names field "${members}", which the resource does not have`]),
  ]
}

/** The title a conversation page with `members` gives its record, after the people in it other than the reader. */
export const membersTitle = (page: RecordPageModel | undefined): { titleFrom: TitleFromModel } | undefined => {
  if (!page || !('conversation' in page) || page.conversation.members === undefined) return
  return { titleFrom: { rule: membersRule, fields: [page.conversation.members] } }
}

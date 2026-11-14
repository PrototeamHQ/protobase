import type { ViewedFile } from './file-viewer'

/**
 * A key that changes when any of `siblings` does: its stored uri, and the record key and file field a sibling carries
 * (`SiblingFile`), which its link's address names. A missing key or field is `null`.
 */
export const siblingsKey = <File extends ViewedFile>(siblings: readonly File[]) =>
  JSON.stringify(siblings.map((sibling) => [sibling.uri, 'key' in sibling ? sibling.key : null, 'field' in sibling ? sibling.field : null]))

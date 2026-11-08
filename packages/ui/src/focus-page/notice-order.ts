/** What a notice says, which sets which one shows while several want the strip. */
export type NoticeLevel = 'refused' | 'conflict' | 'draft' | 'info'

const order: readonly NoticeLevel[] = ['refused', 'conflict', 'draft', 'info']

/** Where a notice stands: the lowest shows, and the next returns once it clears. */
export const noticeOrder = (level: NoticeLevel) => order.indexOf(level)

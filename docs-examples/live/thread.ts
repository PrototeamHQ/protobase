import { f, resource } from '@protobase/schema'

// A chat thread over a view merging messages and replies: an open thread shows a new message or reply within a second or two.

/** thread */
export const thread = resource('thread')
  .table('thread')
  .fields({
    id: f.text().filterable(),
    body: f.text(),
    sent_at: f.timestamp().sortable(),
  })
  .primaryKey((r) => r.id)
  .live({ reads: ['messages', 'replies'] })

import type { RecordComment } from '@protobase/client'
import { bodyParts } from './mention-text'

/** A comment's text as written, line breaks kept, each `@{name}` of someone it mentions picked out. */
export const CommentBody = ({ comment }: { comment: RecordComment }) => (
  <p className="whitespace-pre-wrap break-words">
    {bodyParts(comment.body, comment.mentions).map((part, index) =>
      'mention' in part ? (
        <span key={index} className="font-medium text-primary">
          @{part.mention}
        </span>
      ) : (
        part.text
      ),
    )}
  </p>
)

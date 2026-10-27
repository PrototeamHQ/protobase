import type { RecordComment } from '@protobase/client'
import { MentionedText } from '../../mentions'

/** A comment's text as written, line breaks kept, each `@{name}` of someone it mentions picked out. */
export const CommentBody = ({ comment }: { comment: RecordComment }) => <MentionedText text={comment.body} mentions={comment.mentions} />

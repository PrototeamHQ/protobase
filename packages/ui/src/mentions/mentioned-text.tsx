import { lazyPart } from '../lib/lazy-part'
import { bodyParts, mentionClass } from './mention-text'
import type { MessageContentProps } from './message-content'

// marked and DOMPurify load with the first message shown, as they do for the first markdown field
export const loadMessageContent = () => import('./message-content').then((module) => module.MessageContent)

/** The text as written, line breaks kept, until the renderer has loaded or when it does not load. */
export const AsWritten = ({ text, mentions }: MessageContentProps) => (
  <div className="whitespace-pre-wrap break-words">
    {bodyParts(text, mentions).map((part, index) =>
      'mention' in part ? (
        <span key={index} className={mentionClass}>
          @{part.mention}
        </span>
      ) : (
        part.text
      ),
    )}
  </div>
)

/**
 * A message's text, such as a comment's: bold, italic, strikethrough, code, code blocks, lists and quotes rendered, web
 * addresses as links opening in a new tab, and each `@{name}` of someone it mentions picked out; a name not in `mentions`
 * stays plain.
 */
export const MentionedText = lazyPart(loadMessageContent, AsWritten)

import { lazyPart } from '../lib/lazy-part'
import { messageClass } from './message-class'
import { bodyParts, mentionClass } from './mention-text'
import type { MessageContentProps } from './message-content'
import { paragraphsOf } from './paragraphs'

// marked and DOMPurify load with the first message shown, as they do for the first markdown field
export const loadMessageContent = () => import('./message-content').then((module) => module.MessageContent)

/**
 * The text as written, line breaks kept, until the renderer has loaded or when it does not load: its paragraphs in the
 * box and paragraphs the renderer draws, so text without block markdown, such as lists or code blocks, takes the same
 * room before and after.
 */
export const AsWritten = ({ text, mentions }: MessageContentProps) => (
  <div className={messageClass}>
    {paragraphsOf(text).map((paragraph, index) => (
      <p key={index}>
        {bodyParts(paragraph, mentions).map((part, at) =>
          'mention' in part ? (
            <span key={at} className={mentionClass}>
              @{part.mention}
            </span>
          ) : (
            part.text
          ),
        )}
      </p>
    ))}
  </div>
)

/**
 * A message's text, such as a comment's: bold, italic, strikethrough, code, code blocks, lists and quotes rendered, web
 * addresses as links opening in a new tab, and each `@{name}` of someone it mentions picked out; a name not in `mentions`
 * stays plain. `MentionedText.useLoaded()` tells when its renderer has loaded, or failed to, for a page that shows its
 * messages only then.
 */
export const MentionedText = lazyPart(loadMessageContent, AsWritten)

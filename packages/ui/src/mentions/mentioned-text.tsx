import { bodyParts } from './mention-text'

/** Text as written, line breaks kept, each `@{name}` of someone it mentions picked out; a name not in `mentions` stays plain. */
export const MentionedText = ({ text, mentions }: { text: string; mentions: readonly { name?: string }[] }) => (
  <p className="whitespace-pre-wrap break-words">
    {bodyParts(text, mentions).map((part, index) =>
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

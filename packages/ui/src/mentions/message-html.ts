import { Marked, type Token, type Tokens } from 'marked'
import { escapeHtml, linkSchemes, newTabLink, safeAddress } from '../markdown/safe-html'
import { misleadingLinkText } from './link-text'
import { bodyParts, mentionClass } from './mention-text'
import { chatLines } from './message-lines'

// What a chat message leaves as typed: headings, rules, tables, link definitions and indented code, which a message
// rarely means; code blocks come only from ``` fences
const asTyped = () => undefined

// A link whose text names another address than the link's, marked before mentions turn its text into markup
type CheckedLink = Tokens.Link & { misleading?: boolean }

// Text as it reads, with all formatting inside it flattened
const plainText = (tokens: Token[]): string =>
  tokens.map((token) => ('tokens' in token && token.tokens ? plainText(token.tokens) : 'text' in token ? token.text : '')).join('')

const marked = new Marked({
  gfm: true,
  // A line break in the text is one on the page, as in a chat message
  breaks: true,
  tokenizer: { heading: asTyped, lheading: asTyped, hr: asTyped, table: asTyped, def: asTyped, code: asTyped },
  renderer: {
    // Raw HTML shows as the text it is, never as markup
    html: ({ text, block }: Tokens.HTML | Tokens.Tag) => (block ? `<p>${escapeHtml(text)}</p>` : escapeHtml(text)),
    link({ href, title, tokens, misleading }: CheckedLink) {
      const text = this.parser.parseInline(tokens)
      const address = safeAddress(href, linkSchemes)
      if (address === null) return text
      // Text naming another address than the link's shows the link's own, so it cannot pass for a trusted one
      if (misleading) return newTabLink(address, title, escapeHtml(href))
      return newTabLink(address, title, text)
    },
    // An image shows as the markdown written for it
    image: ({ raw }: Tokens.Image) => escapeHtml(raw),
  },
})

const withMentions = (text: string, mentions: readonly { name?: string }[]) =>
  bodyParts(text, mentions)
    .map((part) => ('mention' in part ? `<span class="${escapeHtml(mentionClass)}">@${escapeHtml(part.mention)}</span>` : escapeHtml(part.text)))
    .join('')

/**
 * A message's text as HTML: bold, italic, strikethrough, code, code blocks, lists and quotes, by chat's line rules
 * (`chatLines`), web addresses as links opening in a new tab, and each `@{name}` of someone it mentions picked out,
 * outside code. Raw HTML shows as text and
 * links go only to http(s), mailto and tel addresses or relative ones; the page sanitises the result again.
 */
export const messageHtml = (text: string, mentions: readonly { name?: string }[]) => {
  const tokens = marked.lexer(chatLines(text))
  marked.walkTokens(tokens, (token) => {
    // A link is reached before the text inside it
    if (token.type === 'link') (token as CheckedLink).misleading = misleadingLinkText(plainText(token.tokens ?? []), token.href)
    // Bold comes only from `**`, so `__init__` stays as typed
    if (token.type === 'strong' && token.raw.startsWith('__')) Object.assign(token, { type: 'text', text: token.raw, tokens: undefined })
    if (token.type !== 'text' || token.tokens) return
    token.text = withMentions(token.text, mentions)
    token.escaped = true
  })
  return marked.parser(tokens)
}

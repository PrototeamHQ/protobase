/** A user picked from the list while writing, whom `@{name}` in the text mentions. */
export type PickedUser = { id: string; name: string }

/** The `@` being typed: where it starts, and the text after it up to the caret, which picks a user by name. */
export type ActiveMention = { start: number; query: string }

/** The mention the caret is in: an `@` that starts the text or follows whitespace, with no whitespace up to the caret. */
export const activeMention = (text: string, caret: number): ActiveMention | undefined => {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))
  return match ? { start: caret - match[1]!.length - 1, query: match[1]! } : undefined
}

/** The text with the active mention written out as `@{name} `, and the caret after it. */
export const insertMention = (text: string, active: ActiveMention, name: string) => {
  const rest = text.slice(active.start + 1 + active.query.length)
  const written = `@${name}${rest.startsWith(' ') ? '' : ' '}`
  return { text: `${text.slice(0, active.start)}${written}${rest}`, caret: active.start + written.length + (rest.startsWith(' ') ? 1 : 0) }
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// `@{name}` as a word of its own, the longest names first so "@Ann de Vries" is not read as "@Ann".
const mentionPattern = (names: readonly string[]) => {
  const unique = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)
  return unique.length === 0 ? undefined : new RegExp(`(?<![\\p{L}\\p{N}_@])@(${unique.map(escaped).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
}

/** The ids of the picked users whose `@{name}` is still in the text, each once. */
export const mentionedIds = (text: string, picked: readonly PickedUser[]) => {
  const pattern = mentionPattern(picked.map((user) => user.name))
  const written = new Set(pattern ? [...text.matchAll(pattern)].map((match) => match[1]!) : [])
  return [...new Set(picked.filter((user) => written.has(user.name)).map((user) => user.id))]
}

export type BodyPart = { text: string } | { mention: string }

/** A comment's text split into plain text and the `@{name}` of each person it mentions whose name is known. */
export const bodyParts = (body: string, mentions: readonly { name?: string }[]): BodyPart[] => {
  const pattern = mentionPattern(mentions.flatMap((user) => (user.name ? [user.name] : [])))
  if (!pattern) return [{ text: body }]
  const parts: BodyPart[] = []
  let at = 0
  for (const match of body.matchAll(pattern)) {
    if (match.index > at) parts.push({ text: body.slice(at, match.index) })
    parts.push({ mention: match[1]! })
    at = match.index + match[0].length
  }
  if (at < body.length) parts.push({ text: body.slice(at) })
  return parts
}

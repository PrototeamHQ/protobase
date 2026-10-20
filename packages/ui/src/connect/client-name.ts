/** The longest client name shown; a longer one is cut, so it cannot push the rest of the page away. */
export const clientNameLength = 60

// Control, line and paragraph separators, zero-width and bidirectional formatting characters: they hide text, break it
// over lines or turn it around, so a client could make its name read as something else.
const hidden = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff]/g

/** A client's own name as one line of plain text, without characters that hide or turn text, cut to `clientNameLength`. */
export const clientName = (name: string | undefined) => {
  const plain = (name ?? '').replace(hidden, ' ').replace(/\s+/g, ' ').trim()
  if (!plain) return undefined
  return plain.length > clientNameLength ? `${plain.slice(0, clientNameLength - 1)}…` : plain
}

// A slug is what the server accepts: lowercase ASCII letters, digits and dashes, starting with a letter or digit, at
// most 63 characters (see `slugPattern` in host.ts).
const maxLength = 63
const suffixLength = 6
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** A slug from a name: its letters without accents, lowercased, the words joined by dashes. Empty for a name with none. */
export const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '')

/** Six random letters and digits, which tell apart organizations whose names give the same slug. */
export const slugSuffix = () => Array.from(crypto.getRandomValues(new Uint8Array(suffixLength)), (byte) => alphabet[byte % alphabet.length]).join('')

/**
 * The slug of a new organization named `name`: the name's own slug while no organization has it, else that slug with a
 * dash and `suffix`, shortened to fit; `suffix` alone for a name that gives no slug, such as one in another script.
 */
export const slugForName = (name: string, taken: (slug: string) => Promise<boolean>, suffix: string) => {
  const base = slugOf(name)
  if (base === '') return Promise.resolve(suffix)
  return taken(base).then((clash) => (clash ? `${base.slice(0, maxLength - suffix.length - 1).replace(/-+$/, '')}-${suffix}` : base))
}

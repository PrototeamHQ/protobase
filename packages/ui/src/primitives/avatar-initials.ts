/** The hue of someone's avatar, the same for the same id. */
export const hueOf = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7)

/** The initials of someone's avatar: the first letters of the first two words of their name. */
export const initialsOf = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

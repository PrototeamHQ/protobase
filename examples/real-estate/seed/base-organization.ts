// Lowercase ASCII words joined by dashes; diacritics are dropped, so Müller becomes muller.
const slugOf = (name: string) =>
  name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'organization'

/** Organization 1, the one every user works in (auth/auth.ts), named after the app; the owner fills in the rest. */
export const baseOrganization = (name: string) => {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('The organization needs a name: pass --name "<the app name>"')
  return { id: 1, name: trimmed, slug: slugOf(trimmed), city: '', kvk_number: '' }
}

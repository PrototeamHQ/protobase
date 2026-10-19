/** The languages Protobase's built-in screens come in. */
export const locales = ['en', 'nl'] as const

export type Locale = (typeof locales)[number]

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale)

/**
 * The first of `preferred`, language tags such as the browser's `nl-BE` or `en`, whose language the screens come in;
 * English when none is.
 */
export const pickLocale = (preferred: readonly string[]): Locale => {
  const language = preferred.map((tag) => tag.split('-')[0]!.toLowerCase()).find(isLocale)
  return language ?? 'en'
}

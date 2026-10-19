import { isLocale, locales, type Locale } from '@protobase/schema/internal'

/** The language of the admin app's built-in screens, for every user; unset, each sees their browser's language. */
export type LocaleOption = Locale

/** The option, checked: a language the screens do not come in stops startup. */
export const localeSetting = (option: unknown): Locale | undefined => {
  if (option === undefined) return undefined
  if (isLocale(option)) return option
  throw new Error(`options.locale is ${JSON.stringify(option)}: use one of ${locales.map((locale) => `'${locale}'`).join(', ')}`)
}

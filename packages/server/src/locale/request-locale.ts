import { pickLocale, type Locale } from '@protobase/schema/internal'

// `nl-BE, nl;q=0.9, en;q=0.8` as its tags, the most preferred first; a tag of weight 0 is not acceptable.
const acceptedTags = (header: string) =>
  header
    .split(',')
    .map((entry) => {
      const [tag = '', ...params] = entry.trim().split(';')
      const weight = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
      return { tag: tag.trim(), q: weight ? Number(weight.slice(2)) : 1 }
    })
    .filter(({ tag, q }) => tag !== '' && tag !== '*' && q > 0)
    .toSorted((a, b) => b.q - a.q)
    .map(({ tag }) => tag)

/** The language a request's user reads: the app's (`options.locale`) when it sets one, else their `Accept-Language`'s. */
export const requestLocale = (appLocale: Locale | undefined, request: Request): Locale =>
  appLocale ?? pickLocale(acceptedTags(request.headers.get('accept-language') ?? ''))

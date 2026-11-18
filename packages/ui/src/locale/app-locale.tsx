import { Fragment, useEffect, type ReactNode } from 'react'
import type { Locale } from '@protobase/schema/internal'
import { activeLocale, fallbackLocale, setAppLocale } from './active-locale'
import { TextsGate } from './texts-gate'

/**
 * Puts the screens below in the language the app sets for everyone, from its `/meta`, or in the fallback when it sets
 * none, once its texts are loaded; draws them anew when that changes, and tells the page which language it is in.
 */
export const AppLocale = ({ locale, children }: { locale: Locale | undefined; children: ReactNode }) => (
  <TextsGate locale={locale ?? fallbackLocale()}>
    <Localized locale={locale}>{children}</Localized>
  </TextsGate>
)

const Localized = ({ locale, children }: { locale: Locale | undefined; children: ReactNode }) => {
  setAppLocale(locale)
  const active = activeLocale()
  useEffect(() => {
    document.documentElement.lang = active
  }, [active])
  return <Fragment key={active}>{children}</Fragment>
}

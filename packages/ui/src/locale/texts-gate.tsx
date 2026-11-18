import { Suspense, use, type ReactNode } from 'react'
import type { Locale } from '@protobase/schema/internal'
import { HoldSplash } from '../app/splash-hold'
import { loadTexts, textsLoaded } from './messages'

const Loaded = ({ locale, children }: { locale: Locale; children: ReactNode }) => {
  if (!textsLoaded(locale)) use(loadTexts(locale))
  return children
}

/** Draws its children once the texts of `locale` are loaded, holding the launch splash until then. */
export const TextsGate = ({ locale, children }: { locale: Locale; children: ReactNode }) => (
  <Suspense fallback={<HoldSplash />}>
    <Loaded locale={locale}>{children}</Loaded>
  </Suspense>
)

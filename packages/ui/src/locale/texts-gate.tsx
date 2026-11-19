import { Component, Suspense, use, type ReactNode } from 'react'
import type { Locale } from '@protobase/schema/internal'
import { HoldSplash } from '../app/splash-hold'
import { loadTexts, textsLoaded } from './messages'

const Loaded = ({ locale, children }: { locale: Locale; children: ReactNode }) => {
  if (!textsLoaded(locale)) use(loadTexts(locale))
  return children
}

/**
 * What shows in place of the screens when their texts do not load, such as offline after the app switched to another
 * language: index.html's own words, as no texts may be there to say it in, and a way to load the page again.
 */
export const TextsMissing = () => (
  <div role="alert" className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
    <p className="text-muted-foreground">The app did not load. Check your connection, then try again.</p>
    <button type="button" className="rounded-md border border-border-strong px-3 py-1.5 text-body font-medium hover:bg-muted" onClick={() => window.location.reload()}>
      Try again
    </button>
  </div>
)

/** Shows `TextsMissing` in place of what throws below it, as texts that do not load make it throw. */
export class TextsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? <TextsMissing /> : this.props.children
  }
}

/** Draws its children once the texts of `locale` are loaded, holding the launch splash until then, and says so when they do not load. */
export const TextsGate = ({ locale, children }: { locale: Locale; children: ReactNode }) => (
  <TextsBoundary>
    <Suspense fallback={<HoldSplash />}>
      <Loaded locale={locale}>{children}</Loaded>
    </Suspense>
  </TextsBoundary>
)

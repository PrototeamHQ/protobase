/// <reference lib="webworker" />
import { setFallbackLocale } from '../../locale/active-locale'
import { createBuilderHandler, type FromBuilder, type ToBuilder } from './builder-port'

// Builds an export file off the page's thread: each message's bytes go back as they are made, moved rather than copied.
const handle = createBuilderHandler()
const scope = self as unknown as DedicatedWorkerGlobalScope

// The shown values are written in the page's language, which the start of each file names.
scope.onmessage = (event: MessageEvent<ToBuilder>) => {
  if (event.data.kind === 'start') setFallbackLocale(event.data.locale)
  const bytes = handle(event.data)
  scope.postMessage({ bytes } satisfies FromBuilder, [bytes.buffer])
}

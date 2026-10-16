/// <reference lib="webworker" />
import { createBuilderHandler, type FromBuilder, type ToBuilder } from './builder-port'

// Builds an export file off the page's thread: each message's bytes go back as they are made, moved rather than copied.
const handle = createBuilderHandler()
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<ToBuilder>) => {
  const bytes = handle(event.data)
  scope.postMessage({ bytes } satisfies FromBuilder, [bytes.buffer])
}

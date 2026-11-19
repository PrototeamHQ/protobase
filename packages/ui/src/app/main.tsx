import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as projectUi from 'virtual:protobase-project-ui'
import '../styles.css'
import { guarded } from '../lib/guarded'
import { listenForPresses } from '../lib/press-feedback'
import { browserLocale } from '../locale/active-locale'
import { loadTexts } from '../locale/messages'
import { cachedMeta, cachedPlugins } from '../data/start-cache/cached-plugins'
import { openStartCache } from '../data/start-cache/open-start-cache'
import { browserLoader } from '../plugins/load-plugin'
import { createPluginSource, preloadPlugins } from '../plugins/plugin-source'
import { pluginWaitMs } from '../plugins/use-plugin-loads'
import { App } from './app'
import { preloadPages } from './lazy-routes'
import { judgesFirstFrame, showFirstFrame } from './first-frame'
import { restorePage } from './live-update/kept-page'
import { nativeBridgeOf, type NativeBridge } from './native-auth-fetch'
import { showKeyboardAccessoryBar } from './native-keyboard'
import { applyNativeTextSize } from './native-text-size'
import { applyNativeViewport } from './native-viewport'
import { pageApiOrigin } from './page-api-origin'
import { uiFromModule } from './pages/ui-from-module'

const root = document.getElementById('root')
if (!root) throw new Error('index.html needs an element with id "root"')

listenForPresses(document)

const nativeBridge = nativeBridgeOf(window as { Capacitor?: NativeBridge })
if (nativeBridge) {
  applyNativeViewport(document)
  applyNativeTextSize(document.documentElement, nativeBridge.getPlatform())
  void showKeyboardAccessoryBar(nativeBridge)
  // Back on the page the app showed before a live update reloaded it
  const storage = guarded(() => window.sessionStorage, undefined)
  if (storage) restorePage(storage, window.history)
}

// The screens' texts in the browser's language start loading with the start cache, which the app waits for anyway. One
// that does not load leaves the app's own wait for it to say so.
const locale = browserLocale()
const texts = loadTexts(locale).catch(() => undefined)

// The first render already has what the app showed last time, read from the start cache, with the plugins it names.
// Nothing in that frame waits on code: the texts of the languages it may be in are loaded first, and, when the cache
// holds a page to draw, the pages' code too.
const plugins = createPluginSource(browserLoader)
void openStartCache().then(async (startCache) => {
  const meta = cachedMeta(startCache)
  await Promise.all([
    preloadPlugins(plugins, cachedPlugins(startCache), pluginWaitMs),
    texts,
    ...(meta?.locale ? [loadTexts(meta.locale).catch(() => undefined)] : []),
    ...(meta ? [preloadPages()] : []),
  ])
  const app = (
    <StrictMode>
      <App baseUrl={`${pageApiOrigin() ?? ''}/api/v1`} ui={uiFromModule(projectUi)} locale={locale} nativeBridge={nativeBridge} startCache={startCache} pluginSource={plugins} />
    </StrictMode>
  )
  if (judgesFirstFrame(window)) return showFirstFrame(root, app)
  createRoot(root).render(app)
})

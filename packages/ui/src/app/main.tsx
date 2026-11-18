import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as projectUi from 'virtual:protobase-project-ui'
import '../styles.css'
import { guarded } from '../lib/guarded'
import { listenForPresses } from '../lib/press-feedback'
import { browserLocale } from '../locale/active-locale'
import { cachedPlugins } from '../data/start-cache/cached-plugins'
import { openStartCache } from '../data/start-cache/open-start-cache'
import { browserLoader } from '../plugins/load-plugin'
import { createPluginSource, preloadPlugins } from '../plugins/plugin-source'
import { pluginWaitMs } from '../plugins/use-plugin-loads'
import { App } from './app'
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

// The first render already has what the app showed last time, read from the start cache, with the plugins it names
const plugins = createPluginSource(browserLoader)
void openStartCache().then(async (startCache) => {
  await preloadPlugins(plugins, cachedPlugins(startCache), pluginWaitMs)
  const app = (
    <StrictMode>
      <App baseUrl={`${pageApiOrigin() ?? ''}/api/v1`} ui={uiFromModule(projectUi)} locale={browserLocale()} nativeBridge={nativeBridge} startCache={startCache} pluginSource={plugins} />
    </StrictMode>
  )
  if (judgesFirstFrame(window)) return showFirstFrame(root, app)
  createRoot(root).render(app)
})

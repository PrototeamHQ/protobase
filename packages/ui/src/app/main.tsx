import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as projectUi from 'virtual:protobase-project-ui'
import '../styles.css'
import { guarded } from '../lib/guarded'
import { listenForPresses } from '../lib/press-feedback'
import { browserLocale } from '../locale/active-locale'
import { openStartCache } from '../data/start-cache/open-start-cache'
import { App } from './app'
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

// The first render already has what the app showed last time, read from the start cache
void openStartCache().then((startCache) =>
  createRoot(root).render(
    <StrictMode>
      <App baseUrl={`${pageApiOrigin() ?? ''}/api/v1`} ui={uiFromModule(projectUi)} locale={browserLocale()} nativeBridge={nativeBridge} startCache={startCache} />
    </StrictMode>,
  ),
)

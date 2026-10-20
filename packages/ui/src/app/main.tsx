import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as projectUi from 'virtual:protobase-project-ui'
import '../styles.css'
import { browserLocale } from '../locale/active-locale'
import { App } from './app'
import { pageApiOrigin } from './page-api-origin'
import { uiFromModule } from './pages/ui-from-module'

const root = document.getElementById('root')
if (!root) throw new Error('index.html needs an element with id "root"')

createRoot(root).render(
  <StrictMode>
    <App baseUrl={`${pageApiOrigin() ?? ''}/api/v1`} ui={uiFromModule(projectUi)} locale={browserLocale()} />
  </StrictMode>,
)

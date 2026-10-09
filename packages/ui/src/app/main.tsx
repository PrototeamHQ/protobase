import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ui from 'virtual:protobase-project-ui'
import '../styles.css'
import { App } from './app'

const root = document.getElementById('root')
if (!root) throw new Error('index.html needs an element with id "root"')

createRoot(root).render(
  <StrictMode>
    <App baseUrl="/api/v1" ui={ui} />
  </StrictMode>,
)

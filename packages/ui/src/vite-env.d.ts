/// <reference types="vite/client" />

// protobase.ui.tsx: its components exported by name, and the rest of its UI config as the default export.
declare module 'virtual:protobase-project-ui' {
  const ui: import('./app/pages/project-ui').ProjectUi
  export default ui
}

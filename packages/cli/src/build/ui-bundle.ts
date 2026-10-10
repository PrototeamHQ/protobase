import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import { adminAppDir } from '../project/admin-app'
import { extensionImports, extensionStyles, type Extension } from '../project/extensions'
import { projectUiPlugin } from '../project/project-ui'

// The admin UI as a production build: index.html and content-hashed files under assets/. Asset URLs are absolute,
// so index.html works as the answer to any deep link. It calls /api on its own origin and reads the rest at runtime;
// the only project code in it is the project's protobase.ui.tsx, when it has one, and the extensions' UI configs.
export const buildUiBundle = async ({ outDir, projectDir, extensions = [] }: { outDir: string; projectDir?: string; extensions?: Extension[] }) => {
  // Vite builds for a NODE_ENV that is already set (vitest sets `test`, a .env may set `development`), and React then
  // ships its development build; the bundle is always a production build.
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  await build({
    configFile: false,
    root: adminAppDir,
    base: '/',
    mode: 'production',
    publicDir: false,
    logLevel: 'warn',
    plugins: [projectUiPlugin(projectDir, extensions), ...(projectDir === undefined ? [] : [extensionImports(projectDir, extensions)]), extensionStyles(extensions), react(), tailwindcss()],
    build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  }).finally(() => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
  })
}

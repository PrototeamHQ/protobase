import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createServer, searchForWorkspaceRoot, type Plugin } from 'vite'
import { layoutCheck } from '../build/layout-check'
import { uiPackageDir } from '../project/admin-app'
import { bundledImports, bundledPackageDirs } from '../project/bundled-imports'
import { extensionImports, projectStyles, type Extension } from '../project/extensions'
import { faviconLink } from '../project/favicon-link'
import { projectUiPlugin } from '../project/project-ui'
import { sharedModulesPlugin } from '../project/shared-modules'
import { themeLink } from '../project/theme-link'
import { frameHeaders } from '../serve/static-site'
import { projectPackages } from '../version/project-packages'
import { devHost } from './loopback'

export type AppServerOptions = {
  appDir: string
  projectDir: string
  extensions: Extension[]
  port: number
  cacheDir?: string
  allowedHosts: string[]
}

// The app's browser dependencies, optimised up front: when Vite discovers them while serving the first page
// it re-optimises and answers 504 "Outdated Optimize Dep", which shows up as a blank first load.
const appDependencies = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'lucide-react',
  'zod',
  '@tanstack/react-query',
  '@tanstack/react-table',
  'recharts',
  '@sentry/browser',
  'maplibre-gl',
  'pmtiles',
  'fflate',
  'react-map-gl/maplibre',
]

/**
 * The Vite server of `protobase dev` that serves the admin app from `appDir`, with the project's UI, theme and icons,
 * on `port`; `plugins` come first, such as the one that hands the API's requests to its process. A bundled project's
 * page code gets the admin app's own @protobase packages and React.
 */
export const createAppServer = (options: AppServerOptions, plugins: Plugin[]) => {
  const projectDirs = [options.projectDir, ...options.extensions.map((extension) => extension.dir)]
  const bundled = projectPackages(options.projectDir).mode === 'bundled'
  return createServer({
    root: options.appDir,
    configFile: false,
    ...(options.cacheDir && { cacheDir: options.cacheDir }),
    // @protobase/ui is the admin app itself, served from its files: a project's or extension's import of it
    // reaches the same modules instead of a pre-bundled copy, which would hold its own React contexts and
    // cannot load MapLibre's `?worker&url` worker import.
    optimizeDeps: { include: appDependencies, exclude: ['@protobase/ui'] },
    server: {
      // Vite sends these with the page of every navigation, as `protobase serve` does: no other site frames the app.
      headers: frameHeaders,
      host: devHost,
      port: options.port,
      strictPort: true,
      ...(options.allowedHosts.length > 0 && { allowedHosts: options.allowedHosts }),
      fs: { allow: [searchForWorkspaceRoot(options.projectDir), uiPackageDir, ...projectDirs, ...(bundled ? bundledPackageDirs() : [])] },
    },
    plugins: [
      ...plugins,
      sharedModulesPlugin(),
      themeLink(options.projectDir),
      faviconLink(options.projectDir),
      projectUiPlugin(options.projectDir, options.extensions),
      ...(bundled ? [bundledImports(projectDirs)] : []),
      extensionImports(options.projectDir, options.extensions),
      projectStyles(options.projectDir, options.extensions),
      layoutCheck(),
      react(),
      tailwindcss(),
    ],
  })
}

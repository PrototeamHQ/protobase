import { existsSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import devServer from '@hono/vite-dev-server'
import react from '@vitejs/plugin-react'
import { createServer, searchForWorkspaceRoot, type Plugin } from 'vite'
import { adminAppDir, adminAppMain, uiPackageDir } from '../project/admin-app'
import { moduleFile } from '../module-file'
import { projectUiPlugin } from '../project/project-ui'
import { layoutCheck } from '../build/layout-check'
import { checkDatabase } from './check-database'
import { loadNearestEnvFile } from './env'

export type DevOptions = {
  port: number
  envVar: string
  projectDir: string
  // Overrides the admin app of @protobase/ui; used by tests.
  appDir?: string
  // Vite's dependency cache; defaults to node_modules/.vite, which concurrent dev servers share.
  cacheDir?: string
  allowedHosts: string[]
}

const entry = moduleFile('./entry', import.meta.url)

const requireAppFiles = (appDir: string) => {
  const missing = ['index.html', adminAppMain].filter((file) => !existsSync(path.join(appDir, file)))
  if (missing.length > 0) {
    throw new Error(`The admin app is missing ${missing.join(', ')} in ${appDir}; \`protobase dev\` serves the app from there`)
  }
}

// The project's files are loaded with a dynamic import, which Vite does not track as an edge of the entry
// module. Any change inside the project therefore drops the server-side module graph, so the next request
// rebuilds the API and `/meta` reports a new X-Meta-Version.
const reloadOnProjectChange = (projectDir: string): Plugin => ({
  name: 'protobase-project-reload',
  handleHotUpdate: ({ file, server }) => {
    if (file.startsWith(`${projectDir}${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}`)) {
      server.environments.ssr.moduleGraph.invalidateAll()
    }
    return undefined
  },
})

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
  '@tanstack/react-virtual',
  'recharts',
]

export const runDev = async (options: DevOptions, out: (text: string) => void) => {
  loadNearestEnvFile(options.projectDir)
  const url = process.env[options.envVar]
  if (!url) throw new Error(`${options.envVar} is not set; add it to .env or pass --env <VARIABLE>`)
  const appDir = options.appDir ?? adminAppDir
  requireAppFiles(appDir)
  await checkDatabase(url, options.projectDir)

  process.env.PROTOBASE_PROJECT = options.projectDir
  process.env.PROTOBASE_DATABASE_URL = url
  const server = await createServer({
    root: appDir,
    configFile: false,
    ...(options.cacheDir && { cacheDir: options.cacheDir }),
    optimizeDeps: { include: appDependencies },
    server: {
      port: options.port,
      strictPort: true,
      ...(options.allowedHosts.length > 0 && { allowedHosts: options.allowedHosts }),
      fs: { allow: [searchForWorkspaceRoot(options.projectDir), uiPackageDir, options.projectDir] },
    },
    plugins: [
      reloadOnProjectChange(options.projectDir),
      projectUiPlugin(options.projectDir),
      layoutCheck(),
      react(),
      tailwindcss(),
      devServer({
        entry,
        // Vite serves everything that is not under /api.
        exclude: [/^(?!\/api(\/|\?|$)).*/],
        injectClientScript: false,
      }),
    ],
  })
  await server.listen()
  // Load the API once now so a missing authenticator or a broken config stops startup instead of failing requests.
  await server.ssrLoadModule(entry).catch(async (error: Error) => {
    await server.close()
    throw error
  })
  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : options.port
  out(`protobase dev ready at http://localhost:${port}\n`)
  out(`  project  ${options.projectDir}\n  api      http://localhost:${port}/api/v1 (docs at /api/docs)\n`)
  out('  login    sign in with a user created by `protobase users create`\n')
  return server
}

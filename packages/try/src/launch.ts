// The launch flow: in the home folder, PostgreSQL, the app the launcher carries, its migrations when the app is new, an
// admin and the sample workflow on the first run, then the app served on this computer alone and opened in the browser,
// until Ctrl+C.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { type AppBundle, markApp, unpackApp } from './app-bundle'
import { freePort } from './free-port'
import { databaseUrl, installPostgres, isRunning, postgresIn, startPostgres, stopPostgres } from './postgres'
import { runRuntime, serveRuntime, waitUntilServing } from './runtime'
import { addSampleWorkflow } from './sample'
import { homeDir, readOpenBrowser, readSettings, writeSettings, type Settings } from './settings'
import { holdHome } from './single-launch'

const createAdmin = (home: string, settings: Settings, appDir: string, env: Record<string, string>) => {
  const admin = { email: 'admin@example.com', password: randomBytes(12).toString('base64url') }
  runRuntime(home, ['create-admin', appDir, admin.email, '--password-stdin'], env, `${admin.password}\n`)
  writeSettings(home, { ...settings, admin })
  writeFileSync(path.join(home, 'sign-in.txt'), `Protobase on this computer\nEmail: ${admin.email}\nPassword: ${admin.password}\n`)
  return admin
}

// The default browser, through the URL handler Windows has had since its first versions.
const openInBrowser = (url: string) => spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { stdio: 'ignore', detached: true }).unref()

export const launch = async (bundle: AppBundle) => {
  const openBrowser = readOpenBrowser(process.env)
  const started = performance.now()
  const home = homeDir(process.env)
  const settings = readSettings(home)
  const pg = postgresIn(home, settings.dbPassword, settings.dbPort)
  const release = holdHome(home, () => isRunning(pg))
  await installPostgres(home, pg)
  startPostgres(pg)
  const app = unpackApp(home, bundle)
  const appPort = await freePort(settings.appPort)
  // The browser's address, which sign-in checks requests' origins against; the launcher itself calls 127.0.0.1, where
  // the app listens.
  const base = `http://localhost:${appPort}`
  const env = { DATABASE_URL: databaseUrl(pg), PROTOBASE_SECRET: settings.secret, PROTOBASE_URL: base, PROTOBASE_HOST: '127.0.0.1', PORT: String(appPort) }
  if (app.updated) {
    runRuntime(home, ['migrate', app.dir], env)
    markApp(app.dir, bundle)
  }
  const firstRun = !settings.admin
  const admin = settings.admin ?? createAdmin(home, settings, app.dir, env)

  const server = serveRuntime(home, app.dir, env)
  const stop = () => {
    server.kill()
    stopPostgres(pg)
    release()
    console.log('Stopped.')
    process.exit(0)
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, stop)
  server.on('exit', (code) => {
    stopPostgres(pg)
    release()
    console.log(`The app stopped (exit ${code}).`)
    process.exit(code ?? 1)
  })
  await waitUntilServing(`http://127.0.0.1:${appPort}`)
  if (firstRun) await addSampleWorkflow(base, `http://127.0.0.1:${appPort}`, admin.email, admin.password)

  console.log(`
Protobase is running at ${base}  (ready in ${Math.floor((performance.now() - started) / 1000)} s)
Sign in as ${admin.email} with password ${admin.password}
Open Workflows in the sidebar to try the sample "Say hello".

Your data stays in ${home} (the password is in sign-in.txt there).
Press Ctrl+C to stop. To remove everything, stop it and delete that folder.
`)
  if (openBrowser) openInBrowser(base)
}

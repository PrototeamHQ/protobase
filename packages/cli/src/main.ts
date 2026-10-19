import { statSync } from 'node:fs'
import path from 'node:path'
import { Command, InvalidArgumentError } from 'commander'
import { registerAuth } from './auth/register'
import { buildDeployBundle } from './build/deploy-bundle'
import { buildPlugin, pluginManifestFile } from './build/plugin-build'
import { buildServeRuntime } from './build/serve-runtime'
import { buildShell } from './build/shell'
import { manifestFile } from './bundle/manifest'
import { resolveConnectionUrl } from './db/connect'
import { parseHosts } from './dev/hosts'
import { loadNearestEnvFile } from './dev/env'
import { runDev } from './dev/run'
import { runDoctor } from './doctor/run'
import { resolveExtensions } from './project/extensions'
import { projectErrorReporter } from './project/error-reporter'
import { runScaffold } from './scaffold/run'
import { serveBundle } from './serve/serve-bundle'
import { serveBundleDir } from './serve/serve-dir'
import { reportCrashes } from './serve/crash-reports'
import { closeOnSignals } from './serve/signals'
import { loadWorkerBundle, startWorker } from './worker/start-worker'
import { registerOrganizations } from './organizations/register'
import { registerFiles } from './files/register'
import { registerMigration } from './migration/register'
import { registerSkill } from './skill/register'
import { registerToken, registerUsers } from './users/register'
import type { UiSection } from './scaffold/ui-file'

const out = (text: string) => process.stdout.write(text)

const collect = (value: string, previous: string[]) => [...previous, value]

const uiSection = (value: string): UiSection => {
  if (value === 'names' || value === 'list') return value
  throw new InvalidArgumentError('expected names or list')
}

const collectSection = (value: string, previous: UiSection[]) => [...previous, uiSection(value)]

const program = new Command('protobase').description('Protobase command line')

program
  .command('scaffold')
  .description('Generate or update config/<resource>/data.ts from a Postgres database')
  .argument('[args...]', 'connection string (unless --env) followed by an optional target: all, schema, schema.table, schema.table.column')
  .option('--env <variable>', 'read the connection string from this environment variable')
  .option('--config <dir>', 'config folder', 'config')
  .option('--yes', 'accept all proposals without asking', false)
  .option('--dry-run', 'print a diff instead of writing files', false)
  .option('--ui', 'also write config/<resource>/ui.ts (names and list)', false)
  .option('--ui-list', 'write only the list section of ui.ts', false)
  .option('--ui-section <name>', 'write only this ui.ts section (names or list), repeatable', collectSection, [])
  .option('--exclude <table>', 'skip a schema or schema.table, repeatable', collect, [])
  .action(async (args: string[], opts) => {
    const [first, ...rest] = args
    const url = resolveConnectionUrl(opts.env ? undefined : first, opts.env)
    const [target, ...extra] = opts.env ? args : rest
    if (extra.length > 0) throw new Error(`Unexpected argument "${extra[0]}"`)
    const ui: UiSection[] = opts.ui ? ['names', 'list'] : [...opts.uiSection, ...(opts.uiList ? ['list' as const] : [])]
    await runScaffold(
      {
        url,
        target,
        configDir: path.resolve(opts.config),
        yes: opts.yes,
        dryRun: opts.dryRun,
        ui: [...new Set(ui)],
        excludes: opts.exclude,
      },
      out,
    )
  })

program
  .command('doctor')
  .description('Check a config folder against the database')
  .argument('[connection]', 'connection string')
  .option('--env <variable>', 'read the connection string from this environment variable')
  .option('--config <dir>', 'config folder', 'config')
  .action(async (connection: string | undefined, opts) => {
    const url = resolveConnectionUrl(connection, opts.env)
    const { errors } = await runDoctor({ url, configDir: path.resolve(opts.config) }, out)
    if (errors > 0) process.exitCode = 1
  })

program
  .command('dev')
  .description('Serve the admin app and API for the project in the current directory')
  .option('--port <port>', 'port for the app and API', '5173')
  .option('--env <variable>', 'environment variable holding the database URL', 'DATABASE_URL')
  .option('--allowed-hosts <hosts>', 'extra Host headers to accept, comma separated; a leading dot matches subdomains (.trycloudflare.com)')
  .option('--cache-dir <dir>', "Vite's dependency cache, so parallel dev servers do not share one")
  .option('--extend <dir>', 'merge the protobase.config.ts and protobase.ui.tsx in this folder before the project\'s, repeatable', collect, [])
  .action(async (opts) => {
    const server = await runDev(
      {
        extensions: resolveExtensions(opts.extend),
        port: Number(opts.port),
        envVar: opts.env,
        projectDir: process.cwd(),
        cacheDir: opts.cacheDir && path.resolve(opts.cacheDir),
        allowedHosts: parseHosts(opts.allowedHosts),
      },
      out,
    )
    process.once('SIGINT', () => void server.close().then(() => process.exit(0)))
    process.once('SIGTERM', () => void server.close().then(() => process.exit(0)))
  })

program
  .command('build')
  .description('Build the deploy bundle of the project in the current directory: its config module, the admin app with the project\'s UI as a plugin, and the manifest')
  .option('--out <dir>', 'output folder', 'dist')
  .option('--bun', "have Bun's bundler write the config module, for a bundle only Bun serves (needs bun on PATH)", false)
  .option('--extend <dir>', 'merge the protobase.config.ts and protobase.ui.tsx in this folder before the project\'s, repeatable', collect, [])
  .action(async (opts) => {
    const extensions = resolveExtensions(opts.extend)
    const onWarning = (message: string) => process.stderr.write(`warning: ${message}\n`)
    const manifest = await buildDeployBundle({ projectDir: process.cwd(), outDir: path.resolve(opts.out), bun: opts.bun, extensions, onWarning })
    const packages = manifest.nodeModules ? `, ${manifest.nodeModules}/` : ''
    const plugins = manifest.plugins.length > 0 ? ` with plugins ${manifest.plugins.map((plugin) => plugin.name).join(', ')}` : ''
    out(`built ${opts.out}: ${manifest.server}${packages}, ${manifest.public}/${plugins} and ${manifestFile} (api ${manifest.api.join(', ')})\n`)
  })

program
  .command('build-plugin')
  .description('Build a plugin the admin app loads at runtime: its protobase.ui.tsx as one ES module, its stylesheet and plugin.json')
  .argument('[dir]', 'the plugin folder, holding protobase.ui.tsx', '.')
  .option('--out <dir>', 'output folder (default: dist in the plugin folder)')
  .option('--name <name>', "the plugin's name (default: its package.json name)")
  .action(async (dir: string, opts) => {
    const pluginDir = path.resolve(dir)
    const outDir = path.resolve(opts.out ?? path.join(dir, 'dist'))
    const manifest = await buildPlugin({ pluginDir, outDir, ...(opts.name && { name: opts.name }) })
    const shown = path.relative(process.cwd(), outDir)
    out(`built ${shown.startsWith('..') ? outDir : shown || '.'}: ${pluginManifestFile}, ${manifest.entry} and ${manifest.css} (${manifest.name}, plugin API ${manifest.api}, Protobase ${manifest.protobase})\n`)
  })

program
  .command('build-shell', { hidden: true })
  .description("Build the admin app every bundle shares, as @protobase/ui's package and the protobase image ship it")
  .argument('<out>', 'output folder')
  .action(async (outDir: string) => {
    const shell = await buildShell(path.resolve(outDir))
    out(`built ${outDir}: the shell of Protobase ${shell.protobase} (plugin API ${shell.pluginApi})\n`)
  })

program
  .command('build-serve')
  .description('Bundle the serve runtime into one file for Bun: bun --no-install protobase-serve.js <bundle.js>')
  .option('--out <file>', 'output file', 'dist/protobase-serve.js')
  .option('--bun', "have Bun's bundler write the file (needs bun on PATH)", false)
  .action(async (opts) => {
    await buildServeRuntime({ outFile: path.resolve(opts.out), bun: opts.bun })
    out(`built ${opts.out}\n`)
  })

program
  .command('serve')
  .description('Serve a bundle written by `protobase build` until SIGTERM or SIGINT: a folder as a host serves it, a config module as its API alone')
  .argument('<bundle>', 'the bundle folder, e.g. dist, or its dist/protobase.config.js')
  .action(async (bundle: string) => {
    loadNearestEnvFile(process.cwd())
    if (statSync(bundle).isDirectory()) await serveBundleDir(bundle, process.env, out)
    else await serveBundle(bundle, process.env, out)
  })

program
  .command('worker')
  .description("Run the jobs of a bundle from `protobase build` in a process of their own, until SIGTERM or SIGINT, as `serve` runs them beside the API")
  .argument('<bundle>', 'the bundle folder, e.g. dist, or its dist/protobase.config.js')
  .action(async (bundle: string) => {
    loadNearestEnvFile(process.cwd())
    const project = await loadWorkerBundle(bundle)
    const reporter = await projectErrorReporter(project, process.env)
    if (reporter) reportCrashes(reporter)
    const worker = await startWorker({ project, databaseUrl: process.env.DATABASE_URL || undefined })
    closeOnSignals(worker.stop)
    out(`protobase worker running ${worker.jobs} job${worker.jobs === 1 ? '' : 's'}\n`)
  })

registerUsers(program)
registerOrganizations(program)
registerToken(program)
registerAuth(program)
registerMigration(program)
registerFiles(program)
registerSkill(program)

// Central error handler: commands throw, the user sees one line.
export const run = (argv: string[]) =>
  program.parseAsync(argv).catch((error: Error) => {
    process.stderr.write(`error: ${error.message}\n`)
    process.exitCode = 1
  })

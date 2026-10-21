// The serve runtime that `protobase build-serve` bundles into one file: `bun protobase-serve.js [serve] <bundle>`,
// `migrate <bundle>` and `create-admin <bundle> <email>` (runtime-program.ts). It owns the process: environment,
// database pool, HTTP server and shutdown; the bundle only carries the config, the app and its migrations.
import { createAdminInBundle } from './create-admin'
import { provideHostModules } from './host-modules'
import { migrateBundle } from './migrate-bundle'
import { runtimeProgram } from './runtime-program'
import { serveBundlePath } from './serve-bundle-path'

const fail = (message: string) => {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}

const out = (text: string) => process.stdout.write(text)

provideHostModules()
await runtimeProgram({
  // The server runs until SIGTERM or SIGINT.
  serve: async (bundle) => {
    await serveBundlePath(bundle, process.env, out)
  },
  migrate: (bundle) => migrateBundle(bundle, process.env, out),
  // The auth store keeps a connection pool open, so the command ends the process itself.
  createAdmin: async (bundle, email, options) => {
    await createAdminInBundle(bundle, email, options, out)
    process.exit(0)
  },
})
  .parseAsync(process.argv)
  .catch((error: Error) => fail(error.message))

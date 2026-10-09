// The serve runtime that `protobase build-serve` bundles into one file: `bun protobase-serve.js <bundle.js>`.
// It owns the process: environment, database pool, HTTP server and shutdown; the bundle only carries the config.
import { provideHostModules } from './host-modules'
import { serveBundle } from './serve-bundle'

const fail = (message: string) => {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}

provideHostModules()
const [file, ...extra] = process.argv.slice(2)
if (!file || extra.length > 0) fail('usage: protobase-serve.js <bundle.js>')
await serveBundle(file!, process.env, (text) => process.stdout.write(text)).catch((error: Error) => fail(error.message))

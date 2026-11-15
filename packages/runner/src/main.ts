// protobase-runner: `bun run runner:build` compiles this file into one executable per platform.
import { cli } from './cli'
import { exec } from './exec'

const stopping = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stopping.abort())

const say = (line: string) => console.log(`${new Date().toISOString()} ${line}`)

try {
  const printed = await cli(process.argv.slice(2), { exec, env: process.env, say, signal: stopping.signal })
  if (printed) console.log(printed)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
process.exit(0)

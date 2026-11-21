import type { Command } from 'commander'

export const registerRelay = (program: Command) => {
  const relay = program.command('relay').description('The realtime relay the app hands its connections to (realtime.relay)')
  relay
    .command('app')
    .description("Print the app's entry for the relay's apps file, from realtime.relay and url")
    .action(async () => {
      const [{ checkRelayOptions }, { loadSourceConfig }, { loadNearestEnvFile }, { relayAppEntry }] = await Promise.all([
        import('@protobase/server'),
        import('../config/source-config'),
        import('../dev/env'),
        import('./app-entry'),
      ])
      loadNearestEnvFile(process.cwd())
      const config = await loadSourceConfig(process.cwd(), { command: 'tool' })
      if (!config.realtime?.relay) throw new Error('The config has no realtime.relay')
      const url = config.url ?? process.env.PROTOBASE_URL
      process.stdout.write(`${JSON.stringify(relayAppEntry(checkRelayOptions(config.realtime.relay), url), null, 2)}\n`)
    })
}

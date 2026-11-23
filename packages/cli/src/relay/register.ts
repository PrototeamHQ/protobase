import type { Command } from 'commander'

export const registerRelay = (program: Command) => {
  const relay = program.command('relay').description('The realtime relay the app hands its connections to (realtime.relay)')
  relay
    .command('app')
    .description("Print the app's entry for the relay's apps file, from realtime.relay or PROTOBASE_RELAY_*, url and the views")
    .action(async () => {
      const [{ configExports, relaySettings }, { loadSourceConfig }, { projectResources }, { loadNearestEnvFile }, { relayAppEntry }] = await Promise.all([
        import('@protobase/server'),
        import('../config/source-config'),
        import('../config/project-parts'),
        import('../dev/env'),
        import('./app-entry'),
      ])
      loadNearestEnvFile(process.cwd())
      const config = await loadSourceConfig(process.cwd(), { command: 'tool' })
      if (!config.realtime?.relay) throw new Error('The config has no realtime.relay')
      const url = config.url ?? process.env.PROTOBASE_URL
      const views = configExports(await projectResources(config)).views.map((view) => view.toModel())
      process.stdout.write(`${JSON.stringify(relayAppEntry(relaySettings(config.realtime.relay, process.env), { url, apiPath: config.apiPath, views }), null, 2)}\n`)
    })
}

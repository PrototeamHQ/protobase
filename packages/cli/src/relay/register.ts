import type { Command } from 'commander'

export const registerRelay = (program: Command) => {
  const relay = program.command('relay').description('The realtime relay the app hands its connections to (realtime.relay)')
  relay
    .command('app')
    .description("Print the app's entry for the relay's apps file, from realtime.relay or the conversation pages' members, PROTOBASE_REALTIME_*, url and the views")
    .action(async () => {
      const [{ appRelayChannels, configExports, relaySettings }, { loadSourceConfig }, { projectResources }, { loadNearestEnvFile }, { relayAppEntry }] = await Promise.all([
        import('@protobase/server'),
        import('../config/source-config'),
        import('../config/project-parts'),
        import('../dev/env'),
        import('./app-entry'),
      ])
      loadNearestEnvFile(process.cwd())
      const config = await loadSourceConfig(process.cwd(), { command: 'tool' })
      const url = config.url ?? process.env.PROTOBASE_URL
      const exported = configExports(await projectResources(config))
      const views = exported.views.map((view) => view.toModel())
      const channels = appRelayChannels(config.realtime?.relay, { views, models: exported.resources.map((resource) => resource.toModel()), signIn: Boolean(config.auth) })
      if (!channels) throw new Error('The app cannot use the relay: its config has no realtime.relay, and no live conversation resource whose page has members, with sign-in, to derive its channels from')
      process.stdout.write(`${JSON.stringify(relayAppEntry(relaySettings({ ...config.realtime?.relay, channels }, process.env), { url, apiPath: config.apiPath, views }), null, 2)}\n`)
    })
}

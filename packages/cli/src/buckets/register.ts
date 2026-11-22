import type { Command } from 'commander'

const out = (text: string) => void process.stdout.write(text)

export const registerBuckets = (program: Command) => {
  const buckets = program.command('buckets').description('Recount the time rollups the app keeps')

  buckets
    .command('rebuild')
    .description("Recount a time rollup's buckets from a time, or all of them, such as after importing records older than its late")
    .argument('<resource>', 'the time rollup, by its resource name')
    .option('--from <time>', 'recount from the bucket this date or date and time (UTC unless it names a zone) falls in; default: every bucket')
    .action(async (resource: string, opts: { from?: string }) => {
      const [{ parseFrom, rebuildBuckets }, { loadBundleProject }] = await Promise.all([import('./rebuild'), import('../project/load-bundle-project')])
      const from = opts.from === undefined ? undefined : parseFrom(opts.from)
      const project = await loadBundleProject(undefined, process.cwd())
      try {
        await rebuildBuckets(project.db, project.resources.map((source) => source.toModel()), resource, from)
      } finally {
        await project.close()
      }
      out(`Recounted ${resource} ${from ? `from ${from}` : 'from its first record'}\n`)
    })
}

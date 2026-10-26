import type { Command } from 'commander'
import type { EncryptionTools } from '@protobase/server'
import type { RebindFlags } from './rebind-option'

const out = (text: string) => void process.stdout.write(text)

const bundleArgument = ['[bundle]', 'a bundle from `protobase build` (its folder or config module); default: the project in the current directory'] as const

// Runs `work` with the project's encryption tools, the keys from the environment and the nearest .env, like serve.
const withTools = async (bundle: string | undefined, work: (tools: EncryptionTools) => Promise<boolean>) => {
  const [{ createEncryptionTools }, { loadBundleProject }] = await Promise.all([import('@protobase/server'), import('../project/load-bundle-project')])
  const project = await loadBundleProject(bundle, process.cwd())
  try {
    const tools = createEncryptionTools({ ...project, env: process.env })
    if (!tools) return out('The project has no encrypted fields\n')
    if (await work(tools)) process.exitCode = 1
  } finally {
    await project.close()
  }
}

export const registerEncryption = (program: Command) => {
  const encryption = program.command('encryption').description('Check and update the stored values of encrypted fields')

  encryption
    .command('status')
    .description('Count each encrypted field\'s values by key, list plaintext and unreadable ones and old values left in history; exits 1 when any need work')
    .argument(...bundleArgument)
    .action(async (bundle: string | undefined) => {
      const { printStatus } = await import('./print-status')
      await withTools(bundle, async (tools) => printStatus(await tools.status(), out))
    })

  encryption
    .command('apply')
    .description('Encrypt plaintext values, move values to the current key, rebind renamed ones and remove old values from history; exits 1 when unreadable values remain')
    .argument(...bundleArgument)
    .option('--rebind <resource[.field]>', 'rebind the values of a resource, or one field, sealed before a rename')
    .option('--from-table <table>', 'the table, as .table() named it, the values were in before')
    .option('--from-column <column>', 'the column the field\'s values were in before')
    .action(async (bundle: string | undefined, flags: RebindFlags) => {
      const [{ rebindOption }, { printApply }] = await Promise.all([import('./rebind-option'), import('./print-apply')])
      const rebind = rebindOption(flags)
      await withTools(bundle, async (tools) => {
        out(`Encrypting with key ${tools.kid}\n`)
        return printApply(await tools.apply(rebind ? { rebind } : {}), out)
      })
    })
}

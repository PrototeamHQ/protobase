import type { Command } from 'commander'
import { createFileCleanup } from '@protobase/server'
import { cleanupCommand } from './cleanup-command'
import { loadFilesProject } from './load-project'

const out = (text: string) => process.stdout.write(text)

export const registerFiles = (program: Command) => {
  const files = program.command('files').description('Manage the stored files of the project in the current directory')

  files
    .command('cleanup')
    .description('Delete the files whose scheduled delete is due and that no row references, such as replaced files and unused uploads')
    .argument('[bundle]', 'a bundle from `protobase build` (its folder or config module); default: the project in the current directory')
    .action(async (bundle: string | undefined) => {
      const project = await loadFilesProject(bundle, process.cwd())
      try {
        const cleanup = createFileCleanup(project)
        if (cleanup) await cleanupCommand(cleanup.run, out)
        else out('The project has no file fields\n')
      } finally {
        await project.close()
      }
    })
}

import { spawn } from 'node:child_process'
import { moduleFile } from '../module-file'
import { projectPackages } from '../version/project-packages'

const preload = moduleFile('./preload', import.meta.url)

/**
 * The Bun command line that runs `file` with `args` for the project in `projectDir`: never installing a missing package,
 * and in a bundled project with the CLI's own copies of the @protobase packages and those the serve runtime supplies
 * (see preload.ts). A locked project's script imports its installed packages.
 */
export const scriptCommand = (projectDir: string, file: string, args: string[]) => [
  '--no-install',
  ...(projectPackages(projectDir).mode === 'bundled' ? ['--preload', preload] : []),
  file,
  ...args,
]

/**
 * Runs a project script, such as a seed or a migration, under Bun in a process of its own, in `projectDir`, and
 * resolves with its exit code. Its output goes to this process's, so a host that captures that captures it too.
 */
export const runScript = (projectDir: string, file: string, args: string[]) =>
  new Promise<number>((resolve, reject) => {
    const child = spawn('bun', scriptCommand(projectDir, file, args), { cwd: projectDir, stdio: ['inherit', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk: Buffer) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk))
    child.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT' ? new Error('protobase run needs Bun: install it from https://bun.sh') : error))
    child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })

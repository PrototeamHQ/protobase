import { randomBytes } from 'node:crypto'
import type { Readable } from 'node:stream'

export type PasswordSource = 'prompt' | 'stdin' | 'generate'

// Called first thing in `users create`, before the project or database is touched. `false` is `--no-password`.
export const rejectPasswordArgument = (value: unknown) => {
  if (value === undefined || value === false) return
  throw new Error(
    'Passwords are never accepted as arguments (they end up in shell history); type it at the prompt, or use --password-stdin or --generate-password',
  )
}

export const generatePassword = () => randomBytes(18).toString('base64url')

// The whole stream is the password, minus one trailing newline.
export const readPasswordFromStream = async (input: Readable) => {
  const chunks: Buffer[] = []
  for await (const chunk of input) chunks.push(Buffer.from(chunk))
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  if (!password) throw new Error('No password on stdin')
  return password
}

// Reads one line from the terminal without echoing it.
export const readHidden = (question: string) =>
  new Promise<string>((resolve, reject) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) {
      reject(new Error('A password prompt needs a terminal; use --password-stdin or --generate-password'))
      return
    }
    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    let value = ''
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          stdin.setRawMode(false)
          stdin.off('data', onData)
          reject(new Error('Cancelled'))
          return
        }
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          stdout.write('\n')
          resolve(value)
          return
        }
        value = char === '\u007f' ? value.slice(0, -1) : value + char
      }
    }
    stdin.on('data', onData)
  })

export type PasswordDeps = {
  stdin: Readable
  prompt: (question: string) => Promise<string>
}

export const resolvePassword = async (
  options: { passwordStdin: boolean; generatePassword: boolean; noPassword?: boolean },
  deps: PasswordDeps,
): Promise<{ password?: string; generated: boolean }> => {
  if ([options.passwordStdin, options.generatePassword, options.noPassword].filter(Boolean).length > 1) {
    throw new Error('Use only one of --password-stdin, --generate-password and --no-password')
  }
  if (options.noPassword) return { generated: false }
  if (options.generatePassword) return { password: generatePassword(), generated: true }
  if (options.passwordStdin) return { password: await readPasswordFromStream(deps.stdin), generated: false }
  const password = await deps.prompt('Password: ')
  if (password !== (await deps.prompt('Repeat password: '))) throw new Error('The passwords do not match')
  return { password, generated: false }
}

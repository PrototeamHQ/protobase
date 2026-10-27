import { createInterface, type Interface } from 'node:readline/promises'
import type { Terminal } from './database-wizard'

/** A terminal whose prompt can be let go of. */
export type ProcessTerminal = Terminal & { closePrompt: () => void }

/**
 * This process's terminal, with `ask` only when stdin and stdout are one. Its questions share one prompt, so none reads
 * the answers typed ahead for the next, opened at the first and again after `closePrompt`, which a child process that
 * runs on the terminal, such as an install, needs first: the prompt keeps the terminal in raw mode, where Ctrl+C reaches
 * it instead of the child.
 */
export const openTerminal = (): ProcessTerminal => {
  let prompt: Interface | undefined
  const print = (text: string) => void process.stdout.write(text)
  const closePrompt = () => {
    prompt?.close()
    prompt = undefined
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) return { print, closePrompt }
  const ask = (text: string) => {
    prompt ??= createInterface({ input: process.stdin, output: process.stdout })
    return prompt.question(text)
  }
  return { ask, print, closePrompt }
}

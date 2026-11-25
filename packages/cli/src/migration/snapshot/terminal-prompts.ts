import { createInterface } from 'node:readline/promises'
import { chooseOff, confirmRevival, offerDefault } from './module-prompts'

/** The questions of `protobase migration` asked on the terminal, and what closes it once answered. */
export const terminalPrompts = () => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (question: string) => rl.question(question)
  return { prompts: { chooseOff: chooseOff(ask), confirmRevival: confirmRevival(ask), offerDefault: offerDefault(ask) }, close: () => rl.close() }
}

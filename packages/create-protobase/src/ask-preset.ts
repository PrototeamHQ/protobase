import { createInterface } from 'node:readline/promises'

/** The preset for an answer: its number in `names` or its name, the first one when the answer is empty. */
export const presetForAnswer = (names: string[], answer: string) => {
  const text = answer.trim()
  if (text === '') return names[0]
  const index = Number(text)
  if (Number.isInteger(index) && index >= 1 && index <= names.length) return names[index - 1]
  return names.find((name) => name === text)
}

const menu = (names: string[]) =>
  `Which preset do you want to start from?\n${names.map((name, i) => `  ${i + 1}. ${name}${i === 0 ? ' (default)' : ''}\n`).join('')}`

/** Asks in the terminal which of `names` to start from, again until the answer is one of them. */
export const askPreset = async (names: string[]) => {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  process.stdout.write(menu(names))
  let picked: string | undefined
  while (!picked) {
    picked = presetForAnswer(names, await prompt.question(`Preset [1-${names.length}]: `))
  }
  prompt.close()
  return picked
}

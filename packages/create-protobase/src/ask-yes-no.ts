/** The answer to a yes or no question: `fallback` when it is empty, yes for y or yes, no otherwise. */
export const yesForAnswer = (answer: string, fallback: boolean) => {
  const text = answer.trim().toLowerCase()
  if (text === '') return fallback
  return text === 'y' || text === 'yes'
}

/** Asks `text` with `question`, a terminal prompt's, showing which answer an empty one takes. */
export const askYesNo = async (question: (text: string) => Promise<string>, text: string, fallback: boolean) =>
  yesForAnswer(await question(`${text} ${fallback ? '[Y/n]' : '[y/N]'}: `), fallback)

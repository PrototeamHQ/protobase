/** The folder a new project goes in when nobody names one. */
export const defaultDir = 'my-app'

/** The folder for an answer: the answer trimmed, `fallback` when it is empty. */
export const dirForAnswer = (answer: string, fallback = defaultDir) => answer.trim() || fallback

/** Asks with `question`, a terminal prompt's, which folder to write the new project in, `fallback` by default. */
export const askDir = async (question: (text: string) => Promise<string>, fallback = defaultDir) =>
  dirForAnswer(await question(`Project folder [${fallback}]: `), fallback)

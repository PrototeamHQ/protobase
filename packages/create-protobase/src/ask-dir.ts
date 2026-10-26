/** The folder a new project goes in when nobody names one. */
export const defaultDir = 'my-app'

/** The folder for an answer: the answer trimmed, the default when it is empty. */
export const dirForAnswer = (answer: string) => answer.trim() || defaultDir

/** Asks with `question`, a terminal prompt's, which folder to write the new project in. */
export const askDir = async (question: (text: string) => Promise<string>) =>
  dirForAnswer(await question(`Project folder [${defaultDir}]: `))

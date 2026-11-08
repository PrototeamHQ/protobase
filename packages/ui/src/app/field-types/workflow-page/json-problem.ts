import { text } from './messages'

// The line of the character at `position`, from 1
const lineAt = (input: string, position: number) => input.slice(0, position).split('\n').length

/** What is wrong with `input` as JSON, naming the line where the parser says so, or nothing when it parses. */
export const jsonProblem = (input: string) => {
  try {
    JSON.parse(input)
    return
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    const position = /position (\d+)/.exec(error.message)?.[1]
    const line = /line (\d+)/.exec(error.message)?.[1] ?? (position === undefined ? undefined : lineAt(input, Number(position)))
    return line === undefined ? text('notJson') : text('notJsonLine', { line: Number(line) })
  }
}

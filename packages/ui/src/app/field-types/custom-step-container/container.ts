/** A custom step's container as its editor holds it: the Dockerfile, the files beside it in order, and its command. */
export type Container = { dockerfile: string; files: [path: string, text: string][]; command: string[] }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stored container, `{ dockerfile, files, command }`, as its editor holds it; parts that are missing or of another shape, empty. */
export const containerOf = (value: unknown): Container => {
  const given = isObject(value) ? value : {}
  return {
    dockerfile: typeof given.dockerfile === 'string' ? given.dockerfile : '',
    files: isObject(given.files) ? Object.entries(given.files).map(([path, text]) => [path, typeof text === 'string' ? text : JSON.stringify(text)]) : [],
    command: Array.isArray(given.command) ? given.command.map(String) : [],
  }
}

// Text that is a JSON list of texts, as that list.
const jsonList = (typed: string): string[] | undefined => {
  if (!typed.trimStart().startsWith('[')) return
  try {
    const parsed: unknown = JSON.parse(typed)
    return Array.isArray(parsed) && parsed.every((part) => typeof part === 'string') ? parsed : undefined
  } catch {
    return
  }
}

/** The command as typed: a JSON list of texts, such as `["sh", "-c", "..."]`, as that list, else one argument a line without its empty lines. */
export const commandOf = (typed: string) => jsonList(typed) ?? typed.split('\n').filter((line) => line !== '')

/** The command as its box shows it: one argument a line, or as a JSON list when an argument holds a line break of its own. */
export const commandText = (command: readonly string[]) => (command.some((part) => part.includes('\n')) ? JSON.stringify(command) : command.join('\n'))

/**
 * The container as it is stored: its files by path, a later file of the same path in place of an earlier one, and the
 * command only when it has an argument, the image's own otherwise.
 */
export const storedContainer = ({ dockerfile, files, command }: Container) => ({ dockerfile, files: Object.fromEntries(files), ...(command.length > 0 && { command }) })

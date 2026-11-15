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

/** The command typed one argument a line, without its empty lines. */
export const commandOf = (typed: string) => typed.split('\n').filter((line) => line !== '')

/**
 * The container as it is stored: its files by path, a later file of the same path in place of an earlier one, and the
 * command only when it has an argument, the image's own otherwise.
 */
export const storedContainer = ({ dockerfile, files, command }: Container) => ({ dockerfile, files: Object.fromEntries(files), ...(command.length > 0 && { command }) })

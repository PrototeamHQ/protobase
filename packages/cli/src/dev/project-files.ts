import path from 'node:path'

// A file of the project or an extension, not of a dependency they install.
export const isProjectFile = (dirs: string[], file: string) =>
  dirs.some((dir) => file.startsWith(`${dir}${path.sep}`)) && !file.includes(`${path.sep}node_modules${path.sep}`)

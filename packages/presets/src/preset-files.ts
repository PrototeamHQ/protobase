/**
 * Where one of an example's files goes in its preset, relative to both, or undefined when it stays here: the README
 * documents the example in this repository. npm leaves .gitignore files out of a package, so it ships as _gitignore,
 * to be renamed when a preset is copied into a project.
 */
export const presetPath = (file: string) => {
  if (file === 'README.md') return undefined
  if (file === '.gitignore') return '_gitignore'
  return file
}

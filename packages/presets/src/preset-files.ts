/**
 * Where one of an example's files goes in its preset, relative to both, or undefined when it stays here: the README
 * documents the example in this repository.
 */
export const presetPath = (file: string) => {
  if (file === 'README.md') return undefined
  return file
}

import { execFileSync } from 'node:child_process'

/** The trees the lint reads: the packages, with the project templates, the examples and the test apps. */
export const scannedTrees = ['packages/', 'examples/', 'tests/apps/']

// Test code runs only on test databases, and some of it names a scoped table on purpose to prove the refusal.
const isTestCode = (file: string) => /\.test\.[mc]?[jt]sx?$/.test(file) || /^packages\/[^/]+\/tests\//.test(file)

const isSource = (file: string) => /\.([mc]?[jt]sx?)$/.test(file) && !file.endsWith('.d.ts')

/** The source files the lint reads, by path from `root`: tracked or new, as git lists them, test code left out. Paths are NUL-separated, as git quotes none then. */
export const sourceFiles = (root: string) =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...scannedTrees], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file !== '' && isSource(file) && !isTestCode(file))

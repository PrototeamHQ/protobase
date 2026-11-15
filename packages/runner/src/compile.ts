/**
 * The `bun build` arguments that compile the runner's `entry` into one executable for `target` (such as
 * `bun-linux-x64`, or `bun` for this machine) at `outfile`, carrying its bytecode, so it starts without parsing its
 * code. Bytecode needs ESM spelled out: main.ts awaits at its top level, and Bun's bytecode defaults to CommonJS.
 */
export const compileArgs = (target: string, outfile: string, entry: string) => ['build', '--compile', '--bytecode', '--format=esm', `--target=${target}`, '--outfile', outfile, entry]

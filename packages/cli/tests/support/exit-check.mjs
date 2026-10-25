// The CLI from source, as bin/protobase-source.mjs runs it, in a process that fails with 124 when anything keeps it
// alive 2 s after the command finished, such as an idle database connection.
if (!process.versions.bun) {
  const { register } = await import('tsx/esm/api')
  register()
}
const { run } = await import('../../src/index.ts')
await run(process.argv)
setTimeout(() => {
  process.stderr.write('still running 2 s after the command finished\n')
  process.exit(124)
}, 2_000).unref()

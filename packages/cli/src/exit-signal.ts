// What process.exit throws while the in-memory runner runs a command: the command ends where the CLI would end the
// process, and its code becomes the exit code.
export class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`The command exited with code ${code}`)
  }
}

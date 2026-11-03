export const runsOnNoteVariable = 'PROTOBASE_RUNS_ON_NOTE'

/**
 * Whether the sign-in page ends on the "Runs on Protobase" note: the host turns it on with `PROTOBASE_RUNS_ON_NOTE=true`,
 * so an app's repository cannot turn it off. Unset or empty, there is no note; any value but `true` or `false` stops the
 * server at startup.
 */
export const readRunsOnNote = (env: Record<string, string | undefined>) => {
  const value = env[runsOnNoteVariable]
  if (!value) return false
  if (value !== 'true' && value !== 'false') throw new Error(`${runsOnNoteVariable} must be true or false, not "${value}"`)
  return value === 'true'
}

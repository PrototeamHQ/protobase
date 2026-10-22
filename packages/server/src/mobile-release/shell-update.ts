const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const parseVersion = (value: string) => {
  const match = versionPattern.exec(value)
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : undefined
}

/** Whether `value` is an x.y.z version, as a shell's Protobase version is. */
export const isShellVersion = (value: string) => parseVersion(value) !== undefined

/**
 * Whether a device running a shell of Protobase `shell` must update before it goes on: its shell no longer works with
 * the API of a server of Protobase `server`. It works on the same major, and below 1.0, where a minor may break, on the
 * same minor, as a bundle does on a runtime.
 */
export const shellUpdateRequired = (shell: string, server: string) => {
  const own = parseVersion(server)
  if (!own) throw new Error(`The server's own Protobase version ${JSON.stringify(server)} is no x.y.z version`)
  const running = parseVersion(shell)
  if (!running) throw new Error(`The shell's Protobase version ${JSON.stringify(shell)} is no x.y.z version`)
  return running.major !== own.major || (own.major === 0 && running.minor !== own.minor)
}

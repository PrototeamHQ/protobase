import semver from 'semver'

/** Whether `value` is an x.y.z version, as a shell's Protobase version is: a semver release, no prerelease. */
export const isShellVersion = (value: string) => semver.valid(value) === value && semver.prerelease(value) === null

const shellVersion = (value: string, whose: string) => {
  if (!isShellVersion(value)) throw new Error(`The ${whose} Protobase version ${JSON.stringify(value)} is no x.y.z version`)
  return { major: semver.major(value), minor: semver.minor(value) }
}

/**
 * Whether a device running a shell of Protobase `shell` must update before it goes on: its shell no longer works with
 * the API of a server of Protobase `server`. It works on the same major, and below 1.0, where a minor may break, on the
 * same minor, as a bundle does on a runtime.
 */
export const shellUpdateRequired = (shell: string, server: string) => {
  const own = shellVersion(server, "server's own")
  const running = shellVersion(shell, "shell's")
  return running.major !== own.major || (own.major === 0 && running.minor !== own.minor)
}

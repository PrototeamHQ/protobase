/** The most devices one credential sends to in a clock hour; a send that would go over is a 429 until the next hour. */
export const relaySendsPerHour = 20_000

/** The most registrations one client address makes a minute. */
export const relayRegistrationsPerMinute = 30

/** The largest send body, in bytes: a message and up to `maxRelayDevices` devices. */
export const maxRelaySendBytes = 128 * 1024

/** The seconds from `now` to the next clock hour, when a credential's count starts again. */
export const secondsToNextHour = (now: number) => Math.max(1, Math.ceil((3_600_000 - (now % 3_600_000)) / 1000))

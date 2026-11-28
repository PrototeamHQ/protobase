/**
 * The events an app with the realtime relay publishes to one person on `people`, the channel every signed-in socket
 * joins: `refresh` once their access changed, so their pages read again and get new live tokens, and `rings` once the
 * calls that ring them changed. Without the relay the live stream tells them the same.
 */
export const peopleEvents = { refresh: 'refresh', rings: 'rings' } as const

export type PeopleEvent = (typeof peopleEvents)[keyof typeof peopleEvents]

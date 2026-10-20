export const platforms = ['ios', 'android'] as const

/** The platform a mobile command builds for. */
export type Platform = (typeof platforms)[number]

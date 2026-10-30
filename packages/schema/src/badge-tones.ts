/** The tones an enum value's badge takes by name in `valueColors`; a value without one is `neutral`. */
export const badgeTones = ['neutral', 'blue', 'green', 'amber', 'red', 'violet'] as const

/** A badge's tone by name, one of `badgeTones`. */
export type BadgeTone = (typeof badgeTones)[number]

/** Whether `name` is one of the badge tones, rather than a hex colour. */
export const isBadgeTone = (name: string): name is BadgeTone => (badgeTones as readonly string[]).includes(name)

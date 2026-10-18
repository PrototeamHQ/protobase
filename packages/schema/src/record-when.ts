const showModes = ['always', 'editing', 'reading'] as const

/** Whether `when` is a condition on the saved record rather than one of the `ShowWhen` modes. */
export const isRecordCondition = (when: string | undefined): when is string => when !== undefined && !(showModes as readonly string[]).includes(when)

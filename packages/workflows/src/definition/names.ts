/** Variables a definition cannot assign: `$states`, which the runner gives each expression. */
export const reservedVariables = new Set(['states'])

/**
 * What an expression may read of `$states.context`, as name paths: the run's input and start time, and a secret by its
 * name (`Secrets.<NAME>`, the name required).
 */
export const contextReads = [['Execution', 'Input'], ['Execution', 'StartTime'], ['Secrets']] as const

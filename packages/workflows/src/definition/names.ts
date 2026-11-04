/**
 * The variable a run's input is read by, in every state: `$trigger`, whether a person, the app's code or a trigger
 * started the run.
 */
export const inputVariable = 'trigger'

/** Variables a definition cannot assign: the run's input and the `$states` the runner gives each expression. */
export const reservedVariables = new Set([inputVariable, 'states'])

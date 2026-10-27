/** Thrown when a rule called without a record reads the record; a `TypeError`, as a missing record has always thrown. */
export class RecordNeeded extends TypeError {
  constructor() {
    super('The rule reads the record')
  }
}

/**
 * A stand-in for the record and the input while a rule is called without them: any read of it throws `RecordNeeded`
 * until `disarm`, so `record?.x`, a default parameter and `args[1].x` all show that the rule needs the record. Once
 * disarmed it acts as an empty object, so a rule that kept it trips nothing later.
 */
export const recordProbe = () => {
  let armed = true
  const trap = <T>(fallback: () => T) => () => {
    if (armed) throw new RecordNeeded()
    return fallback()
  }
  const value = new Proxy({}, {
    get: trap(() => undefined),
    has: trap(() => false),
    ownKeys: trap(() => []),
    getOwnPropertyDescriptor: trap(() => undefined),
  })
  return { value, disarm: () => { armed = false } }
}

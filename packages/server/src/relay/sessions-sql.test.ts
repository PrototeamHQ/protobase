import { describe, expect, it } from 'vitest'
import { refuseSessionsElsewhere } from './sessions-sql'

describe('refuseSessionsElsewhere', () => {
  it("refuses a sessions table the app's database does not have, as an auth store in another database", () => {
    expect(() => refuseSessionsElsewhere(false, 'auth.session')).toThrow("The relay needs the sign-in sessions table auth.session in the app's own database")
  })

  it("takes a sessions table in the app's database", () => {
    expect(() => refuseSessionsElsewhere(true, 'auth.session')).not.toThrow()
  })
})

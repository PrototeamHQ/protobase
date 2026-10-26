import { describe, expect, it } from 'vitest'
import { authDriftLines } from './auth-drift-lines'

describe('authDriftLines', () => {
  it('says nothing while the store matches, and names each difference otherwise', () => {
    expect(authDriftLines([])).toBe('')
    expect(authDriftLines(['lacks the column passkey.rp_id', 'lacks the table oauth_client'])).toBe(
      "  warning  the auth store drifted from its migrations; apply the project's migrations, or write a change made by hand as a migration of the project's own:\n             lacks the column passkey.rp_id\n             lacks the table oauth_client\n",
    )
  })
})

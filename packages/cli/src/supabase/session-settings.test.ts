import { describe, expect, it } from 'vitest'
import { resetSettings, sessionSettings } from './session-settings'

describe('sessionSettings', () => {
  it("names what a dump's SET statements and set_config calls change, and nothing a function sets", () => {
    const dump = [
      'SET statement_timeout = 0;',
      'SET client_min_messages = warning;',
      "SELECT pg_catalog.set_config('search_path', '', false);",
      'SET LOCAL lock_timeout = 0;',
      "CREATE FUNCTION f() RETURNS void LANGUAGE sql SET search_path = '' AS $$ SELECT set_config('role', 'x', true) $$;",
      'SET statement_timeout = 0;',
    ].join('\n')
    expect(sessionSettings(dump)).toEqual(['statement_timeout', 'client_min_messages', 'search_path'])
    expect(resetSettings(['statement_timeout', 'search_path'])).toBe('RESET statement_timeout;\nRESET search_path;\n')
  })
})

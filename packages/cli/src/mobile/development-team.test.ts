import { describe, expect, it } from 'vitest'
import { withDevelopmentTeam } from './development-team'

const configuration = '\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tCURRENT_PROJECT_VERSION = 1;\n'

describe('withDevelopmentTeam', () => {
  it('names the team in both of the app target\'s configurations', () => {
    expect(withDevelopmentTeam(`${configuration}${configuration}`, 'ABCDE12345').match(/CODE_SIGN_STYLE = Automatic;\n\t\t\t\tDEVELOPMENT_TEAM = ABCDE12345;\n/g)).toHaveLength(2)
  })

  it('refuses a project unlike Capacitor\'s template', () => {
    expect(() => withDevelopmentTeam(configuration, 'ABCDE12345')).toThrow('1 times, not 2')
    expect(() => withDevelopmentTeam(`${configuration}DEVELOPMENT_TEAM = XYZ;\n${configuration}`, 'ABCDE12345')).toThrow('already names a DEVELOPMENT_TEAM')
  })
})

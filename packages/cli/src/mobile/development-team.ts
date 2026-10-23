// Capacitor's iOS template signs automatically but names no team, and `cap run` passes none to xcodebuild, so the
// generated project carries `--team` itself: in the app target's Debug and Release configurations.

const anchor = 'CODE_SIGN_STYLE = Automatic;'

/** The project.pbxproj with `team` as the app target's DEVELOPMENT_TEAM, a team id `--team` checked. */
export const withDevelopmentTeam = (pbxproj: string, team: string) => {
  if (pbxproj.includes('DEVELOPMENT_TEAM')) throw new Error('project.pbxproj already names a DEVELOPMENT_TEAM, unlike Capacitor\'s template')
  const parts = pbxproj.split(anchor)
  if (parts.length !== 3) throw new Error(`project.pbxproj has \`${anchor}\` ${parts.length - 1} times, not 2 as in Capacitor's template`)
  return parts.join(`${anchor}\n\t\t\t\tDEVELOPMENT_TEAM = ${team};`)
}

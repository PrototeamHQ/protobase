/** A member as the project list shows them: an avatar and a name. */
export type ProjectMember = { name: string; initials: string; hue: number }

export type ClientProject = {
  id: string
  name: string
  domain: string
  region: 'EU' | 'US'
  location: string
  plan: 'Starter' | 'Team' | 'Business'
  database: string
  members: ProjectMember[]
  lastDeploy: string
  health: 'healthy' | 'degraded'
}

import { userById } from '../mocks'
import type { ClientProject } from './projects'

export const clientProjects: ClientProject[] = [
  { id: 'veldhuis', name: 'Veldhuis Supply', domain: 'admin.veldhuis-supply.nl', region: 'EU', location: 'Frankfurt', plan: 'Business', database: 'Postgres 17 · 184 GB', members: ['u1', 'u3', 'u4', 'u6'].map(userById), lastDeploy: '2 hours ago', health: 'healthy' },
  { id: 'harbor', name: 'Harbor & Pine Outfitters', domain: 'ops.harborpine.com', region: 'US', location: 'N. Virginia', plan: 'Team', database: 'Postgres 16 · 42 GB', members: ['u2', 'u5', 'u7'].map(userById), lastDeploy: 'Yesterday', health: 'healthy' },
  { id: 'rijnland', name: 'Rijnland Fietsen', domain: 'beheer.rijnlandfietsen.nl', region: 'EU', location: 'Amsterdam', plan: 'Starter', database: 'Postgres 16 · 3.1 GB', members: ['u8'].map(userById), lastDeploy: '6 days ago', health: 'healthy' },
]

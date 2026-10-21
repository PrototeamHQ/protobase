import { describe, expect, it } from 'vitest'
import { connectedApps, type ClientRow, type ConsentRow } from './connected-apps'

const labels: Record<string, string> = { sales: 'Sales', admin: 'Superuser' }
const names = { roleLabel: (role: string) => labels[role] ?? role, organizationName: (id: string) => ({ acme: 'Acme' })[id] ?? id }

const clients: ClientRow[] = [
  { clientId: 'https://assistant.example/oauth/client.json', name: 'Example Assistant' },
  { clientId: 'editor-1', name: null },
  { clientId: 'old', name: 'Never allowed' },
]

describe('the apps someone connected', () => {
  it('group the consents of one client, its newest first, each role as its label and organization as its name', () => {
    const consents: ConsentRow[] = [
      { clientId: 'https://assistant.example/oauth/client.json', referenceId: 'role=admin', createdAt: new Date('2026-10-01') },
      { clientId: 'https://assistant.example/oauth/client.json', referenceId: 'organization=acme&role=sales', createdAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-05') },
    ]
    expect(connectedApps(consents, clients, names)).toEqual([
      {
        clientId: 'https://assistant.example/oauth/client.json',
        name: 'Example Assistant',
        allowedAt: '2026-10-05T00:00:00.000Z',
        access: [{ role: 'Sales', organization: 'Acme' }, { role: 'Superuser' }],
      },
    ])
  })

  it('leave out the name of a client without one, and a consent whose client is gone', () => {
    const consents: ConsentRow[] = [
      { clientId: 'editor-1', referenceId: 'role=sales', createdAt: '2026-10-03T00:00:00.000Z' },
      { clientId: 'deleted', referenceId: 'role=sales', createdAt: '2026-10-04T00:00:00.000Z' },
    ]
    expect(connectedApps(consents, clients, names)).toEqual([{ clientId: 'editor-1', allowedAt: '2026-10-03T00:00:00.000Z', access: [{ role: 'Sales' }] }])
  })

  it('come newest first', () => {
    const consents: ConsentRow[] = [
      { clientId: 'editor-1', referenceId: 'role=sales', createdAt: new Date('2026-10-01') },
      { clientId: 'https://assistant.example/oauth/client.json', referenceId: 'role=sales', createdAt: new Date('2026-10-09') },
    ]
    expect(connectedApps(consents, clients, names).map((app) => app.clientId)).toEqual(['https://assistant.example/oauth/client.json', 'editor-1'])
  })

  it('are none without consents', () => {
    expect(connectedApps([], clients, names)).toEqual([])
  })
})

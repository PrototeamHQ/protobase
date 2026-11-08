import { defineFunction, tcpBridge } from '@protobase/server'

// The workshop's machines on the private network, by the name a page asks for.
const machines: Record<string, { host: string; port: number }> = {
  'truing-stand': { host: '10.20.0.11', port: 5900 },
  'stock-db': { host: '10.20.0.2', port: 5432 },
}

// /api/functions/workshop-console: mechanics reach the truing stand's screen for an hour at a time; only admins reach
// the stock database, and only for ten minutes.
export const workshopConsole = tcpBridge({
  target: (name, { session }) => {
    const machine = machines[name]
    if (!machine) return
    if (name !== 'stock-db') return machine
    return session.user.roles.includes('admin') ? { ...machine, expiresInSeconds: 600 } : undefined
  },
})

export default defineFunction({ roles: ['mechanic', 'admin'] }, workshopConsole)

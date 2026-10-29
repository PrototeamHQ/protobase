import { navGroups, type NavGroup, type NavRecord, type ShownMark } from './nav'

const directMessages: NavRecord[] = ['Ann', 'Bo', 'Cas', 'Design team'].map((name) => ({ id: name.toLowerCase(), label: name, href: `#conversations/${name.toLowerCase()}`, active: false }))

// Ann is online and busy having lunch, Bo away on do not disturb, Cas without presence or status, the team names no one.
const inAnHour = new Date(Date.now() + 3_600_000).toISOString()
const peopleMarks = (): Record<string, ShownMark> => ({
  ann: { strong: true, count: 2, person: { presence: 'online', status: { availability: 'busy', text: 'Having lunch', clearsAt: inAnHour } } },
  bo: { person: { presence: 'away', status: { availability: 'do_not_disturb', text: null, clearsAt: null } } },
  cas: { person: {} },
  'design team': { count: 1 },
})

/** The sidebar with direct messages under Customers, each row's mark naming the other person but the team's. */
export const withDirectMessages: NavGroup[] = navGroups.map((group) => ({
  ...group,
  items: group.items.map((item) => (item.id === 'customers' ? { ...item, label: 'Direct messages', recent: { state: 'ready', records: directMessages, useMarks: peopleMarks } } : item)),
}))

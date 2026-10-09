export const users = [
  { id: 'u1', name: 'Sanne M.', initials: 'SM', hue: 250, role: 'Admin' },
  { id: 'u2', name: 'Jonas K.', initials: 'JK', hue: 160, role: 'Sales' },
  { id: 'u3', name: 'Lieke D.', initials: 'LD', hue: 20, role: 'Finance' },
  { id: 'u4', name: 'Tobias R.', initials: 'TR', hue: 310, role: 'Warehouse' },
  { id: 'u5', name: 'Imke V.', initials: 'IV', hue: 200, role: 'Sales' },
  { id: 'u6', name: 'Marek W.', initials: 'MW', hue: 80, role: 'Warehouse' },
  { id: 'u7', name: 'Hanna B.', initials: 'HB', hue: 350, role: 'Finance' },
  { id: 'u8', name: 'Daan P.', initials: 'DP', hue: 120, role: 'Sales' },
] as const

export type MockUser = (typeof users)[number]

export const userById = (id: string) => users.find((user) => user.id === id) ?? users[0]

export const salesUsers = users.filter((user) => user.role === 'Sales')

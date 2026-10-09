import { describe, expect, it } from 'vitest'
import { userToShell } from './user-to-shell'

describe('userToShell', () => {
  it('shows an admin with a violet badge', () => {
    expect(userToShell({ id: 'u1', email: 'sanne@example.com', name: 'Sanne Marsman', role: 'admin' })).toMatchObject({ name: 'Sanne Marsman', initials: 'SM', role: 'Admin', roleTone: 'violet' })
  })
  it('falls back to the email when there is no name', () => {
    expect(userToShell({ id: 'u2', email: 'jonas@example.com', name: '', role: 'user' })).toMatchObject({ name: 'jonas@example.com', initials: 'JE', role: 'User', roleTone: 'blue' })
  })
  it('names the first role of a list', () => {
    expect(userToShell({ id: 'u3', email: 'a@b.c', name: 'A B', role: 'sales,user' }).role).toBe('Sales')
  })
  it('gives the same user the same colour', () => {
    expect(userToShell({ id: 'u1', email: 'x@y.z', name: 'X' }).hue).toBe(userToShell({ id: 'u1', email: 'x@y.z', name: 'X' }).hue)
  })
})

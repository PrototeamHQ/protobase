import { describe, expect, it } from 'vitest'
import { notificationTarget } from './notification-target'

const at = { origin: 'https://app.example.com', basePath: '' }

describe('notificationTarget', () => {
  it('follows a path or a url on this origin in the app', () => {
    expect(notificationTarget('/tasks/42?tab=a#c', at)).toEqual({ kind: 'app', href: '/tasks/42?tab=a#c', path: '/tasks/42?tab=a#c' })
    expect(notificationTarget('https://app.example.com/tasks/42', at)).toEqual({ kind: 'app', href: '/tasks/42', path: '/tasks/42' })
  })

  it("follows a url under the app's base path in the app, and loads one elsewhere on the origin", () => {
    const admin = { ...at, basePath: '/admin' }
    expect(notificationTarget('/admin/tasks/42', admin)).toEqual({ kind: 'app', href: '/admin/tasks/42', path: '/tasks/42' })
    expect(notificationTarget('/admin', admin)).toEqual({ kind: 'app', href: '/admin', path: '/' })
    expect(notificationTarget('/administration', admin)).toEqual({ kind: 'page', href: '/administration' })
  })

  it('opens another origin in a new tab', () => {
    expect(notificationTarget('https://api.example.com/x', at)).toEqual({ kind: 'external', href: 'https://api.example.com/x' })
    expect(notificationTarget('http://app.example.com/x', at)).toEqual({ kind: 'external', href: 'http://app.example.com/x' })
  })

  it('has no link without a url, or for another scheme', () => {
    expect(notificationTarget(null, at)).toBeUndefined()
    expect(notificationTarget('javascript:alert(1)', at)).toBeUndefined()
    expect(notificationTarget('data:text/html,x', at)).toBeUndefined()
  })
})

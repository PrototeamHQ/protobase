import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WorkflowConnection } from '@protobase/client'
import { Router } from '../app/router'
import { ConnectionsSection } from './connections-section'

const connection = (used_by: { id: string; name: string }[]): WorkflowConnection => ({
  key: 'acme:account',
  label: 'Acme account',
  provider: 'workflow-acme-account',
  scopes: [],
  link_params: {},
  accounts: [{ id: 'acc-1', scopes: [], created_at: '2026-11-02T09:00:00Z', needs_sign_in: false, used_by }],
})

const rendered = (used_by: { id: string; name: string }[], basePath?: string) =>
  renderToStaticMarkup(
    createElement(Router, {
      initialUrl: '/-/account',
      ...(basePath !== undefined && { basePath }),
      children: createElement(ConnectionsSection, { connections: [connection(used_by)], onConnect: async () => {}, onDisconnect: async () => 'revoked' as const }),
    }),
  )

describe('ConnectionsSection', () => {
  it("links each workflow that uses an account to the workflow's page", () => {
    const html = rendered([{ id: 'wf-1', name: 'Daily report' }], '/admin')
    expect(html).toContain('Used by')
    expect(html).toContain('<a href="/admin/workflows/wf-1"')
    expect(html).toContain('>Daily report</a>')
  })

  it('shows a workflow name with markup as text, and keeps an odd id under /workflows/', () => {
    const html = rendered([{ id: 'javascript:alert(1)/../x?y', name: '<img src=x onerror=alert(1)>' }])
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    const href = /<a href="([^"]*)"/.exec(html)?.[1]
    expect(href).toBe('/workflows/javascript%3Aalert(1)%2F..%2Fx%3Fy')
  })

  it('says nothing of uses for an account no workflow uses', () => {
    expect(rendered([])).not.toContain('Used by')
  })
})

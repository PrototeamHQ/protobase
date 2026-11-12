import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createClient } from '@protobase/client'
import type { FieldModel } from '@protobase/schema'
import { ApiProvider } from '../data/api-provider'
import { FileField } from './file-field'

const field = { name: 'resume', column: 'resume', type: 'file', nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [], file: { accept: [], maxSize: 1000, provider: 'private' } } as unknown as FieldModel

const locked = (value: unknown) =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ApiProvider, { client: createClient(), children: null }, createElement(FileField, { field, resource: '', value, locked: true, onChange: () => {} }))),
  )

describe('FileField', () => {
  it('shows a locked file outside MetaGate, as a public form does, linking to its download', () => {
    expect(locked(null)).toContain('—')
    expect(locked({ uri: 'private:1/a.pdf', name: 'cv.pdf', type: 'application/pdf', url: '/files/a.pdf' })).toContain('href="/files/a.pdf"')
  })
})

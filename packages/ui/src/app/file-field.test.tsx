import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createClient } from '@protobase/client'
import type { FieldModel } from '@protobase/schema'
import { ApiProvider } from '../data/api-provider'
import { FileField } from './file-field'

const field = { name: 'resume', column: 'resume', type: 'file', nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [], file: { accept: [], maxSize: 1000, provider: 'private' } } as unknown as FieldModel

const rendered = (shown: FieldModel, value: unknown, locked: boolean) =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ApiProvider, { client: createClient(), children: null }, createElement(FileField, { field: shown, resource: '', value, locked, onChange: () => {} }))),
  )
const locked = (value: unknown) => rendered(field, value, true)
const capturing = (capture: 'environment' | 'user') => ({ ...field, file: { ...field.file!, accept: ['image/*'], capture } }) as FieldModel

describe('FileField', () => {
  it('shows a locked file outside MetaGate, as a public form does, linking to its download', () => {
    expect(locked(null)).toContain('—')
    expect(locked({ uri: 'private:1/a.pdf', name: 'cv.pdf', type: 'application/pdf', url: '/files/a.pdf' })).toContain('href="/files/a.pdf"')
  })

  it('opens the rear camera for a capture field, the front one when asked, and only an image file elsewhere', () => {
    expect(rendered(capturing('environment'), null, false)).toMatch(/<input[^>]*accept="image\/\*"[^>]*capture="environment"/)
    expect(rendered(capturing('user'), null, false)).toContain('capture="user"')
    expect(rendered(capturing('user'), null, false)).toContain('Choose a photo')
  })

  it('picks any file without the camera for a field without capture', () => {
    const markup = rendered(field, null, false)
    expect(markup).not.toContain('capture=')
    expect(markup).not.toContain('accept=')
    expect(markup).toContain('Choose a file')
  })
})

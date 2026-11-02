import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ImportFileStep } from './import-file-step'

describe('import file step', () => {
  it('offers workbooks, CSV and JSON files in the file picker', () => {
    const html = renderToStaticMarkup(<ImportFileStep sheets={[]} reading={false} onChoose={() => {}} onSheet={() => {}} />)
    const accept = /accept="([^"]*)"/.exec(html)?.[1]?.split(',')
    expect(accept).toEqual(expect.arrayContaining(['.xlsx', '.csv', '.json', 'application/json']))
  })
})

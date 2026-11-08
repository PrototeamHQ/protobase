import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CodeBlock } from './code-block'

describe('CodeBlock', () => {
  it('shows the text in full, wrapping long lines rather than cutting them off or scrolling', () => {
    const command = 'bun run --cwd /home/worker/projects/protobase test --changed=main -- --reporter=verbose'
    const html = renderToStaticMarkup(<CodeBlock>{command}</CodeBlock>)
    expect(html).toContain(`>${command}</pre>`)
    expect(html).toMatch(/whitespace-pre-wrap/)
    expect(html).toMatch(/\[overflow-wrap:anywhere\]/)
    expect(html).toMatch(/font-mono/)
    expect(html).not.toMatch(/truncate|line-clamp|overflow-(x|y)?-?(auto|scroll)/)
  })
})

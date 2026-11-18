import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { lazyComponent } from './lazy-component'

const Greeting = ({ name }: { name: string }) => <p>Hello {name}</p>

describe('lazyComponent', () => {
  it('draws the fallback for its props until its code has loaded, then the component, at once', async () => {
    let loads = 0
    const Lazy = lazyComponent(
      () => {
        loads += 1
        return Promise.resolve(Greeting)
      },
      ({ name }) => <span>Loading {name}</span>,
    )
    expect(renderToStaticMarkup(<Lazy name="Ann" />)).toBe('<span aria-busy="true" class="contents"><span>Loading Ann</span></span>')
    await Lazy.preload()
    expect(renderToStaticMarkup(<Lazy name="Ann" />)).toBe('<p>Hello Ann</p>')
    expect(loads).toBe(1)
  })

  it('draws at once what was preloaded before it first drew', async () => {
    const Lazy = lazyComponent(() => Promise.resolve(Greeting))
    await Lazy.preload()
    expect(renderToStaticMarkup(<Lazy name="Bo" />)).toBe('<p>Hello Bo</p>')
  })

  it('loads again after a load that failed', async () => {
    let fail = true
    const Lazy = lazyComponent(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(Greeting)))
    await expect(Lazy.preload()).rejects.toThrow('offline')
    fail = false
    await Lazy.preload()
    expect(renderToStaticMarkup(<Lazy name="Cy" />)).toBe('<p>Hello Cy</p>')
  })
})

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type InvokeOptions } from '@protobase/client'
import { Card, Image, Page, page } from '@protobase/layout'
import { App } from '../../app'
import { fakeApi } from '../../testing/fake-api'

const meta = { title: 'Composed pages/Image', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'admin' })

// A network page: the system map an API function draws, and a usage picture whose function refuses this reader

const network = page(
  'network',
  Page({
    title: 'Network',
    children: [
      Card({ title: 'System map', children: Image({ function: 'system-map', alt: 'The system map: three servers behind one router', width: 320, height: 200 }) }),
      Card({ title: 'Usage', children: Image({ function: 'usage-chart' }) }),
    ],
  }),
)

const forbidden = () => new ApiError({ type: 'urn:protobase:problem:function-forbidden', title: 'Forbidden', status: 403, detail: 'You may not call the function "usage-chart"' })

// A PNG of the asked size, in the asked theme's colours, as a function drawing on the server would answer
const drawn = async ({ width, height, theme }: Record<string, string>) => {
  const canvas = new OffscreenCanvas(Number(width), Number(height ?? width))
  const context = canvas.getContext('2d')!
  context.fillStyle = theme === 'dark' ? '#1e293b' : '#e2e8f0'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#2563eb'
  for (const x of [0.2, 0.5, 0.8]) context.fillRect(canvas.width * x - 16, canvas.height * 0.25, 32, 24)
  context.fillRect(canvas.width * 0.5 - 20, canvas.height * 0.7, 40, 24)
  return canvas.convertToBlob({ type: 'image/png' })
}

const asked: Array<{ name: string; query?: Record<string, string> }> = []

const Network = () => {
  const [client] = useState(() => {
    const { client: base } = fakeApi({ resources: [], pages: [network.toModel()], rows: {} })
    const invoke = async (name: string, { query }: InvokeOptions = {}) => {
      asked.push({ name, ...(query && { query }) })
      if (name !== 'system-map') throw forbidden()
      return drawn(query ?? {})
    }
    return { ...base, invoke } as typeof base
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/network" />
    </div>
  )
}

export const Drawn: StoryObj = { name: 'A picture an API function draws', render: () => <Network /> }

/**
 * The block asks its function for the picture at its size and the page's theme, with the reader's token, and draws it
 * with its alt; a function that refuses the reader leaves an image without alt as nothing.
 */
export const Checks: StoryObj = {
  ...Drawn,
  name: 'A picture an API function draws (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const picture = (await canvas.findByRole('img', { name: 'The system map: three servers behind one router' })) as HTMLImageElement
    await waitFor(() => expect(picture.naturalWidth).toBe(320))
    expect(picture.naturalHeight).toBe(200)
    const theme = document.documentElement.dataset.theme
    expect(asked.find((call) => call.name === 'system-map')?.query).toEqual({ width: '320', height: '200', theme })
    await waitFor(() => expect(asked.some((call) => call.name === 'usage-chart')).toBe(true))
    await waitFor(() => expect(canvasElement.querySelector('[class*="pb-shimmer"]')).toBeNull())
    expect(canvasElement.querySelectorAll('main img')).toHaveLength(1)
  },
}

// A live picture asked for every second, whose function draws it once and then fails

const live = page('live', Page({ title: 'Live', children: Card({ title: 'Load', children: Image({ function: 'load-map', alt: 'The load per server', width: 120, height: 80, refresh: 1 }) }) }))

const Live = () => {
  const [client] = useState(() => {
    const { client: base } = fakeApi({ resources: [], pages: [live.toModel()], rows: {} })
    let calls = 0
    const invoke = async (_name: string, { query }: InvokeOptions = {}) => {
      calls += 1
      if (calls > 1) throw new Error('The drawing service is down')
      return drawn(query ?? {})
    }
    return { ...base, invoke } as typeof base
  })
  return (
    <div className="min-h-screen">
      <App client={client} auth={session} initialUrl="/live" />
    </div>
  )
}

/** A refresh that fails after a picture was drawn replaces the picture with its alt. */
export const FailedRefresh: StoryObj = {
  name: 'A refresh that fails (checks)',
  tags: ['play', '!dev'],
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('img', { name: 'The load per server' })
    await canvas.findByText('The load per server', { selector: 'p' }, { timeout: 3000 })
    expect(canvasElement.querySelectorAll('main img')).toHaveLength(0)
  },
}

import { expect, it } from 'vitest'
import { mcpIcons } from './mcp-icons'

const favicon = { src: 'https://app.example/protobase.favicon.svg', mimeType: 'image/svg+xml', sizes: ['any'] }

it('names the favicon on the app\'s origin, for a project with no icons of its own', () => {
  expect(mcpIcons('https://app.example/api/mcp')).toEqual([favicon])
  expect(mcpIcons('https://app.example/api/mcp', { favicon: false, png: [] })).toEqual([favicon])
})

it('names the project\'s PNGs before the favicon, all but the maskable one', () => {
  expect(mcpIcons('https://app.example/api/mcp', { favicon: true, png: ['maskable', 'icon512', 'icon192'] })).toEqual([
    { src: 'https://app.example/protobase.icon-192.png', mimeType: 'image/png', sizes: ['192x192'] },
    { src: 'https://app.example/protobase.icon-512.png', mimeType: 'image/png', sizes: ['512x512'] },
    favicon,
  ])
})

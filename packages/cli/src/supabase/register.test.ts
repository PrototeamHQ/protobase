import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadNearestEnvFile } from '../dev/env'
import { registerImport } from './register'
import { runSupabaseImport } from './run'

vi.mock('./run', () => ({ runSupabaseImport: vi.fn() }))
// The project's .env holds the key, as it may: it is only there once the command loads the file.
vi.mock('../dev/env', () => ({
  loadNearestEnvFile: vi.fn(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk-TEST-SECRET'
    process.env.DATABASE_URL = 'postgres://localhost/app'
  }),
}))

const fetchSpy = vi.spyOn(globalThis, 'fetch')
beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined)
  vi.stubEnv('DATABASE_URL', undefined)
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

// Runs `protobase import supabase` with `args`, printing an error as the CLI's central handler in main.ts does.
const importSupabase = async (args: string[]) => {
  const program = new Command().exitOverride()
  registerImport(program)
  return program.parseAsync(['node', 'protobase', 'import', 'supabase', ...args]).then(
    () => '',
    (error: Error) => `error: ${error.message}\n`,
  )
}

describe('import supabase --storage-url', () => {
  it('refuses plain http on a host that is not loopback before anything is sent, without printing the URL or the key', async () => {
    const printed = await importSupabase(['--storage-url', 'http://abc.supabase.co:8000/storage?x=1'])

    expect(printed).toMatch(/^error: --storage-url must use https/)
    expect(printed).not.toContain('abc.supabase.co')
    expect(printed).not.toContain('sk-TEST-SECRET')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(runSupabaseImport).not.toHaveBeenCalled()
    expect(loadNearestEnvFile).not.toHaveBeenCalled()
  })

  it.each([
    ['https://abc.supabase.co/', 'https://abc.supabase.co'],
    ['http://127.0.0.1:54321', 'http://127.0.0.1:54321'],
  ])('copies from %s with the key the project .env holds', async (given, url) => {
    expect(await importSupabase(['--storage-url', given])).toBe('')
    expect(runSupabaseImport).toHaveBeenCalledWith(expect.objectContaining({ storage: { url, key: 'sk-TEST-SECRET' } }), expect.any(Function))
  })
})

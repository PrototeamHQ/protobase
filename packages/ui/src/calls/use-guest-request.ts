import { useCallback, useState } from 'react'

/**
 * Runs a member's guest request, and says when the server refused it, as `GuestRefused`; any other failure is thrown
 * on, where the page's error handling sees it.
 */
export const useGuestRequest = () => {
  const [refused, setRefused] = useState(false)
  const run = useCallback((request: () => Promise<unknown>) => {
    setRefused(false)
    void (async () => {
      const { GuestRefused } = await import('@protobase/client/calls')
      await request().catch((error: unknown) => {
        if (!(error instanceof GuestRefused)) throw error
        setRefused(true)
      })
    })()
  }, [])
  return { run, refused }
}

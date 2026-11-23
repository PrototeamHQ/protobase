import { useState } from 'react'

/** True from the first render in which `ready` is, and kept, so what shows once everything it needs is read never hides again. */
export const useOnceReady = (ready: boolean) => {
  const [was, setWas] = useState(false)
  if (ready && !was) setWas(true)
  return was || ready
}

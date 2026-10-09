import { useEffect, useState } from 'react'

/** `value`, once it has stayed the same for `ms`. */
export const useDebounced = <T,>(value: T, ms: number) => {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

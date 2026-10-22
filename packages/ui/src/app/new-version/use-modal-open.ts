import { useEffect, useState } from 'react'

const modalOpen = () => document.querySelector('[aria-modal="true"]') !== null

/** Whether a modal, a dialog or a sheet, is open anywhere on the page, following them as they open and close. */
export const useModalOpen = () => {
  const [open, setOpen] = useState(modalOpen)
  useEffect(() => {
    const observer = new MutationObserver(() => setOpen(modalOpen()))
    observer.observe(document.body, { childList: true, subtree: true })
    setOpen(modalOpen())
    return () => observer.disconnect()
  }, [])
  return open
}

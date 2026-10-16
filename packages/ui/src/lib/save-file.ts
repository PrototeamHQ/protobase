/** Hands the browser a file to save under `name`, made from `text`. */
export const saveFile = (text: string, name: string, type = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  link.click()
  URL.revokeObjectURL(url)
}

type Transfer = Pick<DataTransfer, 'files' | 'types'>

/** Whether a drag carries files, which the composer takes, rather than text, which the box takes as usual. */
export const carriesFiles = (transfer: Transfer) => transfer.types.includes('Files')

/**
 * The files a paste gives, or none when it also holds text: a copy from a spreadsheet or a web page can hold an image
 * of its text too, and text pasted into the box stays text.
 */
export const pastedFiles = (transfer: Transfer) => {
  if (transfer.types.includes('text/plain')) return []
  return [...transfer.files]
}

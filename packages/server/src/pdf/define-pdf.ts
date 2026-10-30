import type { DocumentProps } from '@react-pdf/renderer'
import type { FunctionComponent, ReactElement } from 'react'

export type PdfOptions<Data extends object> = {
  /** Names the document, such as `invoice` or `quote`. */
  name: string
  /**
   * The document as a React component of its data, built from React PDF's components (`@protobase/server/pdf`) with a
   * `<Document>` at its root.
   */
  component: PdfComponent<Data>
}

/** A function component of the document's data, as JSX writes one; typed here so the server's own types need no React. */
export type PdfComponent<Data> = (props: Data) => unknown

export type PdfTemplate<Data extends object> = {
  readonly name: string
  readonly options: PdfOptions<Data>
  /**
   * Renders the document for `data` to the bytes of a PDF file, which an email's attachment and a `Response` take as
   * they are.
   */
  render(data: Data): Promise<Uint8Array<ArrayBuffer>>
}

/** React and React PDF's renderer, loaded on the first document rendered, so an app that renders none never loads them. */
const loadRenderer = async () => {
  const [{ createElement }, { renderToBuffer }] = await Promise.all([import('react'), import('@react-pdf/renderer')])
  return { createElement, renderToBuffer }
}

/**
 * A PDF document the app makes, with typed data: a React component built from React PDF's components. Protobase
 * renders it to the bytes of a PDF file with React PDF's renderer.
 */
export const definePdf = <Data extends object>(options: PdfOptions<Data>): PdfTemplate<Data> => {
  const render = async (data: Data) => {
    const renderer = await loadRenderer()
    const element = renderer.createElement(options.component as FunctionComponent<Data>, data)
    // A Node `Buffer` may be a view into a shared pool; a copy of its own is a plain `Uint8Array` over an `ArrayBuffer`.
    return new Uint8Array(await renderer.renderToBuffer(element as unknown as ReactElement<DocumentProps>))
  }

  return { name: options.name, options, render }
}

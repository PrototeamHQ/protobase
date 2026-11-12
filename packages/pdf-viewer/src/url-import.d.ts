// The worker's address, which the app's Vite build emits as a file of its own (`?url`).
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}

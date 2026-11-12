// The address of a file of pdf.js, which the app's Vite build emits as a file of its own (`?url`).
declare module 'pdfjs-dist/*?url' {
  const url: string
  export default url
}

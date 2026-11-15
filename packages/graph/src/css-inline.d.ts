// A stylesheet as text, which the app's Vite build inlines (`?inline`).
declare module '*.css?inline' {
  const css: string
  export default css
}

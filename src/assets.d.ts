/** Images imported from TypeScript resolve to their URL (Vite).
 */
declare module '*.svg' {
  const url: string
  export default url
}

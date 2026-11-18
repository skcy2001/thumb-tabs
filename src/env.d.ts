import type { SidebarApi } from '../shared/api'

declare global {
  interface Window {
    sidebarApi: SidebarApi
  }
  /** The app version from package.json, set by vite.config.ts. */
  const __APP_VERSION__: string
}

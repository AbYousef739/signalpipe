declare module 'openclaw/plugin-sdk/plugin-entry' {
  export function definePluginEntry(entry: {
    id: string
    name?: string
    description?: string
    register(api: any): void
  }): unknown
}

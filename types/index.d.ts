export type Doc = { path: string; label: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: { files: Doc[] }
  }
}

export type EntryKind = 'file' | 'link' | 'folder'
/** One row of the pane: what this session produced and a person may open. */
export type Entry = { kind: EntryKind; target: string; label: string; tail: string; at: number }
/** The shape stored before v0.2.0; read as a file entry. */
export type Doc = { path: string; label: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    cockpit: { files: (Entry | Doc)[] }
  }
}

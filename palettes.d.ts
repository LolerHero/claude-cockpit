// Types for palettes.js, which stays plain JS so the Node status line imports it unbuilt.
export type Role = 'muted' | 'subtle' | 'gold' | 'love' | 'foam' | 'iris' | 'track' | 'base'
export type PaletteName = 'rose-pine' | 'catppuccin-mocha' | 'tokyo-night' | 'ansi'
export type Palette = Record<Role, string>

export const ROLES: readonly Role[]
export const PALETTES: Record<PaletteName, Palette>
export const DEFAULT_PALETTE: 'rose-pine'
export function paletteOf(name: unknown): Palette

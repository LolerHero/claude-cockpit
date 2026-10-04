// One palette table for the mod (runs in the engine) and the status line (runs in Node).
// Seven roles, named by what they mean on the row, not by hue. A value is `#rrggbb`, or one of
// the ANSI color names below so the `ansi` palette works on any terminal without truecolor.
//
// Sources, read 2026-10-03:
//   rose-pine        https://github.com/rose-pine/palette (palette.json)
//   catppuccin-mocha https://github.com/catppuccin/palette (palette.json, flavor mocha)
//   tokyo-night      https://github.com/folke/tokyonight.nvim (extras/lua/tokyonight_night.lua)

export const ROLES = ['muted', 'subtle', 'gold', 'love', 'foam', 'iris', 'track', 'base']

export const PALETTES = {
  'rose-pine': {
    muted: '#6e6a86', // separators, secondary counts
    subtle: '#908caa', // the readable default
    gold: '#f6c177', // uncommitted work, warnings
    love: '#eb6f92', // detached head, context nearly full, alerts
    foam: '#9ccfd8', // room to spare, lines added
    iris: '#c4a7e7', // accent
    track: '#403d52', // unlit bar cells (highlight-med)
    base: '#191724', // the Files pane's ground (base)
  },
  'catppuccin-mocha': {
    muted: '#6c7086', // overlay0
    subtle: '#a6adc8', // subtext0
    gold: '#f9e2af', // yellow
    love: '#f38ba8', // red
    foam: '#94e2d5', // teal
    iris: '#cba6f7', // mauve
    track: '#45475a', // surface1
    base: '#1e1e2e', // base
  },
  'tokyo-night': {
    muted: '#565f89', // comment
    subtle: '#a9b1d6', // fg_dark
    gold: '#e0af68', // yellow
    love: '#f7768e', // red
    foam: '#1abc9c', // teal
    iris: '#bb9af7', // magenta
    track: '#3b4261', // fg_gutter
    base: '#1a1b26', // bg
  },
  // The terminal's own 16 colors: whatever theme the user runs, these follow it.
  ansi: {
    muted: 'gray',
    subtle: 'white',
    gold: 'yellow',
    love: 'red',
    foam: 'cyan',
    iris: 'magenta',
    track: 'gray',
    base: 'black',
  },
}

export const DEFAULT_PALETTE = 'rose-pine'

/** The palette for a settings value; anything unknown is the default, never a crash. */
export const paletteOf = name =>
  typeof name === 'string' && Object.hasOwn(PALETTES, name) ? PALETTES[name] : PALETTES[DEFAULT_PALETTE]

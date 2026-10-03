#!/usr/bin/env node
// Claude Code status line — where you are.
//
//   Opus 5.5 │ Coding │ main* +12 -3 │ ▪▪▪▪▪                        3  ·  1h 20m
//
// Left: model, directory, branch (with churn when dirty), context bar. Right: the cockpit mod's
// file count and the session clock. Every segment carries a priority; when the row does not
// fit, the lowest go first, so a half-width window keeps the branch and the bar.
//
// The engine draws the permission mode itself, so it is not repeated here.
//
// Colors come from palettes.js, chosen in Claude Code's config menu (the `cockpit` plugin's
// `palette` option) and read back from settings.json here, since this script is its own process.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { paletteOf } from '../palettes.js'

const OFF = '\x1b[0m'
const ANSI_NAMES = { black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37, gray: 90 }

/** `#rrggbb` → 24-bit SGR; an ANSI color name → its 16-color SGR. */
const sgr = v =>
  v.startsWith('#')
    ? `\x1b[38;2;${parseInt(v.slice(1, 3), 16)};${parseInt(v.slice(3, 5), 16)};${parseInt(v.slice(5, 7), 16)}m`
    : `\x1b[${ANSI_NAMES[v] ?? 37}m`

const configDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

const readJson = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** The plugin's options as the config menu stores them, under `pluginConfigs[<key>].options`.
 *  Loaded from a folder the key is `cockpit@inline` (measured on 2.1.288, 2026-10-04), so that
 *  comes first; plain `cockpit` is the key a marketplace install would use. Defaults for anything odd. */
function options() {
  const s = readJson(join(configDir(), 'settings.json'))
  const c = s?.pluginConfigs?.['cockpit@inline']?.options ?? s?.pluginConfigs?.cockpit?.options ?? {}
  return { palette: paletteOf(c.palette), glyphs: c.glyphs === 'plain' ? 'plain' : 'nerd' }
}

const { palette: P, glyphs } = options()
const C = Object.fromEntries(Object.entries(P).map(([role, v]) => [role, sgr(v)]))
const paint = (role, s) => `${C[role]}${s}${OFF}`
const sep = paint('muted', ' │ ')

// Nerd Font: nf-fa-file and nf-fa-clock_o, one cell each in a Nerd Font Mono. Plain: words.
const G = glyphs === 'plain' ? { files: 'files ', clock: '' } : { files: '\uf15b ', clock: '\uf017 ' }

/** Five small squares, one per 20 % band (0–20 lights the first). Traffic light by cells lit:
 *  1–2 foam, 3–4 gold, 5 love. ▪ not ■: in some monospace fonts ■ merges into one flat bar. */
function bar(pct) {
  const filled = Math.min(5, Math.max(1, Math.ceil(pct / 20)))
  const role = filled === 5 ? 'love' : filled >= 3 ? 'gold' : 'foam'
  return paint(role, '▪'.repeat(filled)) + paint('track', '▪'.repeat(5 - filled))
}

/** Null when the payload carries no context figures (first render before any turn). */
function contextBar(cw) {
  let pct = cw?.used_percentage
  if (pct == null && cw?.current_usage && cw.context_window_size) {
    const u = cw.current_usage
    const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)
    pct = (100 * used) / cw.context_window_size
  }
  if (pct == null || Number.isNaN(pct)) return null
  return bar(pct)
}

/** Session wall time: `20m`, `1h 20m`. Null under a minute — nothing to say yet. */
function elapsed(ms) {
  const m = Math.floor((ms ?? 0) / 60_000)
  if (m < 1) return null
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** What the cockpit mod published: the file count and the width it measured. Empty when the mod
 *  has not written yet. Any other key (an older or private cockpit) is ignored.
 *  Only this session's own file (`cockpit/<session id>.json`): no fallback to a shared file, which
 *  once showed another session's count and width in a session where the mod had not loaded. */
function cockpit(sessionId) {
  const c = typeof sessionId === 'string' && /^[\w-]+$/.test(sessionId) ? readJson(join(configDir(), 'cockpit', `${sessionId}.json`)) : null
  if (!c) return { parts: [], columns: 0 }
  const parts = typeof c.files === 'number' ? [{ text: paint('subtle', G.files + c.files), prio: 3 }] : []
  return { parts, columns: Number(c.columns) || 0 }
}

/** The terminal's width in cells. The payload does not carry it and stdout is a pipe, so ask
 *  wezterm for this pane (WEZTERM_PANE names it); then the width the cockpit measured; then 80. */
function width(fallback) {
  const pane = process.env.WEZTERM_PANE
  if (pane) {
    try {
      const list = JSON.parse(execFileSync('wezterm', ['cli', 'list', '--format', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }))
      const cols = list.find(p => String(p.pane_id) === pane)?.size?.cols
      if (cols) return cols
    } catch {
      // wezterm not on PATH or too slow: fall through
    }
  }
  return fallback || 80
}

const visible = s => s.replace(/\x1b\[[0-9;]*m/g, '').length

const git = (cwd, args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 })
  } catch {
    return null // not a repo, no git, or slow disk — the line simply omits the segment
  }
}

/** `git status -sb` in one call: branch, upstream gap and dirtiness all come off it. */
function repo(cwd) {
  const out = git(cwd, ['status', '-sb', '--porcelain=v1', '--untracked-files=no'])
  if (out == null) return null
  const lines = out.split('\n')
  const head = lines[0] || ''
  const dirty = lines.slice(1).some(l => l.trim())
  // `## main...origin/main [ahead 2]` — or `## HEAD (no branch)` when detached.
  const detached = /^## HEAD \(no branch\)/.test(head)
  const branch = detached ? 'detached' : (head.match(/^## ([^.\s]+)/)?.[1] ?? '?')
  const ahead = head.match(/ahead (\d+)/)?.[1]
  const behind = head.match(/behind (\d+)/)?.[1]
  return { branch, dirty, ahead, behind, detached }
}

/** Lines added and removed against HEAD (staged and not), as `+12 -3` after the branch; null
 *  when clean or when git is unavailable. Untracked files count nothing. */
function churn(cwd) {
  const out = git(cwd, ['diff', 'HEAD', '--shortstat'])
  if (out == null) return null
  const add = Number(out.match(/(\d+) insertion/)?.[1] ?? 0)
  const del = Number(out.match(/(\d+) deletion/)?.[1] ?? 0)
  if (!add && !del) return null
  return [add && paint('foam', `+${add}`), del && paint('love', `-${del}`)].filter(Boolean).join(' ')
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    // A status line that throws leaves the bar blank and says nothing about why.
  }

  const cwd = payload.workspace?.current_dir || payload.cwd || process.cwd()

  const left = []
  const model = payload.model?.display_name
  if (model) left.push({ text: paint('muted', model), prio: 1 })
  // Both separators: the payload carries `E:\Coding` on Windows, and `[\/]` is only the slash.
  const here = cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
  if (here) left.push({ text: paint('subtle', here), prio: 2 })

  const r = repo(cwd)
  if (r) {
    // The branch is the one thing here worth a glance: it is how work gets committed to the
    // wrong place. Named plainly, colored only when it is not simply "clean on a branch".
    // `*` stays glued to the name. The ahead/behind count is a separate fact and gets a space.
    let b = r.detached ? paint('love', 'detached') : r.dirty ? paint('gold', r.branch + '*') : paint('subtle', r.branch)
    const gap = [r.ahead && '↑' + r.ahead, r.behind && '↓' + r.behind].filter(Boolean).join(' ')
    if (gap) b += paint('muted', ' ' + gap)
    left.push({ text: b, prio: 8 })
    const c = r.dirty ? churn(cwd) : null
    if (c) left.push({ text: c, prio: 5, glue: true }) // glue: a space after the branch, not a separator
  }

  const ctx = contextBar(payload.context_window)
  if (ctx) left.push({ text: ctx, prio: 9 })

  const cp = cockpit(payload.session_id)
  const right = cp.parts
  const t = elapsed(payload.cost?.total_duration_ms)
  if (t) right.push({ text: paint('muted', G.clock) + paint('subtle', t), prio: 7 })

  const join = segs => segs.map((s, i) => (i === 0 ? '' : s.glue ? ' ' : sep) + s.text).join('')
  const dot = paint('muted', '  ·  ')
  const budget = width(cp.columns) - 4 // the engine indents the row; one cell too wide wraps
  const fits = () => visible(join(left)) + (right.length ? 3 + visible(right.map(s => s.text).join(dot)) : 0) <= budget

  while (!fits()) {
    const all = [...left.map(s => ({ s, side: left })), ...right.map(s => ({ s, side: right }))]
    all.sort((x, y) => x.s.prio - y.s.prio)
    if (!all.length) break
    const drop = all[0]
    drop.side.splice(drop.side.indexOf(drop.s), 1)
  }

  const l = join(left)
  if (!right.length) return process.stdout.write(l)
  const rt = right.map(s => s.text).join(dot)
  const pad = budget - visible(l) - visible(rt)
  process.stdout.write(l + (pad >= 3 ? ' '.repeat(pad) : sep) + rt)
}

main()

// cockpit — a pane of what this session made, and the figures the status line needs.
//
//   Opus 5.5 │ Coding │ main* │ ▪▪▪▪▪                          3  ·  1h 20m   ← status line
//
//   1 Open 2026-10-03-report.pdf        ← the pane: /files, /shots, or ctrl+x f
//   2 Open home-1440.png
//
// THE PANE: files a tool wrote or produced this session, newest first, one key each. Only things
// a person opens (documents, images, archives) — never source, which belongs in the editor.
// THE STATUS FILE: the status line is a separate Node process and cannot measure the terminal or
// count files; this module publishes both to <config dir>/cockpit/<session id>.json on every change.
//
// The hint line under the prompt is left to the engine. Tried and dropped on 2.1.288: the hint
// prop carries only the coaching text, the mode words are a pill no hook sees, and a rewritten
// hint is drawn as its own element even when empty, between two separators.

import { paletteOf } from '../palettes.js'
import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { Doc, Entry, EntryKind } from '../types'

const PANE = 'files'
export const KEEP = 48
// One page is what the dialog asks rows for, whatever the list holds: a dialog taller than the
// terminal pushed every redraw (spinner ticks) into scrollback, stacking copies over the chat.
export const PER_PAGE = 8
const INLINE_MAX_BYTES = 400_000 // a tree carries bounded text; a big PNG gets the button alone
// The hint is two rows: the walk (j k h n/N l) and the actions (o f, what Enter and Esc do).
export const HINT_ROWS = 2
export const IMAGE_ROWS = 10 // the inline preview's height in cells; `openPane` asks room for it
// 8 rows + 2 hint rows + 10-row image and its gap = 21 rows: inside a normal window.

// The key reaches the pane through `/files`, not a Button `action`: ~/.claude/keybindings.json
// binds `ctrl+x f` to `command:files` in the Chat context (setup.mjs writes that binding).

const files = atom({ plugin: 'cockpit', key: 'files' } as const, [])

// Legacy rows (`{ path }`, before v0.2.0) are read as files: the state outlives an update of the module.
const asEntry = (d: Entry | Doc): Entry =>
  'target' in d ? d : { kind: 'file', target: d.path, label: d.label, tail: tailOf('file', d.path), at: d.at }

// Trimmed on read, not only on the next write: a session that stored more under an older, larger
// KEEP showed all of it until a new file came in.
const stored = async ($: EngineInterface) => (await read($, files)).slice(-KEEP).map(asEntry)

// Which page the pane shows and which row on it holds the focus ring. Module-level: a reload
// starts on page 1, which is where a reopened pane starts anyway.
let page = 0
let focused = 0
// Filter mode: `f` draws an Input (key `q`) whose text narrows the list; Esc returns to the list.
let filtering = false
let query = ''

// Module-level: a reload starts at 0 until the next draw measures again; the status line then
// falls back to its own width sources.
let columns = 0

// `$.env`, never `process.env`: the module runs in an environment of its own, with no Node.
const configDir = async ($: EngineInterface) => {
  const set = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => null)
  if (set) return set
  const home = (await $.env.get('USERPROFILE').catch(() => null)) ?? (await $.env.get('HOME').catch(() => null))
  return home ? `${home}/.claude` : null
}

// One file per session (`cockpit/<session id>.json`, the id the status line's payload carries as
// `session_id`), so two open sessions never draw each other's count or width. Never rejects: it
// runs un-awaited from a render, where a rejection has no one to land on.
// ponytail: one ~40-byte file per session, never pruned; prune by age if the folder ever matters.
const publish = async ($: EngineInterface) => {
  try {
    const dir = await configDir($)
    const id = await $.session.id()
    if (!dir || !/^[\w-]+$/.test(id)) return
    // Counts what is still on disk, and drops the rest from the list, so a deleted file leaves
    // the count and the pane together. At most KEEP exists checks. Links are taken as given.
    // The count is files only: links and folders are not "files this session made".
    const docs = await stored($)
    const gone = new Set<string>()
    for (const e of docs) {
      if (e.kind === 'link') continue
      if (!(await $.fs.exists(e.target).catch(() => false))) gone.add(e.target)
    }
    if (gone.size) await update($, files, list => list.map(asEntry).filter(e => !gone.has(e.target)))
    const fileCount = docs.filter(e => e.kind === 'file' && !gone.has(e.target)).length
    await $.fs.write(`${dir}/cockpit/${id}.json`, JSON.stringify({ files: fileCount, columns }))
  } catch {
    // the status line falls back to its own width sources and omits the count
  }
}

// ─── what this session made ──────────────────────────────────────────────────────────────────

// Things a person opens, not things a person greps. Deliberately NOT .ts/.py/.json — source
// belongs in the editor, and listing it buries the one file they wanted among forty imports.
const OPENABLE = 'png|jpe?g|webp|gif|svg|pdf|docx?|xlsx?|pptx?|csv|md|html?|zip'

// Absolute OR relative: Playwright answers `./shot.png`, and an absolute-only pattern silently
// found nothing. The separator classes take a RUN, because JSON.stringify escapes a Windows path
// and a single-separator branch eats the drive letter (`C:/Users/…` → `/Users/…`). Names take any
// letter (`Rechnung-März.pdf`), not just ASCII. ponytail: a space ends a path in free text, so
// `my report.pdf` in a command's output reads as `report.pdf`; the mtime check in `collect`
// drops it unless the call produced that file. A Write never goes through this pattern.
const FILE_PATH = new RegExp(
  String.raw`(?:[A-Za-z]:[\\/]+|\.{0,2}[\\/]+)?[\p{L}\p{N}_.\-][\p{L}\p{N}_.\-\\/]*\.(?:${OPENABLE})`,
  'giu',
)
const IS_OPENABLE = new RegExp(String.raw`\.(?:${OPENABLE})$`, 'i')
// The engine spills an MCP result's image block to <session>/tool-results/mcp-<server>-blob-<n>-<id>.png
// and names that copy in the result. It is a duplicate of the file the tool itself saved, kept in
// the transcript's store: never something the person made. (Its 43-char name, cut to 40 by
// `label`, is what showed up as `mcp-playwright-blob-…-g5ctsr` with no extension.)
const ENGINE_BLOB = /(?:^|\/)mcp-[\w-]*-blob-\d+-\w+\.\w+$/

const isAbsolute = (p: string) => /^(?:[A-Za-z]:\/|\/)/.test(p)

export const pathsIn = (value: unknown, cwd?: string): string[] => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  const found = (text.match(FILE_PATH) ?? []).map(p => p.replace(/[\\/]+/g, '/').replace(/^\.\//, ''))
  const base = cwd?.replace(/\\/g, '/').replace(/\/+$/, '')
  // De-duplicated AFTER normalising: one file named in several escapings (Playwright's link,
  // comment and code) is one path, not three.
  return [...new Set(found.map(p => (isAbsolute(p) || !base ? p : `${base}/${p}`)))].filter(
    p => !ENGINE_BLOB.test(p),
  )
}

// A relative path is tried under each root in turn, first that exists wins: the project root
// first (Playwright MCP saves relative to it), then the cwd (a shell `cd` moves only that one).
const resolve = async ($: EngineInterface, path: string, roots: string[]) => {
  const tries = isAbsolute(path) || !roots.length
    ? [path]
    : roots.map(root => `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${path}`)
  for (const full of tries) if (await $.fs.exists(full).catch(() => false)) return full
  return null
}

const label = (path: string) => path.split('/').pop()?.slice(0, 40) ?? 'file'
// One file, one spelling: Windows answers `e:\` from one call and `E:\` from another, and the
// list took them for two files.
const sameDrive = (path: string) => path.replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`)
// The folder a file sits in, for telling two files of one name apart.
const folderOf = (path: string) => path.split('/').slice(-2, -1)[0] ?? ''
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').split(/[/?#]/)[0] ?? url
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/')
// The muted tail of a row: where the thing is, in the words that tell two of a name apart.
export const tailOf = (kind: EntryKind, target: string) =>
  kind === 'file' ? folderOf(target) : kind === 'link' ? hostOf(target) : parentOf(target)
const labelOf = (kind: EntryKind, target: string) =>
  kind === 'link' ? target.replace(/^https?:\/\//, '').slice(0, 40) : label(target)
// PNG only: the terminal's Image takes PNG data, and anything else refuses the WHOLE pane.
const isPng = (path: string) => /\.png$/i.test(path)

type Found = { kind: EntryKind; target: string }
const link = (target: string): Found => ({ kind: 'link', target })
// A `gh … create` prints the URL of the thing it made; any other Bash output's URLs are noise.
const GH_CREATE = /\bgh\s+(?:pr|issue|release)\s+create\b/
const DEPLOY_TOOL = /^mcp__.*deploy/i

// What a tool answered, as text: `text` when the engine flattened it; a Bash result's stdout and
// stderr; an MCP result's text blocks; else the result as JSON. Not JSON for the first three: a
// stringified `\n` is a backslash and an `n`, which a URL pattern reads as part of the URL.
const textOf = (ran: { text?: unknown; result?: unknown }): string => {
  if (typeof ran.text === 'string') return ran.text
  const r = ran.result as { stdout?: unknown; stderr?: unknown; content?: unknown } | undefined
  if (r && (typeof r.stdout === 'string' || typeof r.stderr === 'string')) {
    return `${typeof r.stdout === 'string' ? r.stdout : ''}\n${typeof r.stderr === 'string' ? r.stderr : ''}`
  }
  if (r && Array.isArray(r.content)) {
    return r.content.map(b => (b && typeof b.text === 'string' ? b.text : '')).join('\n')
  }
  return JSON.stringify(ran.result ?? ran ?? '')
}

const URL_RE = /https?:\/\/[^\s<>()"'\]]+/g
// A dev server: localhost, loopback, the unspecified address or a private IPv4, each with a port.
const SERVER_RE =
  /(?<![\w.:/])(?:https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):(\d{2,5})(\/[^\s<>()"']*)?/g
const trimUrl = (u: string) => u.replace(/[.,;:!?)\]]+$/, '')
// A line a person is meant to follow: a bare URL, `- url`, `[text](url)`, or one with an open word.
const ALONE_RE = /^(?:[-*]\s+)?(?:\[[^\]]*\]\()?https?:\/\/\S+\)?$/

// `tool`: every URL (an artifact publish, `gh … create`, a deploy tool). `servers`: dev-server
// addresses only, so a build log's registry and docs links stay out; `0.0.0.0` is not a place a
// browser can go, so it is written as `localhost`. `reply`: a line's URLs when the line is the
// link alone or carries one of `openWords`. De-duplicated, in order of first appearance.
export const linksIn = (text: string, mode: 'tool' | 'servers' | 'reply', openWords: string[] = []): string[] => {
  const out: string[] = []
  const words = openWords.map(w => w.toLowerCase())
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (mode === 'reply' && !ALONE_RE.test(line) && !words.some(w => line.toLowerCase().includes(w))) continue
    if (mode !== 'servers') for (const u of line.match(URL_RE) ?? []) out.push(trimUrl(u))
    for (const m of line.matchAll(SERVER_RE)) {
      const host = m[1] === '0.0.0.0' ? 'localhost' : m[1]
      out.push(trimUrl(`http://${host}:${m[2]}${m[3] ?? ''}`))
    }
  }
  return [...new Set(out)]
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
// `command`: the paths `mkdir` and `git worktree add` name (quotes honoured, `-b <branch>` skipped).
// `reply`: an absolute path alone on its line, backticks or not — a relative one is not taken, the
// reply has no cwd of its own (Julian, 2026-10-04). Forward slashes, no trailing slash, de-duplicated.
// ponytail: a `mkdir` behind `cd x &&` is taken relative to the session cwd, not `x`; `resolve`
// drops it when it does not exist there.
export const foldersIn = (text: string, source: 'command' | 'reply'): string[] => {
  const out: string[] = []
  if (source === 'reply') {
    for (const raw of text.split('\n')) {
      const m = /^`?((?:[A-Za-z]:[\\/]|\/)[^\s`]*)`?$/.exec(raw.trim())
      if (m?.[1]) out.push(norm(m[1]))
    }
    return [...new Set(out)]
  }
  for (const part of text.split(/&&|\|\||;|\|/)) {
    const words = (part.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(w => w.replace(/^["']|["']$/g, ''))
    if (words[0] === 'mkdir') out.push(...words.slice(1).filter(w => !w.startsWith('-')))
    if (words[0] === 'git' && words[1] === 'worktree' && words[2] === 'add') {
      const args: string[] = []
      for (let i = 3; i < words.length; i++) {
        const w = words[i] ?? ''
        if (w === '-b' || w === '-B') i++ // the branch name, not a path
        else if (!w.startsWith('-')) args.push(w)
      }
      if (args[0]) out.push(args[0])
    }
  }
  return [...new Set(out.map(norm))]
}

// An absolute path alone on a reply line: an openable file is a file row, anything else a folder row
// (collect drops it unless it is a directory). Julian, 2026-10-04: a file Claude lists is one to open.
export const replyPaths = (text: string, openWords: string[] = []): Found[] =>
  [...new Set([...foldersIn(text, 'reply'), ...fileLinksIn(text, openWords)])].map(target => ({
    kind: IS_OPENABLE.test(target) ? 'file' as const : 'folder' as const,
    target,
  }))

// A `file://` link in the reply, taken on the same lines as a web link (alone, `- url`, `[text](url)`,
// or an open word) and turned into its path: `file:///E:/x` → `E:/x`, `%20` decoded.
// ponytail: `file://host/share` (UNC) is not handled; no one has written one yet.
const FILE_URL_RE = /file:\/\/([^\s<>()"'\]`]+)/g
const FILE_ALONE_RE = /^(?:[-*]\s+)?(?:\[[^\]]*\]\()?`?file:\/\/\S+\)?$/
const fileLinksIn = (text: string, openWords: string[]): string[] => {
  const words = openWords.map(w => w.toLowerCase())
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!FILE_ALONE_RE.test(line) && !words.some(w => line.toLowerCase().includes(w))) continue
    for (const m of line.matchAll(FILE_URL_RE)) {
      let p = trimUrl(m[1] ?? '').replace(/`$/, '')
      try {
        p = decodeURIComponent(p)
      } catch {
        // a stray % — keep it as written
      }
      out.push(norm(p.replace(/^\/([A-Za-z]:)/, '$1')))
    }
  }
  return out
}

// fzf-flavoured: every query char in order; +3 for continuing a run, +2 at a word start, +1 elsewhere.
// ponytail: greedy leftmost positions, not the best alignment; good enough for 48 short rows.
const WORD_START = /[\s/\-_.:]/
export const fuzzyScore = (query: string, text: string): number | null => {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let score = 0
  let from = 0
  let prev = -2
  for (const ch of q) {
    const at = t.indexOf(ch, from)
    if (at < 0) return null
    score += at === prev + 1 ? 3 : at === 0 || WORD_START.test(t[at - 1] ?? '') ? 2 : 1
    prev = at
    from = at + 1
  }
  return score
}
// Best first, ties newest first; an empty query is the list newest first. Label and tail both count.
export const fuzzy = <E extends { label: string; tail: string; at: number }>(query: string, entries: E[]): E[] =>
  entries
    .map(e => ({ e, s: fuzzyScore(query, `${e.label} ${e.tail}`) }))
    .filter((x): x is { e: E; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || b.e.at - a.e.at)
    .map(x => x.e)

// The kind, one glyph a row: a file, a link out, a folder in.
const MARK: Record<EntryKind, string> = { file: '▪', link: '↗', folder: '▸' }

// A Button hotkey is ONE digit or ONE lowercase letter (the engine refuses anything else), and
// it is the only key a pane can bind: the arrows and Tab belong to the engine, which walks the
// focus ring with them. So rows take 1–8 and the navigation takes h/j/k/l, as Buttons of its own.
const NAV = { j: 'nav:j', k: 'nav:k', h: 'nav:h', l: 'nav:l', o: 'nav:o', f: 'nav:f' } as const
const isNav = (key: string | undefined) => !!key?.startsWith('nav:')

// Turns to `to` (clamped by the caller), redraws, and puts the ring on row `row` of it.
const go = async ($: EngineInterface, to: number, row: number) => {
  page = to
  focused = row
  $.ui.invalidate('ui.render')
  await $.ui.focus({ requestId: PANE, key: `row:${row}` }).catch(() => null)
}

// Top level, not nested in `register`: the validator only traces `$` into a function declared at
// the top of the file, and refuses a module that hands it to a closure it cannot follow.
// `since`: keep only files modified after it, so a path a command merely printed (`git status`
// listing README.md) is not taken for one it produced. 2 s of slack for coarse file-system clocks.
// Publishes even when nothing is collected: every tool call is where a deletion can have happened.
// Files and folders must exist (a folder must be a directory); links are taken as given.
const collect = async ($: EngineInterface, found: Found[], since?: number, roots: string[] = []) => {
  const keep: Found[] = []
  for (const f of found) {
    if (f.kind === 'link') {
      keep.push(f)
      continue
    }
    const resolved = await resolve($, f.target, roots)
    if (!resolved) continue
    const target = sameDrive(resolved)
    const stat = await $.fs.stat(target).catch(() => null)
    if (f.kind === 'folder' && stat?.kind !== 'dir') continue
    if (f.kind === 'file' && since !== undefined && (!stat || stat.mtimeMs < since - 2000)) continue
    keep.push({ kind: f.kind, target })
  }
  if (keep.length) {
    const at = await $.clock.now()
    await update($, files, list => {
      // A target produced again moves to the newest slot: a regenerated file is this session's
      // latest output, and left in its old place a full list drops it on the next new file.
      const targets = new Set(keep.map(k => k.target))
      const kept = list.map(asEntry).filter(e => !targets.has(e.target))
      const fresh = keep.map(k => ({ ...k, label: labelOf(k.kind, k.target), tail: tailOf(k.kind, k.target), at }))
      return [...kept, ...fresh].slice(-KEEP)
    })
  }
  await publish($)
}

// The tools whose answer names a file they produced. Bash is collected live (its call time
// separates produced from merely printed) but never replayed, where that time is gone.
const SCREENSHOT_TOOLS = [
  'mcp__playwright__browser_take_screenshot',
  'mcp__claude-in-chrome__computer',
  'mcp__plugin_figma_figma__get_screenshot',
]

// The list is host state for the session id; a trip through the agent screen hands the same
// conversation a new id and an empty state. The transcript survives it, so an empty list is
// rebuilt from it, oldest first so the newest call ends up on top: Writes, screenshots, artifact
// publishes, and the links and folders the replies named. Never rejects.
const rebuild = async ($: EngineInterface, openWords: string[]) => {
  try {
    const messages = await $.session.messages()
    const roots = [await $.session.root().catch(() => ''), await $.session.cwd().catch(() => '')].filter(Boolean)
    const found: Found[] = []
    const file = (target: string): Found => ({ kind: 'file', target })
    for (const m of messages) {
      if (m.role === 'assistant' && m.text) {
        found.push(...linksIn(m.text, 'reply', openWords).map(link))
        found.push(...replyPaths(m.text, openWords))
      }
      for (const use of m.toolUses ?? []) {
        if (use.isError) continue
        if (use.tool === 'Write' && typeof use.input?.file_path === 'string') {
          const path = use.input.file_path.replace(/\\/g, '/')
          if (IS_OPENABLE.test(path)) found.push(file(path))
        } else if (use.tool === 'Artifact') {
          found.push(...linksIn(use.text ?? JSON.stringify(use.result ?? ''), 'tool').map(link))
        } else if (SCREENSHOT_TOOLS.includes(use.tool)) {
          found.push(...pathsIn(use.result ?? use.text ?? '').map(file))
        }
      }
    }
    if (found.length) await collect($, found, undefined, roots)
  } catch {
    // no transcript to read (a fresh session): the list stays empty
  }
}

// Open as a dialog: it takes the keyboard at once (so a hotkey works without `ctrl+x tab`), Esc
// closes it, and toasts wait behind it rather than landing on the list being picked from.
// `rows` is what makes the arrows walk the list: a dialog tall enough to show whole has nothing
// to scroll, and while it has, the engine spends the arrows on scrolling (measured 2026-10-03:
// opened a third tall, a 20-row image box made the list scroll and the arrows dead).
// One page at most, never the whole list: see PER_PAGE.
const openPane = async ($: EngineInterface, openWords: string[]) => {
  // An empty list may be a new session id over an old conversation: rebuild it before opening.
  // Here, not in the draw: the host refuses a state write while a render is dispatched.
  if (!(await stored($)).length) await rebuild($, openWords)
  const list = await stored($)
  const newest = list[list.length - 1]
  page = 0
  focused = 0
  filtering = false
  query = ''
  const rows = Math.min(PER_PAGE, Math.max(1, list.length)) + HINT_ROWS + (newest && isPng(newest.target) ? IMAGE_ROWS + 1 : 0)
  await $.ui.open({ id: PANE, title: 'Files', focus: true, closeOnEscape: true, holdToasts: true, rows })
}

// The host's own opener, no shell. Windows: `cmd /c start "" <path>` — the empty string is
// `start`'s title argument, without it a quoted path becomes the title; a URL goes through the
// URL handler instead, because `cmd /c start` re-parses its line and an `&` in a query string
// would split it. macOS: `open`. Linux: `xdg-open` (both take a URL as they take a path). A
// failure says so: a silent dead press is the worst outcome for a button.
const openerFor = async ($: EngineInterface, target: string): Promise<string[]> => {
  const os = ((await $.env.get('OS').catch(() => null)) ?? '').toLowerCase()
  const windows = os.includes('windows') || !!(await $.env.get('USERPROFILE').catch(() => null))
  if (windows) {
    return /^https?:\/\//.test(target)
      ? ['rundll32', 'url.dll,FileProtocolHandler', target]
      : ['cmd', '/c', 'start', '', target.replace(/\//g, '\\')]
  }
  const uname = await $.process.run(['uname'], { timeoutMs: 2000 }).catch(() => null)
  return [(uname?.stdout ?? '').trim() === 'Darwin' ? 'open' : 'xdg-open', target]
}

// The `openWords` option: comma-separated, trimmed, case folded in `linksIn`.
const wordsOf = (v: unknown) => String(v ?? '').split(',').map(w => w.trim()).filter(Boolean)

export const register: Register = (on, options) => {
  const openWords = wordsOf(options.openWords)
  // ponytail: Button labels take the terminal's foreground (no colour prop), so a light terminal on a
  // dark base reads poorly; every palette here is dark-ground, which is who picks one.
  const BASE = paletteOf(options.palette).base

  // The reply as it streams: every flush is whole lines but the last, which ends the message, so
  // each line is complete when read and a URL is never taken half. Passed on: a settings hook
  // beneath still runs.
  on('classic.MessageDisplay', async ($, e, next) => {
    const found: Found[] = [
      ...linksIn(e.delta, 'reply', openWords).map(link),
      ...replyPaths(e.delta, openWords),
    ]
    if (found.length) await collect($, found)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'files', description: 'Open a file, link or folder this session produced' })
    await rebuild($, openWords) // a resumed or re-identified conversation: the count is right before /files
    await publish($)
    // A file deleted outside Claude (Explorer, another shell) fires no hook: recount on a clock.
    $.clock.every(30_000, () => void publish($))
    return started
  })

  on('command.run', { command: 'files' }, async $ => {
    await openPane($, openWords)
    return {} // silent: the pane itself is the answer
  })

  // A Write always names the file it wrote, absolute: taken as is, spaces and all.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    const path = e.file_path?.replace(/\\/g, '/')
    const ok = ran.deny === undefined && ran.isError !== true && path && IS_OPENABLE.test(path)
    await collect($, ok ? [{ kind: 'file', target: path }] : [])
    return ran
  })

  // Everything else, one hook with no matcher (a matcher over a list of names sent tsc into
  // TS2589): read the answer, keep what is openable AND on disk. Bash is here because the
  // scripts that produce the real artefacts — invoices, reports — are run, not written; it also
  // yields dev-server addresses from its output (every URL when it is a `gh … create`, whose
  // output is the thing made) and the folders its command made. A screenshot tool names the
  // file it saved. A published artifact and a deploy tool of any MCP server name a URL.
  on('tool.call', async ($, e, next) => {
    const since = await $.clock.now()
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    const producesFiles = e.tool === 'Bash' || SCREENSHOT_TOOLS.includes(e.tool)
    const producesLinks = e.tool === 'Artifact' || DEPLOY_TOOL.test(e.tool)
    if (!producesFiles && !producesLinks) return ran
    const found: Found[] = []
    const roots: string[] = []
    if (producesFiles) {
      roots.push(await $.session.root().catch(() => ''), await $.session.cwd().catch(() => ''))
      found.push(...pathsIn(ran).map(target => ({ kind: 'file' as const, target })))
    }
    if (e.tool === 'Bash') {
      const cmd = typeof e.command === 'string' ? e.command : ''
      found.push(...linksIn(textOf(ran), GH_CREATE.test(cmd) ? 'tool' : 'servers').map(link))
      found.push(...foldersIn(cmd, 'command').map(target => ({ kind: 'folder' as const, target })))
    }
    if (producesLinks) found.push(...linksIn(textOf(ran), 'tool').map(link))
    await collect($, found, since, roots.filter(Boolean))
    return ran
  })

  // No band of its own: the hook only measures the width for the status line, then lets the
  // engine draw whatever belongs there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const width = e.viewport?.columns ?? 0
    if (width && width !== columns) {
      columns = width
      void publish($)
    }
    return next(e)
  })

  // The arrows and Tab walk every Button, the h/j/k/l ones too; the ring stays on the rows, so
  // an arrow past the page's edge stops there (j/k turn the page instead). Tracks the row too.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    if (isNav(e.element)) return {}
    const row = /^row:(\d+)$/.exec(e.element ?? '')
    if (row) focused = Number(row[1])
    return next(e)
  })

  // Esc while the filter is up returns to the list; the pane stays. The engine's Esc reaches us
  // as a close (closeOnEscape): answered without `next`, it is refused and the list is drawn.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (filtering && e.origin.kind === 'person') {
      filtering = false
      query = ''
      page = 0
      focused = 0
      $.ui.invalidate('ui.render')
      // Esc has already handed the keyboard back to the prompt before the close reaches us
      // (Julian 2026-10-04: the list stayed, the focus went to the prompt). Ask for it again and
      // put the ring on row 1; not awaited, the close is still being answered.
      void $.ui
        .open({ id: PANE, title: 'Files', focus: true, closeOnEscape: true, holdToasts: true })
        .then(() => $.ui.focus({ requestId: PANE, key: 'row:0' }))
        .catch(() => null)
      return { value: undefined } // answered here: the pane stays
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    // The pane paints its own ground (Julian 2026-10-04): under a `*-ansi` Claude Code theme the
    // dialog takes an ANSI grey from the terminal's scheme, and neither the rows nor the engine's
    // blue hotkeys read on it. The palette's base, filling the body; text keeps the terminal's
    // foreground. Docked the body is the screen; inline it is what the layout spares.
    const ground = { flexDirection: 'column' as const, backgroundColor: BASE, minHeight: e.props?.scroll?.bodyRows }
    const all = await stored($)

    // Only what is still on disk: a file can be deleted or moved after it was collected, and a
    // button that opens nothing reads as the mod being broken rather than as a missing file.
    // A link is never checked: there is no disk to ask.
    const checked = await Promise.all(
      all.map(async entry =>
        entry.kind === 'link' || (await $.fs.exists(entry.target).catch(() => false)) ? entry : null,
      ),
    )
    const list = checked.filter((entry): entry is Entry => entry !== null)

    // The newest entry doubles as the empty check: `noUncheckedIndexedAccess` types it undefined.
    const newest = list[list.length - 1]
    if (!newest) {
      return (
        <Box {...ground}>
          <Text>Nothing to open yet this session.</Text>
        </Box>
      )
    }
    // A page is as long as the body the surface granted, less the hint rows. Docked (fullscreen
    // from 110 columns) that is floor to ceiling; inline above the prompt it is what the layout
    // spares, which a wrapped prompt shortens. A page taller than the body made the engine scroll
    // it: the hint fell off and the arrows scrolled instead of walking.
    const body = e.props?.scroll?.bodyRows ?? Infinity
    // The Input takes a row off the page while it is up.
    // The pages are cut from `pool`: the list newest first, or the matches best first.
    const pool = filtering && query ? fuzzy(query, list) : list.slice().reverse()
    // Two hint rows only when they cost no entry; tight (inline under a long transcript) the hint is
    // one row of keys, o and f first, the walk after them, no prose (Julian 2026-10-04: the walk is
    // learned once, o and f are rarer). Hidden Buttons would lose their hotkeys, so the keys stay.
    const room = body - (filtering ? 1 : 0)
    const hintRows = room - HINT_ROWS >= Math.min(PER_PAGE, Math.max(1, pool.length)) ? HINT_ROWS : 1
    const perPage = Math.max(1, Math.min(PER_PAGE, room - hintRows))
    const pages = Math.max(1, Math.ceil(pool.length / perPage))
    page = Math.min(page, pages - 1) // a file deleted since can shorten the list under us
    const shown = pool.slice(page * perPage, (page + 1) * perPage)
    const last = shown.length - 1
    focused = Math.min(focused, Math.max(0, last)) // a shorter page than the one the ring was on
    const lastRow = (p: number) => Math.min(perPage, pool.length - p * perPage) - 1

    const startFilter = () => {
      filtering = true
      query = ''
      page = 0
      focused = 0
      $.ui.invalidate('ui.render')
      void $.ui.focus({ requestId: PANE, key: 'q' }).catch(() => null)
    }

    // j past the last row turns to the next page's first; k before the first, to the previous
    // page's last. The list is a ring (Julian, 2026-10-04): past either end it comes round, j
    // from the last entry to page 1's first row, k from the first to the last page's last.
    const down = () => (focused < last ? go($, page, focused + 1) : go($, (page + 1) % pages, 0))
    const up = () => {
      const p = focused > 0 ? page : (page - 1 + pages) % pages
      return go($, p, focused > 0 ? focused - 1 : lastRow(p))
    }
    const turn = (to: number) => () => go($, (to + pages) % pages, 0)

    // A thing that opened takes the person to another app; the pane closes behind it, so they do
    // not come back to a dialog they have to dismiss. A failed open keeps it to pick again.
    const open = (entry: Entry) => () =>
      openerFor($, entry.target)
        .then(cmd => $.process.run(cmd))
        .then(r =>
          r.exitCode === 0
            ? $.ui.close({ id: PANE })
            : $.ui.toast(`could not open ${entry.label} (exit ${r.exitCode})`),
        )
        .catch(() => $.ui.toast(`could not open ${entry.label}`))
    // `o`: the folder of the focused row — a file's parent, a folder itself; a link has none.
    const folderOfRow = () => {
      const entry = shown[focused]
      if (!entry) return
      if (entry.kind === 'link') return $.ui.toast('Links have no folder')
      const target = entry.kind === 'folder' ? entry.target : parentOf(entry.target)
      return open({ ...entry, target, label: target })()
    }

    // The field, while filtering. Its text is drawn back on every change, so a redraw (a new
    // entry arriving) does not empty it. Enter opens the best match; nothing when there is none.
    // Resolved under the surfaces that have an `Input` (mobile does not), as `Image` is below.
    let header = null
    if (filtering && (e.surface === 'terminal' || e.surface === 'desktop' || e.surface === 'vscode')) {
      const { Input } = $.ui.resolve(e)
      header = (
        <Input
          key="q"
          label="find"
          value={query}
          placeholder="type to filter · Enter opens the top match · Esc back"
          autoFocus
          onInput={(value: string) => {
            query = value
            page = 0
            focused = 0
            $.ui.invalidate('ui.render')
          }}
          onSubmit={() => (pool[0] ? open(pool[0])() : undefined)}
        />
      )
    }

    let inline = null
    // The newest file only, on page 1 only, and not while filtering (the list needs the rows):
    // it is what `openPane` asked rows for. Left out when the body cannot hold it under the rows
    // and the hint: a row is worth more than a preview.
    const roomForImage = body >= shown.length + hintRows + IMAGE_ROWS + 1
    if (page === 0 && !filtering && e.surface === 'terminal' && isPng(newest.target) && roomForImage) {
      // Resolved here, not above: `Image` exists only in the terminal's element table, and
      // narrowing on e.surface is what hands it over. A module has no element globals.
      const { Image } = $.ui.resolve(e)
      const stat = await $.fs.stat(newest.target).catch(() => null)
      if (stat && stat.size <= INLINE_MAX_BYTES) {
        const file = await $.fs.read(newest.target, { as: 'bytes' }).catch(() => null)
        if (file) {
          // A fixed, small box: it is what `openPane` asks rows for, and a terminal cell is about
          // twice as tall as wide, so 3 columns a row keeps a screenshot roughly in proportion.
          const cols = Math.min(IMAGE_ROWS * 3, Math.max(10, (e.props?.bodyColumns ?? 60) - 2))
          inline = (
            <Image
              source={{ png: file.base64 }} // FsBytes is `{ base64 }`, already encoded
              columns={cols}
              rows={IMAGE_ROWS}
              // The engine draws pixels in kitty and Ghostty only; everywhere else, this.
              alt="(image preview needs kitty or Ghostty)"
            />
          )
        }
      }
    }

    if (!pool.length) {
      // A filter that matches nothing: the field stays, so the person can retype or Esc back.
      return (
        <Box {...ground}>
          {header}
          <Text>{`No match for ‹${query}›.`}</Text>
        </Box>
      )
    }

    return (
      <Box {...ground}>
        {header}
        {shown.map((entry, i) => (
          // `autoFocus?: true` is a literal-true type, so `false` is not "off", it is an
          // invalid prop — and one invalid prop refuses the WHOLE tree, not just that element.
          // Keyed by position: `row:N` is what `go` focuses after a page turn. The ring starts on
          // the row the pane holds (`go` focuses the same one), so a redraw keeps it; while the
          // field is up, the field keeps it. The muted tail says where the thing is, which tells
          // two files of one name apart.
          <Box key={`line:${i}`} flexDirection="row" columnGap={1}>
            <Button
              key={`row:${i}`}
              plain
              hotkey={String(i + 1)}
              autoFocus={!filtering && i === focused ? true : undefined}
              onPress={open(entry)}
            >
              {`${MARK[entry.kind]} ${entry.label}`}
            </Button>
            {/* The terminal's own foreground on the palette's base (`ground`); italic sets the tail apart. */}
            <Text italic wrap="truncate-end">
              {entry.tail}
            </Text>
          </Box>
        ))}
        {/* The hint, always drawn, two rows (HINT_ROWS) or one when tight: its keys are live Buttons (`j: ↓`), so it cannot
            drift from what works. `openPane` counts these rows. */}
        {/* A short last page keeps the page's height (Julian 2026-10-04): the hint stays where it was,
            so a turn from 8 rows to 7 reads as a turn, not as an entry gone. Only with a second page. */}
        {pages > 1
          ? Array.from({ length: perPage - shown.length }, (_, i) => <Text key={`pad:${i}`}> </Text>)
          : null}
        {(() => {
          const walk = [
            <Button key={NAV.j} plain dimColor hotkey="j" onPress={down}>
              ↓
            </Button>,
            <Button key={NAV.k} plain dimColor hotkey="k" onPress={up}>
              ↑
            </Button>,
            ...(pages > 1
              ? [
                  <Button key={NAV.h} plain dimColor hotkey="h" onPress={turn(page - 1)}>
                    ‹
                  </Button>,
                  // Which entries, not only which page: a wrap from page 1 to a shorter last page read
                  // as an entry lost (Julian 2026-10-04, 15 entries: 8 then 7).
                  <Box key="range" flexShrink={0}>
                    <Text bold>{`${page * perPage + 1}–${page * perPage + shown.length} of ${pool.length} · ${page + 1}/${pages}`}</Text>
                  </Box>,
                  <Button key={NAV.l} plain dimColor hotkey="l" onPress={turn(page + 1)}>
                    ›
                  </Button>,
                ]
              : []),
          ]
          const acts = [
            <Button key={NAV.o} plain dimColor hotkey="o" onPress={folderOfRow}>
              folder
            </Button>,
            ...(filtering
              ? []
              : [
                  <Button key={NAV.f} plain dimColor hotkey="f" onPress={startFilter}>
                    find
                  </Button>,
                ]),
          ]
          return hintRows === HINT_ROWS ? (
            <>
              <Box flexDirection="row" columnGap={1}>
                {walk}
              </Box>
              <Box flexDirection="row" columnGap={1}>
                {acts}
                <Text wrap="truncate-end">
                  {filtering ? '· Enter opens the top match · Esc back' : '· Enter or 1–8 opens · Esc closes'}
                </Text>
              </Box>
            </>
          ) : (
            <Box flexDirection="row" columnGap={1}>
              {acts}
              {walk}
            </Box>
          )
        })()}
        {inline}
      </Box>
    )
  })
}

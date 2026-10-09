# Changelog

Each release names the Claude Code build it was tested against: the plugin hooks API is young,
so pin the tag that matches your build (`git clone --branch v0.1.0 …`).

## v0.2.8 — 2026-10-09

Tested against Claude Code 2.1.295.

- Text, JSON and log files (`.txt`, `.json`, `.log`) are listed in the Files pane.
- A path Git Bash prints on Windows (`/c/Users/…`) is read as `C:/Users/…`. Before, a file a command
  named that way never reached the list.
- New `~/.claude/cockpit/ignore`, written once on first start with the usual configuration files
  (`package.json`, `tsconfig.json`, `requirements.txt`, `*.log` …) all commented out. Uncomment a
  line or add your own pattern to keep a file off the list; edits apply within 30 seconds.

## v0.2.7 — 2026-10-05

Tested against Claude Code 2.1.289.

- Installable through `/plugin`: the repository is its own marketplace.
  `/plugin install cockpit --marketplace LolerHero/claude-cockpit`, or from a shell
  `claude plugin marketplace add LolerHero/claude-cockpit` and `claude plugin install cockpit@cockpit`.
- A plugin cannot set the status line or keybindings, so `setup.mjs` stays for those. Run from the
  marketplace's copy (`~/.claude/plugins/marketplaces/cockpit/setup.mjs`) it wires only those two
  and keys the options as `cockpit@cockpit`; it no longer adds a plugin dir there, which would load
  the plugin twice.
- The status line reads the options of an installed plugin (`cockpit@<marketplace>`) as well.

## v0.2.6 — 2026-10-05

Tested against Claude Code 2.1.289.

- In the find field, `Tab` moves into the matches and `f` brings you back to the field with your
  text kept. Before, only `Shift+Tab` came back, and `f` fell through to the prompt.
- While filtering, the hint leads with `Tab: matches`, then the walk; `o` and `f` are bare keys.
  The one-row hint of a narrow terminal now carries a short text too, cut at the edge.
- The field's Enter label reads `open` (it opens the top match) instead of Claude Code's default
  `submit`, and the placeholder is short enough to keep it on the field's row.
- README: GIFs per section, a narrow-terminal GIF, and the filter described as it matches (the
  typed characters in order, gaps allowed).

## v0.2.5 — 2026-10-05

Tested against Claude Code 2.1.289.

- A file Claude edits joins the pane, as a file it writes always did.
- A file Claude names in a reply joins it too: an absolute path in backticks anywhere on a line,
  or a path alone on its line, bold or not. Source files and bare paths in prose still stay out.
- One file is one row. A rebuild from the transcript listed a file once per mention, and
  `E:\x\a.md` and `e:/X/A.md` were two rows; on drive-letter paths case and separator no
  longer count.
- The status-line count is every row the pane holds: a link or folder behind a `0` was one no
  one would open.

## v0.2.4 — 2026-10-04

Tested against Claude Code 2.1.289.

- The `ctrl+x ↑ more` hint from v0.2.3 is gone. `pane:grow` heightens an inline pane only up to
  the terminal's rows less the prompt's and the transcript's (8 and 3), so in the short window
  where the hint showed, the key had no room to give; docked, it widens instead.

## v0.2.3 — 2026-10-04

Tested against Claude Code 2.1.289.

- When the pane sits inline with fewer rows than a page wants, its one-row hint ends in
  `ctrl+x ↑ more`: Claude Code's own `pane:grow` key. The pane's height request loses to a size
  you keyed earlier, which the engine keeps, so only that key can undo it.

## v0.2.2 — 2026-10-04

Tested against Claude Code 2.1.289.

- A backtick ends a URL, so `` `https://x` `` in a reply is `https://x`, not `https://x` plus a
  backtick. A bare `https://` in prose (no host) is no longer a link: it drew a row labelled `` ` ``.

## v0.2.1 — 2026-10-04

Tested against Claude Code 2.1.289.

- A `file://` link in a reply is a file or folder row: taken on the lines a web link is (alone,
  a bullet, `[text](url)`, or a line with an open word), `file:///E:/x` read as `E:/x`, `%20`
  decoded, and kept only when it exists. A bulleted bare path and a relative path still are not.

## v0.2.0 — 2026-10-04

Tested against Claude Code 2.1.289.

- The `/files` pane is a session hub: files, links and folders this session produced, in one
  list, newest first, the newest 48 kept. Links come from artifact publishes, `gh pr|issue|release
  create`, deploy tools (`mcp__*deploy*`), dev servers a command started (`localhost`,
  `127.0.0.1`, a LAN address with a port; `0.0.0.0` reads as `localhost`), and from the reply as
  it streams when a link stands alone on its line or its line has an open word. Folders come
  from `mkdir` and `git worktree add`, and from an absolute path alone on a reply line; the same
  line naming an openable file that exists adds a file row.
- The pane paints its own ground, the palette's new `base` role (rose-pine #191724, catppuccin
  #1e1e2e, tokyo-night #1a1b26, ansi black): under a `*-ansi` Claude Code theme the dialog took an
  ANSI grey from the terminal scheme, where neither the rows nor the hotkeys read. Text keeps the
  terminal's foreground. The hint drops its doubled key labels (`o: folder`, not `o: o: folder`), and the
  page count no longer breaks over three lines in a narrow hint row. The hint is two rows (walk:
  j k h, `9–15 of 15 · 2/2`, l; actions: o f, Enter, Esc), and a short last page is padded with
  blank rows so the hint never moves when a page turns. When two hint rows would cost an entry
  (inline, little room) the hint is one row of keys: o, f, then the walk, no prose.
- Esc in find mode returns to the list with the keyboard still on the pane (it went to the prompt).
- Each row carries a kind marker (`▪` file, `↗` link, `▸` folder) and an italic tail: the file's
  folder, the link's host and port, the folder's parent. The `· folder` suffix for same-named
  files is gone; the tail tells them apart.
- `o` opens the folder the row sits in (a folder opens itself; a link says it has none).
- `j`/`k` and `h`/`l` wrap around: past either end of the list or the pages they come round.
- `f` finds: a field at the top, fuzzy over the name and the tail, Enter opens the top match,
  Esc returns to the list (Esc in the list closes the pane). The PNG preview hides while filtering.
- `openWords` option (default `open, öffne, ansehen, view, review`): the words that make a
  link in a reply's prose count.
- A URL opens through the URL handler on Windows (`rundll32 url.dll,FileProtocolHandler`), not
  `cmd /c start`, which re-parses an `&` in a query string.
- The status-line count stays files only; links and folders are not counted.
- An empty list is rebuilt from the transcript with links and reply folders too.
- `tsc --noEmit` is clean (the test import extension, one unmatched `tool.call` hook instead of a
  matcher loop, the newest entry narrowed).
- From the unreleased work before this release: eight rows a page with `h`/`l`, `j`/`k` and
  `1`–`8`; the hint line always drawn and the dialog never taller than the terminal; the pane
  closes itself once a thing has opened (a failed open keeps it and says why); inline below 110
  columns a page is as long as the rows granted; one row per file whatever the drive letter's case;
  an empty list is rebuilt from the transcript after the agent screen hands the conversation a new
  session id.

## v0.1.0 — 2026-10-04

Tested against Claude Code 2.1.288.

- Status line: model, directory, branch (dirty, ahead/behind, lines added and removed), a
  five-cell context bar, the file count and the session clock. Segments drop by priority so the
  row never wraps; width from wezterm, else the mod's measurement, else 80.
- `/files` pane (`ctrl+x f`): the documents, images and archives this session wrote or produced,
  newest first. Arrows or Tab move, Enter or a key (`1`–`9`, `a`–`z`) opens, Esc closes. A PNG is
  drawn inline in kitty and Ghostty.
- Four palettes (`rose-pine`, `catppuccin-mocha`, `tokyo-night`, `ansi`) and two glyph sets,
  chosen in Claude Code's config menu.
- `setup.mjs` wires the status line, the plugin folder and the keybinding, with `--dry-run`,
  `--force` and a backup of `settings.json`.
- One status file per session (`~/.claude/cockpit/<session id>.json`).

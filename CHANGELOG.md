# Changelog

Each release names the Claude Code build it was tested against: the plugin hooks API is young,
so pin the tag that matches your build (`git clone --branch v0.1.0 …`).

## v0.2.0 — 2026-10-04

Tested against Claude Code 2.1.288 (the CI pin) and 2.1.289 (locally).

- The `/files` pane is a session hub: files, links and folders this session produced, in one
  list, newest first, the newest 48 kept. Links come from artifact publishes, `gh pr|issue|release
  create`, deploy tools (`mcp__*deploy*`), dev servers a command started (`localhost`,
  `127.0.0.1`, a LAN address with a port; `0.0.0.0` reads as `localhost`), and from the reply as
  it streams when a link stands alone on its line or its line has an open word. Folders come
  from `mkdir` and `git worktree add`, and from an absolute path alone on a reply line.
- Each row carries a kind marker (`▪` file, `↗` link, `▸` folder) and a muted tail: the file's
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

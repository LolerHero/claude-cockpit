# Privacy

claude-cockpit collects no data and sends nothing anywhere. It has no server, no analytics and no
network requests of its own.

Everything stays on your machine:

- The mod keeps the list of files, links and folders your session produced in that session's own
  state inside Claude Code, and writes one small file, `~/.claude/cockpit/<session id>.json`,
  holding the file count and the terminal width for the status line.
- Once, it writes `~/.claude/cockpit/ignore`, a list of file patterns you can edit to keep files
  off the pane. It ships with every line commented out and is only read after that.
- The status line script reads that file and your `settings.json`, and prints one row.
- A link opens in your browser, and a file in its app, only when you pick it in the pane.

The full list of what the mod reads, writes and runs is in the README:
[What the mod does on your machine](README.md#what-the-mod-does-on-your-machine).

Questions: [open an issue](https://github.com/LolerHero/claude-cockpit/issues).

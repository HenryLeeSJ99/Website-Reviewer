# Reviewer Mode

Standalone review tool. The tool lives outside the reviewed repo; only its review data (`reviews/`) is saved into the repo.
Needs only Node (no `npm install`).

## Run
```
start.bat                                   # reviews the PLYTEC website folder
node server.js <site-folder> [--port 8800] [--name project]
```
Open http://localhost:8800/__review/ (the site itself is served at `/`).

The site is now Astro, so review the **built** output: `npm run build` in the repo, and point the tool at `dist/`
(start.bat does this by default). After each pull, rebuild; the tool auto-refreshes when `dist/` changes.

## Where review data lives
Inside the reviewed repo, in `<repo>/reviews/` (override with `--data <dir>`):
- `comments/<id>.json` one file per comment (so two people editing rarely conflict)
- `rounds.json` round list with the commit each round reviewed
- `HISTORY.md` append-only readable log (raised / fixed / verified / replied / round started)

Sync is plain git: reviewer commits + pushes `reviews/`, designer pulls (and vice versa).
The tool re-reads the files when you click back to its tab, or press **Reload**.

## Review loop
1. Designer pushes an update -> `git pull` in the site repo, reload the tool.
2. Press **C** (comment mode), click any element, write the note, pick Must fix / Suggestion / Question.
   Switch Desktop / Tablet / Mobile to review responsive layouts; comments remember the width.
3. Commit and push `reviews/`. (**Export for designer** also gives a markdown summary to paste
   into chat/email; the JSON export/import is a fallback.)
4. Designer pulls, switches to the **Designer** role, marks items *Fixed* or replies, commits `reviews/`.
5. You pull, check each *Fixed* pin, **Verify** or **Reopen**. Then **New round…**
   Open and unverified items carry over automatically.

Pins are anchored to CSS selectors, so they follow layout changes; if the element
was removed/renamed the item is flagged "Element no longer found".

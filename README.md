# 2026 World Cup Pool — live dashboard

A dashboard that pulls 2026 FIFA World Cup results from **football-data.org**,
scores them by your pool's rules, and shows a ranked, easy-to-read leaderboard.

The page itself is plain static files (no framework). The only moving part is a
tiny **fetch step** that calls the API with your secret token and writes
`matches.json` — the page just reads that file. Your token never reaches the
browser.

```
football-data.org  ──(fetch-matches.js, holds the token)──►  matches.json  ──►  the static page
```

---

## How the data flows

- `fetch-matches.js` calls `football-data.org/v4/competitions/WC/matches` with
  your token and writes **`matches.json`** (all 104 matches: scores, stage,
  shootout winners — everything).
- `index.html` reads `matches.json` and renders the standings. It re-reads the
  file every 60s, so whenever `matches.json` is refreshed, the page updates.
- **Your token is never in the page.** It lives in an environment variable /
  GitHub Secret, and (locally) an optional `token.txt` that is gitignored.

You already have a `matches.json` checked in (generated at build time), so the
page works immediately.

---

## Try it locally

Just open `index.html` — it reads the bundled `matches.json`. To **refresh** the
data locally, run the fetch step with your token:

```bash
# option A: environment variable
FOOTBALL_DATA_TOKEN=your-token  node fetch-matches.js

# option B: put the token in token.txt (gitignored), then:
node fetch-matches.js
```

(Windows PowerShell: `$env:FOOTBALL_DATA_TOKEN="your-token"; node fetch-matches.js`)

Requires Node 18+. One API call refreshes everything — far inside the free
tier's 10 requests/minute.

---

## Put it online with automatic updates (recommended: GitHub Pages)

This hosts the page **and** auto-refreshes the scores every ~10 minutes, with
your token kept safe in a GitHub Secret.

1. Create a free **public** GitHub repo (e.g. `worldcup-pool`) and upload every
   file in this folder **except `token.txt`** (it's gitignored — don't upload it).
   `matches.json` and the `.github/` folder should be included.
2. **Add your token as a secret:** repo **Settings → Secrets and variables →
   Actions → New repository secret**. Name it exactly `FOOTBALL_DATA_TOKEN`,
   paste your token, save.
3. **Turn on Pages:** **Settings → Pages → Source = Deploy from a branch →
   `main` / `(root)`** → Save. Your URL appears: `https://<you>.github.io/worldcup-pool/`.
4. **Kick off the updater:** **Actions** tab → "Update scores" → **Run
   workflow**. It fetches the latest results, commits `matches.json`, and from
   then on re-runs automatically every ~10 minutes. (GitHub's cron is
   best-effort and can drift; hit "Run workflow" before a big kickoff if you
   want it fresh that second.)

Share the Pages URL — anyone can view it, no login.

### No-account / quick option

Drag this folder onto [app.netlify.com/drop](https://app.netlify.com/drop) for an
instant public URL. Note: that serves a **static snapshot** — to update scores
you re-run `node fetch-matches.js` and re-drop the folder. For hands-off
auto-updates, use the GitHub Pages path above.

---

## Editing the pool

### `config.js` — players, teams, rules
- **Players & teams** — the `players` list (each team is its 3-letter code).
- **Scoring rules** — `rules`. Already set to your sheet: group +3/+1/+0,
  knockout +2/+0, win bonus `(margin − 1)` capped at +3.
- **Team flags/names** — the `teams` map (keys are the official TLA codes, so
  matching is exact).

### `overrides.js` — manual safety net (rarely needed)
football-data.org reports results, stages, and shootout winners, so you usually
won't touch this. If you ever need to: fix a score (`corrections`), set a
knockout winner the feed didn't report (`knockoutWinners`), or add a missing
match (`manualMatches`). Match ids are football-data.org's ids.

---

## How scoring works

For every **finished** match involving an owned team:

| | Win | Draw | Loss |
|---|---|---|---|
| Group stage | +3 | +1 | +0 |
| Knockout | +2 (the side that advances) | — | +0 |

Plus a **win-margin bonus** (wins only): by 2 = +1, by 3 or more = +2 (so the
most a team can score in one game is 5: a group win +3 plus the +2 bonus). A
penalty-shootout win is a knockout win (+2) with no margin bonus (the feed gives
us the winner automatically). A player's total is the sum across their three
teams. Standings rank by total, then bonus, then wins. **Points lock in at
full-time** — live matches show a provisional preview but don't count yet. Top
two finish in the money ($250 / $50 of the $300 pot).

---

## Data notes

- football-data.org's free tier reports results shortly after full-time, not
  second-by-second. Since points only finalize at full-time, that captures all
  the scoring; the live feed shows in-progress matches as a provisional preview.
- The dashboard reads the throttle headers and stays well within the free 10
  req/min (one call gets all 104 matches).
- If `matches.json` is briefly unreadable, the page keeps the last good data and
  flags itself "Offline".

---

## Files

| File | What it is |
|------|-----------|
| `index.html` | the page |
| `styles.css` | styling (light + dark, responsive) |
| `config.js` | **players, teams, rules** — your main edit point |
| `overrides.js` | manual corrections (rarely needed) |
| `scoring.js` | the pure scoring engine |
| `data.js` | reads & normalizes `matches.json` |
| `app.js` | renders the dashboard, polls for updates |
| `fetch-matches.js` | pulls results from football-data.org → `matches.json` |
| `matches.json` | the data the page reads (refreshed by the fetch step) |
| `.github/workflows/update-scores.yml` | auto-refreshes `matches.json` every ~10 min |
| `.gitignore` | keeps `token.txt` out of the repo |
| `tests.html` / `tests.js` | scoring-engine tests (46 of them) |

*Flags by [flagcdn.com](https://flagcdn.com).*

/*
 * fetch-matches.js — pulls every 2026 World Cup match from football-data.org
 * and writes matches.json (which the static page reads).
 *
 * The token is read from the FOOTBALL_DATA_TOKEN environment variable, or from
 * a local `token.txt` file (which is gitignored — never commit it).
 *
 * Run locally:   FOOTBALL_DATA_TOKEN=xxxx node fetch-matches.js
 *   (or put the token in token.txt, then: node fetch-matches.js)
 * In CI it runs automatically from .github/workflows/update-scores.yml.
 *
 * One request returns all 104 matches, so this stays far inside the free
 * tier's 10 requests/minute — but we still read the throttle headers and warn.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches';

function getToken() {
  if (process.env.FOOTBALL_DATA_TOKEN) return process.env.FOOTBALL_DATA_TOKEN.trim();
  try {
    return fs.readFileSync(path.join(__dirname, 'token.txt'), 'utf8').trim();
  } catch (e) {
    return '';
  }
}

async function main() {
  const token = getToken();
  if (!token) {
    console.error('No API token found. Set FOOTBALL_DATA_TOKEN or create token.txt with your key.');
    process.exit(1);
  }

  const res = await fetch(API_URL, { headers: { 'X-Auth-Token': token } });

  // Throttle awareness (football-data.org asks clients to watch these).
  const avail = res.headers.get('X-Requests-Available-Minute');
  const reset = res.headers.get('X-RequestCounter-Reset');

  if (!res.ok) {
    const body = await res.text();
    console.error('Request failed: HTTP', res.status, body.slice(0, 300));
    if (res.status === 429) console.error('Rate limited. Wait', reset || '60', 'seconds and retry.');
    process.exit(1);
  }

  const data = await res.json();
  const matches = data.matches || [];

  const out = {
    updatedAt: new Date().toISOString(),
    competition: (data.competition && data.competition.code) || 'WC',
    season: data.matches && data.matches[0] && data.matches[0].season
      ? data.matches[0].season.startDate.slice(0, 4) : null,
    count: matches.length,
    matches: matches,
  };

  const outPath = path.join(__dirname, 'matches.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log('Wrote', matches.length, 'matches to matches.json.',
    'Requests left this minute:', avail == null ? '(unknown)' : avail);
}

main().catch(function (e) {
  console.error('Unexpected error:', e && e.message ? e.message : e);
  process.exit(1);
});

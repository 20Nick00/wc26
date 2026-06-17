/*
 * config.js — everything you might want to change lives here.
 *
 * Players & their drafted teams, the scoring rules, and team metadata.
 * Edit this file and reload the page — no build step.
 *
 * Match data comes from `matches.json`, which is produced by `fetch-matches.js`
 * (which calls football-data.org with your secret token). The browser only ever
 * reads matches.json, so the token is never exposed here or to viewers.
 */
window.POOL_CONFIG = {
  title: '2026 World Cup Pool',

  // How often the page re-reads matches.json (seconds). The underlying data is
  // refreshed by the fetch step (GitHub Action cron, or run locally).
  refreshSeconds: 60,

  // ---- Scoring rules (from the pool's rule sheet) ------------------------
  rules: {
    group:    { win: 3, draw: 1, loss: 0 },
    knockout: { win: 2, loss: 0 }, // no draw: the side that advances is the winner
    bonusPerExtraGoal: 1,          // win-margin bonus = (margin - 1) * this ...
    bonusMax: 3,                   // ... capped here. by1:+0 by2:+1 by3:+2 by4+:+3
    buyIn: 50,
    prizes: { first: 250, second: 50 },
  },

  // ---- The draft: each player and their three teams (by code below) ------
  // Codes are the official 3-letter (TLA) codes football-data.org uses.
  players: [
    { name: 'Taran',    teams: ['ESP', 'COL', 'MEX'] },
    { name: 'Ishan',    teams: ['BRA', 'BIH', 'CRO'] },
    { name: 'Vishnu',   teams: ['FRA', 'BEL', 'USA'] },
    { name: 'Praneeth', teams: ['ENG', 'NED', 'URU'] },
    { name: 'Harish',   teams: ['ARG', 'GER', 'JPN'] },
    { name: 'Nick',     teams: ['POR', 'NOR', 'ECU'] },
  ],

  // ---- Team metadata -----------------------------------------------------
  // The keys match football-data.org's `tla` codes, so matching is exact.
  // `iso` drives the flag image; `aliases` are a name-based fallback.
  teams: {
    ESP: { display: 'Spain',          iso: 'es',     aliases: ['Spain'] },
    COL: { display: 'Colombia',       iso: 'co',     aliases: ['Colombia'] },
    MEX: { display: 'Mexico',         iso: 'mx',     aliases: ['Mexico'] },
    BRA: { display: 'Brazil',         iso: 'br',     aliases: ['Brazil'] },
    BIH: { display: 'Bosnia & Herz.', iso: 'ba',     aliases: ['Bosnia-Herzegovina', 'Bosnia and Herzegovina'] },
    CRO: { display: 'Croatia',        iso: 'hr',     aliases: ['Croatia'] },
    FRA: { display: 'France',         iso: 'fr',     aliases: ['France'] },
    BEL: { display: 'Belgium',        iso: 'be',     aliases: ['Belgium'] },
    USA: { display: 'USA',            iso: 'us',     aliases: ['United States', 'USA'] },
    ENG: { display: 'England',        iso: 'gb-eng', aliases: ['England'] },
    NED: { display: 'Netherlands',    iso: 'nl',     aliases: ['Netherlands'] },
    URU: { display: 'Uruguay',        iso: 'uy',     aliases: ['Uruguay'] },
    ARG: { display: 'Argentina',      iso: 'ar',     aliases: ['Argentina'] },
    GER: { display: 'Germany',        iso: 'de',     aliases: ['Germany'] },
    JPN: { display: 'Japan',          iso: 'jp',     aliases: ['Japan'] },
    POR: { display: 'Portugal',       iso: 'pt',     aliases: ['Portugal'] },
    NOR: { display: 'Norway',         iso: 'no',     aliases: ['Norway'] },
    ECU: { display: 'Ecuador',        iso: 'ec',     aliases: ['Ecuador'] },
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = window.POOL_CONFIG;

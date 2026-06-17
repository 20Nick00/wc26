/*
 * data.js — the data layer. Reads the local `matches.json` (written by
 * fetch-matches.js from football-data.org), normalizes each match, and applies
 * your overrides. No secret token here — the browser only reads a static file.
 *
 * Exposes window.DataLayer.
 */
(function (root) {
  'use strict';

  var CFG = root.POOL_CONFIG || {};

  // Normalize a name for matching: strip accents, lowercase, drop punctuation.
  function norm(s) {
    return (s == null ? '' : String(s))
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Build: normalized alias/display/code -> team code (for name-based fallback).
  var aliasToCode = {};
  Object.keys(CFG.teams || {}).forEach(function (code) {
    var t = CFG.teams[code];
    (t.aliases || []).concat([t.display, code]).forEach(function (a) { aliasToCode[norm(a)] = code; });
  });
  function codeForName(name) { return aliasToCode[norm(name)] || null; }
  // Prefer the exact TLA (config keys ARE the TLAs); fall back to name.
  function codeForTeam(tla, name) {
    if (tla && CFG.teams[tla]) return tla;
    return codeForName(name);
  }

  // ---- Status classification (football-data.org statuses) ----------------
  var FINISHED = { FINISHED: 1, AWARDED: 1 };
  var LIVE = { IN_PLAY: 1, PAUSED: 1, LIVE: 1 };
  var SCHEDULED = { SCHEDULED: 1, TIMED: 1, POSTPONED: 1, SUSPENDED: 1, CANCELLED: 1 };

  function classifyStatus(raw) {
    var s = String(raw || '').toUpperCase();
    if (FINISHED[s]) return 'finished';
    if (LIVE[s]) return 'live';
    if (SCHEDULED[s]) return 'scheduled';
    return 'unknown';
  }

  function stageFor(apiStage) {
    return apiStage === 'GROUP_STAGE' ? 'group' : 'knockout';
  }

  function winnerSideFrom(w) {
    if (w === 'HOME_TEAM') return 'home';
    if (w === 'AWAY_TEAM') return 'away';
    if (w === 'DRAW') return 'draw';
    return null;
  }

  // Raw football-data.org match -> normalized match.
  function normalizeMatch(m) {
    var ht = m.homeTeam || {}, at = m.awayTeam || {};
    var sc = m.score || {};
    var ft = sc.fullTime || {};
    var statusClass = classifyStatus(m.status);
    return {
      id: String(m.id),
      name: (ht.name || '?') + ' vs ' + (at.name || '?'),
      date: m.utcDate ? m.utcDate.slice(0, 10) : '',
      timestamp: m.utcDate || '',
      homeName: ht.shortName || ht.name, awayName: at.shortName || at.name,
      homeCode: codeForTeam(ht.tla, ht.name), awayCode: codeForTeam(at.tla, at.name),
      homeScore: ft.home == null ? null : ft.home,
      awayScore: ft.away == null ? null : ft.away,
      homeBadge: ht.crest || '', awayBadge: at.crest || '',
      rawStatus: m.status || '', statusClass: statusClass,
      finished: statusClass === 'finished',
      live: statusClass === 'live',
      scheduled: statusClass === 'scheduled',
      stage: stageFor(m.stage),
      group: m.group || null,
      winnerSide: winnerSideFrom(sc.winner),
      knockoutWinner: null, // manual override hook (overrides.js)
      penalties: sc.penalties || null,
      duration: sc.duration || null,
      venue: '',
      source: 'feed',
    };
  }

  // ---- Apply overrides ---------------------------------------------------
  function applyOverrides(matches, ov) {
    ov = ov || {};
    var map = {};
    (matches || []).forEach(function (m) { map[m.id] = m; });

    var corr = ov.corrections || {};
    Object.keys(corr).forEach(function (id) {
      var c = corr[id], m = map[id];
      if (!m) return;
      if (c.homeScore != null) m.homeScore = c.homeScore;
      if (c.awayScore != null) m.awayScore = c.awayScore;
      if (c.status) {
        m.rawStatus = c.status;
        m.statusClass = classifyStatus(c.status);
        m.finished = m.statusClass === 'finished';
        m.live = m.statusClass === 'live';
        m.scheduled = m.statusClass === 'scheduled';
      }
      if (c.stage) m.stage = c.stage;
      if (c.winner) m.winnerSide = c.winner; // 'home'|'away'|'draw'
      m.source = 'corrected';
    });

    var kw = ov.knockoutWinners || {};
    Object.keys(kw).forEach(function (id) {
      if (map[id]) map[id].knockoutWinner = kw[id];
    });

    (ov.manualMatches || []).forEach(function (mm) {
      var statusClass = classifyStatus(mm.status || 'FINISHED');
      var id = mm.id || ('manual-' + norm(mm.home) + '-' + norm(mm.away) + '-' + (mm.date || ''));
      map[id] = {
        id: id,
        name: (mm.home || '?') + ' vs ' + (mm.away || '?'),
        date: mm.date || '', timestamp: (mm.date || '') + 'T00:00:00Z',
        homeName: mm.home, awayName: mm.away,
        homeCode: codeForTeam(mm.homeTla, mm.home), awayCode: codeForTeam(mm.awayTla, mm.away),
        homeScore: mm.homeScore != null ? mm.homeScore : null,
        awayScore: mm.awayScore != null ? mm.awayScore : null,
        homeBadge: '', awayBadge: '',
        rawStatus: mm.status || 'FINISHED', statusClass: statusClass,
        finished: statusClass === 'finished',
        live: statusClass === 'live',
        scheduled: statusClass === 'scheduled',
        stage: mm.stage || 'group',
        group: mm.group || null,
        winnerSide: mm.winner || null,
        knockoutWinner: mm.knockoutWinner || null,
        penalties: null, duration: null, venue: '', source: 'manual',
      };
    });

    return Object.keys(map).map(function (k) { return map[k]; });
  }

  // ---- Read matches.json -------------------------------------------------
  // Returns { matches: [...normalized], ok: bool, updatedAt: ISO|null }.
  function fetchMatches() {
    var bust = (typeof Date !== 'undefined' && Date.now) ? ('?t=' + Date.now()) : '';
    return fetch('matches.json' + bust, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        var raw = (j && j.matches) || [];
        return { matches: raw.map(normalizeMatch), ok: true, updatedAt: (j && j.updatedAt) || null, count: raw.length };
      })
      .catch(function (e) {
        console.warn('[data] could not read matches.json:', e.message);
        return { matches: [], ok: false, updatedAt: null, count: 0 };
      });
  }

  var api = {
    fetchMatches: fetchMatches,
    applyOverrides: applyOverrides,
    normalizeMatch: normalizeMatch,
    classifyStatus: classifyStatus,
    stageFor: stageFor,
    winnerSideFrom: winnerSideFrom,
    codeForTeam: codeForTeam,
    codeForName: codeForName,
    norm: norm,
    aliasToCode: aliasToCode,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DataLayer = api;
})(typeof window !== 'undefined' ? window : globalThis);

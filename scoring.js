/*
 * scoring.js — the pure scoring engine. No DOM, no network, fully testable.
 *
 * Exposes window.Scoring (and module.exports for Node-based tests):
 *   scoreTeamInMatch(match, side, rules, opts) -> per-team result or null
 *   computeStandings(matches, config, opts)    -> ranked player rows
 *
 * A "match" is a normalized object (see data.js). The only fields this engine
 * needs: homeScore, awayScore, homeCode, awayCode, stage ('group'|'knockout'),
 * finished (bool), knockoutWinner ('home'|'away'|null), date.
 */
(function (root) {
  'use strict';

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // Margin bonus applies only to a win where goals decided it.
  function marginBonus(margin, rules) {
    if (margin < 1) return 0; // shootout win (margin 0) earns no bonus
    return clamp(margin - 1, 0, rules.bonusMax) * rules.bonusPerExtraGoal;
  }

  /*
   * Score one team's outcome in one match.
   * Returns null when the match doesn't count yet (not final, missing scores),
   * unless opts.countLive is set (used for "provisional" live previews).
   *
   * Outcome is taken from an explicit winner when available (`match.winnerSide`
   * from the data feed, or a manual `match.knockoutWinner` override) — this is
   * how penalty shootouts resolve automatically. Otherwise it's inferred from
   * the goal score. The margin bonus always uses the goal score, so a shootout
   * win (level goals) correctly earns +0 bonus.
   */
  function scoreTeamInMatch(match, side, rules, opts) {
    opts = opts || {};
    if (!match) return null;
    if (!match.finished && !opts.countLive) return null;

    var my = side === 'home' ? match.homeScore : match.awayScore;
    var opp = side === 'home' ? match.awayScore : match.homeScore;
    if (my == null || opp == null) return null;

    var stage = match.stage === 'knockout' ? 'knockout' : 'group';
    var table = rules[stage];
    var margin = Math.abs(my - opp);
    var result, base, pending = false;

    // A manual override wins over the feed's winner.
    var explicit = match.knockoutWinner || match.winnerSide || null; // 'home'|'away'|'draw'|null

    if (explicit === 'home' || explicit === 'away') {
      if (explicit === side) { result = 'win'; base = table.win; }
      else { result = 'loss'; base = table.loss; }
    } else if (explicit === 'draw') {
      result = 'draw';
      base = stage === 'group' ? table.draw : 0;
    } else if (my > opp) {
      result = 'win';
      base = table.win;
    } else if (my < opp) {
      result = 'loss';
      base = table.loss;
    } else {
      // Level score, no explicit winner.
      if (stage === 'group') {
        result = 'draw';
        base = table.draw;
      } else {
        // Knockout tie with no winner reported -> awaiting resolution.
        result = 'pending';
        base = 0;
        pending = true;
      }
    }

    // Bonus only on a win decided by goals (shootout win has level goals -> +0).
    var bonus = (result === 'win' && my > opp) ? marginBonus(margin, rules) : 0;

    return {
      points: base + bonus,
      base: base,
      bonus: bonus,
      result: result,   // 'win' | 'draw' | 'loss' | 'pending'
      margin: margin,
      pending: pending, // knockout tie with no winner set yet
      stage: stage,
      side: side,
    };
  }

  function byDateAsc(a, b) {
    var am = a.match || a, bm = b.match || b;
    return String(am.date || '').localeCompare(String(bm.date || ''));
  }

  /*
   * Compute the full standings.
   *   matches: normalized + override-applied match list
   *   config:  POOL_CONFIG
   * Returns an array of player rows sorted best-first, each with a per-team
   * breakdown and the individual match contributions (for the detail view).
   */
  function computeStandings(matches, config) {
    var rules = config.rules;

    // Index every match under each team code that appears in it.
    var byTeam = {};
    (matches || []).forEach(function (m) {
      if (m.homeCode) (byTeam[m.homeCode] = byTeam[m.homeCode] || []).push({ match: m, side: 'home' });
      if (m.awayCode) (byTeam[m.awayCode] = byTeam[m.awayCode] || []).push({ match: m, side: 'away' });
    });

    var rows = config.players.map(function (p) {
      var teams = p.teams.map(function (code) {
        var entries = (byTeam[code] || []).slice().sort(byDateAsc);
        var team = {
          code: code,
          meta: config.teams[code] || { display: code, iso: '' },
          points: 0, bonus: 0,
          wins: 0, draws: 0, losses: 0,
          played: 0, pending: 0,
          contribs: [],                 // finished matches that scored
          fixtures: entries.map(function (e) { return e.match; }), // all (incl. upcoming/live)
        };
        entries.forEach(function (e) {
          var s = scoreTeamInMatch(e.match, e.side, rules);
          if (!s) return; // not final yet
          team.played += 1;
          team.points += s.points;
          team.bonus += s.bonus;
          if (s.result === 'win') team.wins += 1;
          else if (s.result === 'draw') team.draws += 1;
          else if (s.result === 'loss') team.losses += 1;
          else if (s.result === 'pending') team.pending += 1;
          team.contribs.push({ match: e.match, side: e.side, score: s });
        });
        return team;
      });

      return {
        name: p.name,
        teams: teams,
        total: teams.reduce(function (a, t) { return a + t.points; }, 0),
        totalBonus: teams.reduce(function (a, t) { return a + t.bonus; }, 0),
        totalWins: teams.reduce(function (a, t) { return a + t.wins; }, 0),
        played: teams.reduce(function (a, t) { return a + t.played; }, 0),
        pending: teams.reduce(function (a, t) { return a + t.pending; }, 0),
      };
    });

    // Rank: points, then bonus, then wins, then name.
    rows.sort(function (a, b) {
      return (b.total - a.total)
        || (b.totalBonus - a.totalBonus)
        || (b.totalWins - a.totalWins)
        || a.name.localeCompare(b.name);
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  var api = {
    scoreTeamInMatch: scoreTeamInMatch,
    computeStandings: computeStandings,
    marginBonus: marginBonus,
    clamp: clamp,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);

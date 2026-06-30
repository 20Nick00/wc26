/*
 * tests.js — assertions for the pure scoring engine.
 * Runs in the browser (open tests.html) or under Node (`node tests.js`).
 */
(function () {
  'use strict';
  var Scoring = (typeof module !== 'undefined' && module.exports)
    ? require('./scoring.js')
    : window.Scoring;

  var rules = {
    group: { win: 3, draw: 1, loss: 0 },
    knockout: { win: 3, draw: 1, loss: 0 },
    bonusPerExtraGoal: 1,
    bonusMax: 2,
  };

  var results = [];
  function check(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || '' }); }
  function eq(name, got, want) { check(name, got === want, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }

  function M(o) {
    return Object.assign({
      id: 'x', homeCode: null, awayCode: null, homeScore: null, awayScore: null,
      stage: 'group', finished: true, knockoutWinner: null, date: '2026-06-12',
    }, o);
  }
  var S = Scoring.scoreTeamInMatch;

  // ---- margin bonus = (margin-1) capped at 3 ----
  eq('bonus by1', Scoring.marginBonus(1, rules), 0);
  eq('bonus by2', Scoring.marginBonus(2, rules), 1);
  eq('bonus by3 (cap)', Scoring.marginBonus(3, rules), 2);
  eq('bonus by4 (cap)', Scoring.marginBonus(4, rules), 2);
  eq('bonus by5 (cap)', Scoring.marginBonus(5, rules), 2);
  eq('bonus by0', Scoring.marginBonus(0, rules), 0);

  // ---- group stage (max in any game is 5: win +3 plus +2 bonus) ----
  eq('group win by1', S(M({ homeScore: 1, awayScore: 0 }), 'home', rules).points, 3);
  eq('group win by2', S(M({ homeScore: 2, awayScore: 0 }), 'home', rules).points, 4);
  eq('group win by3 (max 5)', S(M({ homeScore: 3, awayScore: 0 }), 'home', rules).points, 5);
  eq('group win by4 (cap 5)', S(M({ homeScore: 4, awayScore: 0 }), 'home', rules).points, 5);
  eq('group win by5 (cap 5)', S(M({ homeScore: 5, awayScore: 0 }), 'home', rules).points, 5);
  eq('group win 7-1 margin6 (cap 5)', S(M({ homeScore: 7, awayScore: 1 }), 'home', rules).points, 5);
  eq('group draw', S(M({ homeScore: 1, awayScore: 1 }), 'home', rules).points, 1);
  eq('group loss', S(M({ homeScore: 0, awayScore: 1 }), 'home', rules).points, 0);
  eq('group result is draw', S(M({ homeScore: 1, awayScore: 1 }), 'home', rules).result, 'draw');

  // ---- away perspective ----
  var away = S(M({ homeScore: 0, awayScore: 2 }), 'away', rules);
  eq('away win by2 points', away.points, 4);
  eq('away win result', away.result, 'win');
  eq('home loss vs away win', S(M({ homeScore: 0, awayScore: 2 }), 'home', rules).points, 0);

  // ---- knockouts (now score the same as group: +3/+1/+0, max 5) ----
  eq('ko win by1', S(M({ stage: 'knockout', homeScore: 1, awayScore: 0 }), 'home', rules).points, 3);
  eq('ko win by2', S(M({ stage: 'knockout', homeScore: 2, awayScore: 0 }), 'home', rules).points, 4);
  eq('ko win by3 (max 5)', S(M({ stage: 'knockout', homeScore: 3, awayScore: 0 }), 'home', rules).points, 5);
  eq('ko win by4 (cap 5)', S(M({ stage: 'knockout', homeScore: 4, awayScore: 0 }), 'home', rules).points, 5);
  eq('ko loss', S(M({ stage: 'knockout', homeScore: 0, awayScore: 1 }), 'home', rules).points, 0);

  // ---- knockout shootout (level score) ----
  var pend = S(M({ stage: 'knockout', homeScore: 1, awayScore: 1 }), 'home', rules);
  eq('ko tie pending', pend.pending, true);
  eq('ko tie pending points', pend.points, 0);
  eq('ko tie winner=home, home gets +3', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1, knockoutWinner: 'home' }), 'home', rules).points, 3);
  eq('ko tie winner=home, away gets 0', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1, knockoutWinner: 'home' }), 'away', rules).points, 0);
  eq('ko shootout win bonus is 0', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1, knockoutWinner: 'home' }), 'home', rules).bonus, 0);

  // ---- explicit winnerSide from the feed (football-data.org) ----
  eq('feed shootout: winnerSide home -> home +3', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1, winnerSide: 'home' }), 'home', rules).points, 3);
  eq('feed shootout: winnerSide home -> away 0', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1, winnerSide: 'home' }), 'away', rules).points, 0);
  eq('feed shootout bonus is 0', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1, winnerSide: 'home' }), 'home', rules).bonus, 0);
  eq('feed ko regulation win uses goal bonus', S(M({ stage: 'knockout', homeScore: 2, awayScore: 0, winnerSide: 'home' }), 'home', rules).points, 4);
  eq('feed group explicit draw', S(M({ homeScore: 0, awayScore: 0, winnerSide: 'draw' }), 'home', rules).points, 1);
  eq('manual override beats feed winnerSide', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1, winnerSide: 'away', knockoutWinner: 'home' }), 'home', rules).points, 3);
  eq('no winner reported -> pending', S(M({ stage: 'knockout', homeScore: 1, awayScore: 1 }), 'home', rules).pending, true);

  // ---- not final ----
  eq('unfinished not counted', S(M({ finished: false, homeScore: 2, awayScore: 0 }), 'home', rules), null);
  eq('countLive computes provisional', S(M({ finished: false, homeScore: 2, awayScore: 0 }), 'home', rules, { countLive: true }).points, 4);
  eq('missing scores -> null', S(M({ homeScore: null, awayScore: null }), 'home', rules), null);

  // ---- computeStandings: totals, both-owned, ranking, tiebreak ----
  var cfg = {
    rules: rules,
    players: [
      { name: 'Alice', teams: ['X', 'Y'] },
      { name: 'Bob', teams: ['Z'] },
    ],
    teams: { X: { display: 'X', iso: '' }, Y: { display: 'Y', iso: '' }, Z: { display: 'Z', iso: '' } },
  };
  var matches = [
    M({ id: 'm1', homeCode: 'X', awayCode: 'Z', homeScore: 2, awayScore: 0 }), // X(group win by2)=4, Z=0
    M({ id: 'm2', homeCode: 'Y', awayCode: null, homeScore: 1, awayScore: 1 }), // Y draw = 1
    M({ id: 'm3', stage: 'knockout', homeCode: 'Z', awayCode: null, homeScore: 1, awayScore: 0 }), // Z ko win = 3
  ];
  var st = Scoring.computeStandings(matches, cfg);
  var alice = st.find(function (r) { return r.name === 'Alice'; });
  var bob = st.find(function (r) { return r.name === 'Bob'; });
  eq('Alice total (4+1)', alice.total, 5);
  eq('Bob total (0+3)', bob.total, 3);
  eq('both-owned: Z scored independently', bob.teams[0].points, 3);
  eq('Alice ranked 1', alice.rank, 1);
  eq('Bob ranked 2', bob.rank, 2);
  eq('Alice X wins counted', alice.teams[0].wins, 1);

  // tiebreak: equal points, more bonus wins the tie (bonus before wins)
  var cfg2 = {
    rules: rules,
    players: [{ name: 'HighBonus', teams: ['P'] }, { name: 'LowBonus', teams: ['Q'] }],
    teams: { P: { display: 'P', iso: '' }, Q: { display: 'Q', iso: '' } },
  };
  var m2 = [
    M({ id: 'a', homeCode: 'P', homeScore: 3, awayScore: 0 }),  // P: 3 + bonus 2 = 5 (bonus 2, 1 win)
    M({ id: 'b', homeCode: 'Q', homeScore: 1, awayScore: 0 }),  // Q: 3
    M({ id: 'c', homeCode: 'Q', homeScore: 0, awayScore: 0 }),  // Q: draw +1
    M({ id: 'd', homeCode: 'Q', homeScore: 2, awayScore: 2 }),  // Q: draw +1 -> Q total 5 (bonus 0, 1 win)
  ];
  var st2 = Scoring.computeStandings(m2, cfg2);
  eq('tiebreak equal totals', st2[0].total === st2[1].total, true);
  eq('tiebreak: higher bonus ranks first', st2[0].name, 'HighBonus');

  // ---- report ----
  var fails = results.filter(function (r) { return !r.pass; });
  if (typeof window !== 'undefined') {
    var html = '<p style="font:600 16px sans-serif">' +
      (fails.length ? '❌ ' + fails.length + ' / ' + results.length + ' failed' : '✅ all ' + results.length + ' passed') + '</p>';
    html += results.map(function (r) {
      return '<div style="font:13px monospace;padding:3px 0;color:' + (r.pass ? '#1d9e75' : '#e0413f') + '">' +
        (r.pass ? '✓' : '✗') + ' ' + r.name + (r.pass ? '' : '  — ' + r.detail) + '</div>';
    }).join('');
    document.getElementById('out').innerHTML = html;
  } else {
    results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + (r.pass ? '' : '  — ' + r.detail)); });
    console.log('\n' + (fails.length ? fails.length + ' FAILED of ' + results.length : 'ALL ' + results.length + ' PASSED'));
    if (typeof process !== 'undefined' && process.exit) process.exit(fails.length ? 1 : 0);
  }
})();

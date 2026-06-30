/*
 * app.js — orchestration + rendering. Fetches on a timer, recomputes the
 * standings, and paints the dashboard. The only file that touches the DOM.
 */
(function () {
  'use strict';

  var CFG = window.POOL_CONFIG;
  var OV = window.POOL_OVERRIDES || {};
  var $ = function (id) { return document.getElementById(id); };

  // Owner lookup: team code -> player name (teams can't overlap by rule).
  var ownerByCode = {};
  CFG.players.forEach(function (p) { p.teams.forEach(function (c) { ownerByCode[c] = p.name; }); });

  var state = { matches: [], standings: [], updated: null, dataUpdated: null, ok: false, open: {} };

  // ---- helpers ----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function flagByIso(iso) {
    if (!iso) return '';
    return 'https://flagcdn.com/40x30/' + iso + '.png';
  }
  // Image for a team in a match: flag if it's one of our teams, else feed badge.
  function teamImg(code, badge) {
    var iso = code && CFG.teams[code] ? CFG.teams[code].iso : '';
    return iso ? flagByIso(iso) : (badge || '');
  }
  function imgTag(src, alt, cls) {
    if (!src) return '<span class="' + (cls || '') + '" style="width:20px;height:15px;display:inline-block;background:var(--border);border-radius:2px"></span>';
    return '<img class="' + (cls || '') + '" src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">';
  }
  function timeAgo(d) {
    if (!d) return '';
    var s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    return Math.floor(s / 3600) + ' h ago';
  }
  function stageLabel(m) { return m.stage === 'knockout' ? 'Knockout' : 'Group'; }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(+p[1]) - 1] || '';
    return mon + ' ' + (+p[2]);
  }

  // ---- render: prize pot ------------------------------------------------
  function renderPot() {
    var pot = CFG.rules.buyIn * CFG.players.length;
    $('pot').innerHTML =
      metric('Total pot', money(pot)) +
      metric('1st place', money(CFG.rules.prizes.first)) +
      metric('2nd place', money(CFG.rules.prizes.second));
  }
  function metric(label, val) {
    return '<div class="metric"><p class="l">' + esc(label) + '</p><p class="v">' + esc(val) + '</p></div>';
  }

  // ---- render: standings ------------------------------------------------
  function renderStandings() {
    var rows = state.standings;
    var max = Math.max(1, rows.reduce(function (a, r) { return Math.max(a, r.total); }, 0));
    var html = rows.map(function (r) {
      var money2 = r.rank <= 2;
      var rankCls = r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : '';
      var pills = r.teams.map(function (t) {
        var out = t.played > 0 && t.wins + t.draws === 0 && t.losses === t.played; // played & all losses
        return '<span class="pill' + (out ? ' out' : '') + '">' +
          imgTag(flagByIso(t.meta.iso), t.meta.display) +
          '<span class="code">' + esc(t.code) + '</span>' +
          '<span class="pts">' + t.points + '</span></span>';
      }).join('');
      var pendNote = r.pending ? ' <span class="pend" title="Knockout tie awaiting a winner">•</span>' : '';
      var open = state.open[r.name];
      return '' +
        '<div class="row' + (money2 ? ' money' : '') + (open ? ' open' : '') + '" role="button" tabindex="0" data-name="' + esc(r.name) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<div class="rank ' + rankCls + '">' + r.rank + '</div>' +
          '<div class="main">' +
            '<div class="name-line"><span class="name">' + esc(r.name) + '</span>' +
              (money2 ? '<span class="tag-money">' + (r.rank === 1 ? 'in the money' : 'in the money') + '</span>' : '') + pendNote +
            '</div>' +
            '<div class="bartrack"><div class="barfill" style="width:' + (r.total / max * 100) + '%"></div></div>' +
            '<div class="teams">' + pills + '</div>' +
          '</div>' +
          '<div class="total"><div class="n">' + r.total + '</div><div class="u">pts · ' + r.totalWins + 'W</div></div>' +
        '</div>' +
        '<div class="detail">' + detailHtml(r) + '</div>';
    }).join('');
    $('standings').innerHTML = html || '<div class="skeleton">No players configured.</div>';
    wireRows();
  }

  function detailHtml(r) {
    return r.teams.map(function (t) {
      var head = '<div class="dt-head">' + imgTag(flagByIso(t.meta.iso), t.meta.display) +
        '<span>' + esc(t.meta.display) + '</span>' +
        '<span class="dt-sub">' + t.points + ' pts · ' + t.wins + 'W ' + t.draws + 'D ' + t.losses + 'L</span></div>';
      var fixtures = t.fixtures.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
      if (!fixtures.length) return '<div class="detail-team">' + head + '<div class="empty-team">No matches in the feed yet.</div></div>';
      var rowsH = fixtures.map(function (m) {
        var side = m.homeCode === t.code ? 'home' : 'away';
        var opp = side === 'home' ? m.awayName : m.homeName;
        var oppImg = teamImg(side === 'home' ? m.awayCode : m.homeCode, side === 'home' ? m.awayBadge : m.homeBadge);
        var scoreTxt, ptCell;
        if (m.finished) {
          var s = window.Scoring.scoreTeamInMatch(m, side, CFG.rules);
          scoreTxt = (side === 'home' ? m.homeScore : m.awayScore) + '–' + (side === 'home' ? m.awayScore : m.homeScore);
          if (s && s.pending) ptCell = '<span class="pend">needs winner</span>';
          else if (s) ptCell = '<span class="pt ' + (s.points > 0 ? 'win' : 'zero') + '">+' + s.points + '</span>';
          else ptCell = '<span class="pt zero">+0</span>';
        } else if (m.live) {
          scoreTxt = (side === 'home' ? m.homeScore : m.awayScore) + '–' + (side === 'home' ? m.awayScore : m.homeScore) + ' <span class="live-badge"><span class="pulse"></span>LIVE</span>';
          ptCell = '<span class="pt zero">—</span>';
        } else {
          scoreTxt = '<span class="up-badge">' + (fmtDate(m.date) || 'TBD') + '</span>';
          ptCell = '<span class="pt zero">—</span>';
        }
        return '<tr>' +
          '<td>' + imgTag(oppImg, opp, '') + ' ' + esc(opp || '?') + '</td>' +
          '<td class="res">' + scoreTxt + '</td>' +
          '<td class="stg">' + stageLabel(m) + '</td>' +
          '<td class="pt">' + ptCell + '</td>' +
        '</tr>';
      }).join('');
      return '<div class="detail-team">' + head + '<table class="mtable">' + rowsH + '</table></div>';
    }).join('');
  }

  function wireRows() {
    var nodes = $('standings').querySelectorAll('.row');
    nodes.forEach(function (el) {
      var toggle = function () {
        var name = el.getAttribute('data-name');
        state.open[name] = !state.open[name];
        el.classList.toggle('open');
        el.setAttribute('aria-expanded', state.open[name] ? 'true' : 'false');
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  // ---- render: live & recent feed --------------------------------------
  function ours(m) { return !!(m.homeCode || m.awayCode); }
  function deltaText(m, live) {
    var parts = [];
    ['home', 'away'].forEach(function (side) {
      var code = side === 'home' ? m.homeCode : m.awayCode;
      if (!code) return;
      var s = window.Scoring.scoreTeamInMatch(m, side, CFG.rules, live ? { countLive: true } : {});
      if (!s) return;
      var who = ownerByCode[code] || code;
      if (s.pending) parts.push(esc(who) + ' <span class="up">needs winner</span>');
      else parts.push(esc(who) + ' <span class="up">+' + s.points + '</span>');
    });
    return parts.join(' · ');
  }
  function chip(m, kind) {
    var hi = teamImg(m.homeCode, m.homeBadge), ai = teamImg(m.awayCode, m.awayBadge);
    var score = (m.homeScore == null ? '' : m.homeScore) + '–' + (m.awayScore == null ? '' : m.awayScore);
    var right;
    if (kind === 'live') right = '<span class="live-badge"><span class="pulse"></span>LIVE</span><span class="delta">' + (deltaText(m, true) ? 'if final: ' + deltaText(m, true) : '') + '</span>';
    else if (kind === 'recent') right = '<span class="delta">' + deltaText(m, false) + '</span>';
    else right = '<span class="up-badge">' + esc(fmtDate(m.date)) + '</span>';
    var scoreHtml = (kind === 'upcoming') ? '<span class="sc">vs</span>' : '<span class="sc">' + esc(score) + '</span>';
    return '<div class="fchip"><div class="ft">' +
        imgTag(hi, m.homeName) + '<span>' + esc(m.homeName || '?') + '</span> ' + scoreHtml + ' ' +
        imgTag(ai, m.awayName) + '<span>' + esc(m.awayName || '?') + '</span>' +
      '</div>' + right + '</div>';
  }
  function renderFeed() {
    var mine = state.matches.filter(ours);
    var live = mine.filter(function (m) { return m.live; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var recent = mine.filter(function (m) { return m.finished; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)); }).slice(0, 6);
    var upcoming = mine.filter(function (m) { return m.scheduled; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).slice(0, 4);
    var all = live.map(function (m) { return chip(m, 'live'); })
      .concat(recent.map(function (m) { return chip(m, 'recent'); }))
      .concat(upcoming.map(function (m) { return chip(m, 'upcoming'); }));
    $('feed-label').hidden = all.length === 0;
    $('feed').innerHTML = all.join('');
  }

  // ---- render: notices --------------------------------------------------
  function renderNotices() {
    var html = '';
    // Knockout matches that finished without a reported winner (rare — the feed
    // normally resolves shootouts itself). Let the owner set it manually.
    var pend = state.matches.filter(function (m) {
      return ours(m) && m.stage === 'knockout' && m.finished && !m.knockoutWinner &&
        m.winnerSide !== 'home' && m.winnerSide !== 'away';
    });
    if (pend.length) {
      html += '<div class="notice"><b>Action needed:</b> ' + pend.length + ' knockout ' +
        (pend.length === 1 ? 'match' : 'matches') + ' finished with no winner reported. Set it in <code>overrides.js</code> &rarr; <code>knockoutWinners</code>:<br>' +
        pend.map(function (m) { return '<code>\'' + esc(m.id) + '\': \'home\'</code> &nbsp;<span style="color:var(--muted)">(' + esc(m.homeName) + ' vs ' + esc(m.awayName) + ')</span>'; }).join('<br>') +
        '</div>';
    }
    $('notices').innerHTML = html;
  }

  // ---- render: footer ---------------------------------------------------
  function renderFooter() {
    var r = CFG.rules;
    $('foot').innerHTML =
      '<h4>How scoring works</h4>' +
      '<div class="legend">' +
        '<span><b>All games:</b> win +' + r.group.win + ' · draw +' + r.group.draw + ' · loss +' + r.group.loss + '</span>' +
        '<span><b>Win bonus:</b> by 2 +1 · by 3+ +' + r.bonusMax + ' (max ' + (r.group.win + r.bonusMax) + ' pts/game)</span>' +
      '</div>' +
      '<p style="margin:0">Standings rank by total points (tiebreak: bonus, then wins). Points lock in at full-time; live matches show a provisional preview but don\'t count yet. ' +
      'Top 2 finish in the money (' + money(r.prizes.first) + ' / ' + money(r.prizes.second) + ').</p>' +
      '<p style="margin:8px 0 0;color:var(--faint)">Data: <a href="https://www.football-data.org" target="_blank" rel="noopener">football-data.org</a> · refreshed by the update job · flags by flagcdn.com</p>';
  }

  // ---- status line ------------------------------------------------------
  function renderStatus(stateName) {
    var dot = $('status-dot'), txt = $('status-text');
    if (stateName === 'loading') { txt.textContent = 'Loading…'; dot.className = 'dot stale'; return; }
    if (stateName === 'error') {
      dot.className = 'dot stale';
      txt.textContent = state.updated ? 'Offline — showing last update from ' + timeAgo(state.updated) : 'Could not reach the data feed. Retrying…';
      return;
    }
    dot.className = 'dot';
    var fresh = state.dataUpdated ? 'data from ' + timeAgo(state.dataUpdated) : 'updated ' + timeAgo(state.updated);
    txt.textContent = 'Auto-refreshing · ' + fresh;
  }

  // ---- main load --------------------------------------------------------
  var loading = false;
  function load(isManual) {
    if (loading) return;
    loading = true;
    var btn = $('refresh-btn');
    btn.setAttribute('aria-busy', 'true');
    if (isManual) $('refresh-icon').outerHTML = '<span class="spin" id="refresh-icon"></span>';

    window.DataLayer.fetchMatches().then(function (res) {
      if (res.ok && res.matches) {
        var merged = window.DataLayer.applyOverrides(res.matches, OV);
        state.matches = merged;
        state.standings = window.Scoring.computeStandings(merged, CFG);
        state.updated = new Date();
        state.dataUpdated = res.updatedAt ? new Date(res.updatedAt) : null;
        state.ok = true;
        paintAll();
        renderStatus('ok');
      } else if (!state.ok) {
        renderStatus('error');
      } else {
        renderStatus('error'); // keep last good render, flag stale
      }
    }).catch(function (e) {
      console.error('[app] load failed', e);
      renderStatus(state.ok ? 'error' : 'error');
    }).then(function () {
      loading = false;
      btn.removeAttribute('aria-busy');
      var ic = $('refresh-icon'); if (ic) ic.outerHTML = '<span id="refresh-icon">↻</span>';
    });
  }

  function paintAll() {
    renderNotices();
    renderStandings();
    renderFeed();
  }

  // ---- boot -------------------------------------------------------------
  function boot() {
    if (CFG.title) { document.title = CFG.title; $('title').textContent = CFG.title; }
    renderPot();
    renderFooter();
    renderStatus('loading');
    $('refresh-btn').addEventListener('click', function () { load(true); });
    load(false);
    setInterval(function () { load(false); }, Math.max(20, CFG.refreshSeconds) * 1000);
    // Keep the "updated N min ago" label fresh between fetches.
    setInterval(function () { if (state.ok) renderStatus('ok'); }, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/*
 * overrides.js — your manual control panel.
 *
 * football-data.org reports the full result, the stage, and the winner of a
 * penalty shootout, so you usually won't need anything here. It's a safety net:
 * anything you put here OVERRIDES or ADDS to the feed. Edit, save, reload.
 *
 * Leave the example lines commented out until you need them. The match `id` is
 * the football-data.org match id (also shown by the dashboard when relevant).
 */
window.POOL_OVERRIDES = {

  // 1) KNOCKOUT WINNER (rare fallback)
  // The feed normally resolves shootouts itself. Only if a knockout finishes
  // with no winner reported, the dashboard shows a yellow "Action needed"
  // notice with the match id — set it here:
  //   key = match id, value = 'home' or 'away'
  knockoutWinners: {
    // '537401': 'home',
  },

  // 2) SCORE CORRECTIONS / FILLS
  // Override a result the feed got wrong or hasn't updated yet.
  //   key = match id.  `winner` (optional) = 'home' | 'away' | 'draw'.
  corrections: {
    // '537327': { homeScore: 2, awayScore: 0, status: 'FINISHED' },
  },

  // 3) MISSING MATCHES
  // Add a match the feed doesn't have. `home`/`away` match a team name or alias
  // (or pass `homeTla`/`awayTla`). `stage` is 'group' or 'knockout'.
  manualMatches: [
    // { id: 'm1', date: '2026-06-15', home: 'France', away: 'Norway',
    //   homeScore: 3, awayScore: 1, status: 'FINISHED', stage: 'group' },
  ],
};

if (typeof module !== 'undefined' && module.exports) module.exports = window.POOL_OVERRIDES;

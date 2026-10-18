/* Isolated RK emblem source: never falls through to Royal Match assets. */
(() => {
  'use strict';
  const MAX = 184;
  const ESCAPE = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPE[c]);
  const valid = logo => Number.isInteger(logo) && logo >= 0 && logo < MAX;
  const logoOf = t => t?.TeamLogo ?? t?.Logo ?? t?.teamLogo ?? t?.logo ?? null;
  const image = logo => valid(logo) ?
    `<img class="rk-team-emblem" src="assets/rk-emblems/${logo}.webp?v=20261018-rk184" width="32" height="35" loading="lazy" decoding="async" alt="" aria-hidden="true" data-rk-logo="${logo}">` : '';
  const name = (label, teamId, logo) => {
    const content = `<span class="rk-team-label">${escape(label)}</span>`;
    return `<span class="rk-team-name"${teamId == null ? '' : ` data-rk-team-id="${escape(teamId)}"`}>${image(logo)}${content}</span>`;
  };
  document.addEventListener('error', event => { if(event.target?.matches?.('.rk-team-emblem')) event.target.hidden=true; }, true);
  window.RoyalKingdomEmblems = Object.freeze({version:'1.0.0',valid,logoOf,image,name});
})();

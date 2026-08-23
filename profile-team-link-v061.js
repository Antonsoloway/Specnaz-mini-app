/* Royal CRM Mini App v0.6.1 — profile team navigation */
(() => {
  'use strict';

  const VERSION = '0.6.1-profile-team-link.2';
  let decorateQueued = false;

  function clean(value) {
    return String(value || '').trim();
  }

  function canonicalGame(value) {
    const text = clean(value).toLocaleLowerCase('ru-RU');
    if (!text) return '';
    if (text === 'рм' || text.includes('royal match')) return 'Royal Match';
    if (text === 'рк' || text.includes('royal kingdom')) return 'Royal Kingdom';
    return clean(value);
  }

  function encodedTeamRef(team, game) {
    return encodeURIComponent(JSON.stringify([clean(team), canonicalGame(game)]));
  }

  function openTeam(team, game) {
    team = clean(team);
    game = canonicalGame(game);
    if (!team) return false;

    try { window.RoyalNav?.pushCurrent?.(); } catch (_) {}

    try {
      if (document.body.classList.contains('admin-mode') && window.RoyalAdminTeamDetailV0600?.open) {
        window.RoyalAdminTeamDetailV0600.open(team, game);
        return true;
      }
      if (window.RoyalTeamDetail?.open) {
        window.RoyalTeamDetail.open(team, game);
        return true;
      }
    } catch (_) {}

    return false;
  }

  function participantProfileRef(card) {
    const team = clean(card?.querySelector?.('b')?.textContent);
    const meta = clean(card?.querySelector?.('small')?.textContent);
    const game = canonicalGame(meta.includes('·') ? meta.split('·').pop() : '');
    return team ? { team, game } : null;
  }

  function ownMembershipRef(card) {
    if (!card) return null;
    const team = [...card.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => clean(node.textContent))
      .filter(Boolean)
      .join(' ')
      .trim();
    const meta = clean(card.querySelector('small')?.textContent);
    const game = canonicalGame(meta.includes('·') ? meta.split('·').pop() : '');
    return team ? { team, game } : null;
  }

  function decorateOwnMembership(card) {
    if (!card || card.dataset.v061OwnTeamReady === '1') return;
    const ref = ownMembershipRef(card);
    if (!ref) return;

    // Reuse the ordinary team router. team-identity-fix.js understands the
    // encoded [name, game] pair, so duplicate team names in RM/RK remain safe.
    card.dataset.team = encodedTeamRef(ref.team, ref.game);
    card.dataset.v061OwnTeamReady = '1';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Открыть команду ${ref.team}${ref.game ? `, ${ref.game}` : ''}`);
    card.style.cursor = 'pointer';
    card.style.touchAction = 'manipulation';
  }

  function decorateOwnMemberships(root = document) {
    const nodes = [];
    if (root?.matches?.('.self-membership')) nodes.push(root);
    root?.querySelectorAll?.('.self-membership')?.forEach(node => nodes.push(node));
    nodes.forEach(decorateOwnMembership);
  }

  function queueDecorate(root = document) {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(() => {
      decorateQueued = false;
      decorateOwnMemberships(root?.isConnected === false ? document : root);
    });
  }

  document.addEventListener('click', event => {
    const profileMembership = event.target?.closest?.('.participant-profile-membership');
    if (!profileMembership) return;
    const ref = participantProfileRef(profileMembership);
    if (!ref) return;
    if (openTeam(ref.team, ref.game)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.addEventListener('keydown', event => {
    const ownMembership = event.target?.closest?.('.self-membership[data-team]');
    if (!ownMembership || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    ownMembership.click();
  }, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (node?.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('.self-membership') || node.querySelector?.('.self-membership')) {
          queueDecorate(node);
          return;
        }
      }
    }
  });

  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
    queueDecorate(document);
  }, { once: true });

  window.addEventListener('royal:auth-ready', () => queueDecorate(document));
  window.addEventListener('royal:snapshot-ready', () => queueDecorate(document));
  queueDecorate(document);

  window.__ROYAL_PROFILE_TEAM_LINK_V061__ = VERSION;
})();

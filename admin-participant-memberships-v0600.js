/* Royal CRM Mini App — v0.6 admin participant list memberships
 * Makes team memberships in the admin participant list use the same visual pills
 * as the ordinary participants page. Read-only DOM decoration; no writes.
 */
(() => {
  const VERSION = '0.6.0-admin-participant-memberships.1';
  let scheduled = 0;

  const clean = value => String(value == null ? '' : value).trim();
  const html = value => {
    try { return typeof esc === 'function' ? esc(value) : clean(value); }
    catch (_) { return clean(value); }
  };

  function canonicalGame(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }

  function membershipFromRow(row) {
    if (!row || row.classList.contains('royal-admin-empty-slot')) return null;
    const title = clean(row.querySelector('b')?.textContent).replace(/^\d+\.\s*/, '');
    const meta = clean(row.querySelector('small')?.textContent);
    const role = clean(meta.split(/\s+·\s+ник:\s*/i)[0]);
    let game = '';
    if (/royal\s*kingdom|(^|\s)рк(\s|$)/i.test(meta)) game = 'Royal Kingdom';
    else if (/royal\s*match|(^|\s)рм(\s|$)/i.test(meta)) game = 'Royal Match';
    return {
      team: title === '—' ? '' : title,
      role: role === '—' ? 'Без роли' : (role || 'Без роли'),
      game: canonicalGame(game)
    };
  }

  function membershipPill(m) {
    if (!m) return '';
    const team = clean(m.team);
    const role = clean(m.role || 'Без роли');
    const game = canonicalGame(m.game);
    if (!team) return `<span class="membership-pill no-team royal-admin-participant-list-membership">Без команды — ${html(role)}</span>`;
    return `<span class="membership-pill team-link royal-admin-participant-list-membership" data-team="${encodeURIComponent(team)}"><span>${html(team)}</span><small>${html(role)}${game ? ` · ${html(game)}` : ''}</small></span>`;
  }

  function signature(list) {
    return list.map(m => [clean(m?.team), clean(m?.role), canonicalGame(m?.game)].join('\u001f')).join('\u001e');
  }

  function decorateRecord(record) {
    const main = record?.querySelector('summary .royal-admin-summary-main');
    if (!main) return false;

    const memberships = [...record.querySelectorAll('.royal-admin-detail .royal-admin-membership')]
      .map(membershipFromRow)
      .filter(Boolean);
    const nextSignature = signature(memberships);
    let list = main.querySelector('.royal-admin-participant-list-memberships');

    if (list && list.dataset.membershipSignature === nextSignature) return false;
    if (!list) {
      list = document.createElement('div');
      list.className = 'membership-list royal-admin-participant-list-memberships';
      main.appendChild(list);
    }

    list.dataset.membershipSignature = nextSignature;
    list.innerHTML = memberships.length
      ? memberships.map(membershipPill).join('')
      : '<span class="muted royal-admin-participant-list-no-team">Команда не указана</span>';
    return true;
  }

  function refreshDecorators() {
    try { window.RoyalTeamGameColors?.refresh?.(); } catch (_) {}
    try { window.RoyalActiveTeams?.refresh?.(); } catch (_) {}
  }

  function decorateAll() {
    let changed = false;
    document.querySelectorAll('details[data-admin-participant="1"]').forEach(record => {
      if (decorateRecord(record)) changed = true;
    });
    if (changed) {
      refreshDecorators();
      window.setTimeout(refreshDecorators, 80);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = window.setTimeout(() => {
      scheduled = 0;
      decorateAll();
    }, 0);
  }

  function installCss() {
    if (document.querySelector('style[data-admin-participant-memberships-v0600="1"]')) return;
    const style = document.createElement('style');
    style.dataset.adminParticipantMembershipsV0600 = '1';
    style.textContent = `
      details[data-admin-participant="1"] .royal-admin-participant-list-teams{display:none!important}
      details[data-admin-participant="1"] .royal-admin-participant-list-memberships{margin-top:8px}
      details[data-admin-participant="1"] .royal-admin-participant-list-membership{pointer-events:none}
      details[data-admin-participant="1"] .royal-admin-participant-list-no-team{font-size:12px}
    `;
    document.head.appendChild(style);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList:true, subtree:true });

  installCss();
  schedule();
  window.addEventListener('pageshow', schedule);
  window.RoyalAdminParticipantMembershipsV0600 = { version:VERSION, refresh:decorateAll };
})();

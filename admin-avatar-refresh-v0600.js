/* Royal CRM Mini App — v0.6 admin avatar refresh hotfix
 * Fixes a race where admin cards rendered before snapshotState avatarFileId data.
 * Reuses the normal avatar loader/cache; no extra network/cache implementation.
 */
(() => {
  const VERSION = '0.6.0-admin-avatar-refresh.1';
  let participantSource = null;
  let byId = new Map();
  let retryTimer = 0;
  let retryCount = 0;
  const MAX_RETRIES = 24;

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function telegramId(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }
  function firstLetter(value) {
    const text = clean(value).replace(/^@/, '');
    return text ? Array.from(text)[0].toUpperCase() : '👤';
  }

  function refreshMap() {
    const participants = Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
    if (participantSource === participants) return participants.length;
    participantSource = participants;
    byId = new Map();
    participants.forEach(p => {
      const id = telegramId(p?.telegramId);
      if (id) byId.set(id, p);
    });
    return participants.length;
  }

  function recordId(record) {
    const summaryMeta = clean(record?.querySelector('summary .royal-admin-summary-main small')?.textContent);
    const summaryMatch = summaryMeta.match(/(?:^|·\s*)ID\s+(\d{5,20})(?:\s|$)/i);
    if (summaryMatch) return summaryMatch[1];

    const fields = [...(record?.querySelectorAll?.('.royal-admin-detail .royal-admin-field') || [])];
    const idField = fields.find(node => /telegram\s*id/i.test(clean(node.querySelector('span:first-child')?.textContent)));
    return telegramId(idField?.querySelector('span:last-child')?.textContent);
  }

  function ensureWrap(record, participant) {
    const summary = record?.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!summary || !main) return null;

    let wrap = summary.querySelector('.royal-admin-participant-avatar');
    if (!wrap) {
      const title = clean(main.querySelector('strong')?.textContent) || clean(participant?.name || participant?.telegramName || participant?.username) || 'Участник';
      wrap = document.createElement('div');
      wrap.className = 'person-avatar-wrap small royal-admin-participant-avatar fallback';
      wrap.setAttribute('aria-hidden', 'true');
      const fallback = document.createElement('span');
      fallback.textContent = firstLetter(title);
      wrap.appendChild(fallback);
      summary.insertBefore(wrap, main);
    }
    return wrap;
  }

  function upgradeRecord(record) {
    const id = recordId(record);
    if (!id) return false;
    const participant = byId.get(id);
    if (!participant) return false;

    const avatarFile = clean(participant.avatarFileId);
    const wrap = ensureWrap(record, participant);
    if (!wrap) return false;

    if (!avatarFile) {
      wrap.classList.add('fallback');
      record.dataset.adminAvatarEnhanced = '1';
      return false;
    }

    let img = wrap.querySelector('img.person-avatar');
    if (!img) {
      img = document.createElement('img');
      img.className = 'person-avatar';
      img.alt = '';
      wrap.appendChild(img);
    }

    if (clean(img.dataset.avatarFile) !== avatarFile) {
      img.removeAttribute('src');
      delete img.dataset.avatarLoaded;
      img.dataset.avatarFile = avatarFile;
    }

    wrap.classList.remove('fallback');
    record.dataset.adminAvatarEnhanced = '1';
    record.dataset.adminAvatarFile = avatarFile;
    return true;
  }

  function refresh() {
    retryTimer = 0;
    const screen = document.querySelector('.royal-admin-screen');
    if (!screen) return false;

    const count = refreshMap();
    const records = [...screen.querySelectorAll('[data-admin-participant="1"]')];
    let upgraded = 0;
    records.forEach(record => { if (upgradeRecord(record)) upgraded += 1; });

    if (upgraded > 0) {
      try {
        if (typeof setupAvatarLoading === 'function') setupAvatarLoading(screen);
      } catch (_) {}
    }

    // If admin UI won the race against the public snapshot, keep retrying for
    // a short bounded window. No network is started here; loadSnapshot owns it.
    if (records.length && !count && retryCount < MAX_RETRIES) {
      retryCount += 1;
      retryTimer = window.setTimeout(refresh, 250);
    } else if (count) {
      retryCount = 0;
    }
    return upgraded > 0;
  }

  function schedule(delay = 0) {
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(refresh, delay);
  }

  // Catch later admin tab/refresh renders.
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => [...record.addedNodes].some(node => {
      if (!(node instanceof Element)) return false;
      return node.matches?.('.royal-admin-screen,[data-admin-participant="1"]') || !!node.querySelector?.('.royal-admin-screen,[data-admin-participant="1"]');
    }));
    if (relevant) schedule(0);
  });
  observer.observe(document.body, { childList:true, subtree:true });

  // Initial race coverage: module itself may load before or after loadSnapshot.
  schedule(0);
  window.setTimeout(() => schedule(0), 500);
  window.setTimeout(() => schedule(0), 1500);
  window.setTimeout(() => schedule(0), 3500);

  window.RoyalAdminAvatarRefreshV0600 = {
    version: VERSION,
    refresh,
    schedule
  };
})();

/* Royal CRM Mini App — v0.6 admin avatar bridge
 *
 * The canonical avatar loader (media-v0517.js) does NOT load by avatarFileId.
 * It discovers images only under [data-telegram-id] and requests /avatar by raw
 * Telegram ID. Admin cards did not expose that DOM contract, so the normal
 * loader correctly found zero admin images.
 *
 * This bridge makes admin participant cards use exactly the same contract,
 * loader and cache as the normal participant list. No second avatar backend,
 * cache or snapshot dependency is introduced.
 */
(() => {
  const VERSION = '0.6.0-admin-avatar-bridge.2';
  let scheduled = 0;
  let decorating = false;

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function telegramId(value) {
    const match = clean(value).replace(/\.0$/, '').match(/\d{5,20}/);
    return match ? match[0] : '';
  }

  function firstLetter(value) {
    const text = clean(value).replace(/^@/, '');
    return text ? Array.from(text)[0].toUpperCase() : '👤';
  }

  function recordId(record) {
    const cached = telegramId(record?.dataset?.telegramId);
    if (cached) return cached;

    const summaryMeta = clean(
      record?.querySelector('summary .royal-admin-summary-main small')?.textContent
    );
    const summaryMatch = summaryMeta.match(/(?:^|·\s*)ID\s+(\d{5,20})(?:\s|$)/i);
    if (summaryMatch) return summaryMatch[1];

    const fields = [
      ...(record?.querySelectorAll?.('.royal-admin-detail .royal-admin-field') || [])
    ];
    const idField = fields.find(node =>
      /telegram\s*id/i.test(clean(node.querySelector('span:first-child')?.textContent))
    );
    return telegramId(idField?.querySelector('span:last-child')?.textContent);
  }

  function ensureAvatarDom(record) {
    const id = recordId(record);
    if (!id) return false;

    const summary = record.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!summary || !main) return false;

    // This is the critical contract required by mediaV0517TelegramIdForImage().
    record.dataset.telegramId = id;

    let wrap = summary.querySelector('.royal-admin-participant-avatar');
    if (!wrap) {
      const title = clean(main.querySelector('strong')?.textContent) || 'Участник';
      wrap = document.createElement('div');
      wrap.className = 'person-avatar-wrap small royal-admin-participant-avatar fallback';
      wrap.setAttribute('aria-hidden', 'true');
      const fallback = document.createElement('span');
      fallback.textContent = firstLetter(title);
      wrap.appendChild(fallback);
      summary.insertBefore(wrap, main);
    }

    // Putting the ID on the nearest holder too makes the contract resilient if
    // the card markup changes later.
    wrap.dataset.telegramId = id;

    let img = wrap.querySelector('img.person-avatar');
    if (!img) {
      img = document.createElement('img');
      img.className = 'person-avatar';
      img.alt = '';
      img.addEventListener('load', () => {
        if (!img.src) return;
        wrap.classList.remove('fallback');
        record.dataset.adminAvatarLoaded = '1';
      });
      img.addEventListener('error', () => {
        wrap.classList.add('fallback');
      });
      wrap.appendChild(img);
    }

    // If an older broken admin pass left an error state, replace the image so
    // media-v0517's WeakSet/loaded-state cannot suppress a fresh canonical load.
    if (img.dataset.avatarLoaded === 'error') {
      const fresh = img.cloneNode(false);
      fresh.removeAttribute('src');
      delete fresh.dataset.avatarLoaded;
      delete fresh.dataset.avatarRetries;
      fresh.addEventListener('load', () => {
        if (!fresh.src) return;
        wrap.classList.remove('fallback');
        record.dataset.adminAvatarLoaded = '1';
      });
      fresh.addEventListener('error', () => wrap.classList.add('fallback'));
      img.replaceWith(fresh);
    }

    record.dataset.adminAvatarEnhanced = '1';
    return true;
  }

  function refresh() {
    scheduled = 0;
    if (decorating) return false;
    const screen = document.querySelector('.royal-admin-screen');
    if (!screen) return false;

    decorating = true;
    try {
      const records = [...screen.querySelectorAll('[data-admin-participant="1"]')];
      let prepared = 0;
      records.forEach(record => {
        if (ensureAvatarDom(record)) prepared += 1;
      });

      if (prepared && typeof setupAvatarLoading === 'function') {
        setupAvatarLoading(screen);
      }
      return prepared > 0;
    } catch (error) {
      console.warn('Admin avatar bridge failed:', error?.message || error);
      return false;
    } finally {
      decorating = false;
    }
  }

  function schedule(delay = 0) {
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(refresh, delay);
  }

  const observer = new MutationObserver(mutations => {
    if (decorating) return;
    const relevant = mutations.some(mutation =>
      [...mutation.addedNodes].some(node => {
        if (!(node instanceof Element)) return false;
        return node.matches?.('.royal-admin-screen,[data-admin-participant="1"]') ||
          !!node.querySelector?.('.royal-admin-screen,[data-admin-participant="1"]');
      })
    );
    if (relevant) schedule(0);
  });
  observer.observe(document.body, { childList:true, subtree:true });

  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-admin-tab],[data-admin-refresh],[data-admin-participant-filter]')) {
      schedule(0);
    }
  }, true);

  schedule(0);
  setTimeout(refresh, 300);
  setTimeout(refresh, 1000);

  window.RoyalAdminAvatarRefreshV0600 = {
    version: VERSION,
    refresh,
    schedule
  };
})();

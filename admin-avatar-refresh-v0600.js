/* Royal CRM Mini App — v0.6 admin avatar bridge
 *
 * Admin participant cards use EXACTLY the same persistent avatar cache as the
 * normal participant list:
 *   IndexedDB: royal-crm-media-cache
 *   key: avatar:<avatarFileId|tg-id>
 *   memory -> disk -> network fallback
 *   same IntersectionObserver/concurrency/retry path.
 *
 * No second admin avatar cache exists.
 */
(() => {
  const VERSION = '0.6.0-admin-avatar-bridge.3';
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

  function attachImageEvents(img, wrap, record) {
    if (!img || img.dataset.adminAvatarEvents === '1') return;
    img.dataset.adminAvatarEvents = '1';
    img.addEventListener('load', () => {
      if (!img.src) return;
      wrap.classList.remove('fallback');
      record.dataset.adminAvatarLoaded = '1';
    });
    img.addEventListener('error', () => {
      wrap.classList.add('fallback');
    });
  }

  function ensureAvatarDom(record) {
    const id = recordId(record);
    if (!id) return false;

    const summary = record.querySelector('summary');
    const main = summary?.querySelector('.royal-admin-summary-main');
    if (!summary || !main) return false;

    // Canonical media contract required by the normal persistent loader.
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
    wrap.dataset.telegramId = id;

    let img = wrap.querySelector('img.person-avatar');
    if (!img) {
      img = document.createElement('img');
      img.className = 'person-avatar';
      img.alt = '';
      wrap.appendChild(img);
    }
    attachImageEvents(img, wrap, record);

    // Old failed DOM nodes may be remembered by queue/observer WeakSets.
    // Replace only failed nodes, preserving successfully cached images.
    if (img.dataset.avatarLoaded === 'error') {
      const fresh = img.cloneNode(false);
      fresh.removeAttribute('src');
      delete fresh.dataset.avatarLoaded;
      delete fresh.dataset.avatarRetries;
      delete fresh.dataset.adminAvatarEvents;
      attachImageEvents(fresh, wrap, record);
      img.replaceWith(fresh);
    }

    record.dataset.adminAvatarEnhanced = '1';
    return true;
  }

  function setupWithCanonicalPersistentCache(screen) {
    // Hard-bind to the exact cache used by normal mode. This avoids any load-
    // order ambiguity with the older session-only setupAvatarLoading symbol.
    const persistent = window.RoyalPersistentMediaCache;
    if (persistent && typeof persistent.setup === 'function') {
      persistent.setup(screen);
      return 'persistent';
    }

    // Safe fallback only while the persistent module is still initializing.
    if (typeof setupAvatarLoading === 'function') {
      setupAvatarLoading(screen);
      return 'global';
    }
    return 'missing';
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

      if (prepared) {
        const mode = setupWithCanonicalPersistentCache(screen);
        screen.dataset.adminAvatarCache = mode;
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

  // Persistent cache is loaded synchronously before admin-v0600 in app-v0600,
  // but keep bounded late passes for WebView script/startup races.
  schedule(0);
  setTimeout(refresh, 300);
  setTimeout(refresh, 1000);

  window.RoyalAdminAvatarRefreshV0600 = {
    version: VERSION,
    refresh,
    schedule,
    get cacheVersion() {
      return window.RoyalPersistentMediaCache?.version || '';
    }
  };
})();

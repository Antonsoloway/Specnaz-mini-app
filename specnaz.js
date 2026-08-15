/* Royal CRM Mini App — Specnaz v0.5.9 */
(() => {
  const UI_VERSION = '0.5.9';
  let specnazView = 'menu';

  function participants() {
    return Array.isArray(snapshotState?.participants) ? snapshotState.participants : [];
  }

  function historyData() {
    return snapshotState?.specnazHistory || null;
  }

  function heroRows() {
    return participants()
      .filter(p => Number(p?.specnazTrips || 0) > 0)
      .sort((a, b) => Number(b?.specnazTrips || 0) - Number(a?.specnazTrips || 0) || displayName(a).localeCompare(displayName(b), 'ru', { sensitivity: 'base' }));
  }

  function avatarHtml(p, cls) {
    const name = displayName(p);
    const fileId = String(p?.avatarFileId || '').trim();
    return fileId
      ? `<div class="${cls}"><span>${esc(firstLetter(name))}</span><img alt="" data-avatar-file="${esc(fileId)}"></div>`
      : `<div class="${cls}"><span>${esc(firstLetter(name))}</span></div>`;
  }

  function usernameButtonHtml(p) {
    const clean = normalizeUsername(p?.username || '');
    if (!clean) return '';
    return `<button type="button" class="hero-user" data-user-menu="${esc(clean)}" data-user-name="${esc(displayName(p))}">@${esc(clean)}</button>`;
  }

  function medal(place) {
    if (place === 1) return '🥇';
    if (place === 2) return '🥈';
    if (place === 3) return '🥉';
    return String(place);
  }

  function renderSpecnazMenu() {
    specnazView = 'menu';
    setActiveNav('help');
    const heroes = heroRows();
    const history = historyData();
    const sections = Array.isArray(history?.sections) ? history.sections : [];
    const rows = sections.reduce((sum, s) => sum + (Array.isArray(s?.rows) ? s.rows.length : 0), 0);
    const panel = document.getElementById('panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="specnaz-menu-head"><h2>🚨 Спецназ</h2><div class="muted">Герои и история помощи командам</div></div>
      <div class="specnaz-menu-grid">
        <button type="button" class="specnaz-menu-card" data-specnaz-view="heroes">
          <span class="specnaz-menu-icon">🏆</span><span class="specnaz-menu-main"><b>Герои спецназа</b><small>${heroes.length ? `${heroes.length} участников в рейтинге` : 'Рейтинг участников'}</small></span><span class="specnaz-menu-arrow">›</span>
        </button>
        <button type="button" class="specnaz-menu-card" data-specnaz-view="history">
          <span class="specnaz-menu-icon">📜</span><span class="specnaz-menu-main"><b>История спецназа</b><small>${rows ? `${rows} записей · ${sections.length} периодов` : 'История походов по периодам'}</small></span><span class="specnaz-menu-arrow">›</span>
        </button>
      </div>`;
  }

  function renderHeroes() {
    specnazView = 'heroes';
    setActiveNav('help');
    const list = heroRows();
    const panel = document.getElementById('panel');
    if (!panel) return;
    const cards = list.map((p, index) => {
      const place = index + 1;
      const trips = Number(p?.specnazTrips || 0);
      const rank = String(p?.specnazRank || 'Новичок');
      return `<article class="hero-card">
        <div class="hero-place${place <= 3 ? ' medal' : ''}">${medal(place)}</div>
        ${avatarHtml(p, 'hero-avatar')}
        <div class="hero-main"><strong>${esc(displayName(p))}</strong>${usernameButtonHtml(p)}<div class="hero-rank">${esc(rank)}</div></div>
        <div class="hero-score"><b>${trips}</b><small>ПОХОДОВ</small></div>
      </article>`;
    }).join('');
    panel.innerHTML = `<button type="button" class="specnaz-back" data-specnaz-view="menu">‹ Спецназ</button><div class="specnaz-title-row"><h2>🏆 Герои спецназа</h2><span class="muted">${list.length}</span></div><div class="hero-list">${cards || '<div class="specnaz-empty">Пока нет участников с походами в спецназ.</div>'}</div>`;
    try { setupAvatarLoading(panel); } catch (_) {}
  }

  function historyParticipant(row) {
    const raw = String(row?.name || '');
    const userMatch = raw.match(/@([A-Za-z0-9_]{3,})/);
    if (userMatch) {
      const wanted = normalizeUsername(userMatch[1]).toLowerCase();
      const found = participants().find(p => normalizeUsername(p?.username || '').toLowerCase() === wanted);
      if (found) return found;
    }
    const first = raw.split(',')[0].trim().toLocaleLowerCase('ru-RU');
    if (!first) return null;
    const matches = participants().filter(p => displayName(p).trim().toLocaleLowerCase('ru-RU') === first);
    return matches.length === 1 ? matches[0] : null;
  }

  function historyName(row) {
    const raw = String(row?.name || '').trim();
    return raw ? raw.split(',')[0].trim() : 'Без имени';
  }

  function safeHistoryUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    return /^(https?:\/\/|tg:\/\/)/i.test(url) ? url : '';
  }

  function historyMessageHtml(row) {
    const plain = String(row?.message || '');
    const rich = Array.isArray(row?.messageRich) ? row.messageRich : [];
    if (!rich.length) return esc(plain);
    return rich.map(segment => {
      const text = String(segment?.text || '');
      const url = safeHistoryUrl(segment?.url);
      if (!url) return esc(text);
      return `<a class="history-inline-link" href="${esc(url)}" data-history-link="${esc(url)}">${esc(text)}</a>`;
    }).join('');
  }

  function historyRowHtml(row) {
    const p = historyParticipant(row);
    const name = historyName(row);
    const avatar = p ? avatarHtml(p, 'history-avatar') : `<div class="history-avatar"><span>${esc(firstLetter(name))}</span></div>`;
    const before = String(row?.before ?? '');
    const after = String(row?.after ?? '');
    const added = String(row?.added ?? '');
    return `<article class="history-row">
      <div class="history-row-head">${avatar}<div class="history-person"><strong>${esc(name)}</strong><div class="history-date">${esc(row?.date || '')}</div></div><span class="history-rank">${esc(row?.rank || '')}</span></div>
      ${row?.team ? `<div class="history-team">${esc(row.team)}</div>` : ''}
      <div class="history-scoreline"><span>Было <b>${esc(before)}</b></span><span>→</span><span>Стало <b>${esc(after)}</b></span>${added ? `<span class="history-added">+${esc(added)}</span>` : ''}</div>
      ${row?.message ? `<div class="history-message">${historyMessageHtml(row)}</div>` : ''}
    </article>`;
  }

  function renderHistory() {
    specnazView = 'history';
    setActiveNav('help');
    const data = historyData();
    const sections = Array.isArray(data?.sections) ? data.sections : [];
    const panel = document.getElementById('panel');
    if (!panel) return;
    if (!snapshotState) {
      panel.innerHTML = `<button type="button" class="specnaz-back" data-specnaz-view="menu">‹ Спецназ</button><h2>📜 История спецназа</h2><div class="specnaz-loading">Загружаем историю…</div>`;
      return;
    }
    const content = sections.map((section, index) => {
      const rows = Array.isArray(section?.rows) ? section.rows : [];
      const isLast = index === sections.length - 1;
      return `<details class="history-section"${isLast ? ' open' : ''}><summary><span class="history-section-title">${esc(section?.title || 'Период')}</span><span class="history-section-count">${rows.length}</span><span class="history-chevron">⌄</span></summary><div class="history-rows">${rows.map(historyRowHtml).join('') || '<div class="specnaz-empty">Нет записей</div>'}</div></details>`;
    }).join('');
    panel.innerHTML = `<button type="button" class="specnaz-back" data-specnaz-view="menu">‹ Спецназ</button><div class="specnaz-title-row"><h2>📜 История спецназа</h2><span class="muted">${sections.length} периодов</span></div><div class="history-list">${content || '<div class="specnaz-empty">История ещё не синхронизирована.</div>'}</div>`;
    try { setupAvatarLoading(panel); } catch (_) {}
  }

  function renderCurrentSpecnazView() {
    if (specnazView === 'heroes') return renderHeroes();
    if (specnazView === 'history') return renderHistory();
    return renderSpecnazMenu();
  }

  const previousRenderPage = renderPage;
  renderPage = function(page) {
    previousRenderPage(page);
    if (page === 'help') renderSpecnazMenu();
  };

  const previousLoadSnapshot = loadSnapshot;
  loadSnapshot = async function() {
    const result = await previousLoadSnapshot();
    if (activePage === 'help') renderCurrentSpecnazView();
    return result;
  };

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-history-link]');
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      const url = safeHistoryUrl(link.dataset.historyLink);
      if (!url) return;
      try {
        if (/^https:\/\/t\.me\//i.test(url) && tg?.openTelegramLink) tg.openTelegramLink(url);
        else if (tg?.openLink) tg.openLink(url);
        else window.open(url, '_blank', 'noopener');
      } catch (_) { window.location.href = url; }
      return;
    }

    const button = event.target.closest('[data-specnaz-view]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const view = button.dataset.specnazView;
    if (view === 'heroes') renderHeroes();
    else if (view === 'history') renderHistory();
    else renderSpecnazMenu();
  }, true);

  const badge = document.getElementById('versionBadge');
  if (badge) badge.textContent = `v${UI_VERSION}`;
})();
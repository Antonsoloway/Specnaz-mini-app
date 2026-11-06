(() => {
  'use strict';
  const VERSION = '20261106-admin-battle-base1';
  const PAGE_SIZE = 20;
  let active = false;
  let searchTimer = 0;
  let requestSequence = 0;
  let results = [];
  let total = 0;
  let hasMore = false;
  let loading = false;
  let lastMeta = null;
  let lastError = '';

  const panel = () => document.getElementById('panel');
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const formatNumber = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('ru-RU').format(Number(value)) : '—';
  function formatDate(value) {
    if (!value) return 'Дата публикации неизвестна';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Дата публикации неизвестна';
  }
  function telegramLink(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || !['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me'].includes(url.hostname)) return '';
      return url.toString();
    } catch (_) { return ''; }
  }
  function renderShell() {
    const target = panel();
    if (!target) return;
    target.innerHTML =
      '<div class="battle-base-screen">' +
        '<button type="button" class="back-link battle-base-back" data-page="home">‹ На главную</button>' +
        '<div class="battle-base-heading"><div><h2>База битв</h2><p>Архив RM/RK · автоматическая синхронизация · поиск по кэшированному индексу</p></div>' +
          '<button type="button" class="battle-base-refresh" data-battle-action="refresh">↻ Обновить базу</button></div>' +
        '<div class="battle-base-filters">' +
          '<label class="battle-base-query"><span>Поиск команды или соперника</span><input type="search" data-battle-query placeholder="Например: JoyBand или AVENGERS TEAM" autocomplete="off" enterkeyhint="search"></label>' +
          '<label><span>Игра</span><select data-battle-game><option value="">Все игры</option><option value="RM">Royal Match</option><option value="RK">Royal Kingdom</option></select></label>' +
          '<label><span>Событие</span><select data-battle-event><option value="">Битвы и турниры</option><option value="battle">Битва</option><option value="tournament">Турнир</option></select></label>' +
          '<label><span>Результат</span><select data-battle-stage><option value="">Все результаты</option><option value="final">Завершённые</option><option value="intermediate">Промежуточные</option></select></label>' +
          '<label><span>Распознавание</span><select data-battle-status><option value="parsed">Распознаны</option><option value="review">Требуют проверки</option><option value="all">Все записи</option></select></label>' +
          '<label><span>Публикация с</span><input type="date" data-battle-from></label>' +
          '<label><span>Публикация по</span><input type="date" data-battle-to></label>' +
          '<label><span>Очки команды от</span><input type="number" min="0" max="1000000000" step="1" inputmode="numeric" data-battle-score placeholder="Любое количество"></label>' +
        '</div>' +
        '<div class="battle-base-status" data-battle-statusline role="status" aria-live="polite">Загружаем индекс…</div>' +
        '<div class="battle-base-results" data-battle-results></div>' +
        '<button type="button" class="battle-base-more" data-battle-action="more" hidden>Показать ещё</button>' +
      '</div>';
  }
  function collectFilters() {
    const root = panel();
    const params = new URLSearchParams();
    const values = {
      q: root?.querySelector('[data-battle-query]')?.value?.trim() || '',
      game: root?.querySelector('[data-battle-game]')?.value || '',
      eventType: root?.querySelector('[data-battle-event]')?.value || '',
      stage: root?.querySelector('[data-battle-stage]')?.value || '',
      status: root?.querySelector('[data-battle-status]')?.value || 'parsed',
      resultClass: root?.querySelector('[data-battle-class]')?.value || 'all',
      from: root?.querySelector('[data-battle-from]')?.value || '',
      to: root?.querySelector('[data-battle-to]')?.value || '',
      scoreMin: root?.querySelector('[data-battle-score]')?.value || ''
    };
    Object.entries(values).forEach(([key, value]) => { if (value !== '') params.set(key, value); });
    params.set('limit', String(PAGE_SIZE));
    return params;
  }
  function teamRow(team) {
    const role = team?.role === 'community' ? 'Команда ЧП' : team?.role === 'opponent' ? 'Соперник' : 'Строка';
    const rank = team?.rank == null ? '—' : String(team.rank);
    const score = team?.score == null ? '—' : formatNumber(team.score);
    return '<div class="battle-base-team-row ' + (team?.role === 'community' ? 'is-community' : '') + '">' +
      '<span class="battle-base-rank">' + esc(rank) + '</span>' +
      '<span class="battle-base-emblem">' + esc(team?.avatarEmoji || '•') + '</span>' +
      '<span class="battle-base-team-name"><strong>' + esc(team?.name || 'Название не распознано') + '</strong><small>' + role + '</small></span>' +
      '<span class="battle-base-score">' + esc(score) + '</span>' +
    '</div>';
  }
  function renderCard(item) {
    const game = item.game === 'RM' ? 'Royal Match' : item.game === 'RK' ? 'Royal Kingdom' : 'Игра не определена';
    const event = item.eventType === 'battle' ? 'Битва' : item.eventType === 'tournament' ? 'Турнир' : 'Тип не определён';
    const stage = item.stage === 'final' ? 'Завершённая' : item.stage === 'intermediate' ? 'Промежуточная' : 'Этап не определён';
    const community = item.communityTeam;
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const source = sources[0] || null;
    const link = telegramLink(source?.link);
    const teamRows = (Array.isArray(item.visibleTeams) ? item.visibleTeams : []).map(teamRow).join('');
    const statusBadge = item.status === 'review' ? '<span class="battle-base-tag is-warning">Требует проверки</span>' : '';
    const epicBadge = item.resultClass === 'epic' ? '<span class="battle-base-tag is-epic">Эпичный архив</span>' : '';
    const visibilityBadge = item.fullyVisible ? '' : '<span class="battle-base-tag">Скрин обрезан</span>';
    const eventDate = item.eventDateLabel ? '<span>Дата события из архива: ' + esc(item.eventDateLabel) + '</span>' : '';
    const caption = source?.caption ? '<p class="battle-base-caption">' + esc(source.caption) + '</p>' : '';
    const author = source?.author || source?.username || '';
    const sourceLine = source ? '<div class="battle-base-source"><div><small>' + (author ? 'Опубликовал: ' + esc(author) : 'Источник Telegram') + '</small>' +
      caption + '<small>' + esc(source.topic || 'База спецназа') + (sources.length > 1 ? ' · ещё ' + (sources.length - 1) + ' источн.' : '') + '</small></div>' +
      (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Открыть сообщение ↗</a>' : '') + '</div>' : '';
    const communityLine = community
      ? '<div class="battle-base-community"><small>Команда ЧП на этом скриншоте</small><strong>' + esc(community.name || 'Название не распознано') + '</strong>' +
        '<span>' + (community.rank == null ? 'Место не распознано' : esc(community.rank) + ' место') + ' · ' +
        (community.score == null ? 'Очки не распознаны' : esc(formatNumber(community.score)) + ' очков') + '</span></div>'
      : '<div class="battle-base-community is-empty"><small>Зелёная строка команды ЧП не определена</small></div>';
    const issues = item.status === 'review' && Array.isArray(item.issues) && item.issues.length
      ? '<small class="battle-base-issues">Проверка: ' + esc(item.issues.join(', ')) + '</small>' : '';
    return '<article class="battle-base-card">' +
      '<div class="battle-base-card-head"><div class="battle-base-tags"><span class="battle-base-tag is-game">' + game + '</span>' +
        '<span class="battle-base-tag">' + event + '</span><span class="battle-base-tag">' + stage + '</span>' + statusBadge + epicBadge + visibilityBadge + '</div>' +
        '<time>' + esc(formatDate(item.firstPublication)) + '</time></div>' +
      communityLine +
      '<div class="battle-base-team-list">' + (teamRows || '<div class="empty-state">Строки команд не распознаны</div>') + '</div>' +
      (item.completionText ? '<small class="battle-base-completion">' + esc(item.completionText) + '</small>' : '') +
      (eventDate ? '<small class="battle-base-event-date">' + eventDate + '</small>' : '') +
      issues + sourceLine +
    '</article>';
  }
  function updateStatus() {
    const root = panel();
    const status = root?.querySelector('[data-battle-statusline]');
    const refresh = root?.querySelector('[data-battle-action="refresh"]');
    const more = root?.querySelector('[data-battle-action="more"]');
    if (status) {
      if (loading) status.textContent = 'Ищем в базе битв…';
      else if (lastError) status.textContent = lastError;
      else {
        const updated = lastMeta?.indexGeneratedAt ? formatDate(lastMeta.indexGeneratedAt) : 'неизвестно';
        status.textContent = 'Найдено: ' + formatNumber(total) + ' · Индекс обновлён: ' + updated +
          (lastMeta?.indexStale ? ' · показан сохранённый снимок' : '');
      }
    }
    if (refresh) {
      refresh.disabled = loading;
      refresh.textContent = loading ? 'Загружаем…' : '↻ Обновить базу';
    }
    if (more) {
      more.hidden = !hasMore || loading;
      more.disabled = loading;
    }
  }
  function renderResults() {
    const target = panel()?.querySelector('[data-battle-results]');
    if (!target) return;
    if (lastError) {
      target.innerHTML = '<div class="battle-base-empty"><strong>Не удалось загрузить базу</strong><p>' + esc(lastError) + '</p>' +
        '<button type="button" data-battle-action="refresh">Повторить</button></div>';
      return;
    }
    if (!results.length) {
      target.innerHTML = '<div class="battle-base-empty">По заданным условиям битвы не найдены.</div>';
      return;
    }
    target.innerHTML = results.map(renderCard).join('');
  }
  async function load(options = {}) {
    if (!active) return;
    const reset = options.reset !== false;
    const force = options.force === true;
    if (!reset && loading) return;
    const sequence = ++requestSequence;
    if (reset) {
      results = [];
      total = 0;
      hasMore = false;
      lastError = '';
      renderResults();
    }
    loading = true;
    updateStatus();
    const params = collectFilters();
    params.set('offset', String(reset ? 0 : results.length));
    if (force) params.set('refresh', '1');
    try {
      const app = window.RoyalAppV0600;
      if (typeof app?.requestAdminBattleBase !== 'function') throw new Error('Сервис базы битв ещё не загружен.');
      const data = await app.requestAdminBattleBase(params);
      if (sequence !== requestSequence || !active) return;
      results = reset ? (data.results || []) : results.concat(data.results || []);
      total = Number(data.pagination?.total || 0);
      hasMore = data.pagination?.hasMore === true;
      lastMeta = data;
      lastError = '';
    } catch (error) {
      if (sequence !== requestSequence || !active) return;
      lastError = String(error?.message || 'База битв временно недоступна.');
      if (error?.code === 'ADMIN_REQUIRED') lastError = 'Раздел доступен только администраторам.';
    } finally {
      if (sequence === requestSequence && active) {
        loading = false;
        renderResults();
        updateStatus();
      }
    }
  }
  function scheduleSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load({reset:true}), 320);
  }
  document.addEventListener('input', event => {
    if (!active || !event.target?.matches?.('[data-battle-query],[data-battle-score]')) return;
    scheduleSearch();
  });
  document.addEventListener('change', event => {
    if (!active || !event.target?.matches?.('[data-battle-game],[data-battle-event],[data-battle-stage],[data-battle-status],[data-battle-class],[data-battle-from],[data-battle-to]')) return;
    load({reset:true});
  });
  document.addEventListener('click', event => {
    const page = event.target?.closest?.('button[data-page]');
    if (page && page.dataset.page !== 'battle-base') active = false;
    const action = event.target?.closest?.('[data-battle-action]')?.dataset?.battleAction;
    if (!action || !active) return;
    event.preventDefault();
    if (action === 'refresh') load({reset:true,force:true});
    if (action === 'more') load({reset:false});
  });
  function render() {
    const app = window.RoyalAppV0600;
    if (typeof app?.isChatAdmin !== 'function' || app.isChatAdmin() !== true) {
      active = false;
      const target = panel();
      if (target) target.innerHTML = '<h2>Доступ закрыт</h2><p>Раздел «База битв» доступен только администраторам чата.</p>';
      return;
    }
    active = true;
    requestSequence += 1;
    results = [];
    total = 0;
    hasMore = false;
    lastMeta = null;
    lastError = '';
    loading = false;
    renderShell();
    load({reset:true});
  }
  window.RoyalBattleBaseV0615 = {version:VERSION,render};
})();

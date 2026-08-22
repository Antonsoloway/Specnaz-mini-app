/* Royal CRM Mini App — human-readable admin journal v0.6.0 */
(function initRoyalAdminJournal(globalRoot, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!globalRoot) return;
  globalRoot.RoyalAdminJournalV0600 = api;
  if (globalRoot.document) api.install(globalRoot.document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRoyalAdminJournal() {
  'use strict';

  const VERSION = '0.6.0-journal-ui.1';
  const PAGE_SIZE = 20;
  const installedDocuments = typeof WeakSet === 'function' ? new WeakSet() : new Set();

  const FIELD_LABELS = Object.freeze({
    name:'Имя', telegramName:'Имя Telegram', username:'Имя пользователя',
    memberships:'Игровые слоты', game:'Игра', team:'Команда', role:'Роль',
    nickname:'Игровой ник', leader:'Лидер', photo:'Фото команды', photoUrl:'Фото команды',
    chatState:'Состояние чата', status:'Статус', specnaz:'Походы спецназа',
    date:'Дата', screens:'Скрины', activityBase:'Активность в базе',
    activityOutside:'Активность вне базы', players:'Количество игроков',
    specnazTrips:'Походы спецназа', sort:'Порядок', average:'Среднее',
    deleted:'Запись', record:'Запись', cascadeCount:'Связанные участники'
  });

  const PARTICIPANT_FIELDS = Object.freeze([
    'name','telegramName','username','memberships','specnaz','date','screens',
    'activityBase','activityOutside','chatState','status'
  ]);
  const TEAM_FIELDS = Object.freeze([
    'game','name','leader','photoUrl','status','players','specnazTrips','screens',
    'activityBase','activityOutside','average'
  ]);
  const MEMBERSHIP_FIELDS = Object.freeze(['game','team','role','nickname']);

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(value, key) {
    return isRecord(value) && Object.prototype.hasOwnProperty.call(value, key);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizedSearch(value) {
    return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  }

  function redactPublicText(value, fallback = '') {
    let text = clean(value).slice(0, 320);
    if (!text) return fallback;
    text = text
      .replace(/https?:\/\/\S+/giu, '[ссылка скрыта]')
      .replace(/data:[^\s]+/giu, '[данные скрыты]')
      .replace(/\b(?:bearer|token|authorization)\s*[:=]?\s*\S+/giu, '[секрет скрыт]');
    return text || fallback;
  }

  function looksLikeRawIdentity(value) {
    return /^\d{7,}$/.test(clean(value));
  }

  function canonicalEntity(value) {
    const key = normalizedSearch(value);
    if (key.includes('participant') || key.includes('участ')) return 'participant';
    if (key.includes('team') || key.includes('команд')) return 'team';
    return 'other';
  }

  function canonicalSource(value) {
    const key = normalizedSearch(value).replace(/[\s_-]+/g, '');
    if (/miniapp|adminui|webapp/.test(key)) return 'miniapp';
    if (/sheet|googlesheet|manual|таблиц/.test(key)) return 'sheet';
    if (/telegrambot|^bot$|бот/.test(key)) return 'bot';
    if (/system|appsscript|trigger|cascade|repair|систем/.test(key)) return 'system';
    return 'other';
  }

  function sourceFallback(key) {
    return ({
      miniapp:'Mini App', sheet:'Google Sheets', bot:'Telegram-бот',
      system:'Система', other:'Другой источник'
    })[key] || 'Другой источник';
  }

  function normalizeSource(row) {
    const nested = isRecord(row.source) ? row.source : {};
    const rawType = nested.type || nested.channel || row.sourceType || row.channel || 'miniapp';
    const key = canonicalSource(rawType);
    const label = redactPublicText(nested.label || sourceFallback(key), sourceFallback(key));
    return {
      key,
      type:clean(nested.type || rawType),
      channel:redactPublicText(nested.channel || row.channel || '', ''),
      label
    };
  }

  function normalizeActor(row, source) {
    const nested = isRecord(row.actor) ? row.actor : {};
    const optimistic = normalizedSearch(row.adminUsername).includes('snapshot обновляется');
    const username = clean(nested.username || (!optimistic ? row.adminUsername : ''));
    let label = redactPublicText(
      nested.displayName || nested.label || (username ? (username.startsWith('@') ? username : '@' + username) : ''),
      ''
    );
    if (!label || looksLikeRawIdentity(label)) {
      if (source.key === 'sheet') label = 'Редактор Google Sheets';
      else if (source.key === 'bot') label = 'Telegram-бот';
      else if (source.key === 'system') label = 'Система';
      else label = 'Администратор';
    }
    return {
      label,
      type:clean(nested.type || (source.key === 'system' ? 'system' : 'admin')),
      isSystem:source.key === 'system' || normalizedSearch(label) === 'система'
    };
  }

  function teamNameFromKey(value) {
    const text = clean(value);
    if (!text) return '';
    const pieces = text.split(/\s*::\s*/);
    return pieces.length > 1 ? clean(pieces.slice(1).join(' :: ')) : text;
  }

  function safeTargetLabel(value, fallback) {
    const label = redactPublicText(value, '');
    if (!label || looksLikeRawIdentity(label)) return fallback;
    return label;
  }

  function normalizeTarget(row) {
    const nested = isRecord(row.target) ? row.target : {};
    const before = isRecord(row.before) ? row.before : {};
    const after = isRecord(row.after) ? row.after : {};
    const entity = canonicalEntity(nested.entityType || row.entityType);
    const generic = entity === 'participant' ? 'Участник' : (entity === 'team' ? 'Команда' : 'Запись');
    let candidate = nested.label;
    if (!candidate && entity === 'participant') {
      candidate = after.name || before.name || after.telegramName || before.telegramName || '';
    }
    if (!candidate && entity === 'team') {
      candidate = after.name || before.name || teamNameFromKey(nested.entityKey || row.entityKey);
    }
    const label = safeTargetLabel(candidate, generic);
    return {
      entity,
      label,
      generic:label === generic,
      game:redactPublicText(nested.game || after.game || before.game || '', '')
    };
  }

  function normalizeAction(row, entity) {
    const op = clean((isRecord(row.action) ? row.action.type : row.action) || row.op);
    const key = normalizedSearch(op).replace(/[\s_-]+/g, '');
    let mode = 'update';
    if (/^create|add|insert|нов|добав/.test(key)) mode = 'create';
    else if (/^delete|remove|удал/.test(key)) mode = 'delete';
    else if (/clear|очист/.test(key)) mode = 'clear';
    const noun = entity === 'participant' ? 'участника' : (entity === 'team' ? 'команду' : 'запись');
    const label = ({
      create:entity === 'participant' ? 'Добавление участника' : (entity === 'team' ? 'Добавление команды' : 'Добавление записи'),
      delete:entity === 'participant' ? 'Удаление участника' : (entity === 'team' ? 'Удаление команды' : 'Удаление записи'),
      clear:'Очистка данных',
      update:entity === 'participant' ? 'Изменение участника' : (entity === 'team' ? 'Изменение команды' : 'Изменение записи')
    })[mode];
    return { op, mode, noun, label };
  }

  function formatTimestamp(row) {
    const raw = clean(row.occurredAtIso || row.at);
    if (!raw) return 'Время не указано';
    const isoCandidate = clean(row.occurredAtIso) || (/^\d{4}-\d\d-\d\dT/.test(raw) ? raw : '');
    if (isoCandidate) {
      const date = new Date(isoCandidate);
      if (!Number.isNaN(date.getTime())) {
        try {
          return new Intl.DateTimeFormat('ru-RU', {
            timeZone:'Europe/Moscow', day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
          }).format(date).replace(',', '') + ' МСК';
        } catch (_) {}
      }
    }
    const timezone = clean(row.timezone);
    const suffix = timezone === 'Europe/Moscow' ? ' МСК' : '';
    return redactPublicText(raw, 'Время не указано') + suffix;
  }

  function canonicalValue(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.map(canonicalValue).join('|');
    if (isRecord(value)) {
      return Object.keys(value).sort().map(key => key + ':' + canonicalValue(value[key])).join('|');
    }
    return String(value);
  }

  function valuesEqual(left, right) {
    return canonicalValue(left) === canonicalValue(right);
  }

  function membershipMap(value) {
    const result = new Map();
    (Array.isArray(value) ? value : []).forEach((membership, index) => {
      if (!isRecord(membership)) return;
      const slot = Number(membership.slot || index + 1);
      if (slot >= 1 && slot <= 5) result.set(slot, membership);
    });
    return result;
  }

  function membershipText(value) {
    if (!isRecord(value)) return 'Пусто';
    const parts = [];
    if (clean(value.game)) parts.push(clean(value.game));
    if (clean(value.team)) parts.push(clean(value.team));
    if (clean(value.role)) parts.push(clean(value.role));
    if (clean(value.nickname)) parts.push('ник: ' + clean(value.nickname));
    return parts.length ? redactPublicText(parts.join(' · '), 'Пусто') : 'Пусто';
  }

  function deriveMembershipDiff(before, after) {
    const oldSlots = membershipMap(before);
    const newSlots = membershipMap(after);
    const changes = [];
    for (let slot = 1; slot <= 5; slot += 1) {
      const oldValue = oldSlots.get(slot);
      const newValue = newSlots.get(slot);
      if (!oldValue && !newValue) continue;
      if (!oldValue || !newValue) {
        changes.push({
          kind:oldValue ? 'cleared' : 'added', field:'memberships', slot,
          label:'Слот ' + slot, before:membershipText(oldValue), after:membershipText(newValue)
        });
        continue;
      }
      MEMBERSHIP_FIELDS.forEach(field => {
        if (valuesEqual(oldValue[field], newValue[field])) return;
        changes.push({
          kind:'changed', field, slot,
          label:'Слот ' + slot + ' · ' + FIELD_LABELS[field],
          before:oldValue[field], after:newValue[field]
        });
      });
    }
    return changes;
  }

  function isSensitiveField(value) {
    const key = normalizedSearch(value).replace(/[\s_.\[\]-]+/g, '');
    return /telegramid|admintelegramid|token|authorization|endpoint|base64|signedurl/.test(key);
  }

  function fieldLabel(field, slot) {
    const base = FIELD_LABELS[clean(field)] || redactPublicText(field, 'Поле');
    return slot ? 'Слот ' + slot + ' · ' + base : base;
  }

  function normalizeV2Diff(value) {
    if (!Array.isArray(value)) return [];
    return value.reduce((result, item) => {
      if (!isRecord(item)) return result;
      const field = clean(item.field || item.path);
      if (isSensitiveField(field)) return result;
      const slot = Number(item.slot || 0);
      const explicitLabel = redactPublicText(item.label, '');
      let before = item.before;
      let after = item.after;
      if (field === 'photo' || field === 'photoUrl') {
        const hadPhoto = !!clean(isRecord(before) ? (before.label || before.summary || '') : before);
        const hasPhoto = !!clean(isRecord(after) ? (after.label || after.summary || '') : after);
        before = hadPhoto ? (hasPhoto ? 'Предыдущее фото' : 'Есть фото') : 'Нет фото';
        after = hasPhoto ? (hadPhoto ? 'Новое фото' : 'Добавлено') : 'Удалено';
      }
      result.push({
        kind:clean(item.kind || 'changed'), field,
        slot:slot >= 1 && slot <= 5 ? slot : 0,
        label:explicitLabel || fieldLabel(field, slot),
        before, after
      });
      return result;
    }, []);
  }

  function deriveLegacyDiff(row, target) {
    const before = isRecord(row.before) ? row.before : {};
    const after = isRecord(row.after) ? row.after : {};
    if (after.deleted === true) {
      return [{ kind:'deleted', field:'record', label:'Запись', before:target.label, after:'Удалена' }];
    }

    const fields = target.entity === 'participant' ? PARTICIPANT_FIELDS
      : (target.entity === 'team' ? TEAM_FIELDS : []);
    const result = [];
    if (before.empty === true) {
      result.push({ kind:'created', field:'record', label:'Запись', before:'Пусто', after:'Создана' });
    }
    fields.forEach(field => {
      if (field === 'memberships') {
        result.push(...deriveMembershipDiff(before.memberships, after.memberships));
        return;
      }
      if (!hasOwn(before, field) && !hasOwn(after, field)) return;
      if (valuesEqual(before[field], after[field])) return;
      if (field === 'photoUrl') {
        const hadPhoto = !!clean(before[field]);
        const hasPhoto = !!clean(after[field]);
        result.push({
          kind:'changed', field:'photo', label:FIELD_LABELS[field],
          before:hadPhoto ? (hasPhoto ? 'Предыдущее фото' : 'Есть фото') : 'Нет фото',
          after:hasPhoto ? (hadPhoto ? 'Новое фото' : 'Добавлено') : 'Удалено'
        });
        return;
      }
      result.push({ kind:'changed', field, label:FIELD_LABELS[field] || field, before:before[field], after:after[field] });
    });

    const changed = isRecord(row.changed) ? row.changed : {};
    if (isRecord(changed.photo) && changed.photo.changed && !result.some(item => /photo/i.test(item.field))) {
      result.push({
        kind:'changed', field:'photo', label:'Фото команды',
        before:before.photoUrl ? 'Есть фото' : 'Нет фото', after:'Добавлено или заменено'
      });
    }
    return result;
  }

  function formatValue(value, field = '') {
    if (value == null || value === '') return 'Пусто';
    if (field === 'photo' || field === 'photoUrl') {
      if (typeof value === 'string') {
        const text = clean(value);
        if (/^(?:Предыдущее фото|Новое фото|Нет фото|Есть фото|Добавлено|Удалено|Добавлено или заменено)$/u.test(text)) return text;
        return text ? 'Есть фото' : 'Нет фото';
      }
      if (isRecord(value) && value.changed) return 'Добавлено или заменено';
      return value ? 'Есть фото' : 'Нет фото';
    }
    if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Пусто';
    if (Array.isArray(value)) {
      const primitive = value.filter(item => ['string','number','boolean'].includes(typeof item));
      if (primitive.length === value.length && value.length <= 6) {
        return redactPublicText(primitive.join(', '), value.length ? 'Изменено' : 'Пусто');
      }
      return value.length ? 'Изменено (' + value.length + ')' : 'Пусто';
    }
    if (isRecord(value)) {
      if (field === 'memberships' || hasOwn(value, 'team') || hasOwn(value, 'role')) return membershipText(value);
      if (clean(value.summary || value.label || value.name)) {
        return redactPublicText(value.summary || value.label || value.name, 'Изменено');
      }
      if (value.deleted === true) return 'Удалена';
      if (value.empty === true) return 'Пусто';
      return 'Изменено';
    }
    const text = clean(value);
    if (!text) return 'Пусто';
    if (/^https?:\/\//i.test(text)) return field === 'photoUrl' ? 'Есть фото' : 'Ссылка скрыта';
    if (/^data:/i.test(text)) return 'Данные скрыты';
    if (text.length > 120 && !/\s/.test(text)) return 'Данные скрыты';
    return redactPublicText(text, 'Пусто');
  }

  function normalizeOutcome(row, source) {
    const nested = isRecord(row.outcome) ? row.outcome : {};
    const optimistic = normalizedSearch(row.adminUsername).includes('snapshot обновляется') ||
      (isRecord(row.changed) && row.changed.snapshotRefresh === 'queued');
    let rawStatus = clean(nested.status || (optimistic ? 'pending' : 'committed'));
    const key = normalizedSearch(rawStatus).replace(/[\s_-]+/g, '');
    let status = 'committed';
    if (/^noop$|nochange|unchanged|безизмен/.test(key)) status = 'noop';
    else if (/pending|queued|ожида|sync/.test(key)) status = 'pending';
    else if (/warning|partial|предуп/.test(key)) status = 'warning';
    else if (/fail|error|reject|ошиб/.test(key)) status = 'failed';
    const warnings = (Array.isArray(nested.warnings) ? nested.warnings : [])
      .map(item => redactPublicText(isRecord(item) ? (item.summary || item.message || item.code) : item, ''))
      .filter(Boolean);
    if (isRecord(row.changed) && row.changed.mediaCleanupWarning) {
      warnings.push(redactPublicText(row.changed.mediaCleanupWarning, 'Предупреждение при очистке медиа'));
    }
    if (warnings.length && status === 'committed') status = 'warning';
    const label = ({
      committed:'Выполнено', pending:'Ожидает синхронизации',
      warning:'С предупреждением', failed:'Ошибка', noop:'Без изменений'
    })[status];
    let summary = redactPublicText(nested.summary, '');
    if (!summary && status === 'noop') summary = 'Фактических изменений нет.';
    if (!summary && status === 'pending') summary = 'Изменение сохранено, данные обновляются.';
    if (!summary && status === 'failed') summary = 'Операция завершилась ошибкой.';
    if (!summary && source.key === 'sheet' && status === 'committed') summary = 'Изменение в таблице зафиксировано.';
    return { status, label, summary, warnings };
  }

  function titleFor(actor, action, target) {
    const feminine = actor.isSystem;
    const verbs = feminine
      ? { create:'добавила', update:'изменила', delete:'удалила', clear:'очистила' }
      : { create:'добавил', update:'изменил', delete:'удалил', clear:'очистил' };
    const targetSuffix = target.generic ? '' : ' «' + target.label + '»';
    return actor.label + ' ' + verbs[action.mode] + ' ' + action.noun + targetSuffix;
  }

  function compactIdentifier(value) {
    const raw = clean(value);
    if (/https?:\/\/|bearer|token|authorization/i.test(raw) || looksLikeRawIdentity(raw)) return 'скрыто';
    const text = raw.replace(/[^\w.:-]/gu, '').slice(0, 96);
    if (!text) return '';
    return text.length > 38 ? text.slice(0, 24) + '…' + text.slice(-8) : text;
  }

  function technicalRows(row) {
    const items = [
      ['Версия схемы', clean(row.schemaVersion || (row.diff ? '2' : '1'))],
      ['Версия обработчика', redactPublicText(row.version, '')],
      ['Событие', compactIdentifier(row.eventId)],
      ['Запрос', compactIdentifier(row.requestId)],
      ['Транзакция', compactIdentifier(row.transactionId)],
      ['Родительское событие', compactIdentifier(row.parentEventId)],
      ['Строка источника', Number(row.row || (isRecord(row.target) ? row.target.row : 0)) || ''],
      ['Часовой пояс', redactPublicText(row.timezone, '')],
      ['Канал', isRecord(row.source) ? redactPublicText(row.source.channel, '') : '']
    ];
    return items.filter(item => clean(item[1])).slice(0, 9);
  }

  function normalizeEvent(raw, index = 0) {
    if (!isRecord(raw)) {
      return {
        valid:false, index, source:{ key:'other', label:'Неизвестный источник' },
        actor:{ label:'Неизвестный источник', isSystem:false },
        target:{ entity:'other', label:'Запись', generic:true, game:'' },
        action:{ mode:'update', label:'Неизвестное изменение', noun:'запись', op:'' },
        outcome:{ status:'failed', label:'Не удалось прочитать', summary:'Запись журнала повреждена.', warnings:[] },
        timestamp:'Время не указано', title:'Повреждённая запись журнала', diffs:[], technical:[], searchText:'поврежденная запись журнала'
      };
    }
    const source = normalizeSource(raw);
    const actor = normalizeActor(raw, source);
    const target = normalizeTarget(raw);
    const action = normalizeAction(raw, target.entity);
    const v2Diff = normalizeV2Diff(raw.diff);
    const diffs = v2Diff.length ? v2Diff : deriveLegacyDiff(raw, target);
    const outcome = normalizeOutcome(raw, source);
    const timestamp = formatTimestamp(raw);
    const title = titleFor(actor, action, target);
    const searchable = [
      title, actor.label, action.label, target.label, target.game, source.label,
      outcome.label, outcome.summary, timestamp,
      ...diffs.flatMap(item => [item.label, formatValue(item.before, item.field), formatValue(item.after, item.field)]),
      ...outcome.warnings
    ].join(' ');
    return {
      valid:true, index, source, actor, target, action, outcome, timestamp, title, diffs,
      technical:technicalRows(raw), searchText:normalizedSearch(searchable).slice(0, 3000)
    };
  }

  function renderDiff(item) {
    return `<li class="royal-journal-change">
      <strong>${escapeHtml(item.label || 'Изменение')}</strong>
      <div class="royal-journal-change-values"><span>${escapeHtml(formatValue(item.before, item.field))}</span><b aria-hidden="true">→</b><span>${escapeHtml(formatValue(item.after, item.field))}</span></div>
    </li>`;
  }

  function renderTechnical(items) {
    if (!items.length) return '';
    return `<details class="royal-journal-technical"><summary>Технические сведения</summary><dl>${items.map(item =>
      `<div><dt>${escapeHtml(item[0])}</dt><dd>${escapeHtml(item[1])}</dd></div>`
    ).join('')}</dl></details>`;
  }

  function renderCard(event, index) {
    const hidden = index >= PAGE_SIZE ? ' hidden' : '';
    const details = event.diffs.length
      ? `<ul class="royal-journal-changes">${event.diffs.map(renderDiff).join('')}</ul>`
      : (event.outcome.status === 'noop' ? '' : `<p class="royal-journal-no-diff">${event.valid ? 'Подробности отсутствуют в старой записи журнала.' : 'Исходные данные не показаны из соображений безопасности.'}</p>`);
    const summary = event.outcome.summary
      ? `<p class="royal-journal-outcome-summary">${escapeHtml(event.outcome.summary)}</p>` : '';
    const warnings = event.outcome.warnings.length
      ? `<ul class="royal-journal-warnings">${event.outcome.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
    const game = event.target.game ? ` · ${escapeHtml(event.target.game)}` : '';
    return `<article class="royal-admin-journal-card" data-journal-record="1" data-journal-source="${escapeHtml(event.source.key)}" data-journal-entity="${escapeHtml(event.target.entity)}" data-journal-outcome="${escapeHtml(event.outcome.status)}" data-journal-search-text="${escapeHtml(event.searchText)}"${hidden}>
      <header class="royal-journal-card-head">
        <div class="royal-journal-badges"><span class="royal-journal-source royal-journal-source--${escapeHtml(event.source.key)}">${escapeHtml(event.source.label)}</span><span class="royal-journal-outcome royal-journal-outcome--${escapeHtml(event.outcome.status)}">${escapeHtml(event.outcome.label)}</span></div>
        <h3>${escapeHtml(event.title)}</h3>
        <p><time>${escapeHtml(event.timestamp)}</time>${game}</p>
      </header>
      ${summary}${details}${warnings}${renderTechnical(event.technical)}
    </article>`;
  }

  function render(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return '<div class="royal-admin-note royal-journal-empty">📜 Изменений пока нет.</div>';
    }
    const events = list.map(normalizeEvent);
    return `<section class="royal-admin-journal" data-admin-journal-v2="1" data-journal-visible-limit="${PAGE_SIZE}">
      <div class="royal-journal-toolbar">
        <label class="royal-admin-search royal-journal-search"><span aria-hidden="true">🔎</span><input type="search" data-journal-search="1" placeholder="Администратор, участник, команда, поле…" autocomplete="off" aria-label="Поиск по журналу"></label>
        <div class="royal-journal-selects">
          <label><span>Источник</span><select data-journal-filter="source" aria-label="Источник изменений"><option value="all">Все</option><option value="miniapp">Mini App</option><option value="sheet">Google Sheets</option><option value="bot">Telegram-бот</option><option value="system">Система</option><option value="other">Другой</option></select></label>
          <label><span>Объект</span><select data-journal-filter="entity" aria-label="Объект изменений"><option value="all">Все</option><option value="participant">Участники</option><option value="team">Команды</option><option value="other">Другие</option></select></label>
          <label><span>Результат</span><select data-journal-filter="outcome" aria-label="Результат операции"><option value="all">Все</option><option value="committed">Выполнено</option><option value="noop">Без изменений</option><option value="pending">Синхронизация</option><option value="warning">Предупреждение</option><option value="failed">Ошибка</option></select></label>
        </div>
      </div>
      <div class="royal-admin-count royal-journal-count" data-journal-count aria-live="polite">Показано: ${Math.min(PAGE_SIZE, events.length)} из ${events.length}</div>
      <div class="royal-admin-journal-list">${events.map(renderCard).join('')}</div>
      <div class="royal-journal-no-results" data-journal-no-results hidden>Ничего не найдено. Измените поиск или фильтры.</div>
      <button type="button" class="royal-admin-action royal-journal-load-more" data-journal-load-more="1"${events.length > PAGE_SIZE ? '' : ' hidden'}>Показать ещё</button>
    </section>`;
  }

  function journalContainers(root) {
    const result = [];
    if (root?.matches?.('[data-admin-journal-v2="1"]')) result.push(root);
    if (root?.querySelectorAll) result.push(...root.querySelectorAll('[data-admin-journal-v2="1"]'));
    return result;
  }

  function apply(container) {
    if (!container?.querySelectorAll) return { matched:0, visible:0, total:0 };
    const query = normalizedSearch(container.querySelector?.('[data-journal-search]')?.value || '');
    const source = clean(container.querySelector?.('[data-journal-filter="source"]')?.value || 'all');
    const entity = clean(container.querySelector?.('[data-journal-filter="entity"]')?.value || 'all');
    const outcome = clean(container.querySelector?.('[data-journal-filter="outcome"]')?.value || 'all');
    const limit = Math.max(PAGE_SIZE, Number(container.dataset?.journalVisibleLimit || PAGE_SIZE));
    const records = [...container.querySelectorAll('[data-journal-record="1"]')];
    let matched = 0;
    let visible = 0;
    records.forEach(record => {
      const sourceOk = source === 'all' || record.dataset.journalSource === source;
      const entityOk = entity === 'all' || record.dataset.journalEntity === entity;
      const outcomeOk = outcome === 'all' || record.dataset.journalOutcome === outcome;
      const searchOk = !query || normalizedSearch(record.dataset.journalSearchText).includes(query);
      const matches = sourceOk && entityOk && outcomeOk && searchOk;
      if (matches) matched += 1;
      const show = matches && visible < limit;
      record.hidden = !show;
      if (show) visible += 1;
    });
    const count = container.querySelector?.('[data-journal-count]');
    if (count) count.textContent = `Показано: ${visible} из ${matched}${matched !== records.length ? ` · всего ${records.length}` : ''}`;
    const empty = container.querySelector?.('[data-journal-no-results]');
    if (empty) empty.hidden = matched !== 0;
    const more = container.querySelector?.('[data-journal-load-more]');
    if (more) more.hidden = visible >= matched;
    return { matched, visible, total:records.length };
  }

  function mount(root) {
    const containers = journalContainers(root || (typeof document !== 'undefined' ? document : null));
    containers.forEach(container => apply(container));
    return containers.length;
  }

  function install(documentRef) {
    if (!documentRef?.addEventListener || installedDocuments.has(documentRef)) return false;
    installedDocuments.add(documentRef);
    documentRef.addEventListener('input', event => {
      const input = event.target?.closest?.('[data-journal-search="1"]');
      if (!input) return;
      const container = input.closest('[data-admin-journal-v2="1"]');
      if (!container) return;
      container.dataset.journalVisibleLimit = String(PAGE_SIZE);
      apply(container);
    }, true);
    documentRef.addEventListener('change', event => {
      const filter = event.target?.closest?.('[data-journal-filter]');
      if (!filter) return;
      const container = filter.closest('[data-admin-journal-v2="1"]');
      if (!container) return;
      container.dataset.journalVisibleLimit = String(PAGE_SIZE);
      apply(container);
    }, true);
    documentRef.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-journal-load-more="1"]');
      if (!button) return;
      const container = button.closest('[data-admin-journal-v2="1"]');
      if (!container) return;
      event.preventDefault();
      container.dataset.journalVisibleLimit = String(
        Math.max(PAGE_SIZE, Number(container.dataset.journalVisibleLimit || PAGE_SIZE)) + PAGE_SIZE
      );
      apply(container);
    }, true);
    return true;
  }

  return Object.freeze({
    version:VERSION, pageSize:PAGE_SIZE, escapeHtml, normalizeEvent,
    render, apply, mount, install
  });
});

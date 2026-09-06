/* Royal CRM Mini App v0.6.1 — deterministic newest-first admin journal order */
(() => {
  'use strict';

  const base = window.RoyalAdminJournalV0600;
  if (!base || typeof base.render !== 'function') return;
  if (window.__ROYAL_ADMIN_JOURNAL_ORDER_V061__) return;

  const VERSION = '0.6.1-journal-order.1';
  const MOSCOW_OFFSET_HOURS = 3;

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function moscowEpoch(year, month, day, hour = 0, minute = 0, second = 0, millis = 0) {
    return Date.UTC(
      Number(year), Number(month) - 1, Number(day),
      Number(hour) - MOSCOW_OFFSET_HOURS, Number(minute), Number(second), Number(millis)
    );
  }

  function parseJournalTime(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return Number.NEGATIVE_INFINITY;

    const candidates = [
      row.occurredAtIso,
      row.at,
      row.timestamp,
      row.createdAt,
      row.updatedAt
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate > 1e12 ? candidate : candidate * 1000;
      }

      const raw = clean(candidate);
      if (!raw) continue;

      // ISO / RFC timestamps with an explicit timezone are authoritative.
      if (/^\d{4}-\d{2}-\d{2}T/.test(raw) || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
        const direct = Date.parse(raw);
        if (Number.isFinite(direct)) return direct;
      }

      // Legacy admin journal: DD.MM.YYYY HH:mm[:ss] [МСК].
      let match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?/);
      if (match) {
        return moscowEpoch(
          match[3], match[2], match[1], match[4], match[5], match[6] || 0,
          String(match[7] || '').padEnd(3, '0').slice(0, 3) || 0
        );
      }

      // Defensive support for YYYY-MM-DD HH:mm[:ss] without timezone.
      match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?/);
      if (match) {
        return moscowEpoch(
          match[1], match[2], match[3], match[4], match[5], match[6] || 0,
          String(match[7] || '').padEnd(3, '0').slice(0, 3) || 0
        );
      }

      const direct = Date.parse(raw);
      if (Number.isFinite(direct)) return direct;
    }

    return Number.NEGATIVE_INFINITY;
  }

  function sortRows(rows) {
    const source = Array.isArray(rows) ? rows : [];
    return source
      .map((row, index) => ({ row, index, epoch:parseJournalTime(row) }))
      .sort((left, right) => {
        if (left.epoch !== right.epoch) return right.epoch - left.epoch;
        // Keep source order stable when timestamps are equal or both missing.
        return left.index - right.index;
      })
      .map(item => item.row);
  }

  const patched = Object.freeze({
    ...base,
    version:VERSION,
    baseVersion:base.version,
    parseJournalTime,
    sortRows,
    render(rows) {
      return base.render(sortRows(rows));
    }
  });

  window.RoyalAdminJournalV0600 = patched;
  window.__ROYAL_ADMIN_JOURNAL_ORDER_V061__ = VERSION;
})();

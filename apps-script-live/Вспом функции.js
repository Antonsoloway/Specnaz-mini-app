
/* ========================================================================== */
/* ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ                                                   */
/* ========================================================================== */

function normalizeTelegramDisplayName_(value) {
  const text = decodeHtml_(extractHtmlText_(value)).trim();
  if (!text || isNumericTelegramId_(text)) return '';
  if (/^tg:\/\//i.test(text) || /^https?:\/\//i.test(text)) return '';
  return text;
}

function normalizePublicUsername_(value) {
  let text = String(value || '').trim();
  if (!text || isNumericTelegramId_(text)) return '';

  const href = extractHref_(text);
  if (href) text = href;

  if (/^tg:\/\/user\?id=/i.test(text)) return '';

  let match = text.match(/@([A-Za-z0-9_]{5,32})\b/);
  if (!match) match = text.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\b/i);
  if (!match && /^[A-Za-z0-9_]{5,32}$/.test(text)) match = [text, text];

  return match && match[1] ? '@' + match[1] : '';
}

function normalizeUsernameKey_(value) {
  const username = normalizePublicUsername_(value);
  return username ? username.substring(1).toLowerCase() : '';
}

function normalizeTgId_(value) {
  const text = String(value === null || value === undefined ? '' : value)
    .trim()
    .replace(/\.0$/, '');

  return /^\d{5,20}$/.test(text) ? text : '';
}

function isNumericTelegramId_(value) {
  return /^\d{5,20}$/.test(String(value || '').trim().replace(/\.0$/, ''));
}

function extractHtmlText_(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const match = text.match(/<a[^>]*>(.*?)<\/a>/i);
  return match && match[1] ? match[1] : text;
}

function extractHref_(value) {
  const text = String(value || '').trim();
  const match = text.match(/href=["']([^"']+)["']/i);
  return match && match[1] ? match[1].trim() : '';
}

function decodeHtml_(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractUsernameFromText_(text) {
  const value = String(text || '');
  let match = value.match(/@([A-Za-z0-9_]{5,32})\b/);
  if (!match) match = value.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\b/i);
  return match && match[1] ? '@' + match[1] : '';
}

function extractTelegramIdFromText_(text) {
  const match = String(text || '').match(/\b(?:id|ид|тг|tg_id|telegram_id)\s*[:=\-—]?\s*(\d{5,20})\b/i);
  return match && match[1] ? match[1] : '';
}

function normalizeSlot_(value) {
  const number = parseNumber_(value);
  if (number === null) return null;

  const slot = Math.floor(number);
  return slot >= 1 && slot <= 5 ? slot : null;
}

function extractSlotFromText_(text) {
  const match = String(text || '').match(/\b(?:слот|slot|акк|аккаунт|account)\s*[:=.\-—]?\s*([1-5])\b/i);
  return match && match[1] ? match[1] : '';
}

function removeSlotPhrase_(text) {
  return String(text || '')
    .replace(/\b(?:слот|slot|акк|аккаунт|account)\s*[:=.\-—]?\s*[1-5]\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber_(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).replace(/\s+/g, '').replace(',', '.').trim();
  if (!text) return null;

  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const number = Number(match[0]);
  return isNaN(number) ? null : number;
}

function numberOrZero_(value) {
  const number = parseNumber_(value);
  return number === null ? 0 : number;
}

function parseDateValue_(value) {
  if (value instanceof Date) return value;

  const text = clean_(value);
  let match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }

  const parsed = new Date(text);
  return parsed;
}

function normalizeNameKey_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^'+/, '')
    .replace(/[^a-zа-яё0-9@_]+/gi, '')
    .trim();
}

function firstClean_(items) {
  for (let i = 0; i < items.length; i++) {
    const value = clean_(items[i]);
    if (value !== '') return value;
  }
  return '';
}

function firstNonPlaceholder_(items) {
  for (let i = 0; i < items.length; i++) {
    if (items[i] === null || items[i] === undefined) continue;
    const raw = String(items[i]).trim();
    if (!raw) continue;
    if (raw.charAt(0) === '%' && raw.charAt(raw.length - 1) === '%') continue;
    return raw;
  }
  return '';
}

function clean_(value) {
  if (value === null || value === undefined) return '';

  const text = String(value).trim();
  if (!text) return '';
  if (text.charAt(0) === '%' && text.charAt(text.length - 1) === '%') return '';
  return text;
}

function safeText_(value) {
  const text = clean_(value).replace(/^'+/, '');
  if (!text) return '';
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function escapeRegExp_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncate_(value, maxLength) {
  const text = String(value || '');
  return text.length > maxLength ? text.substring(0, maxLength) + '…' : text;
}

function columnToLetter_(column) {
  let value = Number(column);
  let result = '';

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


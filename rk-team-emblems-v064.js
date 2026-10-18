/* Isolated RK emblem source: never falls through to Royal Match assets. */
(() => {
  'use strict';
  const MAX = 184;
  const ESCAPE = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPE[c]);
  const valid = logo => Number.isInteger(logo) && logo >= 0 && logo < MAX;
  const logoOf = t => t?.TeamLogo ?? t?.Logo ?? t?.teamLogo ?? t?.logo ?? null;
  // RK's own zero-based catalogue; never index the RM symbol table with an RK ID.
  const EMOJI=["⚜️", "⚜️", "👑", "👑", "🦆", "🦆", "🏰", "🏰", "♞", "♞", "🔔", "🔔", "🌴", "🌴", "🎀", "🎀", "🏛️", "🏛️", "⚡", "⚡", "🦖", "🦖", "🍒", "🍒", "🧩", "🧩", "❤️", "❤️", "🔥", "🔥", "🐿️", "🐿️", "🧭", "🧭", "🪖", "🪖", "🌲", "🌲", "🌼", "🌼", "🏛️", "🏛️", "🏠", "🏠", "🐷", "🐷", "🎮", "🎮", "🐾", "🐾", "🍀", "🍀", "⚓", "⚓", "🚀", "🚀", "⭐", "⭐", "🎵", "🎵", "🌰", "🌰", "⛵", "⛵", "🐬", "🐬", "🎂", "🎂", "☂️", "☂️", "🌙", "🌙", "💀", "💀", "🐙", "🐙", "🎭", "🎭", "🚂", "🚂", "🍸", "🍸", "⚗️", "⚗️", "♠️", "♠️", "🦴", "🦴", "🐈", "🐈", "⚔️", "⚔️", "🌵", "🌵", "🐦", "🐦", "🐕", "🐕", "☀️", "☀️", "🖌️", "🖌️", "💧", "💧", "🎃", "🎃", "⛺", "⛺", "🎩", "🎩", "🥚", "🥚", "🥸", "🥸", "🪶", "🪶", "💣", "💣", "🗡️", "🗡️", "♣️", "♣️", "🐟", "🐟", "🦋", "🦋", "🧙", "🧙", "🇺🇸", "🇨🇦", "🇬🇧", "🇯🇵", "🇸🇪", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "🇨🇭", "🇵🇹", "🇳🇱", "🇮🇹", "🇩🇪", "🇫🇷", "🇩🇰", "🇪🇸", "🇰🇷", "🇫🇮", "🇷🇺", "🇧🇪", "🇳🇴", "🇮🇪", "🇲🇽", "🇮🇳", "🇨🇳", "🇧🇷", "🇻🇪", "🇿🇦", "🇭🇰", "🇺🇾", "🇹🇼", "🇺🇦", "🇷🇴", "🇹🇷", "🇵🇱", "🇹🇭", "🇵🇭", "🇦🇹", "🇦🇺", "🇦🇷", "🇨🇴", "🇬🇷", "🇮🇩", "🇨🇿", "🇭🇺", "🇨🇱", "🇭🇷", "🇸🇬", "🇵🇪", "🇮🇱", "🇧🇬", "🇦🇪", "🇳🇬", "🇲🇾", "🇪🇬", "🇻🇳", "🇶🇦", "🇰🇼"];
  const emoji=logo=>valid(logo)?EMOJI[logo]:'';
  const hasEmojiPrefix=text=>/^[\p{Extended_Pictographic}\p{Regional_Indicator}♠♣♞]/u.test(String(text||'').trim());
  function emojiName(text,logo){const name=String(text||'').trim(),prefix=emoji(logo);if(hasEmojiPrefix(name))return name.replace(/^((?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[♞\uFE0E\uFE0F\u200D\u{E0020}-\u{E007F}])+)\s+/u,'$1');return prefix&&name?prefix+name:name;}
  const PREFIX=/^\s*(?:(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[♞\uFE0E\uFE0F\u200D\u{E0020}-\u{E007F}])+\s*)+/u;
  function label(text){const raw=String(text??''),prefix=raw.match(PREFIX)?.[0];return prefix&&raw.slice(prefix.length).trim()?'<span class="rk-team-emoji-prefix">'+escape(prefix)+'</span>'+escape(raw.slice(prefix.length)):escape(raw);}
  const image = logo => valid(logo) ?
    `<img class="rk-team-emblem" src="assets/rk-emblems/${logo}.webp?v=20261018-rk184" width="32" height="35" loading="lazy" decoding="async" alt="" aria-hidden="true" data-rk-logo="${logo}">` : '';
  const name = (text, teamId, logo) => {
    const content = `<span class="rk-team-label">${label(text)}</span>`;
    return `<span class="rk-team-name"${teamId == null ? '' : ` data-rk-team-id="${escape(teamId)}"`}>${image(logo)}${content}</span>`;
  };
  document.addEventListener('load',event=>{const img=event.target;if(img?.matches?.('.rk-team-emblem')&&img.naturalWidth>0){img.hidden=false;img.dataset.rkLoaded='1';}},true);
  document.addEventListener('error',event=>{const img=event.target;if(img?.matches?.('.rk-team-emblem')){delete img.dataset.rkLoaded;img.hidden=true;}},true);
  window.RoyalKingdomEmblems = Object.freeze({version:'1.2.0',valid,logoOf,image,name,emoji,emojiName,hasEmojiPrefix,label});
  window.RoyalTeamEmblems?.decorate();
})();

/* Royal CRM Mini App — rank system v0.5.23
 * Visual only. Participant identity remains raw Telegram ID only.
 */
(() => {
  const VERSION = '0.5.23';
  const defs = [
    { slug:'novice', name:'Новичок', min:0, glyph:'★' },
    { slug:'beginner', name:'Начинающий', min:1, glyph:'⌃' },
    { slug:'recognizable', name:'Узнаваемый', min:4, glyph:'◉' },
    { slug:'known', name:'Известный', min:8, glyph:'✦' },
    { slug:'famous', name:'Знаменитый', min:14, glyph:'✪' },
    { slug:'outstanding', name:'Выдающийся', min:22, glyph:'◆' },
    { slug:'maestro', name:'Маэстро', min:30, glyph:'♛' },
    { slug:'greatest', name:'Величайший', min:38, glyph:'✹' },
    { slug:'immortal', name:'Бессмертный', min:48, glyph:'∞' },
    { slug:'legendary', name:'Легендарный', min:60, glyph:'ϟ' },
    { slug:'god', name:'БОГ СПЕЦНАЗА', min:80, glyph:'↯' }
  ];
  let visibilityObserver = null;

  function safe(value) {
    return String(value ?? '')
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
  }

  function byScore(score) {
    const n = Math.max(0, Number(score || 0));
    let found = defs[0];
    defs.forEach(d => { if (n >= d.min) found = d; });
    return found;
  }

  function resolve(rank, score) {
    const key = normalize(rank);
    const exact = defs.find(d => normalize(d.name) === key);
    return exact || byScore(score);
  }

  function compact(rank, score, options = {}) {
    const def = resolve(rank, score);
    const tiny = !!options.tiny;
    const showLabel = options.label !== false;
    return `<span class="rank-badge rank-badge--compact rank-${def.slug}${tiny ? ' rank-badge--tiny' : ''}" data-rank="${safe(def.name)}" title="${safe(def.name)}"><span class="rank-medallion" aria-hidden="true"><span class="rank-glyph">${safe(def.glyph)}</span></span>${showLabel ? `<span class="rank-label">${safe(def.name)}</span>` : ''}</span>`;
  }

  function premium(rank, score) {
    const def = resolve(rank, score);
    const level = defs.indexOf(def) + 1;
    const particles = Array.from({length:6},(_,i)=>`<i class="rank-particle p${i+1}"></i>`).join('');
    return `<div class="rank-premium-stage"><div class="rank-badge rank-badge--premium rank-${def.slug}" data-level="${level}" aria-label="${safe(def.name)}"><span class="rank-premium-halo"></span><span class="rank-premium-wing left"></span><span class="rank-premium-wing right"></span><span class="rank-premium-orbit"></span><span class="rank-premium-core"><span class="rank-premium-crown">♛</span><span class="rank-glyph">${safe(def.glyph)}</span></span>${particles}<span class="rank-premium-name">${safe(def.name)}</span></div></div>`;
  }

  function ensureVisibilityObserver() {
    if (visibilityObserver || !('IntersectionObserver' in window)) return visibilityObserver;
    visibilityObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('rank-visible', !!entry.isIntersecting);
      });
    }, { rootMargin: '80px 0px', threshold: 0.01 });
    return visibilityObserver;
  }

  function activate(root) {
    const scope = root || document;
    const badges = [...scope.querySelectorAll('.rank-badge--compact')];
    if (!badges.length) return;
    const observer = ensureVisibilityObserver();
    if (!observer) {
      badges.forEach(b => b.classList.add('rank-visible'));
      return;
    }
    badges.forEach(b => {
      if (b.dataset.rankObserved === '1') return;
      b.dataset.rankObserved = '1';
      observer.observe(b);
    });
  }

  function injectAfter(html, pattern, badge) {
    const text = String(html || '');
    if (!badge || text.includes('rank-list-slot')) return text;
    return text.replace(pattern, match => `${match}<div class="rank-list-slot">${badge}</div>`);
  }

  /* Participants list and team roster are global renderers from app.js. */
  if (typeof participantCard === 'function') {
    const nativeParticipantCard = participantCard;
    participantCard = function(participant) {
      const html = nativeParticipantCard(participant);
      return injectAfter(html, /<div class="person-title">[\s\S]*?<\/div>/, compact(participant?.specnazRank, participant?.specnazTrips, {tiny:true}));
    };
  }

  if (typeof teamMemberCard === 'function') {
    const nativeTeamMemberCard = teamMemberCard;
    teamMemberCard = function(participant, teamRef) {
      const html = nativeTeamMemberCard(participant, teamRef);
      return injectAfter(html, /<strong>[\s\S]*?<\/strong>/, compact(participant?.specnazRank, participant?.specnazTrips, {tiny:true}));
    };
  }

  if (typeof renderParticipantsPage === 'function') {
    const nativeRenderParticipantsPage = renderParticipantsPage;
    renderParticipantsPage = function(query) {
      const result = nativeRenderParticipantsPage(query);
      activate(document.getElementById('panel'));
      return result;
    };
  }

  if (typeof renderTeamDetail === 'function') {
    const nativeRenderTeamDetail = renderTeamDetail;
    renderTeamDetail = function(teamRef) {
      const result = nativeRenderTeamDetail(teamRef);
      activate(document.getElementById('panel'));
      return result;
    };
  }

  window.RoyalRank = { version: VERSION, defs, resolve, compact, premium, activate };
  window.__ROYAL_RANK_SYSTEM_VERSION__ = VERSION;
})();

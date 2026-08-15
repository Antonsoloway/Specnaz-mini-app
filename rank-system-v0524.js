/* Royal CRM Mini App — rank system v0.5.24
 * Visual only. Participant identity/data logic is untouched.
 * Compact concept crests + premium profile crest + tap fireworks.
 */
(() => {
  const VERSION = '0.5.24';
  const defs = [
    { slug:'novice', name:'Новичок', min:0, glyph:'★', accent:'silver' },
    { slug:'beginner', name:'Начинающий', min:1, glyph:'▲', accent:'silver' },
    { slug:'recognizable', name:'Узнаваемый', min:4, glyph:'★', accent:'blue' },
    { slug:'known', name:'Известный', min:8, glyph:'✦', accent:'cyan' },
    { slug:'famous', name:'Знаменитый', min:14, glyph:'★', accent:'green' },
    { slug:'outstanding', name:'Выдающийся', min:22, glyph:'◆', accent:'emerald' },
    { slug:'maestro', name:'Маэстро', min:30, glyph:'♛', accent:'gold' },
    { slug:'greatest', name:'Величайший', min:38, glyph:'✹', accent:'amber' },
    { slug:'immortal', name:'Бессмертный', min:48, glyph:'◆', accent:'violet' },
    { slug:'legendary', name:'Легендарный', min:60, glyph:'♞', accent:'red' },
    { slug:'god', name:'БОГ СПЕЦНАЗА', min:80, glyph:'ϟ', accent:'divine' }
  ];

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
    defs.forEach(def => { if (n >= def.min) found = def; });
    return found;
  }

  function resolve(rank, score) {
    const key = normalize(rank);
    const exact = defs.find(def => normalize(def.name) === key);
    return exact || byScore(score);
  }

  function crestMarkup(def, level, premium) {
    const crown = level === 5 || level === 7 || level === 8 || level === 11;
    const laurel = level === 5 || level === 7;
    const wings = level >= 3;
    const lightning = level === 11;
    return `
      <span class="rank-crest ${premium ? 'rank-crest--premium' : 'rank-crest--mini'}" data-level="${level}" aria-hidden="true">
        ${wings ? '<i class="rank-wing rank-wing--left"></i><i class="rank-wing rank-wing--right"></i>' : ''}
        ${laurel ? '<i class="rank-laurel rank-laurel--left"></i><i class="rank-laurel rank-laurel--right"></i>' : ''}
        ${crown ? '<i class="rank-crown">♛</i>' : ''}
        ${lightning ? '<i class="rank-lightning rank-lightning--left">ϟ</i><i class="rank-lightning rank-lightning--right">ϟ</i>' : ''}
        <i class="rank-shield"><i class="rank-shield-inner"><b class="rank-glyph">${safe(def.glyph)}</b></i></i>
      </span>`;
  }

  function compact(rank, score, options = {}) {
    const def = resolve(rank, score);
    const level = defs.indexOf(def) + 1;
    const tiny = !!options.tiny;
    const showLabel = options.label !== false;
    return `<span class="rank-badge rank-badge--compact rank-${def.slug}${tiny ? ' rank-badge--tiny' : ''}" data-level="${level}" data-rank="${safe(def.name)}" title="${safe(def.name)}">${crestMarkup(def, level, false)}${showLabel ? `<span class="rank-label">${safe(def.name)}</span>` : ''}</span>`;
  }

  function premium(rank, score) {
    const def = resolve(rank, score);
    const level = defs.indexOf(def) + 1;
    return `<div class="rank-premium-stage" data-rank-stage="1"><button type="button" class="rank-badge rank-badge--premium rank-${def.slug}" data-level="${level}" data-rank-firework="1" aria-label="${safe(def.name)} — нажмите для салюта"><span class="rank-premium-halo"></span><span class="rank-premium-ring r1"></span><span class="rank-premium-ring r2"></span>${crestMarkup(def, level, true)}<span class="rank-premium-name">${safe(def.name)}</span><span class="rank-tap-hint">✦</span></button></div>`;
  }

  function injectAfter(html, pattern, badge) {
    const text = String(html || '');
    if (!badge || text.includes('rank-list-slot')) return text;
    return text.replace(pattern, match => `${match}<div class="rank-list-slot">${badge}</div>`);
  }

  if (typeof participantCard === 'function') {
    const nativeParticipantCard = participantCard;
    participantCard = function(participant) {
      const html = nativeParticipantCard(participant);
      return injectAfter(html, /<div class="person-title">[\s\S]*?<\/div>/, compact(participant?.specnazRank, participant?.specnazTrips, { tiny:true }));
    };
  }

  if (typeof teamMemberCard === 'function') {
    const nativeTeamMemberCard = teamMemberCard;
    teamMemberCard = function(participant, teamRef) {
      const html = nativeTeamMemberCard(participant, teamRef);
      return injectAfter(html, /<strong>[\s\S]*?<\/strong>/, compact(participant?.specnazRank, participant?.specnazTrips, { tiny:true }));
    };
  }

  let observed = new WeakSet();
  const motionObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => entry.target.classList.toggle('rank-is-visible', entry.isIntersecting));
      }, { rootMargin:'80px 0px 80px 0px', threshold:0.01 })
    : null;

  function observeCompact(root = document) {
    root.querySelectorAll?.('.rank-badge--compact').forEach(el => {
      if (observed.has(el)) return;
      observed.add(el);
      if (motionObserver) motionObserver.observe(el);
      else el.classList.add('rank-is-visible');
    });
  }

  function firework(stage) {
    if (!stage) return;
    const old = stage.querySelector('.rank-firework-layer');
    if (old) old.remove();
    const layer = document.createElement('span');
    layer.className = 'rank-firework-layer';
    const count = 34;
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement('i');
      const angle = (Math.PI * 2 * i / count) + (Math.random() * 0.18 - 0.09);
      const distance = 76 + Math.random() * 92;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const size = 2 + Math.random() * 4.5;
      p.className = `rank-firework-particle p${i % 5}`;
      p.style.setProperty('--fx', `${x.toFixed(1)}px`);
      p.style.setProperty('--fy', `${y.toFixed(1)}px`);
      p.style.setProperty('--fs', `${size.toFixed(1)}px`);
      p.style.setProperty('--fd', `${(Math.random() * 0.12).toFixed(2)}s`);
      layer.appendChild(p);
    }
    const flash = document.createElement('i');
    flash.className = 'rank-firework-flash';
    layer.appendChild(flash);
    const ringA = document.createElement('i');
    ringA.className = 'rank-firework-burst-ring a';
    layer.appendChild(ringA);
    const ringB = document.createElement('i');
    ringB.className = 'rank-firework-burst-ring b';
    layer.appendChild(ringB);
    stage.appendChild(layer);
    stage.classList.remove('rank-celebrate');
    void stage.offsetWidth;
    stage.classList.add('rank-celebrate');
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('medium'); } catch (_) {}
    window.setTimeout(() => {
      layer.remove();
      stage.classList.remove('rank-celebrate');
    }, 1350);
  }

  document.addEventListener('click', event => {
    const badge = event.target?.closest?.('[data-rank-firework="1"]');
    if (!badge) return;
    event.preventDefault();
    event.stopPropagation();
    firework(badge.closest('[data-rank-stage="1"]'));
  }, true);

  const domObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.('.rank-badge--compact')) observeCompact(node.parentElement || document);
      else if (node.querySelector?.('.rank-badge--compact')) observeCompact(node);
    }));
  });
  domObserver.observe(document.documentElement, { childList:true, subtree:true });
  observeCompact(document);

  window.RoyalRank = { version:VERSION, defs, resolve, compact, premium, firework, observeCompact };
  window.__ROYAL_RANK_SYSTEM_VERSION__ = VERSION;
})();

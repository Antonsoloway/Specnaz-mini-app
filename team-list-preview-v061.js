/* Royal CRM Mini App v0.6.1 — ordinary team-list photo previews */
(() => {
  'use strict';
  if (String(window.__ROYAL_BUILD__ || '') !== '0.6.1') return;
  if (window.__ROYAL_TEAM_LIST_PREVIEW_V061__) return;

  const VERSION = '0.6.1-team-list-preview.1';
  const CONCURRENCY = 3;
  const memory = new Map();
  const pending = new Map();
  const queued = new WeakSet();
  const queue = [];
  let active = 0;
  let observer = null;
  let scheduled = 0;

  const clean = value => String(value == null ? '' : value).trim();
  const normText = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, ' ').replace(/\s+/g, ' ').trim();
  function game(value) {
    const raw = clean(value);
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }
  function decodeRef(value) {
    let raw = clean(value);
    try { raw = decodeURIComponent(raw); } catch (_) {}
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { name:clean(parsed[0]), game:game(parsed[1]) };
    } catch (_) {}
    return { name:raw, game:'' };
  }
  function teamGame(team) {
    return game(team?.game || (Array.isArray(team?.games) ? team.games[0] : '') || '');
  }
  function keyFor(name, teamGameValue, token) {
    return `${normText(name)}\n${normText(game(teamGameValue))}\n${clean(token)}`;
  }
  function publicTeams() {
    try { return Array.isArray(snapshotState?.teams) ? snapshotState.teams : []; }
    catch (_) { return []; }
  }
  function findTeam(ref) {
    const name = normText(ref?.name);
    const wantedGame = game(ref?.game);
    if (!name) return null;
    const teams = publicTeams();
    if (wantedGame) {
      const exact = teams.find(team => normText(team?.name) === name && teamGame(team) === wantedGame);
      if (exact) return exact;
    }
    const matches = teams.filter(team => normText(team?.name) === name);
    return matches.length === 1 ? matches[0] : null;
  }
  function identityForCard(card) {
    if (!card) return null;
    const ref = decodeRef(card.dataset?.team || '');
    const team = findTeam(ref);
    if (!team) return null;
    const name = clean(team?.name || ref.name);
    const teamGameValue = teamGame(team) || game(ref.game);
    const photoUrl = clean(team?.photoUrl);
    const revision = clean(team?.revision);
    const token = photoUrl || (revision ? `rev:${revision}` : '');
    return { team, name, game:teamGameValue, photoUrl, token, key:keyFor(name, teamGameValue, token) };
  }
  function session() {
    try { return clean(typeof sessionToken === 'undefined' ? '' : sessionToken); }
    catch (_) { return ''; }
  }
  function apiBase() {
    try { return clean(typeof API_URL === 'undefined' ? '' : API_URL); }
    catch (_) { return ''; }
  }

  function installCss() {
    if (document.querySelector('style[data-team-list-preview-v061="1"]')) return;
    const style = document.createElement('style');
    style.dataset.teamListPreviewV061 = '1';
    style.textContent = `
      #panel .teams-list .team-card-icon.royal-team-list-preview-v061{position:relative;display:grid;place-items:center;flex:0 0 58px;width:58px;height:58px;padding:0;border-radius:12px;overflow:hidden;background:rgba(9,24,35,.30);font-size:29px;line-height:1}
      #panel .teams-list .team-card-icon.royal-team-list-preview-v061>span{display:grid;place-items:center;position:absolute;inset:0;transition:opacity .12s ease}
      #panel .teams-list .royal-team-list-preview-image-v061{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:cover!important;display:block!important;opacity:0;transition:opacity .12s ease}
      #panel .teams-list .team-card-icon.royal-team-list-preview-v061.is-ready>span{opacity:0}
      #panel .teams-list .team-card-icon.royal-team-list-preview-v061.is-ready .royal-team-list-preview-image-v061{opacity:1}
      #panel .teams-list .team-card-icon.royal-team-list-preview-v061.is-error .royal-team-list-preview-image-v061{display:none!important}
      @media(max-width:360px){#panel .teams-list .team-card-icon.royal-team-list-preview-v061{flex-basis:54px;width:54px;height:54px}}
    `;
    document.head.appendChild(style);
  }

  function clearPreview(icon) {
    if (!icon) return;
    icon.classList.remove('royal-team-list-preview-v061','is-ready','is-loading','is-error');
    icon.innerHTML = '🏰';
    icon.dataset.v061TeamListPreview = 'none';
  }
  function ensurePreview(card) {
    const icon = card?.querySelector?.('.team-card-icon');
    if (!icon) return;
    const identity = identityForCard(card);
    if (!identity?.name || !identity?.game || !identity.photoUrl) {
      if (icon.dataset.v061TeamListPreview !== 'none' || icon.querySelector('img')) clearPreview(icon);
      return;
    }

    icon.classList.add('royal-team-list-preview-v061');
    icon.dataset.v061TeamListPreview = identity.key;
    let fallback = icon.querySelector(':scope > span');
    if (!fallback) {
      icon.textContent = '';
      fallback = document.createElement('span');
      fallback.textContent = '🏰';
      icon.appendChild(fallback);
    }
    let img = icon.querySelector('img.royal-team-list-preview-image-v061');
    if (!img) {
      img = document.createElement('img');
      img.className = 'royal-team-list-preview-image-v061';
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      icon.appendChild(img);
    }
    img.dataset.teamName = identity.name;
    img.dataset.teamGame = identity.game;
    img.dataset.photoToken = identity.token;
    img.dataset.previewKey = identity.key;
    if (img.dataset.previewEvents !== VERSION) {
      img.dataset.previewEvents = VERSION;
      img.addEventListener('load', () => {
        if (!img.isConnected) return;
        const holder = img.closest('.team-card-icon');
        holder?.classList.remove('is-loading','is-error');
        holder?.classList.add('is-ready');
      });
      img.addEventListener('error', () => {
        if (!img.isConnected) return;
        const holder = img.closest('.team-card-icon');
        holder?.classList.remove('is-loading','is-ready');
        holder?.classList.add('is-error');
      });
    }
    observe(img);
  }

  async function fetchBlob(identity) {
    const token = session();
    const api = apiBase();
    if (!token || !api) throw new Error('TEAM_PREVIEW_AUTH_MISSING');
    const url = new URL(`${api}/team-photo`);
    url.searchParams.set('team', identity.name);
    url.searchParams.set('game', identity.game);
    const response = await fetch(url.toString(), {
      method:'GET', mode:'cors', cache:'no-store',
      headers:{ Authorization:`Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`TEAM_PREVIEW_HTTP_${response.status}`);
    const blob = await response.blob();
    if (!(blob instanceof Blob) || !blob.size || !String(blob.type || '').startsWith('image/')) {
      throw new Error('TEAM_PREVIEW_INVALID');
    }
    return blob;
  }
  function apply(img, identity, url) {
    if (!img?.isConnected || clean(img.dataset.previewKey) !== identity.key) return false;
    const holder = img.closest('.team-card-icon');
    holder?.classList.remove('is-error');
    holder?.classList.add('is-loading');
    if (img.src !== url) img.src = url;
    return true;
  }
  async function load(img) {
    if (!img?.isConnected) return;
    const card = img.closest('.team-card');
    const identity = identityForCard(card);
    if (!identity?.photoUrl || clean(img.dataset.previewKey) !== identity.key) return;
    if (memory.has(identity.key)) {
      apply(img, identity, memory.get(identity.key));
      return;
    }
    let task = pending.get(identity.key);
    if (!task) {
      task = (async () => {
        const blob = await fetchBlob(identity);
        const url = URL.createObjectURL(blob);
        memory.set(identity.key, url);
        return url;
      })();
      pending.set(identity.key, task);
    }
    try {
      apply(img, identity, await task);
    } catch (_) {
      const holder = img.closest('.team-card-icon');
      holder?.classList.remove('is-loading','is-ready');
      holder?.classList.add('is-error');
    } finally {
      if (pending.get(identity.key) === task) pending.delete(identity.key);
    }
  }
  function enqueue(img) {
    if (!img?.isConnected || queued.has(img) || img.dataset.previewLoading === '1') return;
    queued.add(img);
    queue.push(img);
    pump();
  }
  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const img = queue.shift();
      if (img) queued.delete(img);
      if (!img?.isConnected) continue;
      img.dataset.previewLoading = '1';
      active += 1;
      Promise.resolve(load(img)).finally(() => {
        delete img.dataset.previewLoading;
        active -= 1;
        pump();
      });
    }
  }
  function observe(img) {
    if (!img?.isConnected) return;
    if (memory.has(clean(img.dataset.previewKey))) { enqueue(img); return; }
    if (!('IntersectionObserver' in window)) { enqueue(img); return; }
    if (!observer) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          enqueue(entry.target);
        });
      }, { rootMargin:'360px 0px' });
    }
    observer.observe(img);
  }

  function decorate(root=document) {
    const cards = [];
    if (root?.matches?.('#panel .teams-list .team-card')) cards.push(root);
    root?.querySelectorAll?.('#panel .teams-list .team-card')?.forEach(card => cards.push(card));
    cards.forEach(ensurePreview);
  }
  function schedule(root=document) {
    if (scheduled) return;
    scheduled = window.requestAnimationFrame(() => {
      scheduled = 0;
      decorate(root?.isConnected === false ? document : root);
    });
  }

  try {
    if (typeof renderTeamsPage === 'function') {
      const native = renderTeamsPage;
      renderTeamsPage = function renderTeamsPageWithPreview(...args) {
        const result = native.apply(this, args);
        schedule(document);
        return result;
      };
    }
  } catch (_) {}

  const mutation = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.teams-list,.team-card') || node.querySelector?.('.teams-list,.team-card')) {
          schedule(node);
          return;
        }
      }
    }
  });
  mutation.observe(document.body, { childList:true, subtree:true });

  installCss();
  schedule(document);
  window.addEventListener('royal:snapshot-ready', () => schedule(document));
  window.addEventListener('pageshow', () => schedule(document));
  window.addEventListener('pagehide', () => {
    observer?.disconnect?.();
    memory.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
    memory.clear();
  }, { once:true });

  window.RoyalTeamListPreviewV061 = { version:VERSION, refresh:() => schedule(document) };
  window.__ROYAL_TEAM_LIST_PREVIEW_V061__ = VERSION;
})();

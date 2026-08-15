// Royal CRM Mini App team identity fix — v0.5.5
// Distinguishes teams by BOTH normalized name and game.
(function () {
  const TEAM_IDENTITY_VERSION = '0.5.5';

  function canonicalGame(value) {
    const raw = String(value || '').trim();
    const low = raw.toLocaleLowerCase('ru-RU');
    if (low === 'рм' || low.includes('royal match')) return 'Royal Match';
    if (low === 'рк' || low.includes('royal kingdom')) return 'Royal Kingdom';
    return raw;
  }

  function teamGame(t) {
    return canonicalGame(t?.game || (Array.isArray(t?.games) ? t.games[0] : '') || '');
  }

  function identityKey(name, game) {
    return `${normalizeTeam(name)}\n${canonicalGame(game).toLocaleLowerCase('ru-RU')}`;
  }

  function refFor(name, game) {
    return JSON.stringify([String(name || '').trim(), canonicalGame(game)]);
  }

  function parseRef(value) {
    const raw = String(value || '');
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { name: String(parsed[0] || '').trim(), game: canonicalGame(parsed[1]) };
    } catch (_) {}
    return { name: raw.trim(), game: '' };
  }

  membershipHtml = function membershipHtmlV055(m) {
    const team = String(m?.team || '').trim();
    const role = String(m?.role || 'Без роли').trim();
    const game = canonicalGame(m?.game);
    if (!team) return `<span class="membership-pill no-team">Без команды — ${esc(role)}</span>`;
    const ref = refFor(team, game);
    return `<button type="button" class="membership-pill team-link" data-team="${enc(ref)}"><span>${esc(team)}</span><small>${esc(role)}${game ? ` · ${esc(game)}` : ''}</small></button>`;
  };

  teamSearchText = function teamSearchTextV055(t) {
    return [t?.name, t?.game, ...(Array.isArray(t?.games) ? t.games : [])]
      .filter(Boolean).join(' ').toLocaleLowerCase('ru-RU');
  };

  teamCard = function teamCardV055(t) {
    const game = teamGame(t);
    const ref = refFor(t?.name || '', game);
    return `<button type="button" class="team-card" data-team="${enc(ref)}"><div class="team-card-icon">🏰</div><div class="team-card-main"><strong>${esc(t?.name || 'Без названия')}</strong>${game ? `<span>${esc(game)}</span>` : ''}<small>Участников: ${Number(t?.memberCount || 0)} · лидеров: ${Number(t?.leaderCount || 0)} · помощников: ${Number(t?.assistantCount || 0)}</small></div><span class="chevron">›</span></button>`;
  };

  teamMemberInfo = function teamMemberInfoV055(p, teamRef) {
    const ref = parseRef(teamRef);
    const nameKey = normalizeTeam(ref.name);
    return (p?.memberships || []).filter(m => {
      if (normalizeTeam(m?.team) !== nameKey) return false;
      if (!ref.game) return true;
      return canonicalGame(m?.game) === ref.game;
    }).sort((a, b) => roleRank(a.role) - roleRank(b.role));
  };

  teamMemberCard = function teamMemberCardV055(p, teamRef) {
    const name = displayName(p);
    const teamMemberships = teamMemberInfo(p, teamRef);
    const info = teamMemberships.map(m => {
      const role = m?.role || 'Без роли';
      const extra = [m?.nickname, canonicalGame(m?.game)].filter(Boolean).join(' · ');
      return `<div class="team-member-role">${esc(role)}${extra ? ` · ${esc(extra)}` : ''}</div>`;
    }).join('');
    const avatarFile = String(p?.avatarFileId || '');
    const avatar = avatarFile
      ? `<div class="person-avatar-wrap small"><span>${esc(firstLetter(name))}</span><img class="person-avatar" alt="" data-avatar-file="${esc(avatarFile)}"></div>`
      : `<div class="person-avatar-wrap small fallback"><span>${esc(firstLetter(name))}</span></div>`;
    return `<article class="team-member">${avatar}<div class="team-member-main"><strong>${esc(name)}</strong>${usernameButton(p, true)}${info}</div></article>`;
  };

  renderTeamDetail = function renderTeamDetailV055(teamRef) {
    const teams = snapshotState?.teams || [];
    const participants = snapshotState?.participants || [];
    const ref = parseRef(teamRef);
    const wantedKey = identityKey(ref.name, ref.game);

    let team = teams.find(t => identityKey(t?.name, teamGame(t)) === wantedKey);
    if (!team && !ref.game) team = teams.find(t => normalizeTeam(t?.name) === normalizeTeam(ref.name));

    if (!team) {
      document.getElementById('panel').innerHTML = `<button type="button" class="back-link" data-page="teams">‹ Команды</button><h2>Команда не найдена</h2>`;
      return;
    }

    const game = teamGame(team);
    const exactRef = refFor(team.name, game);
    const members = participants.filter(p => teamMemberInfo(p, exactRef).length).sort((a, b) => {
      const ar = roleRank(teamMemberInfo(a, exactRef)[0]?.role);
      const br = roleRank(teamMemberInfo(b, exactRef)[0]?.role);
      return ar - br || displayName(a).localeCompare(displayName(b), 'ru', { sensitivity: 'base' });
    });

    const initialSrc = team?.photoUrl ? ` src="${esc(team.photoUrl)}"` : '';
    const photo = `<div class="team-photo-box${team?.photoUrl ? '' : ' photo-error'}"><img class="team-photo"${initialSrc} alt="${esc(team.name)}" data-team-name="${esc(team.name)}" data-team-game="${esc(game)}" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('photo-error')"><div class="team-photo-fallback">🏰</div></div>`;

    document.getElementById('panel').innerHTML = `<button type="button" class="back-link" data-page="teams">‹ Все команды</button>${photo}<div class="team-detail-head"><h2>${esc(team.name)}</h2><div class="muted">${esc(game)}</div></div><div class="team-stats"><span><b>${members.length}</b><small>участников</small></span><span><b>${Number(team.leaderCount || 0)}</b><small>лидеров</small></span><span><b>${Number(team.assistantCount || 0)}</b><small>помощников</small></span></div><h3 class="subheading">Состав команды</h3><div class="team-members-list">${members.length ? members.map(p => teamMemberCard(p, exactRef)).join('') : '<div class="empty-state">Участники не найдены</div>'}</div>`;

    setActiveNav('teams');
    setupAvatarLoading(document.getElementById('panel'));
  };

  window.__ROYAL_TEAM_IDENTITY_VERSION__ = TEAM_IDENTITY_VERSION;
})();

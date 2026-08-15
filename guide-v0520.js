/* Royal CRM Mini App — Путеводитель v0.5.20 */
(() => {
  const VERSION = '0.5.20';

  const topics = [
    {
      icon: '👥',
      name: 'Участники',
      url: 'https://t.me/c/2109152418/149973',
      description: 'Новоприбывшим обязательно нужно написать здесь свой ник и команду. В этом разделе располагаются только анкеты участников, чтобы мы могли познакомиться друг с другом.'
    },
    {
      icon: '🚪',
      name: 'Парадная',
      url: 'https://t.me/c/2109152418/1',
      description: 'Общение на темы, связанные с жизнедеятельностью чата и его участниками: приветствие новеньких, важные объявления, поздравления.'
    },
    {
      icon: '👑',
      name: 'Royal Kingdom',
      url: 'https://t.me/c/2109152418/40673',
      description: 'Тема по РК. Обсуждаем всё, что связано с игрой: задаём вопросы, решаем проблемы, делимся результатами и находками.'
    },
    {
      icon: '🏰',
      name: 'Royal Match',
      url: 'https://t.me/c/2109152418/152051',
      description: 'Тема по РМ. Обсуждаем всё, что связано с игрой: задаём вопросы, решаем проблемы, делимся результатами и находками.'
    },
    {
      icon: '🪑',
      name: 'Лавочка',
      url: 'https://t.me/c/2109152418/21453',
      description: 'Общение на любые темы, в том числе не связанные с игрой — от пирогов и котиков до квантовой физики. Это публичное пространство, поэтому придерживаемся общепринятых норм общения.'
    },
    {
      icon: '🌪️',
      name: 'Флудильня',
      url: 'https://t.me/c/2109152418/150669',
      description: 'Говорящее название — слабонервным не входить! Видео, гифки, стикеры, голосовые, словесное недержание, шум и всё остальное. К обсценной лексике здесь относятся демократично. Если такой формат не подходит — уведомления темы можно отключить.'
    },
    {
      icon: '🎬',
      name: 'Кинозал',
      url: 'https://t.me/c/2109152418/171084',
      description: 'Советуем друг другу фильмы, чтобы веселее игралось и интереснее жилось.'
    },
    {
      icon: '🎙️',
      name: 'Голосовые',
      url: 'https://t.me/c/2109152418/171133',
      description: 'Для любителей пообщаться голосом и не слышать в ответ: «Опять ты со своими голосовухами».'
    },
    {
      icon: '🪖',
      name: 'PRO Спецназ',
      url: 'https://t.me/c/2109152418/208466',
      description: 'История и гайды по основному направлению работы Чата Победителей. Обязательна к изучению для всех новичков.'
    },
    {
      icon: '🚨',
      name: 'База спецназа',
      url: 'https://t.me/c/2109152418/21213',
      description: 'Тема открыта с пятницы по понедельник. Здесь выкладывают скрины битв, при необходимости просят помощи друзей, предлагают помощь и обсуждают детали битв: количество спецназовцев, уровень входа, ники и другое. Правила раздела находятся в закреплённых сообщениях.'
    },
    {
      icon: '🚑',
      name: 'Реанимация',
      url: 'https://t.me/c/2109152418/267777',
      description: 'Помощь командам, которые хотят побеждать, учиться и развиваться, но пока не знают как. Сюда приглашаются новые интересные команды, чтобы получить поддержку, советы, дружбу и возможность вырасти до спецназа.'
    },
    {
      icon: '📚',
      name: 'Советы, гайды, лайфхаки',
      url: 'https://t.me/c/2109152418/37455',
      description: 'Закрытая тема со статьями и полезной информацией об игре. Админы также переносят сюда полезные и интересные посты участников, содержащие ценную информацию.'
    },
    {
      icon: '📖',
      name: 'Полная библиотека RWstudy',
      url: 'https://t.me/RWstudy',
      description: 'Полная библиотека гайдов и знаний по игре вынесена в отдельный чат — наш филиал RWstudy.'
    },
    {
      icon: '🛸',
      name: 'Очевидное-невероятное',
      url: 'https://t.me/c/2109152418/121042',
      description: 'Делимся скринами своих находок на просторах игры — от милых и забавных до откровенного кринжа и треша.'
    },
    {
      icon: '⚡',
      name: 'Обучение скоростным комбо',
      url: 'https://t.me/c/2109152418/125689',
      description: 'Здесь учимся продвинутым техникам игры, помогаем друг другу советами, радуемся успехам и поддерживаем при неудачах.'
    }
  ];

  const rules = [
    {
      cls: 'danger',
      icon: '❗️',
      title: 'Без оскорблений и переходов на личности',
      text: 'В чате запрещены любые оскорбления и переходы на личности. Админы добрые, но могут стать злыми, а нарушители — молчаливыми.',
      url: 'https://t.me/c/2109152418/29777/244160',
      button: 'Открыть правило'
    },
    {
      cls: 'danger',
      icon: '❗️',
      title: 'Сухой закон',
      text: 'В чате запрещено отклоняющееся поведение под влиянием алкоголя и психотропных веществ.',
      url: 'https://t.me/c/2109152418/29777/227917',
      button: 'Открыть правило'
    },
    {
      cls: 'warm',
      icon: '🎓',
      title: 'Вопросы приветствуются',
      text: 'В чате приветствуются любые вопросы и размышления. Другие участники всегда готовы помочь, подсказать, поддержать беседу и не оставить вас в беде и одиночестве.'
    },
    {
      cls: 'danger',
      icon: '⛔️',
      title: 'Рекрут игроков запрещён',
      text: 'Рекрут игроков запрещён как в пространстве чата, так и через личные сообщения. Чат не создан для усиления одной команды за счёт других. Игрок может по собственной инициативе спросить, где поиграть, или попросить принять его в конкретную команду — тогда место предложить можно.'
    },
    {
      cls: 'home',
      icon: '🏠',
      title: 'Чувствуйте себя как дома!',
      text: 'Цель Чата Победителей — объединять игроков и делать наше сообщество шире, интереснее и сплочённее. Мы из разных команд и можем быть соперниками в битвах, но здесь мы все друзья.'
    }
  ];

  function h(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function openTelegram(url) {
    const target = String(url || '').trim();
    if (!/^https:\/\/t\.me\//i.test(target)) return;
    const webapp = window.Telegram?.WebApp;
    try {
      if (webapp?.openTelegramLink) {
        webapp.openTelegramLink(target);
        return;
      }
      if (webapp?.openLink) {
        webapp.openLink(target);
        return;
      }
    } catch (_) {}
    window.location.href = target;
  }

  function topicHtml(topic) {
    return `<details class="guide-topic">
      <summary><span class="guide-topic-icon">${h(topic.icon)}</span><span class="guide-topic-name">${h(topic.name)}</span><span class="guide-topic-arrow">⌄</span></summary>
      <div class="guide-topic-body"><p>${h(topic.description)}</p><button type="button" class="guide-open-button" data-guide-url="${h(topic.url)}">Перейти в тему</button></div>
    </details>`;
  }

  function ruleHtml(rule) {
    return `<article class="guide-rule ${h(rule.cls || '')}"><strong>${h(rule.icon)} ${h(rule.title)}</strong><p>${h(rule.text)}</p>${rule.url ? `<button type="button" class="guide-open-button" data-guide-url="${h(rule.url)}">${h(rule.button || 'Перейти')}</button>` : ''}</article>`;
  }

  function renderGuide() {
    const panel = document.getElementById('panel');
    if (!panel || !authState?.access) return;
    try { setActiveNav('guide'); } catch (_) {}
    const selfCard = document.getElementById('selfProfileCard');
    if (selfCard) selfCard.hidden = true;
    panel.hidden = false;
    panel.classList.remove('profile-panel');
    panel.innerHTML = `
      <div class="guide-head"><h2>🧭 Путеводитель</h2><div class="muted">Краткое руководство для участников Чата Победителей</div></div>
      <section class="guide-intro"><strong>🤗 Всем новичкам — добро пожаловать!</strong><p>Новоприбывшим обязательно нужно указать свой ник и команду в теме «Участники». Ниже можно открыть описание каждой темы и сразу перейти в неё.</p></section>
      <div class="guide-note"><p>📱 На Android ссылки обычно открываются напрямую. Если на iPhone Telegram не открывает ссылку из темы, пост можно переслать себе в «Избранное» и открыть ссылку оттуда.</p></div>
      <h3 class="guide-section-title">Темы чата</h3>
      <div class="guide-list">${topics.map(topicHtml).join('')}</div>
      <div class="guide-event-note">ℹ️ Для отдельных событий при необходимости создаются временные темы. После завершения события они закрываются.</div>
      <h3 class="guide-section-title">Важные правила</h3>
      <div class="guide-rules">${rules.map(ruleHtml).join('')}</div>
      <div class="guide-footnote">Путеводитель собран по действующим правилам и структуре Чата Победителей.</div>`;
    try { window.scrollTo(0, 0); } catch (_) {}
  }

  const nativeRenderPage = renderPage;
  renderPage = function(page) {
    const result = nativeRenderPage(page);
    if (page === 'guide') renderGuide();
    return result;
  };

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-guide-url]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openTelegram(button.dataset.guideUrl);
  }, true);

  window.RoyalGuide = { version: VERSION, render: renderGuide };
  window.__ROYAL_GUIDE_VERSION__ = VERSION;
})();

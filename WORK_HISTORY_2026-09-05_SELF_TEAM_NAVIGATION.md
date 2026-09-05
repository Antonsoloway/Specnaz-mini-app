# 2026-09-05 — v0.6.1 self-team navigation hotfix

## Симптом

При нажатии на membership-плашку собственной команды на главном экране Mini App переход визуально приводил к пустому/чёрному экрану. Нижняя навигация оставалась видимой, а системный Back возвращал на главную. Ошибка воспроизводилась независимо от конкретной активной команды.

## Корневая причина

`profile-card-v0523.js` намеренно скрывает `#panel` на home (`panel.hidden = true`) и показывает отдельную карточку `#selfProfileCard`. Версия `profile-team-link-v061.js .2` только добавляла `data-team` к `.self-membership`, после чего общий legacy router из `app.js` вызывал ordinary `renderTeamDetail(...)`. Карточка команды при этом действительно рендерилась, но оставалась внутри скрытого `#panel`, поэтому пользователь видел пустой фон.

## Исправление

- `profile-team-link-v061.js` обновлён до `0.6.1-profile-team-link.3`.
- Клик по `.self-membership[data-team]` теперь перехватывается самим v0.6.1-модулем до общего `[data-team]` router.
- Ordinary team detail открывается через текущий `renderTeamDetail` path, поэтому существующий `RoyalNav` по-прежнему сохраняет Back state.
- После рендера модуль явно переключает home surfaces: скрывает `#selfProfileCard`, показывает `#panel`, снимает `profile-panel` и запускает штатный forward-scroll-top hook.
- Team identity остаётся `name + game`; encoded `data-team` сохранён для существующих color/search decorators.
- Admin transition по-прежнему использует `RoyalAdminTeamDetailV0600`.
- Release/cache marker: `20260905-v061-self-team-link3`.

## Граница изменения

Frontend-only. Google Sheets, Apps Script, Worker, snapshot schema и CRM-данные не изменялись. Rollback v0.5.59 не изменён.

## Acceptance

После GitHub Pages deployment: полностью закрыть Mini App в Telegram, открыть заново, нажать свою команду на главной. Должна открыться ordinary team detail; Back должен вернуть на прежнюю главную карточку.

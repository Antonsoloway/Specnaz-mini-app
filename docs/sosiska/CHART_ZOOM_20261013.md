# Масштаб и перемещение графиков

Module 0.5.3; release `20261013-v061-sosiska-zoom1`.

Графики команды, выбранного игрока и сравнения получили масштаб по времени, горизонтальное перемещение и ползунок положения во всей истории. Два пальца меняют масштаб около центра жеста, один палец перетаскивает график. Кнопки + / −, стрелки и «Вся история» доступны независимо от жестов. Keyboard: +, −, Left, Right, Home. Ctrl+wheel/trackpad pinch масштабируют около курсора; обычное колесо сохраняет прокрутку страницы. Ось времени и вертикальная шкала перерисовываются для видимого участка. Под графиком показаны точные границы участка и масштаб.

Начальный диапазон — вся загруженная история. Масштаб и положение ограничены настоящими датами и минимальным наблюдаемым интервалом. Серии сравнения используют общий существующий период наблюдений. Разрывы истории не соединяются. Выбор игрока и контекста имеет отдельный диапазон; закрытие модуля очищает состояние. Изменение масштаба не запускает ИИ, игровое слежение или сетевые запросы.

Browser accumulators use retainIntervals:true: сохраняется каждый интервал команды и каждого игрока, включая ранние интервалы после 512 точек. Server accumulators keep their existing bounded default and totals. Source and browser bundle changed together.

Validation: 24 local Node tests pass (UI, release, full-history regression for 801 snapshots). Chromium, 390px, 801 snapshots: buttons zoom/pan, slider to earliest interval, pointer drag, real two-touch pinch, keyboard reset, player switching, no horizontal page overflow or page errors. Mobile screenshot inspected. Full Sosiska CI and exact regenerated period bundle comparison must pass before merge.

var SosiskaPeriod = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // worker/src/sosiska-period.js
  var sosiska_period_exports = {};
  __export(sosiska_period_exports, {
    activityOrder: () => activityOrder,
    comparePeriods: () => comparePeriods,
    createPeriodAccumulator: () => createPeriodAccumulator,
    hourlyDays: () => hourlyDays,
    mskDateRange: () => mskDateRange,
    sortedMembers: () => sortedMembers
  });
  var sortedMembers = (members) => [...members ?? []].sort((a, b) => Number(b.Level ?? 0) + Number(b.Crown ?? 0) - (Number(a.Level ?? 0) + Number(a.Crown ?? 0)) || Number(b.Level ?? 0) - Number(a.Level ?? 0) || String(a.UserId).localeCompare(String(b.UserId)));
  function createPeriodAccumulator(teamId, { retainIntervals = false, membershipHistory = false } = {}) {
    let newer = null, expected = null, head = null, count = 0, from = null, to = null, teamName = "", complete = false;
    const players = /* @__PURE__ */ new Map(), series = [];
    const ensure = (m) => {
      let p = players.get(m.UserId);
      if (!p) {
        p = { userId: m.UserId, name: m.Name, current: count === 0, level: m.Level, crown: m.Crown, levelGain: 0, crownGain: 0, helpGain: 0, observedHours: 0, levelHours: 0, crownHours: 0, levelResets: 0, crownResets: 0, helpResets: 0, joined: 0, left: 0, ...membershipHistory ? { baseline: false, firstSeenAt: null, lastSeenAt: null, lastMember: { ...m }, membershipEvents: [] } : {}, intervals: 0, series: [], hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, hours: 0, levelHours: 0, crownHours: 0, helpHours: 0, levels: 0, crowns: 0, help: 0 })) };
        players.set(m.UserId, p);
      }
      return p;
    };
    const numeric = (v) => Number.isSafeInteger(v) && v >= 0;
    function add(record) {
      if (complete) throw Error("PERIOD_ALREADY_COMPLETE");
      const s = record?.snapshot, n = record?.sequence;
      if (s?.teamId !== teamId || !Number.isSafeInteger(n) || n < 1 || !Array.isArray(s.raw?.Members) || !Number.isFinite(Date.parse(s.capturedAt))) throw Error("PERIOD_INVALID");
      if (expected === null) {
        head = n;
        expected = n;
        to = s.capturedAt;
        teamName = s.raw.TeamName;
      }
      if (n !== expected) throw Error("PERIOD_HISTORY_INCOMPLETE");
      const old = new Map(s.raw.Members.map((m) => [m.UserId, m]));
      if (old.size !== s.raw.Members.length) throw Error("PERIOD_INVALID");
      for (const m of old.values()) {
        const p = ensure(m);
        if (membershipHistory) {
          p.firstSeenAt = s.capturedAt;
          if (!p.lastSeenAt) p.lastSeenAt = s.capturedAt;
          if (n === 1) p.baseline = true;
        }
      }
      if (newer) {
        const dt = (Date.parse(newer.capturedAt) - Date.parse(s.capturedAt)) / 36e5;
        if (!(dt > 0)) throw Error("PERIOD_INVALID_TIME");
        const next = new Map(newer.raw.Members.map((m) => [m.UserId, m]));
        const interval = { from: s.capturedAt, to: newer.capturedAt, hours: dt, levels: 0, crowns: 0, help: 0, active: 0, observed: 0 };
        for (const [id, m] of old) {
          const p = ensure(m), v = next.get(id);
          if (!v) {
            p.left++;
            if (membershipHistory) p.membershipEvents.push({ type: "left", from: s.capturedAt, to: newer.capturedAt });
            continue;
          }
          p.observedHours += dt;
          p.intervals++;
          const point = { from: s.capturedAt, to: newer.capturedAt, hours: dt, levels: null, crowns: null, help: null };
          for (const [field, gain, resets, hours] of [["Level", "levelGain", "levelResets", "levelHours"], ["Crown", "crownGain", "crownResets", "crownHours"], ["HelpCount", "helpGain", "helpResets", null]]) {
            if (!numeric(m[field]) || !numeric(v[field])) continue;
            const delta = v[field] - m[field];
            if (delta < 0) {
              p[resets]++;
              continue;
            }
            p[gain] += delta;
            if (hours) p[hours] += dt;
            point[{ Level: "levels", Crown: "crowns", HelpCount: "help" }[field]] = delta;
          }
          interval.observed++;
          if (point.levels > 0 || point.crowns > 0 || point.help > 0) interval.active++;
          for (const metric of ["levels", "crowns", "help"]) interval[metric] += point[metric] ?? 0;
          appendPoint(p.series, point, retainIntervals);
          addHourly(p.hourly, point);
        }
        appendPoint(series, interval, retainIntervals);
        for (const [id, m] of next) if (!old.has(id)) {
          const p = ensure(m);
          p.joined++;
          if (membershipHistory) p.membershipEvents.push({ type: "joined", from: s.capturedAt, to: newer.capturedAt });
        }
      }
      newer = s;
      from = s.capturedAt;
      count++;
      expected--;
      if (n === 1) {
        if (record.changes?.baseline !== true) throw Error("PERIOD_HISTORY_INCOMPLETE");
        complete = true;
      }
    }
    function result() {
      const rows = [...players.values()].map((p) => ({
        ...p,
        ...membershipHistory ? { lastMember: { ...p.lastMember }, membershipEvents: p.membershipEvents.map((e) => ({ ...e })).reverse() } : {},
        levelsPerHour: p.levelHours ? p.levelGain / p.levelHours : null,
        crownsPerHour: p.crownHours ? p.crownGain / p.crownHours : null,
        series: [...p.series].reverse(),
        hourly: p.hourly.map((h) => ({ ...h, levelsPerHour: h.levelHours ? h.levels / h.levelHours : null, crownsPerHour: h.crownHours ? h.crowns / h.crownHours : null }))
      }));
      rows.sort(activityOrder);
      return {
        teamId,
        teamName,
        from,
        to,
        snapshotCount: count,
        headSequence: head,
        complete,
        hours: count > 1 ? (Date.parse(to) - Date.parse(from)) / 36e5 : 0,
        players: rows,
        series: [...series].reverse(),
        precision: "observed-base-level-and-crown-counters",
        leagueRoundsAvailable: false
      };
    }
    return { add, result };
  }
  var activityOrder = (a, b) => Number(b.levelGain > 0 || b.crownGain > 0 || b.helpGain > 0) - Number(a.levelGain > 0 || a.crownGain > 0 || a.helpGain > 0) || b.levelGain - a.levelGain || b.crownGain - a.crownGain || b.helpGain - a.helpGain || String(a.userId).localeCompare(String(b.userId));
  function appendPoint(list, point, retainIntervals) {
    list.push(point);
    if (!retainIntervals && list.length > 512) {
      const b = list.pop(), a = list.pop(), merged = { from: b.from, to: a.to, hours: a.hours + b.hours, aggregated: true };
      for (const k of ["levels", "crowns", "help", "active", "observed"]) if (k in a) merged[k] = a[k] === null || b[k] === null ? null : a[k] + b[k];
      list.push(merged);
    }
  }
  function addHourly(bins, p) {
    let t = Date.parse(p.from), end = Date.parse(p.to);
    while (t < end) {
      const next = Math.min(end, (Math.floor(t / 36e5) + 1) * 36e5), hours = (next - t) / 36e5, h = bins[(Math.floor(t / 36e5) + 3) % 24];
      h.hours += hours;
      for (const k of ["levels", "crowns", "help"]) if (p[k] !== null) {
        h[k] += p[k] * hours / p.hours;
        h[{ levels: "levelHours", crowns: "crownHours", help: "helpHours" }[k]] += hours;
      }
      t = next;
    }
  }
  function comparePeriods(periods) {
    if (periods.length < 2 || periods.some((p) => !p.complete || p.snapshotCount < 2)) throw Error("COMPARISON_NEEDS_HISTORY");
    const from = new Date(Math.max(...periods.map((p) => Date.parse(p.from)))).toISOString(), to = new Date(Math.min(...periods.map((p) => Date.parse(p.to)))).toISOString();
    if (Date.parse(from) >= Date.parse(to)) throw Error("COMPARISON_NO_OVERLAP");
    return { from, to, teams: periods.map((p) => {
      const points = p.series.filter((x) => Date.parse(x.from) >= Date.parse(from) && Date.parse(x.to) <= Date.parse(to));
      const hours = points.reduce((n, x) => n + x.hours, 0), levels = points.reduce((n, x) => n + x.levels, 0), crowns = points.reduce((n, x) => n + x.crowns, 0), help = points.reduce((n, x) => n + x.help, 0);
      return { teamId: p.teamId, teamName: p.teamName, from: points[0]?.from, to: points.at(-1)?.to, hours, levels, crowns, help, levelsPerHour: hours ? levels / hours : null, crownsPerHour: hours ? crowns / hours : null, series: points };
    }) };
  }
  function hourlyDays(series, hour, metric, from, to) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !["levels", "crowns", "help"].includes(metric)) throw Error("INVALID_HOUR");
    const start = Date.parse(from), end = Date.parse(to), rows = /* @__PURE__ */ new Map();
    if (!(end > start)) return [];
    const offset = 3 * 36e5, dayMs = 864e5;
    for (let day = Math.floor((start + offset) / dayMs) * dayMs - offset; day < end; day += dayMs) {
      const a = day + hour * 36e5, b = a + 36e5;
      if (b <= start || a >= end) continue;
      const date = new Date(day + offset).toISOString().slice(0, 10);
      rows.set(date, { date, hours: 0, gain: 0, intervals: 0 });
    }
    for (const point of series) {
      const a = Date.parse(point.from), b = Date.parse(point.to);
      if (!(b > a) || !Number.isFinite(point[metric]) || point[metric] < 0) continue;
      for (let day = Math.floor((Math.max(a, start) + offset) / dayMs) * dayMs - offset; day < Math.min(b, end); day += dayMs) {
        const left = Math.max(a, start, day + hour * 36e5), right = Math.min(b, end, day + (hour + 1) * 36e5);
        if (right <= left) continue;
        const row = rows.get(new Date(day + offset).toISOString().slice(0, 10));
        if (!row) continue;
        row.hours += (right - left) / 36e5;
        row.gain += point[metric] * (right - left) / (b - a);
        row.intervals++;
      }
    }
    return [...rows.values()].reverse().map((row) => ({ ...row, rate: row.hours ? row.gain / row.hours : null }));
  }
  function mskDateRange(from, to) {
    const valid = (s) => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s) && Number.isFinite(Date.parse(s + "T00:00:00Z")) && (/* @__PURE__ */ new Date(s + "T00:00:00Z")).toISOString().slice(0, 10) === s;
    if (!valid(from) || !valid(to) || from > to) throw Error("INVALID_DATE_RANGE");
    return { from: new Date(Date.parse(from + "T00:00:00Z") - 108e5).toISOString(), to: new Date(Date.parse(to + "T00:00:00Z") + 864e5 - 108e5).toISOString() };
  }
  return __toCommonJS(sosiska_period_exports);
})();

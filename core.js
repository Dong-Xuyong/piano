(function (factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.PianoCore = api;
  }
})(function () {
  var HANDS = { left: 1, right: 1, together: 2 };

  function pad2(n) {
    var s = String(n);
    return s.length < 2 ? "0" + s : s;
  }

  function isFiniteNumber(n) {
    return typeof n === "number" && isFinite(n);
  }

  function isPositiveNumber(n) {
    return isFiniteNumber(n) && n > 0;
  }

  function isDayKey(key) {
    return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key);
  }

  function own(obj, key) {
    return !!obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value;
  }

  function blankStore() {
    return {
      version: 1,
      profile: { weeklyMinutesGoal: null, minimumSessionMinutes: 10 },
      pieces: {},
      sessions: {},
      recordings: [],
      plan: { updatedAt: null, next: [], coachNote: "" }
    };
  }

  function dayKey(date) {
    if (!date) date = new Date();
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function parseNoon(key) {
    var parts = key.split("-");
    return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0));
  }

  function formatUTC(date) {
    return date.getUTCFullYear() + "-" + pad2(date.getUTCMonth() + 1) + "-" + pad2(date.getUTCDate());
  }

  function shift(key, deltaDays) {
    var date = parseNoon(key);
    var delta = typeof deltaDays === "number" && isFinite(deltaDays) ? deltaDays : 0;
    date.setUTCDate(date.getUTCDate() + delta);
    return formatUTC(date);
  }

  function daysBetween(fromKey, toKey) {
    var ms = parseNoon(toKey).getTime() - parseNoon(fromKey).getTime();
    return Math.round(ms / 86400000);
  }

  function mondayOf(key) {
    var back = (parseNoon(key).getUTCDay() + 6) % 7;
    return shift(key, -back);
  }

  function readProfile(data) {
    var src = asObject(data && data.profile);
    var minimum = 10;
    var goal = null;
    if (src && isPositiveNumber(src.minimumSessionMinutes)) minimum = src.minimumSessionMinutes;
    if (src && isPositiveNumber(src.weeklyMinutesGoal)) goal = src.weeklyMinutesGoal;
    return { weeklyMinutesGoal: goal, minimumSessionMinutes: minimum };
  }

  function readPlan(data) {
    var src = asObject(data && data.plan);
    var next = [];
    var updatedAt = null;
    var coachNote = "";
    if (src) {
      if (typeof src.updatedAt === "string") updatedAt = src.updatedAt;
      if (typeof src.coachNote === "string") coachNote = src.coachNote;
      if (Array.isArray(src.next)) {
        for (var i = 0; i < src.next.length; i++) {
          if (typeof src.next[i] === "string") next.push(src.next[i]);
        }
      }
    }
    return { updatedAt: updatedAt, next: next, coachNote: coachNote };
  }

  function sessionsOf(data) {
    var sessions = data && data.sessions;
    if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) return {};
    return sessions;
  }

  function sessionKeys(sessions) {
    var keys = [];
    var raw = Object.keys(sessions);
    for (var i = 0; i < raw.length; i++) {
      if (isDayKey(raw[i])) keys.push(raw[i]);
    }
    keys.sort();
    return keys;
  }

  function readMinutes(sessions, key) {
    if (!own(sessions, key)) return null;
    var session = sessions[key];
    if (isFiniteNumber(session)) return session;
    var obj = asObject(session);
    if (!obj) return 0;
    if (isFiniteNumber(obj.minutes)) return obj.minutes;
    return 0;
  }

  function qualifies(sessions, key, minimum) {
    var minutes = readMinutes(sessions, key);
    return minutes !== null && minutes >= minimum;
  }

  function countStreak(sessions, startKey, minimum) {
    var count = 0;
    var key = startKey;
    while (qualifies(sessions, key, minimum)) {
      count += 1;
      key = shift(key, -1);
    }
    return count;
  }

  function displayLabel(section) {
    if (section && typeof section.label === "string" && section.label !== "") return section.label;
    if (section && typeof section.id === "string") return section.id;
    return "";
  }

  function idKey(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number" && isFinite(value)) return String(value);
    return null;
  }

  function finiteOrNull(value) {
    return isFiniteNumber(value) ? value : null;
  }

  function normalizeSection(raw) {
    var src = asObject(raw);
    if (!src) return null;
    var id = idKey(src.id);
    return {
      id: id === null ? "" : id,
      bars: typeof src.bars === "string" ? src.bars : (isFiniteNumber(src.bars) ? String(src.bars) : ""),
      label: typeof src.label === "string" ? src.label : "",
      targetBpm: finiteOrNull(src.targetBpm),
      latest: null,
      history: []
    };
  }

  function normalizePiece(id, raw) {
    var src = asObject(raw) || {};
    var sections = [];
    var rawSections = Array.isArray(src.sections) ? src.sections : [];
    for (var i = 0; i < rawSections.length; i++) {
      var section = normalizeSection(rawSections[i]);
      if (section) sections.push(section);
    }
    return {
      id: id,
      title: typeof src.title === "string" ? src.title : "",
      composer: typeof src.composer === "string" ? src.composer : "",
      status: typeof src.status === "string" ? src.status : "",
      targetBpm: finiteOrNull(src.targetBpm),
      sections: sections
    };
  }

  function comparePieces(a, b) {
    var aLearn = a.status === "learning" ? 0 : 1;
    var bLearn = b.status === "learning" ? 0 : 1;
    if (aLearn !== bLearn) return aLearn - bLearn;
    var byTitle = a.title.localeCompare(b.title);
    if (byTitle !== 0) return byTitle;
    return a.id.localeCompare(b.id);
  }

  function handRank(hands) {
    return own(HANDS, hands) ? HANDS[hands] : 0;
  }

  function preferEntry(current, next) {
    if (next.cleanBpm > current.cleanBpm) return true;
    if (next.cleanBpm < current.cleanBpm) return false;
    return handRank(next.hands) > handRank(current.hands);
  }

  function buildPieces(data) {
    var src = data && data.pieces;
    var pieces = [];
    var index = Object.create(null);
    if (src && typeof src === "object" && !Array.isArray(src)) {
      var ids = Object.keys(src);
      for (var i = 0; i < ids.length; i++) {
        var piece = normalizePiece(ids[i], src[ids[i]]);
        pieces.push(piece);
        var bySection = Object.create(null);
        index[piece.id] = bySection;
        for (var s = 0; s < piece.sections.length; s++) {
          var section = piece.sections[s];
          if (!own(bySection, section.id)) {
            section._byDate = Object.create(null);
            bySection[section.id] = section;
          }
        }
      }
    }

    var sessions = sessionsOf(data);
    var keys = sessionKeys(sessions);
    for (var k = 0; k < keys.length; k++) {
      var date = keys[k];
      var session = asObject(sessions[date]);
      if (!session || !Array.isArray(session.pieces)) continue;
      for (var r = 0; r < session.pieces.length; r++) {
        var row = asObject(session.pieces[r]);
        if (!row) continue;
        var pieceId = idKey(row.pieceId);
        var sectionId = idKey(row.sectionId);
        if (pieceId === null || sectionId === null) continue;
        var sectionMatch = index[pieceId] && own(index[pieceId], sectionId) ? index[pieceId][sectionId] : null;
        if (!sectionMatch) continue;
        if (!isFiniteNumber(row.cleanBpm)) continue;
        if (row.hands !== "left" && row.hands !== "right" && row.hands !== "together") continue;
        var entry = { date: date, cleanBpm: row.cleanBpm, hands: row.hands };
        var prev = sectionMatch._byDate[date];
        if (!prev || preferEntry(prev, entry)) sectionMatch._byDate[date] = entry;
      }
    }

    for (var p = 0; p < pieces.length; p++) {
      var secs = pieces[p].sections;
      for (var n = 0; n < secs.length; n++) {
        var sec = secs[n];
        var byDate = sec._byDate || Object.create(null);
        var dates = Object.keys(byDate);
        dates.sort();
        var history = [];
        for (var d = 0; d < dates.length; d++) history.push(byDate[dates[d]]);
        sec.history = history;
        sec.latest = history.length ? history[history.length - 1] : null;
        delete sec._byDate;
      }
    }

    pieces.sort(comparePieces);
    return pieces;
  }

  function addEar(map, date, row) {
    var src = asObject(row);
    if (!src || typeof src.drill !== "string") return;
    var drill = src.drill.replace(/^\s+|\s+$/g, "");
    if (!drill) return;
    if (!isFiniteNumber(src.correct)) return;
    if (!isFiniteNumber(src.total) || !(src.total > 0)) return;
    if (!map[drill]) map[drill] = Object.create(null);
    if (!map[drill][date]) map[drill][date] = { correct: 0, total: 0 };
    map[drill][date].correct += src.correct;
    map[drill][date].total += src.total;
  }

  function addSight(map, date, row) {
    var src = asObject(row);
    if (!src) return;
    if (!isFiniteNumber(src.total) || !(src.total > 0)) return;
    if (!map[date]) map[date] = { correct: 0, total: 0, level: null };
    var bucket = map[date];
    bucket.correct += isFiniteNumber(src.correct) ? src.correct : 0;
    bucket.total += src.total;
    if (isFiniteNumber(src.level) && (bucket.level === null || src.level > bucket.level)) {
      bucket.level = src.level;
    }
  }

  function buildEar(data) {
    var map = Object.create(null);
    var sessions = sessionsOf(data);
    var keys = sessionKeys(sessions);
    for (var i = 0; i < keys.length; i++) {
      var session = asObject(sessions[keys[i]]);
      if (!session || !Array.isArray(session.ear)) continue;
      for (var r = 0; r < session.ear.length; r++) addEar(map, keys[i], session.ear[r]);
    }
    var drills = Object.keys(map);
    drills.sort(function (a, b) { return a.localeCompare(b); });
    var out = [];
    for (var d = 0; d < drills.length; d++) {
      var dates = Object.keys(map[drills[d]]);
      dates.sort();
      var points = [];
      for (var p = 0; p < dates.length; p++) {
        var bucket = map[drills[d]][dates[p]];
        points.push({
          date: dates[p],
          correct: bucket.correct,
          total: bucket.total,
          accuracy: bucket.correct / bucket.total
        });
      }
      out.push({ drill: drills[d], points: points });
    }
    return out;
  }

  function buildSight(data) {
    var map = Object.create(null);
    var sessions = sessionsOf(data);
    var keys = sessionKeys(sessions);
    for (var i = 0; i < keys.length; i++) {
      var session = asObject(sessions[keys[i]]);
      if (!session || !Array.isArray(session.sight)) continue;
      for (var r = 0; r < session.sight.length; r++) addSight(map, keys[i], session.sight[r]);
    }
    var dates = Object.keys(map);
    dates.sort();
    var out = [];
    for (var d = 0; d < dates.length; d++) {
      var bucket = map[dates[d]];
      out.push({
        date: dates[d],
        level: bucket.level,
        correct: bucket.correct,
        total: bucket.total,
        accuracy: bucket.correct / bucket.total
      });
    }
    return out;
  }

  function pieceRecord(pieces, pieceId) {
    var key = idKey(pieceId);
    if (key === null || !pieces || typeof pieces !== "object" || Array.isArray(pieces)) return null;
    if (!own(pieces, key)) return null;
    return asObject(pieces[key]);
  }

  function sectionLabelOf(piece, sectionId) {
    if (!piece || !Array.isArray(piece.sections)) return "";
    var key = idKey(sectionId);
    if (key === null) return "";
    for (var i = 0; i < piece.sections.length; i++) {
      var section = asObject(piece.sections[i]);
      if (!section) continue;
      var id = idKey(section.id);
      if (id === key) return typeof section.label === "string" ? section.label : "";
    }
    return "";
  }

  function buildRecordings(data) {
    var src = data && data.recordings;
    var pieces = data && data.pieces;
    var out = [];
    if (!Array.isArray(src)) return out;
    for (var i = 0; i < src.length; i++) {
      var row = asObject(src[i]);
      if (!row || typeof row.date !== "string" || typeof row.url !== "string") continue;
      var piece = pieceRecord(pieces, row.pieceId);
      out.push({
        date: row.date,
        pieceId: idKey(row.pieceId) || "",
        pieceTitle: piece && typeof piece.title === "string" ? piece.title : "",
        sectionId: idKey(row.sectionId) || "",
        sectionLabel: sectionLabelOf(piece, row.sectionId),
        bpm: finiteOrNull(row.bpm),
        url: row.url,
        note: typeof row.note === "string" ? row.note : ""
      });
    }
    out.sort(function (a, b) {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      return a.pieceTitle.localeCompare(b.pieceTitle);
    });
    return out;
  }

  function buildHeatmap(sessions, todayKey) {
    var start = shift(mondayOf(todayKey), -25 * 7);
    var out = [];
    for (var i = 0; i < 26 * 7; i++) {
      var date = shift(start, i);
      var minutes = readMinutes(sessions, date);
      out.push({
        date: date,
        minutes: minutes === null ? 0 : minutes,
        future: date > todayKey
      });
    }
    return out;
  }

  function gapInsight(daysSinceLast) {
    if (daysSinceLast === null) {
      return { kind: "gap", text: "No practice logged yet." };
    }
    if (daysSinceLast >= 3) {
      var unit = daysSinceLast === 1 ? "day" : "days";
      return {
        kind: "gap",
        text: "Last practice was " + daysSinceLast + " " + unit + " ago. A 10-minute session restarts the streak."
      };
    }
    return null;
  }

  function plateauInsights(pieces) {
    var out = [];
    for (var p = 0; p < pieces.length; p++) {
      var piece = pieces[p];
      if (piece.status !== "learning") continue;
      for (var s = 0; s < piece.sections.length; s++) {
        var section = piece.sections[s];
        if (!section.history || section.history.length < 2 || !section.latest) continue;
        var latest = section.latest;
        var prior = null;
        for (var i = section.history.length - 2; i >= 0; i--) {
          if (daysBetween(section.history[i].date, latest.date) >= 14) {
            prior = section.history[i];
            break;
          }
        }
        if (!prior) continue;
        if (latest.cleanBpm <= prior.cleanBpm) {
          var drop = Math.max(1, Math.round(latest.cleanBpm * 0.9));
          out.push({
            kind: "plateau",
            text: displayLabel(section) + " has not gained BPM in 14 days. Drop to " + drop + " and slow-practice."
          });
        }
      }
    }
    return out;
  }

  function mostRecentSectionDate(piece) {
    var best = null;
    for (var i = 0; i < piece.sections.length; i++) {
      var latest = piece.sections[i].latest;
      if (latest && (best === null || latest.date > best)) best = latest.date;
    }
    return best;
  }

  function pieceBefore(a, b) {
    var byTitle = a.title.localeCompare(b.title);
    if (byTitle !== 0) return byTitle < 0;
    return a.id.localeCompare(b.id) < 0;
  }

  function sectionEligible(section) {
    return !!(section.latest && isPositiveNumber(section.targetBpm));
  }

  function weakerSection(a, b) {
    var ra = a.latest.cleanBpm / a.targetBpm;
    var rb = b.latest.cleanBpm / b.targetBpm;
    if (ra < rb) return true;
    if (ra > rb) return false;
    if (a.latest.cleanBpm < b.latest.cleanBpm) return true;
    if (a.latest.cleanBpm > b.latest.cleanBpm) return false;
    return displayLabel(a).localeCompare(displayLabel(b)) < 0;
  }

  function weakestInsight(pieces) {
    var chosen = null;
    var chosenDate = null;
    for (var i = 0; i < pieces.length; i++) {
      if (pieces[i].status !== "learning") continue;
      var date = mostRecentSectionDate(pieces[i]);
      if (date === null) continue;
      if (!chosen || date > chosenDate || (date === chosenDate && pieceBefore(pieces[i], chosen))) {
        chosen = pieces[i];
        chosenDate = date;
      }
    }
    if (!chosen) return null;
    var weakest = null;
    for (var s = 0; s < chosen.sections.length; s++) {
      var section = chosen.sections[s];
      if (!sectionEligible(section)) continue;
      if (!weakest || weakerSection(section, weakest)) weakest = section;
    }
    if (!weakest) return null;
    return {
      kind: "weakest",
      text: displayLabel(weakest) + " is the weakest section (" + weakest.latest.cleanBpm + " of " + weakest.targetBpm + " BPM)."
    };
  }

  function earInsight(ear) {
    var worst = null;
    for (var i = 0; i < ear.length; i++) {
      var points = ear[i].points;
      if (!points || !points.length) continue;
      var start = points.length > 10 ? points.length - 10 : 0;
      var correct = 0;
      var total = 0;
      var n = 0;
      for (var p = start; p < points.length; p++) {
        correct += points[p].correct;
        total += points[p].total;
        n += 1;
      }
      if (!(total > 0)) continue;
      var accuracy = correct / total;
      var drill = ear[i].drill;
      if (!worst || accuracy < worst.accuracy || (accuracy === worst.accuracy && n < worst.n) || (accuracy === worst.accuracy && n === worst.n && drill.localeCompare(worst.drill) < 0)) {
        worst = { drill: drill, accuracy: accuracy, n: n };
      }
    }
    if (!worst) return null;
    return {
      kind: "ear",
      text: worst.drill + " is the weakest ear drill (" + Math.round(worst.accuracy * 100) + "% over the last " + worst.n + " logs)."
    };
  }

  function sightInsight(sight, todayKey, sessionCount) {
    if (!sessionCount) return null;
    var from = shift(todayKey, -6);
    for (var i = 0; i < sight.length; i++) {
      if (sight[i].date >= from && sight[i].date <= todayKey) return null;
    }
    return { kind: "sight", text: "No sight-reading in the last 7 days." };
  }

  function buildInsights(ctx) {
    var insights = [];
    var gap = gapInsight(ctx.daysSinceLast);
    if (gap) insights.push(gap);
    var plateaus = plateauInsights(ctx.pieces);
    for (var i = 0; i < plateaus.length; i++) insights.push(plateaus[i]);
    var weakest = weakestInsight(ctx.pieces);
    if (weakest) insights.push(weakest);
    var ear = earInsight(ctx.ear);
    if (ear) insights.push(ear);
    var sight = sightInsight(ctx.sight, ctx.todayKey, ctx.sessionCount);
    if (sight) insights.push(sight);
    return insights;
  }

  function derive(data, todayKey) {
    try {
      if (!isDayKey(todayKey)) todayKey = dayKey(new Date());
      if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
      var profile = readProfile(data);
      var sessions = sessionsOf(data);
      var keys = sessionKeys(sessions);
      var monday = mondayOf(todayKey);
      var sunday = shift(monday, 6);
      var daysSinceLast = keys.length ? daysBetween(keys[keys.length - 1], todayKey) : null;
      var weekMinutes = 0;
      var loggedDays = 0;
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] >= monday && keys[i] <= sunday) {
          loggedDays += 1;
          var minutes = readMinutes(sessions, keys[i]);
          weekMinutes += minutes === null ? 0 : minutes;
        }
      }
      var streak = 0;
      if (qualifies(sessions, todayKey, profile.minimumSessionMinutes)) {
        streak = countStreak(sessions, todayKey, profile.minimumSessionMinutes);
      } else {
        var yesterday = shift(todayKey, -1);
        if (qualifies(sessions, yesterday, profile.minimumSessionMinutes)) {
          streak = countStreak(sessions, yesterday, profile.minimumSessionMinutes);
        }
      }
      var pieces = buildPieces(data);
      var ear = buildEar(data);
      var sight = buildSight(data);
      return {
        profile: profile,
        consistency: {
          daysSinceLast: daysSinceLast,
          streak: streak,
          weekMinutes: weekMinutes,
          weekGoal: profile.weeklyMinutesGoal,
          loggedDays: loggedDays
        },
        heatmap: buildHeatmap(sessions, todayKey),
        plan: readPlan(data),
        pieces: pieces,
        ear: ear,
        sight: sight,
        recordings: buildRecordings(data),
        insights: buildInsights({
          daysSinceLast: daysSinceLast,
          pieces: pieces,
          ear: ear,
          sight: sight,
          todayKey: todayKey,
          sessionCount: keys.length
        })
      };
    } catch (err) {
      return {
        profile: { weeklyMinutesGoal: null, minimumSessionMinutes: 10 },
        consistency: { daysSinceLast: null, streak: 0, weekMinutes: 0, weekGoal: null, loggedDays: 0 },
        heatmap: [],
        plan: { updatedAt: null, next: [], coachNote: "" },
        pieces: [],
        ear: [],
        sight: [],
        recordings: [],
        insights: [{ kind: "gap", text: "No practice logged yet." }]
      };
    }
  }

  var SCHEMA_VERSION = 2;
  var OWNER = "brook";
  var ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

  function cloneDoc(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return blankStore();
    return JSON.parse(JSON.stringify(doc));
  }

  function schemaOf(doc) {
    if (!doc || typeof doc.schemaVersion !== "number" || !isFinite(doc.schemaVersion)) return 1;
    return doc.schemaVersion;
  }

  function touchHeader(doc, nowIso) {
    if (!own(doc, "version")) doc.version = 1;
    var current = schemaOf(doc);
    doc.schemaVersion = current > SCHEMA_VERSION ? current : SCHEMA_VERSION;
    doc.owner = OWNER;
    if (typeof nowIso === "string" && nowIso) doc.updatedAt = nowIso;
    return doc;
  }

  function todayKey(date) {
    var d = date instanceof Date ? date : new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Lisbon",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(d);
      var year = "";
      var month = "";
      var day = "";
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "year") year = parts[i].value;
        if (parts[i].type === "month") month = parts[i].value;
        if (parts[i].type === "day") day = parts[i].value;
      }
      var key = year + "-" + month + "-" + day;
      if (isDayKey(key)) return key;
    } catch (err) {}
    return dayKey(d);
  }

  function weekDates(key) {
    if (!isDayKey(key)) return [];
    var start = mondayOf(key);
    var out = [];
    for (var i = 0; i < 7; i++) out.push(shift(start, i));
    return out;
  }

  function trimText(value) {
    if (typeof value !== "string") return "";
    return value.replace(/^\s+|\s+$/g, "");
  }

  function normalizeEntries(day) {
    var src = asObject(day);
    if (!src || !Array.isArray(src.entries)) return [];
    var out = [];
    for (var i = 0; i < src.entries.length; i++) {
      var row = asObject(src.entries[i]);
      if (!row || typeof row.id !== "string" || row.id === "") continue;
      var copy = {};
      var keys = Object.keys(row);
      for (var k = 0; k < keys.length; k++) copy[keys[k]] = row[keys[k]];
      if (typeof copy.pieceId !== "string" || copy.pieceId === "") copy.pieceId = null;
      copy.pieceTitle = copy.pieceId ? "" : (typeof copy.pieceTitle === "string" ? copy.pieceTitle : "");
      if (typeof copy.note !== "string") copy.note = "";
      if (copy.at !== null && typeof copy.at !== "string") copy.at = null;
      if (copy.deleted === true) copy.deleted = true;
      else delete copy.deleted;
      out.push(copy);
    }
    return out;
  }

  function liveEntries(day) {
    var rows = normalizeEntries(day);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].deleted !== true) out.push(rows[i]);
    }
    return out;
  }

  function recomputeMinutes(day) {
    if (!day || !Array.isArray(day.entries) || day.entries.length === 0) return;
    var sum = 0;
    var live = 0;
    for (var i = 0; i < day.entries.length; i++) {
      var row = day.entries[i];
      if (!row || typeof row !== "object" || row.deleted === true) continue;
      if (!isPositiveNumber(row.minutes)) continue;
      sum += row.minutes;
      live += 1;
    }
    day.minutes = live > 0 ? sum : 0;
  }

  function collectIds(doc) {
    var used = Object.create(null);
    var sessions = sessionsOf(doc);
    var keys = Object.keys(sessions);
    for (var i = 0; i < keys.length; i++) {
      var day = asObject(sessions[keys[i]]);
      if (!day || !Array.isArray(day.entries)) continue;
      for (var e = 0; e < day.entries.length; e++) {
        var row = asObject(day.entries[e]);
        if (row && typeof row.id === "string") used[row.id] = true;
      }
    }
    return used;
  }

  function randomId(used) {
    var n, c, id;
    for (n = 0; n < 32; n++) {
      id = "ps_";
      for (c = 0; c < 6; c++) {
        id += ID_ALPHABET.charAt(Math.floor(Math.random() * ID_ALPHABET.length));
      }
      if (id !== "ps_legacy" && !used[id]) return id;
    }
    return "ps_zzzzzz";
  }

  function entryIdOk(id) {
    return typeof id === "string" && /^(ps_[a-z0-9]{6}|ps_legacy)$/.test(id);
  }

  function buildEntry(partial, nowIso, id) {
    var src = asObject(partial) || {};
    var pieceId = null;
    if (typeof src.pieceId === "string" && src.pieceId !== "") pieceId = src.pieceId;
    var created = {
      id: id,
      at: typeof src.at === "string" ? src.at : (src.at === null ? null : nowIso),
      minutes: src.minutes,
      pieceId: pieceId,
      pieceTitle: pieceId ? "" : trimText(src.pieceTitle),
      note: trimText(src.note),
      source: "app",
      updatedAt: nowIso
    };
    var keys = Object.keys(src);
    for (var i = 0; i < keys.length; i++) {
      if (!own(created, keys[i])) created[keys[i]] = src[keys[i]];
    }
    return created;
  }

  function ensureSessions(doc) {
    if (!doc.sessions || typeof doc.sessions !== "object" || Array.isArray(doc.sessions)) {
      doc.sessions = {};
    }
    return doc.sessions;
  }

  function addEntry(doc, dateKey, entry, nowIso) {
    if (!isDayKey(dateKey)) throw new Error("Bad date");
    var partial = asObject(entry) || {};
    if (!isPositiveNumber(partial.minutes)) throw new Error("Minutes must be greater than 0");
    var next = cloneDoc(doc);
    var sessions = ensureSessions(next);
    var day = asObject(sessions[dateKey]);
    if (!day) {
      day = { updatedAt: nowIso, minutes: 0 };
      sessions[dateKey] = day;
    }
    if (!Array.isArray(day.entries)) day.entries = [];
    if (day.entries.length === 0 && isPositiveNumber(day.minutes)) {
      day.entries.push({
        id: "ps_legacy",
        at: null,
        minutes: day.minutes,
        pieceId: null,
        pieceTitle: "",
        note: "",
        source: "legacy",
        updatedAt: nowIso
      });
    }
    var used = collectIds(next);
    var id = entryIdOk(partial.id) && !used[partial.id] ? partial.id : randomId(used);
    day.entries.push(buildEntry(partial, nowIso, id));
    day.updatedAt = nowIso;
    recomputeMinutes(day);
    touchHeader(next, nowIso);
    return next;
  }

  function isLegacyEntry(row) {
    return !!row && (row.id === "ps_legacy" || row.source === "legacy");
  }

  function applyPiece(row, patch) {
    var pieceId = null;
    if (typeof patch.pieceId === "string" && patch.pieceId !== "") pieceId = patch.pieceId;
    row.pieceId = pieceId;
    row.pieceTitle = pieceId ? "" : trimText(patch.pieceTitle);
  }

  function editEntry(doc, dateKey, id, patch, nowIso) {
    if (!isDayKey(dateKey) || typeof id !== "string") return cloneDoc(doc);
    var changes = asObject(patch) || {};
    var next = cloneDoc(doc);
    var day = asObject(ensureSessions(next)[dateKey]);
    if (!day || !Array.isArray(day.entries)) return next;
    var row = null;
    for (var i = 0; i < day.entries.length; i++) {
      if (day.entries[i] && day.entries[i].id === id) {
        row = day.entries[i];
        break;
      }
    }
    if (!row) return next;
    if (isLegacyEntry(row)) {
      applyPiece(row, changes);
    } else {
      if (own(changes, "minutes")) {
        if (!isPositiveNumber(changes.minutes)) throw new Error("Minutes must be greater than 0");
        row.minutes = changes.minutes;
      }
      if (own(changes, "note")) row.note = trimText(changes.note);
      if (own(changes, "pieceId") || own(changes, "pieceTitle")) applyPiece(row, changes);
      if (own(changes, "at")) row.at = typeof changes.at === "string" || changes.at === null ? changes.at : row.at;
    }
    row.updatedAt = nowIso;
    day.updatedAt = nowIso;
    recomputeMinutes(day);
    touchHeader(next, nowIso);
    return next;
  }

  function deleteEntry(doc, dateKey, id, nowIso) {
    if (!isDayKey(dateKey) || typeof id !== "string") return cloneDoc(doc);
    var next = cloneDoc(doc);
    var day = asObject(ensureSessions(next)[dateKey]);
    if (!day || !Array.isArray(day.entries)) return next;
    var found = false;
    for (var i = 0; i < day.entries.length; i++) {
      if (day.entries[i] && day.entries[i].id === id) {
        day.entries[i].deleted = true;
        day.entries[i].updatedAt = nowIso;
        found = true;
        break;
      }
    }
    if (!found) return next;
    day.updatedAt = nowIso;
    recomputeMinutes(day);
    touchHeader(next, nowIso);
    return next;
  }

  function preferNewer(incoming, current) {
    var kept = Date.parse(current && current.updatedAt);
    var next = Date.parse(incoming && incoming.updatedAt);
    if (!isFinite(next)) return false;
    if (!isFinite(kept)) return true;
    return next > kept;
  }

  function mergeEntryArrays(remoteEntries, localEntries) {
    var order = [];
    var map = Object.create(null);
    function take(raw, allowReplace) {
      var row = asObject(raw);
      if (!row || typeof row.id !== "string" || row.id === "") return;
      if (!own(map, row.id)) {
        order.push(row.id);
        map[row.id] = JSON.parse(JSON.stringify(row));
        return;
      }
      if (allowReplace && preferNewer(row, map[row.id])) {
        map[row.id] = JSON.parse(JSON.stringify(row));
      }
    }
    var i;
    var remoteList = Array.isArray(remoteEntries) ? remoteEntries : [];
    var localList = Array.isArray(localEntries) ? localEntries : [];
    for (i = 0; i < remoteList.length; i++) take(remoteList[i], false);
    for (i = 0; i < localList.length; i++) take(localList[i], true);
    var out = [];
    for (i = 0; i < order.length; i++) out.push(map[order[i]]);
    return out;
  }

  function newerStamp(a, b) {
    var ia = typeof a === "string" ? Date.parse(a) : NaN;
    var ib = typeof b === "string" ? Date.parse(b) : NaN;
    if (isFinite(ia) && isFinite(ib)) return ia >= ib ? a : b;
    if (isFinite(ia)) return a;
    if (isFinite(ib)) return b;
    if (typeof a === "string") return a;
    if (typeof b === "string") return b;
    return null;
  }

  function mergeEntries(local, remote) {
    if (!remote || typeof remote !== "object" || Array.isArray(remote)) {
      var alone = cloneDoc(local);
      return touchHeader(alone, alone.updatedAt);
    }
    var result = cloneDoc(remote);
    if (schemaOf(remote) > SCHEMA_VERSION) return result;
    var localSessions = sessionsOf(local);
    var remoteSessions = sessionsOf(remote);
    if (!result.sessions || typeof result.sessions !== "object" || Array.isArray(result.sessions)) {
      result.sessions = {};
    }
    var seen = Object.create(null);
    var dates = [];
    var keys = Object.keys(remoteSessions).concat(Object.keys(localSessions));
    var i;
    for (i = 0; i < keys.length; i++) {
      if (!isDayKey(keys[i]) || seen[keys[i]]) continue;
      seen[keys[i]] = true;
      dates.push(keys[i]);
    }
    dates.sort();
    for (i = 0; i < dates.length; i++) {
      var date = dates[i];
      var lDay = asObject(localSessions[date]);
      var rDay = asObject(remoteSessions[date]);
      var localHas = !!(lDay && Array.isArray(lDay.entries) && lDay.entries.length > 0);
      if (rDay && !localHas) continue;
      if (!rDay && lDay) {
        var added = JSON.parse(JSON.stringify(lDay));
        recomputeMinutes(added);
        result.sessions[date] = added;
        continue;
      }
      if (!rDay || !lDay) continue;
      var day = result.sessions[date];
      day.entries = mergeEntryArrays(rDay.entries, lDay.entries);
      recomputeMinutes(day);
      day.updatedAt = newerStamp(lDay.updatedAt, rDay.updatedAt);
    }
    if (!own(result, "version")) result.version = 1;
    var maxVersion = Math.max(schemaOf(local), schemaOf(remote));
    result.schemaVersion = maxVersion > SCHEMA_VERSION ? maxVersion : Math.max(maxVersion, SCHEMA_VERSION);
    result.owner = OWNER;
    result.updatedAt = newerStamp(local && local.updatedAt, remote.updatedAt);
    return result;
  }

  function entriesForWeek(doc, key) {
    if (!isDayKey(key)) return [];
    var dates = weekDates(key);
    var allow = Object.create(null);
    var i;
    for (i = 0; i < dates.length; i++) allow[dates[i]] = true;
    var sessions = sessionsOf(doc);
    var keys = sessionKeys(sessions);
    var rows = [];
    for (i = 0; i < keys.length; i++) {
      if (!allow[keys[i]]) continue;
      var entries = liveEntries(sessions[keys[i]]);
      for (var e = 0; e < entries.length; e++) {
        rows.push({ date: keys[i], entry: entries[e] });
      }
    }
    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      var ta = Date.parse((a.entry && (a.entry.at || a.entry.updatedAt)) || "");
      var tb = Date.parse((b.entry && (b.entry.at || b.entry.updatedAt)) || "");
      if (!isFinite(ta)) ta = 0;
      if (!isFinite(tb)) tb = 0;
      if (ta !== tb) return tb - ta;
      var ida = a.entry && a.entry.id ? a.entry.id : "";
      var idb = b.entry && b.entry.id ? b.entry.id : "";
      if (ida === idb) return 0;
      return ida < idb ? 1 : -1;
    });
    return rows;
  }

  function entryLabel(doc, entry) {
    if (!entry || typeof entry !== "object") return "Unspecified";
    if (typeof entry.pieceId === "string" && entry.pieceId) {
      var rec = pieceRecord(doc && doc.pieces, entry.pieceId);
      if (rec && typeof rec.title === "string" && rec.title !== "") return rec.title;
      return entry.pieceId;
    }
    if (typeof entry.pieceTitle === "string" && entry.pieceTitle !== "") return entry.pieceTitle;
    return "Unspecified";
  }

  function minutesByPiece(doc, days) {
    var allow = null;
    if (Array.isArray(days)) {
      allow = Object.create(null);
      for (var d = 0; d < days.length; d++) {
        if (isDayKey(days[d])) allow[days[d]] = true;
      }
    } else if (isDayKey(days)) {
      var dates = weekDates(days);
      allow = Object.create(null);
      for (var w = 0; w < dates.length; w++) allow[dates[w]] = true;
    }
    var sessions = sessionsOf(doc);
    var keys = sessionKeys(sessions);
    var buckets = Object.create(null);
    var order = [];
    for (var i = 0; i < keys.length; i++) {
      if (allow && !allow[keys[i]]) continue;
      var entries = liveEntries(sessions[keys[i]]);
      for (var e = 0; e < entries.length; e++) {
        var entry = entries[e];
        var bucketKey;
        if (entry.pieceId) bucketKey = "id:" + entry.pieceId;
        else if (entry.pieceTitle) bucketKey = "title:" + entry.pieceTitle;
        else bucketKey = "unspecified";
        if (!buckets[bucketKey]) {
          buckets[bucketKey] = {
            pieceId: entry.pieceId || null,
            pieceTitle: entryLabel(doc, entry),
            minutes: 0
          };
          order.push(bucketKey);
        }
        if (isPositiveNumber(entry.minutes)) buckets[bucketKey].minutes += entry.minutes;
      }
    }
    var out = [];
    for (var n = 0; n < order.length; n++) out.push(buckets[order[n]]);
    out.sort(function (a, b) {
      if (a.minutes !== b.minutes) return b.minutes - a.minutes;
      return String(a.pieceTitle).localeCompare(String(b.pieceTitle));
    });
    return out;
  }

  function pieceChoices(doc, selectedId) {
    var src = doc && doc.pieces;
    var out = [];
    if (!src || typeof src !== "object" || Array.isArray(src)) return out;
    var ids = Object.keys(src);
    for (var i = 0; i < ids.length; i++) {
      var piece = asObject(src[ids[i]]);
      if (!piece) continue;
      var status = typeof piece.status === "string" ? piece.status : "";
      if (status === "planned" && ids[i] !== selectedId) continue;
      out.push({
        id: ids[i],
        title: typeof piece.title === "string" && piece.title !== "" ? piece.title : ids[i],
        status: status
      });
    }
    out.sort(function (a, b) {
      var byTitle = a.title.localeCompare(b.title);
      if (byTitle !== 0) return byTitle;
      return a.id.localeCompare(b.id);
    });
    return out;
  }

  function seedDoc() {
    return {
      version: 1,
      schemaVersion: 2,
      owner: "brook",
      updatedAt: null,
      profile: {
        weeklyMinutesGoal: null,
        minimumSessionMinutes: 10
      },
      pieces: {},
      sessions: {},
      recordings: [],
      plan: {
        updatedAt: null,
        next: [],
        coachNote: ""
      }
    };
  }

  function demoDoc() {
    return {
      version: 1,
      schemaVersion: 2,
      owner: "brook",
      updatedAt: "2026-01-13T18:00:00.000Z",
      profile: {
        weeklyMinutesGoal: 60,
        minimumSessionMinutes: 10
      },
      pieces: {
        "example-etude": {
          title: "EXAMPLE Etude",
          composer: "EXAMPLE",
          status: "learning",
          targetBpm: null,
          sections: []
        },
        "example-waltz": {
          title: "EXAMPLE Waltz",
          composer: "EXAMPLE",
          status: "maintaining",
          targetBpm: null,
          sections: []
        }
      },
      sessions: {
        "2026-01-12": {
          updatedAt: "2026-01-12T19:00:00.000Z",
          minutes: 30,
          pieces: [],
          ear: [],
          sight: [],
          note: "",
          entries: [
            {
              id: "ps_demo01",
              at: "2026-01-12T18:00:00.000Z",
              minutes: 20,
              pieceId: "example-etude",
              pieceTitle: "",
              note: "Hands separate",
              source: "app",
              updatedAt: "2026-01-12T18:00:00.000Z"
            },
            {
              id: "ps_demo02",
              at: "2026-01-12T19:00:00.000Z",
              minutes: 10,
              pieceId: null,
              pieceTitle: "EXAMPLE scale",
              note: "",
              source: "app",
              updatedAt: "2026-01-12T19:00:00.000Z"
            }
          ]
        },
        "2026-01-13": {
          updatedAt: "2026-01-13T18:00:00.000Z",
          minutes: 15,
          pieces: [],
          ear: [],
          sight: [],
          note: "Keep the pulse"
        }
      },
      recordings: [],
      plan: {
        updatedAt: null,
        next: [
          "EXAMPLE keep the pulse",
          "EXAMPLE count aloud",
          "EXAMPLE stop while it is clean"
        ],
        coachNote: "EXAMPLE short sessions count."
      }
    };
  }

  function isConflict(err) {
    var msg = "";
    if (err && typeof err.message === "string") msg = err.message;
    else if (typeof err === "string") msg = err;
    return msg.indexOf("another device") !== -1;
  }

  function saveWithRetry(saveFn) {
    return Promise.resolve().then(function () {
      return saveFn();
    }).catch(function (err) {
      if (!isConflict(err)) return Promise.reject(err);
      return saveFn();
    });
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    blankStore: blankStore,
    dayKey: dayKey,
    shift: shift,
    derive: derive,
    todayKey: todayKey,
    weekDates: weekDates,
    seedDoc: seedDoc,
    demoDoc: demoDoc,
    schemaVersionOf: schemaOf,
    normalizeEntries: normalizeEntries,
    liveEntries: liveEntries,
    addEntry: addEntry,
    editEntry: editEntry,
    deleteEntry: deleteEntry,
    mergeEntries: mergeEntries,
    entriesForWeek: entriesForWeek,
    minutesByPiece: minutesByPiece,
    entryLabel: entryLabel,
    pieceChoices: pieceChoices,
    isConflict: isConflict,
    saveWithRetry: saveWithRetry
  };
});

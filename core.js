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

  return {
    blankStore: blankStore,
    dayKey: dayKey,
    shift: shift,
    derive: derive
  };
});

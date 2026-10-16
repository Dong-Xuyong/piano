/**
 * Piano dashboard plus a practice log.
 * The dashboard renders PianoCore.derive(). #/log writes practice entries
 * through GhSync (piano.json): sessions[date].entries, that day's minutes
 * and updatedAt, and the top-level updatedAt, schemaVersion, and owner.
 * Minutes stay the sum of the live entries. Every other field is merged
 * from the remote file and is not edited here.
 */
(function () {
  "use strict";

  var APP_ID = "piano";
  var SAVE_DELAY = 2500;
  var pulling = false;
  var state = {
    doc: null,
    demo: false,
    readOnly: false,
    dirty: false,
    generation: 0,
    savePending: false,
    saveTimer: null,
    stopped: false,
    editing: null
  };

  function messageOf(err) {
    if (err && typeof err.message === "string" && err.message) return err.message;
    if (typeof err === "string" && err) return err;
    return "Sync failed";
  }

  function setSync(text) {
    var node = document.getElementById("sync");
    if (node) node.textContent = text;
  }

  function formatTime(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function isNum(n) {
    return typeof n === "number" && isFinite(n);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isHttpUrl(url) {
    return (
      typeof url === "string" &&
      (url.indexOf("https://") === 0 || url.indexOf("http://") === 0)
    );
  }

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function mount(id) {
    var node = document.getElementById(id);
    if (!node) return null;
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function addText(parent, text) {
    var span = document.createElement("span");
    span.textContent = text;
    parent.appendChild(span);
    return span;
  }

  function bar(percent) {
    var wrap = el("div", "bar");
    var span = document.createElement("span");
    var width = percent;
    if (width < 0) width = 0;
    if (width > 100) width = 100;
    span.style.width = width + "%";
    wrap.appendChild(span);
    return wrap;
  }

  function heading(text) {
    var h = document.createElement("h2");
    h.textContent = text;
    return h;
  }

  function muted(text) {
    var p = el("p", "muted");
    p.textContent = text;
    return p;
  }

  function handsShort(hands) {
    if (hands === "left") return "LH";
    if (hands === "right") return "RH";
    if (hands === "together") return "HT";
    return "";
  }

  function lastPracticeLabel(days) {
    if (!isNum(days)) return "None";
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days >= 2) return days + " days ago";
    return "None";
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function sparkline(values, yAt) {
    var nums = [];
    var i;
    for (i = 0; i < values.length; i++) {
      if (isNum(values[i])) nums.push(values[i]);
    }
    if (nums.length < 2) return null;

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "chart");
    svg.setAttribute("viewBox", "0 0 100 40");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    var poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "currentColor");
    poly.setAttribute("stroke-width", "1.5");
    poly.setAttribute("vector-effect", "non-scaling-stroke");

    var parts = [];
    var n = nums.length;
    for (i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 100;
      var y = yAt(nums[i]);
      if (!isNum(y)) continue;
      parts.push(round1(x) + "," + round1(y));
    }
    if (parts.length < 2) return null;
    poly.setAttribute("points", parts.join(" "));
    svg.appendChild(poly);
    return svg;
  }

  function yInRange(value, min, max) {
    var pad = 2;
    var inner = 40 - pad * 2;
    if (max === min) return 20;
    var t = (value - min) / (max - min);
    return pad + (1 - t) * inner;
  }

  function yAccuracy(value) {
    var pad = 2;
    var inner = 40 - pad * 2;
    var c = value;
    if (c < 0) c = 0;
    if (c > 1) c = 1;
    return pad + (1 - c) * inner;
  }

  function bpmSeries(history) {
    var values = [];
    var i;
    for (i = 0; i < history.length; i++) {
      var point = history[i];
      if (point && typeof point === "object" && isNum(point.cleanBpm)) {
        values.push(point.cleanBpm);
      }
    }
    return values;
  }

  function bpmChart(history) {
    var values = bpmSeries(history);
    if (values.length < 2) return null;
    var min = values[0];
    var max = values[0];
    var i;
    for (i = 1; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    return sparkline(values, function (v) {
      return yInRange(v, min, max);
    });
  }

  function accuracySeries(points) {
    var values = [];
    var i;
    for (i = 0; i < points.length; i++) {
      var point = points[i];
      if (point && typeof point === "object" && isNum(point.accuracy)) {
        values.push(point.accuracy);
      }
    }
    return values;
  }

  function accuracyChart(points) {
    var values = accuracySeries(points);
    if (values.length < 2) return null;
    return sparkline(values, yAccuracy);
  }

  function renderConsistency(consistency) {
    var root = mount("consistency");
    if (!root) return;
    var data = consistency && typeof consistency === "object" ? consistency : {};
    var streak = isNum(data.streak) ? data.streak : 0;
    var weekMinutes = isNum(data.weekMinutes) ? data.weekMinutes : 0;
    var weekGoal = data.weekGoal;
    var stats = el("div", "stats");

    var streakStat = el("div", "stat");
    streakStat.appendChild(el("div", "muted")).textContent = "Streak";
    addText(streakStat, streak === 1 ? "1 day" : streak + " days");
    stats.appendChild(streakStat);

    var lastStat = el("div", "stat");
    lastStat.appendChild(el("div", "muted")).textContent = "Last";
    addText(lastStat, lastPracticeLabel(data.daysSinceLast));
    stats.appendChild(lastStat);

    var weekStat = el("div", "stat");
    weekStat.appendChild(el("div", "muted")).textContent = "This week";
    addText(weekStat, weekMinutes + " min");
    if (isNum(weekGoal) && weekGoal > 0) {
      weekStat.appendChild(bar((weekMinutes / weekGoal) * 100));
      weekStat.appendChild(muted("of " + weekGoal));
    }
    stats.appendChild(weekStat);

    root.appendChild(stats);
  }

  function renderPlan(plan) {
    var root = mount("plan");
    if (!root) return;
    var data = plan && typeof plan === "object" ? plan : {};
    var next = asArray(data.next);
    var note = typeof data.coachNote === "string" ? data.coachNote : "";
    var h = heading("Next session");
    h.className = "h2";
    root.appendChild(h);

    var strings = [];
    var i;
    for (i = 0; i < next.length && strings.length < 3; i++) {
      if (typeof next[i] === "string") strings.push(next[i]);
    }

    if (!strings.length && note === "") {
      root.appendChild(muted("No plan yet."));
      return;
    }

    if (strings.length) {
      var list = el("ol", "tasks");
      for (i = 0; i < strings.length; i++) {
        var li = document.createElement("li");
        li.textContent = strings[i];
        list.appendChild(li);
      }
      root.appendChild(list);
    }
    if (note !== "") root.appendChild(muted(note));
  }

  function renderHeatmap(days) {
    var root = mount("heatmap");
    if (!root) return;
    root.appendChild(heading("Practice"));
    var card = el("div", "card");
    var heat = el("div", "heat");
    var list = asArray(days);
    var i;
    for (i = 0; i < list.length; i++) {
      var day = list[i] && typeof list[i] === "object" ? list[i] : {};
      var date = typeof day.date === "string" ? day.date : "";
      var minutes = isNum(day.minutes) ? day.minutes : 0;
      var mark = document.createElement("i");
      mark.setAttribute("title", date + " \u00b7 " + minutes + " min");
      if (minutes === 0 || day.future === true) {
        mark.className = "off";
      } else {
        mark.style.opacity = String(Math.max(0.2, Math.min(1, minutes / 45)));
      }
      heat.appendChild(mark);
    }
    card.appendChild(heat);
    root.appendChild(card);
  }

  function sectionLabel(section) {
    if (typeof section.label === "string" && section.label !== "") return section.label;
    if (typeof section.id === "string" && section.id !== "") return section.id;
    if (isNum(section.id)) return String(section.id);
    return "";
  }

  function renderPieces(pieces) {
    var root = mount("pieces");
    if (!root) return;
    root.appendChild(heading("Pieces"));
    var list = asArray(pieces);
    if (!list.length) {
      root.appendChild(muted("No pieces yet."));
      return;
    }

    var i;
    for (i = 0; i < list.length; i++) {
      var piece = list[i];
      if (!piece || typeof piece !== "object") continue;
      var card = el("div", "card");
      var row = el("div", "row");
      addText(row, typeof piece.title === "string" ? piece.title : "");
      var badge = el("span", "badge");
      badge.textContent = typeof piece.status === "string" ? piece.status : "";
      row.appendChild(badge);
      card.appendChild(row);

      if (typeof piece.composer === "string" && piece.composer !== "") {
        card.appendChild(muted(piece.composer));
      }
      if (isNum(piece.targetBpm)) {
        card.appendChild(muted("Target " + piece.targetBpm + " BPM"));
      }

      var sections = asArray(piece.sections);
      var s;
      for (s = 0; s < sections.length; s++) {
        var section = sections[s];
        if (!section || typeof section !== "object") continue;
        var latest = section.latest && typeof section.latest === "object" ? section.latest : null;
        var secRow = el("div", "row");
        addText(secRow, sectionLabel(section));
        if (latest) {
          var short = handsShort(latest.hands);
          if (short) {
            var handsBadge = el("span", "badge");
            handsBadge.textContent = short;
            secRow.appendChild(handsBadge);
          }
        }
        if (latest && isNum(latest.cleanBpm)) {
          addText(secRow, latest.cleanBpm + " BPM");
        } else {
          addText(secRow, "No tempo yet");
        }
        card.appendChild(secRow);

        if (latest && isNum(section.targetBpm) && section.targetBpm > 0 && isNum(latest.cleanBpm)) {
          card.appendChild(bar((latest.cleanBpm / section.targetBpm) * 100));
        }

        var chart = bpmChart(asArray(section.history));
        if (chart) card.appendChild(chart);
      }
      root.appendChild(card);
    }
  }

  function renderEar(drills) {
    var root = mount("ear");
    if (!root) return;
    root.appendChild(heading("Ear training"));
    var list = asArray(drills);
    if (!list.length) {
      root.appendChild(muted("No ear scores yet."));
      return;
    }

    var i;
    for (i = 0; i < list.length; i++) {
      var drill = list[i];
      if (!drill || typeof drill !== "object") continue;
      var card = el("div", "card");
      var name = document.createElement("div");
      name.textContent = typeof drill.drill === "string" ? drill.drill : "";
      card.appendChild(name);

      var points = asArray(drill.points);
      var chart = accuracyChart(points);
      if (chart) card.appendChild(chart);

      var last = points.length ? points[points.length - 1] : null;
      if (last && typeof last === "object" && isNum(last.accuracy)) {
        card.appendChild(muted(Math.round(last.accuracy * 100) + "% last"));
      }
      root.appendChild(card);
    }
  }

  function renderSight(scores) {
    var root = mount("sight");
    if (!root) return;
    root.appendChild(heading("Sight reading"));
    var list = asArray(scores);
    if (!list.length) {
      root.appendChild(muted("No sight-reading scores yet."));
      return;
    }

    var card = el("div", "card");
    var chart = accuracyChart(list);
    if (chart) card.appendChild(chart);

    var last = list[list.length - 1];
    if (last && typeof last === "object" && isNum(last.accuracy)) {
      var level = last.level;
      var levelText = level === undefined || level === null ? "" : String(level);
      card.appendChild(muted("Level " + levelText + " \u00b7 " + Math.round(last.accuracy * 100) + "%"));
    }
    root.appendChild(card);
  }

  function renderRecordings(items) {
    var root = mount("recordings");
    if (!root) return;
    root.appendChild(heading("Recordings"));
    var list = asArray(items);
    if (!list.length) {
      root.appendChild(muted("No recordings yet."));
      return;
    }

    var card = el("div", "card");
    var i;
    for (i = 0; i < list.length; i++) {
      var item = list[i] && typeof list[i] === "object" ? list[i] : {};
      var row = el("div", "row");
      addText(row, typeof item.date === "string" ? item.date : "");
      addText(row, typeof item.pieceTitle === "string" ? item.pieceTitle : "");
      if (typeof item.sectionLabel === "string" && item.sectionLabel !== "") {
        addText(row, item.sectionLabel);
      }
      if (isNum(item.bpm)) addText(row, item.bpm + " BPM");
      if (isHttpUrl(item.url)) {
        var link = document.createElement("a");
        link.setAttribute("href", item.url);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
        link.textContent = "Listen";
        row.appendChild(link);
      }
      if (typeof item.note === "string" && item.note !== "") {
        var note = el("span", "muted");
        note.textContent = item.note;
        row.appendChild(note);
      }
      card.appendChild(row);
    }
    root.appendChild(card);
  }

  function renderInsights(items) {
    var root = mount("insights");
    if (!root) return;
    root.appendChild(heading("Insights"));
    var list = asArray(items);
    var texts = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var item = list[i];
      if (item && typeof item === "object" && typeof item.text === "string") {
        texts.push(item.text);
      }
    }
    if (!texts.length) {
      root.appendChild(muted("No insights yet."));
      return;
    }
    var card = el("div", "card");
    for (i = 0; i < texts.length; i++) {
      var p = el("p", "insight");
      p.textContent = texts[i];
      card.appendChild(p);
    }
    root.appendChild(card);
  }

  function render(view) {
    var data = view && typeof view === "object" ? view : {};
    renderConsistency(data.consistency);
    renderPlan(data.plan);
    renderHeatmap(data.heatmap);
    renderPieces(data.pieces);
    renderEar(data.ear);
    renderSight(data.sight);
    renderRecordings(data.recordings);
    renderInsights(data.insights);
    renderLog();
  }

  function coreReady() {
    return (
      typeof GhSync !== "undefined" &&
      GhSync &&
      typeof GhSync.load === "function" &&
      typeof GhSync.save === "function" &&
      typeof PianoCore !== "undefined" &&
      PianoCore &&
      typeof PianoCore.blankStore === "function" &&
      typeof PianoCore.dayKey === "function" &&
      typeof PianoCore.derive === "function" &&
      typeof PianoCore.addEntry === "function" &&
      typeof PianoCore.mergeEntries === "function" &&
      typeof PianoCore.todayKey === "function"
    );
  }

  function today() {
    return PianoCore.todayKey(new Date());
  }

  function hasToken() {
    try {
      var raw = localStorage.getItem("dong-gh-sync");
      if (!raw) return false;
      var cfg = JSON.parse(raw);
      return !!(cfg && typeof cfg.token === "string" && cfg.token);
    } catch (err) {
      return false;
    }
  }

  function fieldFocused() {
    var el = document.activeElement;
    if (!el || !el.tagName) return false;
    var tag = el.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return false;
    var log = document.getElementById("log");
    return !!(log && log.contains && log.contains(el));
  }

  function showError(text) {
    var node = document.getElementById("log-error");
    if (!node) return;
    if (text) {
      node.hidden = false;
      node.textContent = text;
    } else {
      node.hidden = true;
      node.textContent = "";
    }
  }

  function renderBanners() {
    var demo = document.getElementById("demo-banner");
    var format = document.getElementById("format-banner");
    if (demo) demo.hidden = !state.demo;
    if (format) format.hidden = !state.readOnly;
  }

  function isLogRoute() {
    var hash = location.hash || "";
    return hash === "#/log" || hash.indexOf("#/log?") === 0;
  }

  function route() {
    var log = isLogRoute();
    var ids = ["consistency", "plan", "heatmap", "pieces", "ear", "sight", "recordings", "insights"];
    var i;
    for (i = 0; i < ids.length; i++) {
      var node = document.getElementById(ids[i]);
      if (node) node.hidden = log;
    }
    var section = document.getElementById("log");
    if (section) section.hidden = !log;
  }

  function toggleOther() {
    var select = document.getElementById("log-piece");
    var label = document.getElementById("log-piece-title-label");
    if (!select || !label) return;
    label.hidden = select.value !== "other";
  }

  function syncChips() {
    var input = document.getElementById("log-minutes");
    var value = input ? String(input.value) : "";
    var chips = document.querySelectorAll("#log-form [data-minutes]");
    var i;
    for (i = 0; i < chips.length; i++) {
      chips[i].setAttribute("aria-pressed", chips[i].getAttribute("data-minutes") === value ? "true" : "false");
    }
  }

  function syncFormMode() {
    var legacy = !!(state.editing && state.editing.legacy);
    var editing = !!state.editing;
    var lock = !!state.readOnly;
    var dateEl = document.getElementById("log-date");
    var minutesEl = document.getElementById("log-minutes");
    var noteEl = document.getElementById("log-note");
    var pieceEl = document.getElementById("log-piece");
    var titleEl = document.getElementById("log-piece-title");
    var saveEl = document.getElementById("log-save");
    var cancelEl = document.getElementById("log-cancel");
    if (dateEl) dateEl.disabled = lock || editing;
    if (minutesEl) minutesEl.disabled = lock || legacy;
    if (noteEl) noteEl.disabled = lock || legacy;
    if (pieceEl) pieceEl.disabled = lock;
    if (titleEl) titleEl.disabled = lock;
    if (saveEl) {
      saveEl.disabled = lock;
      saveEl.textContent = editing ? "Update" : "Save";
    }
    if (cancelEl) cancelEl.hidden = !editing;
    var chips = document.querySelectorAll("#log-form [data-minutes]");
    var i;
    for (i = 0; i < chips.length; i++) chips[i].disabled = lock || legacy;
    syncChips();
  }

  function fillPieces(selectedId) {
    var select = document.getElementById("log-piece");
    if (!select) return;
    var current = selectedId !== undefined ? selectedId : select.value;
    while (select.firstChild) select.removeChild(select.firstChild);
    function option(value, text) {
      var node = document.createElement("option");
      node.value = value;
      node.textContent = text;
      select.appendChild(node);
    }
    option("", "Unspecified");
    var choices = PianoCore.pieceChoices(state.doc || {}, current === "other" ? "" : current);
    var i;
    for (i = 0; i < choices.length; i++) option(choices[i].id, choices[i].title);
    option("other", "Other\u2026");
    var found = false;
    for (i = 0; i < select.options.length; i++) {
      if (select.options[i].value === current) found = true;
    }
    select.value = found ? current : "";
    toggleOther();
  }

  function ensureDate() {
    var input = document.getElementById("log-date");
    if (input && !input.value) input.value = today();
  }

  function clearForm() {
    var dateEl = document.getElementById("log-date");
    var minutesEl = document.getElementById("log-minutes");
    var noteEl = document.getElementById("log-note");
    var titleEl = document.getElementById("log-piece-title");
    if (dateEl) dateEl.value = today();
    if (minutesEl) minutesEl.value = "";
    if (noteEl) noteEl.value = "";
    if (titleEl) titleEl.value = "";
    fillPieces("");
    showError("");
    syncFormMode();
  }

  function renderSummary(doc, day) {
    var root = document.getElementById("log-summary");
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(heading("This week"));
    var view = PianoCore.derive(doc, day);
    var total = view.consistency && isNum(view.consistency.weekMinutes) ? view.consistency.weekMinutes : 0;
    var goal = doc && doc.profile && typeof doc.profile.weeklyMinutesGoal === "number"
      ? doc.profile.weeklyMinutesGoal
      : null;
    var card = el("div", "card");
    if (goal !== null) {
      var line = el("p", "log-total");
      line.textContent = total + " of " + goal + " min";
      card.appendChild(line);
      if (goal > 0) card.appendChild(bar((total / goal) * 100));
    } else if (total > 0) {
      var plain = el("p", "log-total");
      plain.textContent = total + " min";
      card.appendChild(plain);
    }
    var pieces = PianoCore.minutesByPiece(doc, PianoCore.weekDates(day));
    if (!pieces.length) {
      card.appendChild(muted(total > 0 ? "No minutes by piece yet." : "No practice logged this week."));
    } else {
      for (var i = 0; i < pieces.length; i++) {
        var row = el("div", "row");
        addText(row, pieces[i].pieceTitle);
        addText(row, pieces[i].minutes + " min");
        card.appendChild(row);
      }
    }
    root.appendChild(card);
  }

  function findEntry(doc, date, id) {
    var sessions = doc && doc.sessions;
    var day = sessions && sessions[date];
    var entries = day && day.entries;
    if (!Array.isArray(entries)) return null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && entries[i].id === id) return entries[i];
    }
    return null;
  }

  function appendEntryRows(card, rows) {
    var i;
    for (i = 0; i < rows.length; i++) {
      var item = rows[i];
      var entry = item.entry || {};
      var row = el("div", "log-row");
      var text = el("div", "log-row-text");
      var label = PianoCore.entryLabel(state.doc, entry);
      var bits = [];
      bits.push((isNum(entry.minutes) ? entry.minutes : 0) + " min");
      bits.push(label);
      if (typeof entry.note === "string" && entry.note !== "") bits.push(entry.note);
      text.textContent = bits.join(" \u00b7 ");
      if (entry.id === "ps_legacy" || entry.source === "legacy") {
        var tag = el("span", "badge");
        tag.textContent = "Legacy";
        text.appendChild(document.createTextNode(" "));
        text.appendChild(tag);
      }
      row.appendChild(text);
      if (!state.readOnly) {
        var actions = el("div", "log-row-actions");
        var edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";
        edit.setAttribute("data-edit-date", item.date);
        edit.setAttribute("data-edit-id", entry.id || "");
        var remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";
        remove.setAttribute("data-delete-date", item.date);
        remove.setAttribute("data-delete-id", entry.id || "");
        actions.appendChild(edit);
        actions.appendChild(remove);
        row.appendChild(actions);
      }
      card.appendChild(row);
    }
  }

  function renderGroup(root, title, rows, emptyText) {
    root.appendChild(heading(title));
    var card = el("div", "card");
    if (!rows.length) card.appendChild(muted(emptyText));
    else appendEntryRows(card, rows);
    root.appendChild(card);
  }

  function renderList(doc, day) {
    var root = document.getElementById("log-list");
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    var rows = PianoCore.entriesForWeek(doc, day);
    var todayRows = [];
    var earlier = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].date === day) todayRows.push(rows[i]);
      else earlier.push(rows[i]);
    }
    renderGroup(root, "Today", todayRows, "No entries today.");
    renderGroup(root, "Earlier this week", earlier, "No other entries this week.");
  }

  function renderLog() {
    if (typeof PianoCore === "undefined" || !PianoCore || typeof PianoCore.derive !== "function") return;
    var day = today();
    var doc = state.doc || PianoCore.blankStore();
    renderSummary(doc, day);
    renderList(doc, day);
    if (!fieldFocused()) {
      ensureDate();
      if (!state.editing) fillPieces();
    }
    syncFormMode();
    renderBanners();
    route();
  }

  function markDirty() {
    if (state.demo || state.readOnly || state.stopped) return;
    state.dirty = true;
    state.generation += 1;
    scheduleSave();
  }

  function scheduleSave() {
    if (state.demo || state.readOnly || state.stopped || !state.dirty) return;
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      flushSave();
    }, SAVE_DELAY);
  }

  function flushSave() {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    if (state.demo || state.readOnly || state.stopped) return;
    if (!state.dirty || state.savePending) return;
    if (!hasToken() || typeof GhSync === "undefined" || !GhSync || typeof GhSync.save !== "function") return;
    var gen = state.generation;
    state.savePending = true;
    setSync("Saving\u2026");
    PianoCore.saveWithRetry(function () {
      return GhSync.save(APP_ID, function () {
        return state.doc;
      }, function (remote) {
        if (PianoCore.schemaVersionOf(remote) > PianoCore.SCHEMA_VERSION) {
          state.doc = remote;
          state.readOnly = true;
          state.dirty = false;
          throw new Error("Newer data format, update the app");
        }
        state.doc = PianoCore.mergeEntries(state.doc, remote);
      }, { quiet: true });
    }).then(function () {
      state.savePending = false;
      if (state.readOnly) {
        setSync("Newer data format, update the app");
        render(PianoCore.derive(state.doc, today()));
        return;
      }
      if (state.generation === gen) state.dirty = false;
      else scheduleSave();
      setSync("Synced " + formatTime(new Date()));
      render(PianoCore.derive(state.doc, today()));
    }, function (err) {
      state.savePending = false;
      if (PianoCore.isConflict(err)) {
        state.stopped = true;
        setSync("⚠️ Not saved, reload");
        return;
      }
      setSync(messageOf(err));
    });
  }

  function paint() {
    render(PianoCore.derive(state.doc || PianoCore.blankStore(), today()));
  }

  function enterDemo() {
    state.demo = true;
    state.readOnly = false;
    state.dirty = false;
    state.doc = PianoCore.demoDoc();
    setSync("Demo");
    paint();
  }

  function startEdit(date, id) {
    var entry = findEntry(state.doc, date, id);
    if (!entry || state.readOnly) return;
    var legacy = entry.id === "ps_legacy" || entry.source === "legacy";
    state.editing = { date: date, id: id, legacy: legacy };
    var dateEl = document.getElementById("log-date");
    var minutesEl = document.getElementById("log-minutes");
    var noteEl = document.getElementById("log-note");
    var titleEl = document.getElementById("log-piece-title");
    if (dateEl) dateEl.value = date;
    if (minutesEl) minutesEl.value = isNum(entry.minutes) ? String(entry.minutes) : "";
    if (noteEl) noteEl.value = typeof entry.note === "string" ? entry.note : "";
    var pieceVal = "";
    if (typeof entry.pieceId === "string" && entry.pieceId) pieceVal = entry.pieceId;
    else if (typeof entry.pieceTitle === "string" && entry.pieceTitle) pieceVal = "other";
    fillPieces(pieceVal);
    if (titleEl) titleEl.value = pieceVal === "other" ? entry.pieceTitle : "";
    showError("");
    syncFormMode();
    var form = document.getElementById("log-form");
    if (form && form.scrollIntoView) form.scrollIntoView({ block: "nearest" });
  }

  function cancelEdit() {
    state.editing = null;
    clearForm();
  }

  function onSubmit(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (state.readOnly || !state.doc) return;
    var minutes = Number(document.getElementById("log-minutes").value);
    if (!isFinite(minutes) || minutes <= 0) {
      showError("Enter minutes greater than 0.");
      return;
    }
    var pieceVal = document.getElementById("log-piece").value;
    var pieceId = null;
    var pieceTitle = "";
    if (pieceVal === "other") {
      pieceTitle = document.getElementById("log-piece-title").value.replace(/^\s+|\s+$/g, "");
      if (!pieceTitle) {
        showError("Name the piece.");
        return;
      }
    } else if (pieceVal) {
      pieceId = pieceVal;
    }
    var note = document.getElementById("log-note").value;
    var now = new Date().toISOString();
    showError("");
    try {
      if (state.editing && state.editing.legacy) {
        state.doc = PianoCore.editEntry(state.doc, state.editing.date, state.editing.id, {
          pieceId: pieceId,
          pieceTitle: pieceTitle
        }, now);
      } else if (state.editing) {
        state.doc = PianoCore.editEntry(state.doc, state.editing.date, state.editing.id, {
          minutes: minutes,
          note: note,
          pieceId: pieceId,
          pieceTitle: pieceTitle
        }, now);
      } else {
        var date = document.getElementById("log-date").value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          showError("Enter a date.");
          return;
        }
        state.doc = PianoCore.addEntry(state.doc, date, {
          minutes: minutes,
          note: note,
          pieceId: pieceId,
          pieceTitle: pieceTitle,
          at: now
        }, now);
      }
    } catch (err) {
      showError(messageOf(err));
      return;
    }
    state.editing = null;
    clearForm();
    markDirty();
    paint();
    if (state.demo) setSync("Demo");
  }

  function onDelete(date, id) {
    if (state.readOnly || !state.doc) return;
    if (!window.confirm("Delete this practice block?")) return;
    state.doc = PianoCore.deleteEntry(state.doc, date, id, new Date().toISOString());
    if (state.editing && state.editing.date === date && state.editing.id === id) {
      state.editing = null;
      clearForm();
    }
    markDirty();
    paint();
    if (state.demo) setSync("Demo");
  }

  function bindLog() {
    var form = document.getElementById("log-form");
    if (!form || form.getAttribute("data-bound") === "1") return;
    form.setAttribute("data-bound", "1");
    form.addEventListener("submit", onSubmit);
    form.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target || !target.getAttribute) return;
      var minutes = target.getAttribute("data-minutes");
      if (!minutes) return;
      var input = document.getElementById("log-minutes");
      if (!input || input.disabled) return;
      input.value = minutes;
      syncChips();
    });
    form.addEventListener("input", function (ev) {
      var target = ev.target;
      if (target && target.id === "log-minutes") syncChips();
    });
    var select = document.getElementById("log-piece");
    if (select) select.addEventListener("change", toggleOther);
    var cancel = document.getElementById("log-cancel");
    if (cancel) cancel.addEventListener("click", cancelEdit);
    var list = document.getElementById("log-list");
    if (list) {
      list.addEventListener("click", function (ev) {
        var target = ev.target;
        if (!target || !target.getAttribute) return;
        var editDate = target.getAttribute("data-edit-date");
        var editId = target.getAttribute("data-edit-id");
        if (editDate && editId) {
          startEdit(editDate, editId);
          return;
        }
        var deleteDate = target.getAttribute("data-delete-date");
        var deleteId = target.getAttribute("data-delete-id");
        if (deleteDate && deleteId) onDelete(deleteDate, deleteId);
      });
    }
  }

  function applyRemote(remoteJson) {
    if (state.dirty || state.savePending) return;
    try {
      state.doc = remoteJson;
      state.demo = false;
      state.readOnly = PianoCore.schemaVersionOf(remoteJson) > PianoCore.SCHEMA_VERSION;
      render(PianoCore.derive(state.doc, today()));
    } catch (err) {
      setSync(messageOf(err));
      throw err;
    }
  }

  function shouldMarkSyncing(text) {
    if (text == null) return true;
    if (text === "Not synced" || text === "Syncing\u2026") return true;
    return String(text).replace(/^\s+|\s+$/g, "") === "";
  }

  function pull() {
    if (state.demo) return;
    if (!hasToken()) {
      enterDemo();
      return;
    }
    if (pulling || state.savePending || state.dirty || fieldFocused()) return;
    if (typeof GhSync === "undefined" || !GhSync || typeof GhSync.load !== "function") {
      setSync("Not synced");
      return;
    }
    pulling = true;
    var node = document.getElementById("sync");
    if (shouldMarkSyncing(node ? node.textContent : "")) setSync("Syncing\u2026");

    var pending;
    try {
      pending = GhSync.load(APP_ID, applyRemote);
    } catch (err) {
      setSync(messageOf(err));
      pulling = false;
      return;
    }
    if (!pending || typeof pending.then !== "function") {
      setSync("Sync failed");
      pulling = false;
      return;
    }

    pending.then(
      function (message) {
        pulling = false;
        if (state.readOnly) {
          setSync("Newer data format, update the app");
          return;
        }
        if (!state.dirty && !state.savePending && message === "Nothing saved on GitHub yet") {
          state.doc = PianoCore.seedDoc();
          state.demo = false;
          paint();
        }
        if (!state.savePending) setSync("Synced " + formatTime(new Date()));
      },
      function (err) {
        setSync(messageOf(err));
        pulling = false;
      }
    );
  }

  function boot() {
    bindLog();
    window.addEventListener("hashchange", route);
    if (!coreReady()) {
      setSync("Not synced");
      route();
      return;
    }
    if (!hasToken()) {
      enterDemo();
    } else {
      try {
        state.doc = PianoCore.blankStore();
        paint();
      } catch (err) {
        setSync(messageOf(err));
      }
      pull();
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushSave();
      else if (document.visibilityState === "visible") pull();
    });
    setInterval(pull, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

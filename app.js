/**
 * Read-only piano dashboard. Renders PianoCore.derive() into the page
 * and refreshes from GhSync (piano.json). No editors, no local writes.
 */
(function () {
  "use strict";

  var APP_ID = "piano";
  var pulling = false;

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
  }

  function coreReady() {
    return (
      typeof GhSync !== "undefined" &&
      GhSync &&
      typeof GhSync.load === "function" &&
      typeof PianoCore !== "undefined" &&
      PianoCore &&
      typeof PianoCore.blankStore === "function" &&
      typeof PianoCore.dayKey === "function" &&
      typeof PianoCore.derive === "function"
    );
  }

  function applyRemote(remoteJson) {
    try {
      render(PianoCore.derive(remoteJson, PianoCore.dayKey(new Date())));
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
    if (pulling) return;
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
      function () {
        setSync("Synced " + formatTime(new Date()));
        pulling = false;
      },
      function (err) {
        setSync(messageOf(err));
        pulling = false;
      }
    );
  }

  function boot() {
    if (!coreReady()) {
      setSync("Not synced");
      return;
    }
    try {
      render(PianoCore.derive(PianoCore.blankStore(), PianoCore.dayKey(new Date())));
    } catch (err) {
      setSync(messageOf(err));
    }
    pull();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") pull();
    });
    setInterval(pull, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

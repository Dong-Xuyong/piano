var assert = require("assert");
var PianoCore = require("./core.js");

var TODAY = "2026-10-06";

function sess(minutes, extra) {
  return {
    minutes: minutes,
    pieces: extra && extra.pieces ? extra.pieces : [],
    ear: extra && extra.ear ? extra.ear : [],
    sight: extra && extra.sight ? extra.sight : []
  };
}

function store(partial) {
  var data = PianoCore.blankStore();
  if (!partial) return data;
  if (partial.profile) data.profile = partial.profile;
  if (partial.pieces) data.pieces = partial.pieces;
  if (partial.sessions) data.sessions = partial.sessions;
  if (partial.recordings) data.recordings = partial.recordings;
  if (partial.plan) data.plan = partial.plan;
  return data;
}

function ofKind(insights, kind) {
  var out = [];
  for (var i = 0; i < insights.length; i++) {
    if (insights[i].kind === kind) out.push(insights[i]);
  }
  return out;
}

function heatmapDay(heatmap, date) {
  for (var i = 0; i < heatmap.length; i++) {
    if (heatmap[i].date === date) return heatmap[i];
  }
  return null;
}

assert.deepStrictEqual(Object.keys(PianoCore).sort(), [
  "SCHEMA_VERSION",
  "addEntry",
  "blankStore",
  "dayKey",
  "deleteEntry",
  "demoDoc",
  "derive",
  "editEntry",
  "entriesForWeek",
  "entryLabel",
  "isConflict",
  "liveEntries",
  "mergeEntries",
  "minutesByPiece",
  "normalizeEntries",
  "pieceChoices",
  "saveWithRetry",
  "schemaVersionOf",
  "seedDoc",
  "shift",
  "todayKey",
  "weekDates"
]);
assert.strictEqual(PianoCore.SCHEMA_VERSION, 2);
assert.strictEqual(PianoCore.dayKey(new Date(2026, 9, 6)), "2026-10-06");
assert.strictEqual(PianoCore.shift("2026-10-06", -1), "2026-10-05");
assert.strictEqual(PianoCore.shift("2026-03-29", 1), "2026-03-30");

var streakToday = PianoCore.derive(store({
  sessions: {
    "2026-10-06": sess(15),
    "2026-10-05": sess(15)
  }
}), TODAY);
assert.strictEqual(streakToday.consistency.streak, 2, "test 1 streak");
assert.strictEqual(streakToday.consistency.daysSinceLast, 0, "test 1 daysSinceLast");
assert.strictEqual(streakToday.consistency.weekMinutes, 30, "test 1 weekMinutes");
assert.strictEqual(streakToday.consistency.loggedDays, 2, "test 1 loggedDays");
assert.strictEqual(streakToday.consistency.weekGoal, null, "test 1 weekGoal");

var streakYesterday = PianoCore.derive(store({
  sessions: {
    "2026-10-05": sess(15),
    "2026-10-04": sess(15)
  }
}), TODAY);
assert.strictEqual(streakYesterday.consistency.streak, 2, "test 2 streak");
assert.strictEqual(streakYesterday.consistency.daysSinceLast, 1, "test 2 daysSinceLast");
assert.strictEqual(ofKind(streakYesterday.insights, "gap").length, 0, "test 2 no gap");

var gap = PianoCore.derive(store({
  sessions: {
    "2026-10-03": sess(20)
  }
}), TODAY);
assert.strictEqual(gap.consistency.streak, 0, "test 3 streak");
assert.strictEqual(gap.consistency.daysSinceLast, 3, "test 3 daysSinceLast");
var gapInsights = ofKind(gap.insights, "gap");
assert.strictEqual(gapInsights.length, 1, "test 3 one gap");
assert.ok(gapInsights[0].text.indexOf("3 days") !== -1, "test 3 text");
assert.strictEqual(
  gapInsights[0].text,
  "Last practice was 3 days ago. A 10-minute session restarts the streak."
);

var week = PianoCore.derive(store({
  sessions: {
    "2026-09-30": sess(40),
    "2026-10-05": sess(20),
    "2026-10-06": sess(15)
  }
}), TODAY);
assert.strictEqual(week.consistency.weekMinutes, 35, "test 4 weekMinutes");
assert.strictEqual(week.heatmap.length, 182, "test 4 heatmap length");
assert.strictEqual(week.heatmap[0].date, PianoCore.shift("2026-10-05", -25 * 7), "test 4 heatmap start");
assert.strictEqual(week.heatmap[181].date, PianoCore.shift("2026-10-05", 6), "test 4 heatmap end");
var oct7 = heatmapDay(week.heatmap, "2026-10-07");
var oct6 = heatmapDay(week.heatmap, "2026-10-06");
var sep30 = heatmapDay(week.heatmap, "2026-09-30");
assert.ok(oct7, "test 4 has 2026-10-07");
assert.strictEqual(oct7.future, true, "test 4 future");
assert.strictEqual(oct7.minutes, 0, "test 4 future minutes");
assert.ok(oct6, "test 4 has 2026-10-06");
assert.strictEqual(oct6.future, false, "test 4 today not future");
assert.strictEqual(oct6.minutes, 15, "test 4 today minutes");
assert.ok(sep30, "test 4 has 2026-09-30");
assert.strictEqual(sep30.minutes, 40, "test 4 outside week still on heatmap");
assert.strictEqual(sep30.future, false, "test 4 sep30 not future");

function learningPiece(historyRows) {
  return store({
    pieces: {
      nocturne: {
        title: "Nocturne",
        composer: "Chopin",
        status: "learning",
        targetBpm: 80,
        sections: [
          { id: "opening", bars: "1-4", label: "Opening", targetBpm: 80 }
        ]
      }
    },
    sessions: {
      "2026-09-01": sess(20, {
        pieces: [{ pieceId: "nocturne", sectionId: "opening", cleanBpm: historyRows[0], hands: "together" }]
      }),
      "2026-10-01": sess(20, {
        pieces: [{ pieceId: "nocturne", sectionId: "opening", cleanBpm: historyRows[1], hands: "together" }]
      })
    }
  });
}

var plateau = PianoCore.derive(learningPiece([60, 60]), TODAY);
var plateauInsights = ofKind(plateau.insights, "plateau");
assert.ok(plateauInsights.length >= 1, "test 5 plateau present");
assert.ok(plateauInsights[0].text.indexOf("Drop to 54") !== -1, "test 5 drop");
assert.strictEqual(
  plateauInsights[0].text,
  "Opening has not gained BPM in 14 days. Drop to 54 and slow-practice."
);
assert.strictEqual(plateau.pieces[0].sections[0].history.length, 2, "test 5 history");
assert.strictEqual(plateau.pieces[0].sections[0].latest.cleanBpm, 60, "test 5 latest");

var gained = PianoCore.derive(learningPiece([50, 60]), TODAY);
assert.strictEqual(ofKind(gained.insights, "plateau").length, 0, "test 6 no plateau");
assert.strictEqual(gained.pieces[0].sections[0].latest.cleanBpm, 60, "test 6 latest");

var weakest = PianoCore.derive(store({
  pieces: {
    etude: {
      title: "Etude",
      composer: "X",
      status: "learning",
      sections: [
        { id: "a", label: "a", targetBpm: 100 },
        { id: "b", label: "b", targetBpm: 100 }
      ]
    }
  },
  sessions: {
    "2026-10-06": sess(30, {
      pieces: [
        { pieceId: "etude", sectionId: "a", cleanBpm: 50, hands: "together" },
        { pieceId: "etude", sectionId: "b", cleanBpm: 90, hands: "together" }
      ]
    })
  }
}), TODAY);
var weakestInsights = ofKind(weakest.insights, "weakest");
assert.strictEqual(weakestInsights.length, 1, "test 7 one weakest");
assert.ok(weakestInsights[0].text.indexOf("50 of 100") !== -1, "test 7 ratio");
assert.ok(
  weakestInsights[0].text.indexOf("a") !== -1 || weakestInsights[0].text.indexOf("a") === 0,
  "test 7 label"
);
assert.strictEqual(weakestInsights[0].text, "a is the weakest section (50 of 100 BPM).");

var ear = PianoCore.derive(store({
  sessions: {
    "2026-10-01": sess(10, {
      ear: [
        { drill: "intervals", correct: 1, total: 10 },
        { drill: "chords", correct: 9, total: 10 }
      ]
    }),
    "2026-10-02": sess(10, {
      ear: [
        { drill: " intervals ", correct: 2, total: 10 },
        { drill: "chords", correct: 8, total: 10 }
      ]
    })
  }
}), TODAY);
assert.strictEqual(ear.ear.length, 2, "test 8 two drills");
assert.strictEqual(ear.ear[0].drill, "chords", "test 8 chord order");
assert.strictEqual(ear.ear[1].drill, "intervals", "test 8 interval order");
assert.strictEqual(ear.ear[1].points.length, 2, "test 8 interval points");
assert.strictEqual(ear.ear[1].points[0].date, "2026-10-01");
assert.strictEqual(ear.ear[1].points[1].correct, 2);
var earInsights = ofKind(ear.insights, "ear");
assert.strictEqual(earInsights.length, 1, "test 8 one ear insight");
assert.ok(earInsights[0].text.indexOf("intervals") !== -1, "test 8 names intervals");
assert.ok(earInsights[0].text.indexOf("chords") === -1, "test 8 not chords");

var sightMissing = PianoCore.derive(store({
  sessions: {
    "2026-10-06": sess(15)
  }
}), TODAY);
assert.strictEqual(sightMissing.sight.length, 0, "test 9 empty sight");
assert.strictEqual(ofKind(sightMissing.insights, "sight").length, 1, "test 9 sight insight");
assert.strictEqual(ofKind(sightMissing.insights, "sight")[0].text, "No sight-reading in the last 7 days.");

var sightToday = PianoCore.derive(store({
  sessions: {
    "2026-10-06": sess(15, {
      sight: [{ level: 2, correct: 4, total: 5 }]
    })
  }
}), TODAY);
assert.strictEqual(sightToday.sight.length, 1, "test 9 sight point");
assert.strictEqual(sightToday.sight[0].date, "2026-10-06");
assert.strictEqual(sightToday.sight[0].accuracy, 0.8);
assert.strictEqual(ofKind(sightToday.insights, "sight").length, 0, "test 9 no sight insight");

var empty = PianoCore.blankStore();
assert.deepStrictEqual(empty.pieces, {}, "test 10 pieces");
assert.strictEqual(empty.profile.minimumSessionMinutes, 10);
assert.strictEqual(empty.profile.weeklyMinutesGoal, null);
var blank = PianoCore.derive(PianoCore.blankStore(), TODAY);
assert.strictEqual(blank.insights[0].kind, "gap", "test 10 kind");
assert.strictEqual(blank.insights[0].text, "No practice logged yet.", "test 10 text");
assert.strictEqual(blank.consistency.streak, 0, "test 10 streak");
assert.strictEqual(blank.consistency.daysSinceLast, null, "test 10 daysSinceLast");
assert.strictEqual(blank.heatmap.length, 182, "test 10 heatmap");

var broken = PianoCore.derive(store({
  profile: { minimumSessionMinutes: 10 },
  sessions: {
    "2026-10-06": sess(15),
    "2026-10-05": sess(5),
    "2026-10-04": sess(15)
  }
}), TODAY);
assert.strictEqual(broken.consistency.streak, 1, "low day breaks streak");

var fromYesterday = PianoCore.derive(store({
  profile: { minimumSessionMinutes: 10 },
  sessions: {
    "2026-10-06": sess(5),
    "2026-10-05": sess(15),
    "2026-10-04": sess(15)
  }
}), TODAY);
assert.strictEqual(fromYesterday.consistency.streak, 2, "streak counts from yesterday");

var defaults = PianoCore.derive(store({
  profile: { minimumSessionMinutes: 0, weeklyMinutesGoal: -4 },
  sessions: { "2026-10-06": sess(5) }
}), TODAY);
assert.strictEqual(defaults.profile.minimumSessionMinutes, 10, "default minimum");
assert.strictEqual(defaults.profile.weeklyMinutesGoal, null, "default goal");
assert.strictEqual(defaults.consistency.streak, 0, "5 minutes is under the default minimum");
assert.strictEqual(defaults.consistency.weekGoal, null);

var deduped = PianoCore.derive(store({
  pieces: {
    song: {
      title: "Song",
      status: "learning",
      sections: [{ id: "s", label: "Verse", targetBpm: 100 }]
    }
  },
  sessions: {
    "2026-10-01": sess(20, {
      pieces: [
        { pieceId: "song", sectionId: "s", cleanBpm: 70, hands: "left" },
        { pieceId: "song", sectionId: "s", cleanBpm: 70, hands: "together" },
        { pieceId: "song", sectionId: "s", cleanBpm: 65, hands: "right" },
        { pieceId: "song", sectionId: "s", cleanBpm: 200, hands: "both" },
        { pieceId: "song", sectionId: "missing", cleanBpm: 200, hands: "together" },
        { pieceId: "other", sectionId: "s", cleanBpm: 200, hands: "together" }
      ]
    }),
    "2026-10-02": sess(20, {
      pieces: [
        { pieceId: "song", sectionId: "s", cleanBpm: 80, hands: "right" },
        { pieceId: "song", sectionId: "s", cleanBpm: 75, hands: "together" }
      ]
    })
  }
}), TODAY);
var history = deduped.pieces[0].sections[0].history;
assert.strictEqual(history.length, 2, "dedupe history");
assert.strictEqual(history[0].date, "2026-10-01");
assert.strictEqual(history[0].cleanBpm, 70);
assert.strictEqual(history[0].hands, "together");
assert.strictEqual(history[1].cleanBpm, 80);
assert.strictEqual(history[1].hands, "right");

var ordered = PianoCore.derive(store({
  pieces: {
    b: { title: "Bravo", status: "repertoire", sections: [] },
    c: { title: "Alpha", status: "learning", sections: [] },
    a: { title: "Alpha", status: "learning", sections: [] }
  }
}), TODAY);
assert.deepStrictEqual(
  ordered.pieces.map(function (piece) { return piece.id; }),
  ["a", "c", "b"]
);

var recordings = PianoCore.derive(store({
  pieces: {
    p: {
      title: "Song",
      sections: [{ id: "s", label: "Verse" }]
    }
  },
  recordings: [
    { date: "2026-10-01", pieceId: "p", sectionId: "s", bpm: 90, url: "https://a", note: "ok" },
    { date: "2026-10-03", pieceId: "p", sectionId: "missing", bpm: "fast", url: "https://b", note: 1 },
    { date: "2026-10-03", pieceId: "nope", sectionId: "s", bpm: 10, url: "https://c" },
    { url: "https://no-date" },
    { date: "2026-10-02" }
  ]
}), TODAY);
assert.strictEqual(recordings.recordings.length, 3);
assert.strictEqual(recordings.recordings[0].date, "2026-10-03");
assert.strictEqual(recordings.recordings[0].pieceTitle, "");
assert.strictEqual(recordings.recordings[0].bpm, 10);
assert.strictEqual(recordings.recordings[1].pieceTitle, "Song");
assert.strictEqual(recordings.recordings[1].sectionLabel, "");
assert.strictEqual(recordings.recordings[1].bpm, null);
assert.strictEqual(recordings.recordings[1].note, "");
assert.strictEqual(recordings.recordings[2].sectionLabel, "Verse");
assert.strictEqual(recordings.recordings[2].note, "ok");
assert.strictEqual(recordings.recordings[2].bpm, 90);

assert.doesNotThrow(function () {
  PianoCore.derive(null, TODAY);
  PianoCore.derive(undefined, TODAY);
  PianoCore.derive(1, TODAY);
  PianoCore.derive("x", TODAY);
  PianoCore.derive({
    sessions: { bad: { minutes: 5 }, "2026-10-06": { minutes: "x", pieces: "nope" } },
    pieces: { p: null },
    recordings: "no",
    plan: null,
    profile: { minimumSessionMinutes: "10", weeklyMinutesGoal: 0 }
  }, TODAY);
});

var garbage = PianoCore.derive({
  sessions: { bad: { minutes: 100 } },
  pieces: { p: null },
  profile: { minimumSessionMinutes: "10", weeklyMinutesGoal: 0 }
}, TODAY);
assert.strictEqual(garbage.consistency.daysSinceLast, null);
assert.strictEqual(garbage.consistency.streak, 0);
assert.strictEqual(garbage.profile.minimumSessionMinutes, 10);
assert.strictEqual(garbage.pieces.length, 1);
assert.strictEqual(garbage.pieces[0].id, "p");
assert.strictEqual(garbage.pieces[0].title, "");

assert.deepStrictEqual(PianoCore.seedDoc(), require("./piano.seed.json"));
assert.strictEqual(PianoCore.todayKey(new Date("2026-10-16T22:30:00.000Z")), "2026-10-16");
assert.strictEqual(PianoCore.todayKey(new Date("2026-10-16T23:30:00.000Z")), "2026-10-17");
assert.deepStrictEqual(PianoCore.weekDates("2026-01-14"), [
  "2026-01-12",
  "2026-01-13",
  "2026-01-14",
  "2026-01-15",
  "2026-01-16",
  "2026-01-17",
  "2026-01-18"
]);

var NOW = "2026-01-10T18:00:00.000Z";
var NOW2 = "2026-01-10T19:00:00.000Z";

function legacyFixture() {
  return {
    version: 1,
    customFlag: { keep: true },
    profile: { weeklyMinutesGoal: 90, minimumSessionMinutes: 10 },
    pieces: {
      "example-etude": {
        title: "EXAMPLE Etude",
        composer: "EXAMPLE",
        status: "learning",
        targetBpm: 80,
        sections: [{ id: "opening", bars: "1-8", label: "Opening", targetBpm: 80 }]
      },
      "example-waltz": {
        title: "EXAMPLE Waltz",
        composer: "EXAMPLE",
        status: "planned",
        targetBpm: null,
        sections: []
      }
    },
    sessions: {
      "2026-01-09": {
        updatedAt: "2026-01-09T12:00:00.000Z",
        minutes: 15,
        pieces: [],
        ear: [],
        sight: [],
        note: "untouched",
        room: "A"
      },
      "2026-01-10": {
        updatedAt: "2026-01-10T12:00:00.000Z",
        minutes: 30,
        pieces: [{ pieceId: "example-etude", sectionId: "opening", cleanBpm: 60, hands: "together" }],
        ear: [{ app: "Tenuto", drill: "intervals", correct: 3, total: 4 }],
        sight: [{ app: "SRF", level: 2, correct: 5, total: 8 }],
        note: "keep me",
        room: "B"
      }
    },
    recordings: [
      { date: "2026-01-09", pieceId: "example-etude", sectionId: "opening", bpm: 70, url: "https://example.test/a", note: "EXAMPLE take" }
    ],
    plan: {
      updatedAt: "2026-01-09T12:00:00.000Z",
      next: ["EXAMPLE one", "EXAMPLE two", "EXAMPLE three"],
      coachNote: "EXAMPLE stay with the pulse."
    }
  };
}

function dayFields(day) {
  return {
    note: day.note,
    pieces: day.pieces,
    ear: day.ear,
    sight: day.sight,
    room: day.room
  };
}

function scrub(doc, date) {
  var copy = JSON.parse(JSON.stringify(doc));
  delete copy.updatedAt;
  delete copy.schemaVersion;
  delete copy.owner;
  var day = copy.sessions[date];
  delete day.minutes;
  delete day.entries;
  delete day.updatedAt;
  return JSON.stringify(copy);
}

var original = legacyFixture();
var originalJson = JSON.stringify(original);
var beforeFields = dayFields(original.sessions["2026-01-10"]);
var added = PianoCore.addEntry(original, "2026-01-10", {
  id: "ps_new001",
  minutes: 20,
  pieceId: "example-etude",
  pieceTitle: "ignored",
  note: "new block"
}, NOW);
assert.strictEqual(JSON.stringify(original), originalJson, "addEntry does not mutate");
var addedDay = added.sessions["2026-01-10"];
assert.strictEqual(addedDay.entries.length, 2, "legacy plus new");
assert.strictEqual(addedDay.entries[0].id, "ps_legacy");
assert.strictEqual(addedDay.entries[0].minutes, 30);
assert.strictEqual(addedDay.entries[0].source, "legacy");
assert.strictEqual(addedDay.entries[0].pieceId, null);
assert.strictEqual(addedDay.entries[0].pieceTitle, "");
assert.strictEqual(addedDay.entries[1].id, "ps_new001");
assert.strictEqual(addedDay.entries[1].minutes, 20);
assert.strictEqual(addedDay.entries[1].source, "app");
assert.strictEqual(addedDay.entries[1].pieceTitle, "", "pieceTitle is empty when pieceId is set");
assert.strictEqual(addedDay.minutes, 50);
assert.deepStrictEqual(dayFields(addedDay), beforeFields);
assert.strictEqual(added.version, 1);
assert.strictEqual(added.schemaVersion, 2);
assert.strictEqual(added.owner, "brook");
assert.strictEqual(added.updatedAt, NOW);
assert.deepStrictEqual(added.pieces, original.pieces);
assert.deepStrictEqual(added.plan, original.plan);
assert.deepStrictEqual(added.recordings, original.recordings);
assert.deepStrictEqual(added.customFlag, original.customFlag);
assert.strictEqual(JSON.stringify(added.sessions["2026-01-09"]), JSON.stringify(original.sessions["2026-01-09"]));

var logged = PianoCore.derive(added, "2026-01-10");
assert.strictEqual(logged.consistency.weekMinutes, 65, "15 on Monday plus 50 on Saturday");
assert.strictEqual(heatmapDay(logged.heatmap, "2026-01-10").minutes, 50);
assert.ok(added.sessions["2026-01-10"].minutes > 0, "hub Today check reads minutes");
assert.strictEqual(logged.consistency.streak >= 1, true);

var removed = PianoCore.deleteEntry(added, "2026-01-10", "ps_new001", NOW2);
assert.strictEqual(removed.sessions["2026-01-10"].minutes, 30);
assert.strictEqual(removed.sessions["2026-01-10"].entries.length, 2, "tombstone stays");
assert.strictEqual(removed.sessions["2026-01-10"].entries[1].deleted, true);
assert.strictEqual(PianoCore.liveEntries(removed.sessions["2026-01-10"]).length, 1);
assert.strictEqual(PianoCore.liveEntries(removed.sessions["2026-01-10"])[0].id, "ps_legacy");
assert.deepStrictEqual(dayFields(removed.sessions["2026-01-10"]), beforeFields);
assert.strictEqual(PianoCore.derive(removed, "2026-01-10").consistency.weekMinutes, 45);

var v1 = legacyFixture();
assert.strictEqual(PianoCore.schemaVersionOf(v1), 1);
assert.doesNotThrow(function () { PianoCore.derive(v1, "2026-01-10"); });
var savedV1 = PianoCore.addEntry(v1, "2026-01-10", {
  id: "ps_new001",
  minutes: 20,
  pieceId: null,
  pieceTitle: "EXAMPLE other",
  note: ""
}, NOW);
var mergedV1 = PianoCore.mergeEntries(savedV1, v1);
assert.strictEqual(mergedV1.schemaVersion, 2);
assert.strictEqual(mergedV1.owner, "brook");
assert.strictEqual(mergedV1.version, 1);
assert.strictEqual(scrub(mergedV1, "2026-01-10"), scrub(v1, "2026-01-10"));
assert.strictEqual(JSON.stringify(mergedV1.sessions["2026-01-09"]), JSON.stringify(v1.sessions["2026-01-09"]));
assert.deepStrictEqual(mergedV1.pieces, v1.pieces, "free text does not add a piece");
var otherEntry = mergedV1.sessions["2026-01-10"].entries.filter(function (entry) {
  return entry.id === "ps_new001";
})[0];
assert.strictEqual(otherEntry.pieceId, null);
assert.strictEqual(otherEntry.pieceTitle, "EXAMPLE other");

var remote = legacyFixture();
remote.plan = {
  updatedAt: "2026-02-01T00:00:00.000Z",
  next: ["EXAMPLE remote one", "EXAMPLE remote two", "EXAMPLE remote three"],
  coachNote: "EXAMPLE remote plan."
};
remote.pieces = {
  "example-waltz": {
    title: "EXAMPLE Waltz",
    composer: "EXAMPLE",
    status: "learning",
    targetBpm: 100,
    sections: []
  }
};
remote.customFlag = { keep: "remote" };
remote.sessions["2026-01-10"] = {
  updatedAt: "2026-01-10T12:00:00.000Z",
  minutes: 15,
  pieces: [{ pieceId: "example-waltz", sectionId: "opening", cleanBpm: 40, hands: "left" }],
  ear: [],
  sight: [],
  note: "remote note",
  room: "C",
  entries: [{
    id: "ps_brook1",
    at: "2026-01-10T16:00:00.000Z",
    minutes: 15,
    pieceId: "example-waltz",
    pieceTitle: "",
    note: "bot block",
    source: "brook",
    updatedAt: "2026-01-10T16:00:00.000Z",
    marker: "keep"
  }]
};
var localEntry = PianoCore.addEntry(legacyFixture(), "2026-01-10", {
  id: "ps_app001",
  minutes: 20,
  pieceId: "example-etude",
  note: "app block"
}, NOW);
var mergedBoth = PianoCore.mergeEntries(localEntry, remote);
var bothIds = mergedBoth.sessions["2026-01-10"].entries.map(function (entry) { return entry.id; });
assert.ok(bothIds.indexOf("ps_brook1") !== -1);
assert.ok(bothIds.indexOf("ps_app001") !== -1);
assert.ok(bothIds.indexOf("ps_legacy") !== -1, "local legacy conversion is kept");
assert.strictEqual(mergedBoth.sessions["2026-01-10"].minutes, 65, "30 legacy + 20 app + 15 brook");
assert.deepStrictEqual(mergedBoth.plan, remote.plan);
assert.deepStrictEqual(mergedBoth.pieces, remote.pieces);
assert.deepStrictEqual(mergedBoth.customFlag, remote.customFlag);
assert.strictEqual(mergedBoth.sessions["2026-01-10"].note, "remote note");
assert.strictEqual(mergedBoth.sessions["2026-01-10"].room, "C");
assert.deepStrictEqual(mergedBoth.sessions["2026-01-10"].pieces, remote.sessions["2026-01-10"].pieces);
assert.strictEqual(mergedBoth.recordings[0].note, "EXAMPLE take");
var brookKept = mergedBoth.sessions["2026-01-10"].entries.filter(function (entry) {
  return entry.id === "ps_brook1";
})[0];
assert.strictEqual(brookKept.marker, "keep");

var sameDay = {
  version: 1,
  profile: { weeklyMinutesGoal: null, minimumSessionMinutes: 10 },
  pieces: {},
  sessions: {
    "2026-01-10": {
      updatedAt: "2026-01-10T12:00:00.000Z",
      minutes: 10,
      pieces: [],
      ear: [],
      sight: [],
      note: "",
      entries: [{
        id: "ps_same01",
        at: null,
        minutes: 10,
        pieceId: null,
        pieceTitle: "",
        note: "remote",
        source: "brook",
        updatedAt: "2026-10-16T08:30:00Z"
      }]
    }
  },
  recordings: [],
  plan: { updatedAt: null, next: [], coachNote: "" }
};
var localSame = JSON.parse(JSON.stringify(sameDay));
localSame.sessions["2026-01-10"].entries[0] = {
  id: "ps_same01",
  at: null,
  minutes: 10,
  pieceId: null,
  pieceTitle: "",
  note: "local",
  source: "app",
  updatedAt: "2026-10-16T10:00:00+01:00"
};
localSame.schemaVersion = 2;
localSame.owner = "brook";
localSame.updatedAt = "2026-10-16T09:00:00.000Z";
var newerWins = PianoCore.mergeEntries(localSame, sameDay);
assert.strictEqual(newerWins.sessions["2026-01-10"].entries[0].note, "local");
assert.strictEqual(newerWins.sessions["2026-01-10"].minutes, 10);

var tieRemote = JSON.parse(JSON.stringify(sameDay));
tieRemote.sessions["2026-01-10"].entries[0].updatedAt = "2026-01-02T00:00:00.000Z";
tieRemote.sessions["2026-01-10"].entries[0].note = "remote";
var tieLocal = JSON.parse(JSON.stringify(tieRemote));
tieLocal.sessions["2026-01-10"].entries[0].updatedAt = "2026-01-02T00:00:00+00:00";
tieLocal.sessions["2026-01-10"].entries[0].note = "local";
tieLocal.schemaVersion = 2;
tieLocal.owner = "brook";
tieLocal.updatedAt = "2026-01-02T00:00:00.000Z";
assert.strictEqual(PianoCore.mergeEntries(tieLocal, tieRemote).sessions["2026-01-10"].entries[0].note, "remote");

var normalized = PianoCore.normalizeEntries({
  entries: [{
    id: "ps_demo01",
    minutes: 5,
    pieceId: null,
    pieceTitle: "EXAMPLE scale",
    note: "",
    source: "app",
    updatedAt: "2026-01-01T00:00:00.000Z",
    extra: 1,
    deleted: true
  }]
});
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].extra, 1);
assert.strictEqual(normalized[0].deleted, true);
assert.strictEqual(PianoCore.liveEntries({ entries: normalized }).length, 0);

var choices = PianoCore.pieceChoices(legacyFixture(), "");
assert.deepStrictEqual(choices.map(function (piece) { return piece.id; }), ["example-etude"]);
var withPlanned = PianoCore.pieceChoices(legacyFixture(), "example-waltz");
assert.deepStrictEqual(withPlanned.map(function (piece) { return piece.id; }), ["example-etude", "example-waltz"]);

var demo = PianoCore.demoDoc();
assert.strictEqual(demo.pieces["example-etude"].title.indexOf("EXAMPLE"), 0);
assert.strictEqual(demo.pieces["example-waltz"].title.indexOf("EXAMPLE"), 0);
var weekRows = PianoCore.entriesForWeek(demo, "2026-01-14");
assert.deepStrictEqual(weekRows.map(function (row) { return row.entry.id; }), ["ps_demo02", "ps_demo01"]);
assert.deepStrictEqual(PianoCore.minutesByPiece(demo, PianoCore.weekDates("2026-01-14")), [
  { pieceId: "example-etude", pieceTitle: "EXAMPLE Etude", minutes: 20 },
  { pieceId: null, pieceTitle: "EXAMPLE scale", minutes: 10 }
]);
assert.strictEqual(PianoCore.entryLabel(demo, demo.sessions["2026-01-13"]), "Unspecified");

var legacyEdited = PianoCore.editEntry(added, "2026-01-10", "ps_legacy", {
  minutes: 5,
  note: "nope",
  pieceId: "example-etude",
  pieceTitle: "ignored"
}, NOW2);
assert.strictEqual(legacyEdited.sessions["2026-01-10"].entries[0].minutes, 30);
assert.strictEqual(legacyEdited.sessions["2026-01-10"].entries[0].note, "");
assert.strictEqual(legacyEdited.sessions["2026-01-10"].entries[0].pieceId, "example-etude");
assert.strictEqual(legacyEdited.sessions["2026-01-10"].entries[0].pieceTitle, "");
assert.strictEqual(legacyEdited.sessions["2026-01-10"].minutes, 50);

function runConflictWalk() {
  var fs = require("fs");
  var vm = require("vm");
  var memory = new Map();
  var localStorage = {
    getItem: function (key) { return memory.has(key) ? memory.get(key) : null; },
    setItem: function (key, value) { memory.set(key, String(value)); },
    removeItem: function (key) { memory.delete(key); }
  };
  var calls = [];
  var handler = function () { return Promise.reject(new Error("fetch not stubbed")); };
  var confirms = [];
  function encodeContent(data) {
    return Buffer.from(unescape(encodeURIComponent(JSON.stringify(data))), "binary").toString("base64");
  }
  function decodeContent(b64) {
    return JSON.parse(decodeURIComponent(escape(Buffer.from(String(b64).replace(/\s/g, ""), "base64").toString("binary"))));
  }
  function response(status, body) {
    return { status: status, ok: status >= 200 && status < 300, json: function () { return Promise.resolve(body); } };
  }
  var context = vm.createContext({
    localStorage: localStorage,
    console: console,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Error: Error,
    Promise: Promise,
    Date: Date,
    String: String,
    Number: Number,
    unescape: unescape,
    escape: escape,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    btoa: function (value) { return Buffer.from(value, "binary").toString("base64"); },
    atob: function (value) { return Buffer.from(value, "base64").toString("binary"); },
    fetch: function (url, opts) {
      calls.push({ url: url, method: opts && opts.method, body: opts && opts.body, headers: opts && opts.headers });
      return handler(url, opts || {});
    },
    confirm: function (msg) { confirms.push(msg); return false; },
    prompt: function () { return null; }
  });
  context.window = context;
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(require("path").join(__dirname, "dong-ui/gh-sync.js"), "utf8"), context);
  localStorage.setItem("dong-gh-sync", JSON.stringify({
    token: "test-token",
    repo: "Dong-Xuyong/progress-sync"
  }));
  var file = "https://api.github.com/repos/Dong-Xuyong/progress-sync/contents/piano.json";
  var remoteFile = legacyFixture();
  remoteFile.sessions["2026-01-10"].entries = [{
    id: "ps_brook1",
    at: null,
    minutes: 15,
    pieceId: null,
    pieceTitle: "EXAMPLE brook",
    note: "bot",
    source: "brook",
    updatedAt: "2026-01-10T15:00:00.000Z"
  }];
  remoteFile.sessions["2026-01-10"].minutes = 15;
  var remotePlan = {
    updatedAt: "2026-02-02T00:00:00.000Z",
    next: ["EXAMPLE after conflict", "EXAMPLE still three", "EXAMPLE tasks"],
    coachNote: "EXAMPLE remote wins."
  };
  var sawConflict = false;
  handler = function (url, opts) {
    if (url !== file) return Promise.reject(new Error("unexpected url " + url));
    if (!opts.headers || opts.headers.Authorization !== "Bearer test-token") {
      return Promise.reject(new Error("missing authorization"));
    }
    if (opts.method === "GET") {
      var payload = JSON.parse(JSON.stringify(remoteFile));
      if (sawConflict) payload.plan = remotePlan;
      return Promise.resolve(response(200, {
        sha: sawConflict ? "sha-new" : "sha-old",
        content: encodeContent(payload)
      }));
    }
    var body = JSON.parse(opts.body);
    if (!sawConflict) {
      if (body.sha !== "sha-old") return Promise.reject(new Error("first put sha"));
      sawConflict = true;
      return Promise.resolve(response(409, {}));
    }
    if (body.sha !== "sha-new") return Promise.reject(new Error("retry put sha"));
    return Promise.resolve(response(200, {}));
  };
  var doc = PianoCore.addEntry(legacyFixture(), "2026-01-10", {
    id: "ps_app001",
    minutes: 20,
    pieceId: null,
    pieceTitle: "EXAMPLE app",
    note: "from the app"
  }, NOW);
  function saveOnce() {
    return context.GhSync.save(APP_ID_CONFLICT, function () {
      return doc;
    }, function (remoteDoc) {
      doc = PianoCore.mergeEntries(doc, remoteDoc);
    }, { quiet: true });
  }
  var APP_ID_CONFLICT = "piano";
  return PianoCore.saveWithRetry(saveOnce).then(function (message) {
    assert.strictEqual(message, "Saved to GitHub");
    assert.strictEqual(confirms.length, 0, "quiet save does not confirm");
    assert.deepStrictEqual(calls.map(function (call) { return call.method; }), ["GET", "PUT", "GET", "PUT"]);
    var puts = calls.filter(function (call) { return call.method === "PUT"; });
    assert.strictEqual(JSON.parse(puts[0].body).sha, "sha-old");
    assert.strictEqual(JSON.parse(puts[1].body).sha, "sha-new");
    puts.forEach(function (call) {
      assert.ok(call.url.indexOf("/piano.json") !== -1);
      assert.ok(call.url.indexOf("progress-sync") !== -1);
    });
    var written = decodeContent(JSON.parse(puts[1].body).content);
    assert.strictEqual(written.version, 1);
    assert.strictEqual(written.schemaVersion, 2);
    assert.strictEqual(written.owner, "brook");
    assert.deepStrictEqual(written.plan, remotePlan);
    assert.deepStrictEqual(written.pieces, remoteFile.pieces);
    var ids = written.sessions["2026-01-10"].entries.map(function (entry) { return entry.id; });
    assert.ok(ids.indexOf("ps_legacy") !== -1);
    assert.ok(ids.indexOf("ps_app001") !== -1);
    assert.ok(ids.indexOf("ps_brook1") !== -1);
    assert.strictEqual(written.sessions["2026-01-10"].minutes, 65);
    assert.strictEqual(JSON.stringify(written.sessions["2026-01-09"]), JSON.stringify(remoteFile.sessions["2026-01-09"]));
    calls.length = 0;
    var failures = 0;
    handler = function (url, opts) {
      if (opts.method === "GET") {
        return Promise.resolve(response(200, { sha: "sha-x", content: encodeContent(remoteFile) }));
      }
      failures += 1;
      return Promise.resolve(response(409, {}));
    };
    doc = PianoCore.addEntry(doc, "2026-01-11", {
      id: "ps_app002",
      minutes: 10,
      pieceId: null,
      pieceTitle: "EXAMPLE again",
      note: ""
    }, NOW2);
    return PianoCore.saveWithRetry(saveOnce).then(function () {
      throw new Error("second conflict should reject");
    }, function (err) {
      assert.strictEqual(PianoCore.isConflict(err), true);
      assert.strictEqual(failures, 2, "one retry, then stop");
    });
  });
}

var APP_ID_CONFLICT = "piano";

runConflictWalk().then(function () {
  console.log("pass");
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});

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

assert.deepStrictEqual(Object.keys(PianoCore).sort(), ["blankStore", "dayKey", "derive", "shift"]);
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

console.log("pass");

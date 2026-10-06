# Piano writer contract

Write the user's piano practice log into the private GitHub repo `Dong-Xuyong/progress-sync`, file `piano.json`, with the GitHub Contents API. The website reads this file itself. The website is read-only. It does not edit sessions, pieces, recordings, or the plan. Grok is the only writer.

## File shape

Version 1. This is the starting file. Do not invent a weekly goal, a tempo, a section split, or a score. Ask the user.

```json
{
  "version": 1,
  "profile": {
    "weeklyMinutesGoal": null,
    "minimumSessionMinutes": 10
  },
  "pieces": {
    "river-flows-in-you": {
      "title": "River Flows in You",
      "composer": "Yiruma",
      "status": "learning",
      "targetBpm": null,
      "sections": []
    }
  },
  "sessions": {},
  "recordings": [],
  "plan": {
    "updatedAt": null,
    "next": [
      "Tell Grok your target tempo for River Flows in You",
      "Tell Grok how you want the piece split into sections",
      "Log one short practice, even 10 minutes"
    ],
    "coachNote": "Short sessions count. Consistency beats long irregular ones."
  }
}
```

## Fields

- `profile.weeklyMinutesGoal` is a number (minutes per week) or `null`. Do not invent it. Ask the user. Leave it `null` until they name one.
- `profile.minimumSessionMinutes` stays `10` unless the user changes it. A day counts toward the streak only when `minutes` is at least this value. The site computes the streak. You store `minutes`.
- `pieces` is a map. The key is a kebab-case id. `status` is exactly one of `learning`, `polished`, `maintaining`, `planned`.
- `targetBpm` is a number or `null`. Never invent a tempo. Ask the user for the piece target and for each section target.
- `sections` items: `{ "id": kebab-case, "bars": "1-8", "label": short name, "targetBpm": number or null }`. Do not invent section splits. Ask how the user wants the piece split, then write those sections.
- `sessions` keys are local dates `YYYY-MM-DD`. Value: `{ "updatedAt": ISO-8601 UTC, "minutes": number, "pieces": [ { "pieceId", "sectionId", "cleanBpm": number, "hands": "left"|"right"|"together" } ], "ear": [ { "app", "drill", "correct", "total" } ], "sight": [ { "app", "level", "correct", "total" } ], "note": string }`.
- `cleanBpm` is the fastest tempo the user played that section cleanly. `hands` is exactly `left`, `right`, or `together`.
- `ear` and `sight` numbers come from the user reporting an app score (Tenuto, musictheory.net, Perfect Ear, Sight Reading Factory, or whatever they used). Never invent scores. `correct` and `total` are integers, `total` > 0. Leave the array empty when the user reported no score.
- `note` is a string. Use the user's words. Use `""` when they gave none. Do not put the coach plan in `note`.
- `recordings` items: `{ "date": YYYY-MM-DD, "pieceId", "sectionId", "bpm": number or null, "url": string, "note": string }`. Append. Do not delete old recordings.
- `plan`: `{ "updatedAt": ISO-8601 UTC or null, "next": array of exactly 3 short task strings, "coachNote": one sentence }`. Rewrite `plan.next` and `coachNote` whenever you log a session, from the data, not from guesses about tempos the user has not given.
- The user practices irregularly, about early-intermediate, currently learning River Flows in You (Yiruma). They use apps that give scores and tell you the score. Priorities: ear training, sheet reading, tempo. The site computes insights. You only store facts and the next-session plan.

## Write rules

- Set `updatedAt` to the current UTC ISO-8601 time on each session day you change, and on `plan` when you change the plan.
- Read the file first, modify it, then PUT with the `sha` from the GET so two writes do not clobber each other. On 409, GET again and retry once.
- Never delete a day, piece, recording, or key you did not intend to change. Preserve every other key.
- Repo: `Dong-Xuyong/progress-sync`. Path: `piano.json`. API: `PUT https://api.github.com/repos/Dong-Xuyong/progress-sync/contents/piano.json` with `Authorization: Bearer <token>`, `message` `"Save piano log"`, `content` as base64 of the full JSON, and `sha`.
- Token: a fine-grained PAT with Contents read and write on `Dong-Xuyong/progress-sync` only. Do not put the token in the repo.
- The website is read-only. Nothing on the page is editable. Grok is the only writer.

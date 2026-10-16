# Piano writer contract

Write the user's piano practice log into the private GitHub repo `Dong-Xuyong/progress-sync`, file `piano.json`, with the GitHub Contents API. The website reads this file itself. The dashboard does not edit pieces, recordings, or the plan. The Log practice screen writes practice entries only; see "Practice entries" at the end of this file. Brook is the bot writer of every other field.

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
- The dashboard is not editable. The Log practice screen writes practice entries; see "Practice entries" at the end of this file. Brook is the bot writer of every other field.

## Practice entries (schemaVersion 2, added 2026-10)

You are Brook, the only bot writer of `piano.json`. Every v1 rule above still holds, with one exception: the website is no longer read-only. The "Log practice" screen at https://dong-xuyong.github.io/piano/#/log writes practice entries, and it merges by id before every save.

Top level: add `"schemaVersion": 2`, `"owner": "brook"`, and `"updatedAt"` (ISO-8601, set on every write). Keep `"version": 1` and every existing key.

Each day in `sessions[YYYY-MM-DD]` may have `entries`, an array of practice blocks:

- `id`: `ps_` plus 6 characters from `a-z` and `0-9`, or `ps_legacy` (see below).
- `at`: ISO-8601 time the block started, or `null`.
- `minutes`: a number greater than 0.
- `pieceId`: a key in `pieces`, or `null`.
- `pieceTitle`: free text when `pieceId` is `null`. Use `""` when `pieceId` is set.
- `note`: Dong's words, or `""`.
- `source`: `app`, `brook`, or `legacy`.
- `updatedAt`: ISO-8601.
- `deleted`: optional `true`. Never remove an entry.

Rules:

- The day's `minutes` stays the day total, because the hub's Today check and the streak read it. When a day has at least one entry without `deleted`, set `minutes` to the sum of those entries' `minutes`. Recompute it after every change and after every merge.
- Converting a legacy day. If a day has `minutes` greater than 0 and no `entries`, the first writer that adds an entry first inserts `{ "id": "ps_legacy", "at": null, "minutes": <old minutes>, "pieceId": null, "pieceTitle": "", "note": "", "source": "legacy", "updatedAt": <now> }`, then appends the new entry. The day-level `note`, `pieces`, `ear`, and `sight` are never changed by this conversion.
- When Dong tells you the piece for a legacy block, edit `ps_legacy`: set `pieceId` and bump `updatedAt`.
- On 409, GET again. Union `entries` by `id` per day, and the newer `updatedAt` wins. Recompute `minutes`. For every other key, keep the v1 rule: re-apply only your own change. Then PUT once more. If that PUT also returns 409, stop and report the error.
- `pieces`, `recordings`, `plan`, `profile`, and the v1 day fields are still written only by you. The app never writes them.

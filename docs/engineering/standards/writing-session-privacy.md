# Writing Session Privacy Architecture

Authoritative contract for how writing-session data is projected to each
audience. Any code path that emits session data outside the author's own
device — friends, community, public sharing — **must** go through one of the
projection functions defined here. This document is doctrine: read it before
touching any code that reads, renders, or transmits `WritingSessionRecord`.

The plugin currently ships only the `private` audience. The `friends` and
`community` projections exist as stubs with locked-in contracts so the
companion website can be built against a stable, tested boundary.

---

## Audiences

There are three audiences. They are different, and they take different
shapes. Do not collapse them into one "shared" tier.

| Audience | Who | Shape | Default |
|---|---|---|---|
| `private` | The author, on their own device | Full row | always on |
| `friends` | Invited, trusted contacts | Per-session row, redacted | opt-in per book |
| `community` | Public / strangers | Daily aggregate only | opt-in per book |

**Key shape difference:** friends see *per-session rows* (with sensitive
fields stripped). Community **never** sees per-session rows — only daily
aggregates. This is itself a privacy lever: forcing community to aggregates
eliminates the spoiler surface entirely.

---

## Field sensitivity tiers

Every field on `WritingSessionRecord` lives in one of three tiers.

### Always private — never emitted at any tier

These fields **must not** appear in `friends` or `community` projections,
ever, under any opt-in. Adding a new field to this list is a one-way door.

- `scenePaths` — vault file paths; reveal folder structure and working
  titles
- `scenesCompletedPaths` — same risk surface as `scenePaths`
- Scene titles (derived from paths or scene metadata) — these are spoilers
  for unpublished work
- `note` — free-form prose written by the author about their own session;
  the writing journal must be safe to write honestly in. Sharing it by
  default would chill that.

> If a future "share this reflection" feature is needed, it is an explicit,
> per-row publish action with its own UI affirmation — never a passive flag
> on the record.

### Author-controlled — opt-in per audience

These fields are personal but not dangerous. They are emitted only when the
author has opted in (per book, not globally).

- `bookTitle` — public for published works, private for WIP. Per-book toggle.
- Wall-clock time-of-day in `startedAt` / `endedAt` / `lastSeenAt`. See
  **Time precision** below — this is a granularity knob, not a binary flag.

### Social currency — emitted freely once a tier is opted in

These fields carry the "writing life" story without exposing the work.

- `mode` (drafting / revising / editing / planning)
- `stage` (Zero / Author / House / Press)
- `elapsedMs`, rounded to minutes
- `wordsAdded`, full precision (rounded to nearest 50 for `community`)
- `scenesCompleted` (count only — never paths or titles)
- `pagesEdited`
- Date, at audience-appropriate precision

---

## Time precision is its own axis

Same timestamp, different granularity per audience. Apply via the
`redactTime(iso, audience)` helper — never emit raw ISO strings to non-private
audiences.

| Audience | Precision |
|---|---|
| `private` | minute (`2026-06-01T09:14:00Z`) |
| `friends` | hour (`2026-06-01T09:00:00Z`) |
| `community` | day (`2026-06-01`) |

This is a standard privacy-engineering pattern. Do not skip it.

---

## Projection functions

The four projection functions are the **only** sanctioned exit points for
session data. Each one is pure, deterministic, and tested against the tracer
contract (see below).

```ts
type Audience = 'private' | 'friends' | 'community';

projectPrivate(record): PrivateSessionLogRow         // full row
projectFriends(record): FriendsSessionLogRow         // per-session, redacted
projectCommunityDaily(records[]): CommunityDailyRow  // daily aggregate ONLY
```

There is intentionally no `projectCommunity(record)` — community emits
daily aggregates, never per-session rows.

**No fallbacks.** If a field cannot be safely projected, omit it. Never
substitute "Untitled scene" or "Anonymous" — surface absence honestly. The
no-fallback doctrine applies here as it does everywhere.

**Identity is added server-side.** Client projections never know the author
id. The website attaches identity at upload from the authenticated session.
This means the projections are pure of identity concerns and one less thing
can leak.

---

## Defaults

- Every record is `private` by default.
- Friends sharing is **per-book**, not global. Author has multiple books;
  one may be public, three may be WIP.
- Community sharing is **per-book**, not global, and requires friends
  sharing to also be enabled (forcing the author through the lower-stakes
  tier first).
- The `note` field is permanently private regardless of toggles.
- Time precision is not user-configurable — it is fixed per audience.

---

## The tracer privacy test

Privacy boundaries are tested like security boundaries, because that is
what they are.

`projections.privacy.test.ts` builds a `WritingSessionRecord` where every
private field contains a unique tracer string:

```
note:               'PRIVACY_TRACER_NOTE_DO_NOT_LEAK'
scenePaths:         ['PRIVACY_TRACER_PATH_DO_NOT_LEAK']
scenesCompletedPaths: ['PRIVACY_TRACER_COMPLETED_PATH_DO_NOT_LEAK']
bookTitle:          'PRIVACY_TRACER_TITLE_DO_NOT_LEAK'  // when book opt-in is off
```

For each non-private projection, the test asserts the JSON-serialized
output does **not** contain any tracer substring.

A future field added to `WritingSessionRecord` that quietly passes through
to a non-private projection will fail this test. **Adding the tracer for a
new field is required as part of adding that field.**

---

## When to update this document

Bump and amend before:

- Adding a new field to `WritingSessionRecord`.
- Adding a new projection function or audience tier.
- Changing what a current projection emits.
- Wiring a new render surface that consumes session data.

The doctrine is the contract. The contract is older than any view.

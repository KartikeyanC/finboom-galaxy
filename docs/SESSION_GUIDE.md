# How to run this project across Claude sessions

> You do not need to remember 26 documents. You need **three files and one prompt.**

---

## 1. The only files that change during testing

| File | What it is | Who writes it |
|---|---|---|
| [QA_PROGRESS.md](./QA_PROGRESS.md) | Which tests have been run and what happened | Claude, every session |
| [BUG_TRACKER.md](./BUG_TRACKER.md) | Every bug, its root cause, its fix, its status | Claude, every session |
| [Production_Readiness.md](./Production_Readiness.md) | The score and the go/no-go checklist | Claude, at each milestone |

Everything else is **reference** — written once, read when needed, rarely edited.

**This is the important part:** these three files are the memory that survives between
sessions. Claude's own memory is a summary and can go stale. **The files are the truth.**
As long as Claude keeps them updated, any future session can pick up exactly where the last
one stopped — even months later, even in a fresh conversation.

---

## 2. Copy-paste this at the start of every testing session

```
Read docs/SESSION_GUIDE.md, docs/QA_PROGRESS.md and docs/BUG_TRACKER.md first.

Continue Phase 2 testing on FinRoot at F:\Movie\AK\FinRoot\_extracted.

Rules:
- Work through docs/Test_Cases.md in priority order (P0 first).
- For each case: execute it, record the result in docs/QA_PROGRESS.md.
- If it fails: add/update a row in docs/BUG_TRACKER.md with root cause, fix the code,
  retest, then re-run the regression cases listed for that bug.
- Never skip a failing case.
- Update docs/Production_Readiness.md when a milestone closes.
- Tell me before making any database migration or any change to live.

Start by telling me where the last session stopped and what you're doing next.
```

That's it. You do not need to explain the project again. The documents do that.

---

## 3. What Claude should do at the end of every session

Ask for this explicitly if it doesn't happen:

> "Update QA_PROGRESS.md and BUG_TRACKER.md with everything from this session, then tell me
> in three lines where we are and what's next."

If a session ends without that, the next session starts blind.

---

## 4. The loop

```
    ┌─────────────────────────────────────────────┐
    │  Pick the next unrun case from Test_Cases   │
    └────────────────────┬────────────────────────┘
                         ▼
                    Execute it
                         │
            ┌────────────┴────────────┐
          PASS                       FAIL
            │                          │
            ▼                          ▼
   Log PASS in QA_PROGRESS    Open a bug in BUG_TRACKER
            │                          ▼
            │                    Find root cause
            │                          ▼
            │                       Fix code
            │                          ▼
            │                        Retest
            │                          ▼
            │                 Run regression cases
            │                          │
            └────────────┬─────────────┘
                         ▼
            Milestone done? → update Production_Readiness
                         ▼
                     Next case
```

---

## 5. Order of work (do not reshuffle this)

| Stage | What | Why this order |
|---|---|---|
| **0** | Safety net — CI, error boundary, monitoring, backups, fix `tsc`/ESLint | You cannot safely fix anything until a regression can be detected |
| **1** | Security blockers — BUG-001, 003, 004, 005, 006, 008 | These are exploitable today |
| **2** | Correctness — tenancy, net worth, budgets, transfers, pricing | Makes the numbers true |
| **3** | Durability — move localStorage features to the database | Stops users losing work |
| **4** | Scale & polish — bundle, pagination, accessibility | Makes it fast and pleasant |
| **5** | Commercial — privacy/terms, onboarding, analytics | Makes it sellable |

Full detail: [Improvement_Roadmap.md](./Improvement_Roadmap.md).

---

## 6. If a session seems to have lost the thread

Symptoms: Claude re-explains the project, re-audits things already documented, or proposes
work that's already done.

Fix — paste this:

```
Stop. Read docs/QA_PROGRESS.md and docs/BUG_TRACKER.md. Tell me the last case executed
and the highest-priority open bug, then continue from there.
```

---

## 7. Things to say "no" to

- Starting Stage 1 before Stage 0 exists.
- Any migration against the **live** project before backups exist.
- "I'll fix a few things quickly" without logging them in BUG_TRACKER.md — untracked fixes
  are how the tracker goes stale and cross-session continuity breaks.

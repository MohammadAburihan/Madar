---
name: delivering-features
description: Use when building a Madar feature or roadmap step from docs/STATUS.md, when a feature PR is open and waiting for review, fixes or merge, or when deciding whether another review pass is worth running.
---

# Delivering a feature

## Overview

Every feature goes build → PR → review → fix → merge. The aim of reviewing is **confidence, not zero
findings**: a large diff reviewed at high effort always turns up something new, so "a pass comes back
clean" never ends the loop on its own. Stop when further passes stop finding things that matter.

## The loop

1. **Build** on a feature branch from `development`. First read the `review-lesson` memories in `MEMORY.md`
   that touch the area you're changing, and build so those findings can't recur. Follow CLAUDE.md
   (container/presenter, specs for every presenter, en + ar, checked against the mocks). Design first: make every screen change in `docs/Madar.pen` through the Pencil MCP tools, in English and Arabic, before or with the code, and ask the user to save it in Pencil so it can be committed. Before opening the PR, and again after each review fix that touches a screen, run a design sync check: screenshot every changed screen at 390 and 1440 px in both languages and compare each with its frame. Then fix the `.pen` (or the code) until labels, controls, their order and states match, and list any intended difference in the PR. Check it end to end on the test site
   (`scripts/dev-test-site.sh`), never on `frontend`.
2. **Add e2e tests** in `e2e/` for every happy path the feature adds or changes, at the widths it supports (`@phone`,
   `@desktop`), with at least one Arabic path when it has new screens. Assert what the screen shows, not only that it
   loads: figures and names that match what was entered or what ERPNext holds. Keep runs repeatable (unique names, no
   stock drain). Run the whole suite (`npm run e2e`) until it passes, and fix the app when a test exposes a bug.
3. **Open the PR** against `development`. Run `npm run format:check`, `npm test` and `npm run e2e` before every push.
4. **Review** with `/code-review <PR> high` (it runs in the background; wait for its notification).
5. **Triage every finding** before fixing:
   - Check it against the code and, for ERPNext behaviour, against the local v16 container. Drop the
     ones that don't hold up.
   - Rate each real one:
     - **High:** wrong money, stock or document data, a duplicate or lost write, a security or permission gap,
       or a crash on a normal path.
     - **Medium:** a visible bug on a plausible path.
     - **Low:** an unlikely edge case or a brief cosmetic glitch.
     - **Nit:** style or wording.
6. **Fix** high, medium, and cheap low findings, each with a test that fails without the fix. Commit, push,
   update `docs/STATUS.md`.
7. **Save the lessons.** For every real finding that could recur in other code, save it to memory (below)
   before the next pass.
8. **Decide** whether to run another pass (below). If yes, go to step 4. If not, merge.
9. **Merge** once CI is green and the branch is up to date with `development`, with a merge commit
   (`gh pr merge <PR> --merge --delete-branch`), as earlier PRs were.

## Saving review lessons

A finding is worth saving when it teaches something beyond this diff:
- an ERPNext/Frappe behaviour;
- a project rule that was broken, such as en/ar parity, RTL or design fidelity;
- a bug pattern that could recur, such as stale state, retry or idempotency, or copied content keeping its source's
  references.

Don't save one-off typos, sample-data slips, or anything the code or CLAUDE.md already states.

For each one, check `MEMORY.md` for an existing lesson on the same pattern and update it rather than adding a
duplicate. Otherwise write one `feedback` memory per pattern:
- the name starts with `review-lesson-`;
- the body states the rule, then **Why:** (the PR and the failure it caused) and **How to apply:** (what to do
  or check while building);
- it links to [[feature-delivery-loop]].

Add its line to `MEMORY.md`. If a lesson is project-wide and stable, propose adding it to CLAUDE.md instead.

## When reviewing is enough

Review again only while a pass is still finding high or medium issues. Stop and merge when **any** of these holds:

| Signal | Why it's enough |
|---|---|
| The latest pass found nothing above **low** | Remaining risk is edge cases; more passes trade time for trivia |
| Two passes in a row found only low/nit items | Returns have flattened |
| Findings are about code outside the PR's purpose, or repeat earlier deferred ones | The review has run out of real targets |

Always run one more pass after fixing a **high** finding, since such fixes often have their own bugs.
Leave deferred low/nit items in the PR description or `docs/STATUS.md`, not as TODO comments.

If a review agent stalls or fails, run it once more. If it fails again, review the latest fix commits
yourself instead of the whole diff.

## After a batch of features

Once a group of steps is merged, run one review of the whole `development` branch with the same triage and stopping rule.

## Common mistakes

- Treating "no findings" as the only exit and looping on ever-smaller edge cases.
- Fixing a finding without first confirming it's real.
- Merging with a high finding fixed but not re-reviewed.
- Leaving `docs/STATUS.md` describing work that's already committed.
- Fixing a recurring kind of finding without saving the lesson, so the next feature repeats it.
- Merging a feature without e2e tests for its happy paths, or with tests that only check a page loads.

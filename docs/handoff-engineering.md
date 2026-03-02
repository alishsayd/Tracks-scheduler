# Engineering Handoff (Tracks Scheduler v6)

This document is for software engineers taking over the prototype codebase.

## 1. Architecture Map

Primary UI entrypoint:
- `src/AppV6.tsx`

Planning flow modules:
- `src/appv6/useCampusFlow.ts`  
  Owns Step 0/1/2 state, gating, apply pipeline, and homeroom unlock state.
- `src/appv6/campusFlow.ts`  
  Step policy helpers (demand snapshot, level policy, feasibility checks, step option builders).
- `src/appv6/applyCampusPlan.ts`  
  Converts chosen plan into room assignments.

Homeroom/movement modules:
- `src/appv6/useHomeroomMovement.ts`  
  Owns side panel state, movement summaries, room flags, and manual destination changes.
- `src/domain/plannerMovement.ts`  
  Movement classification and deterministic auto-routing.
- `src/domain/rules.ts`  
  Student-course matching rules.

Policy constants (single source of truth):
- `src/domain/plannerPolicy.ts`

Core domain data:
- `src/domain/constants.ts`
- `src/domain/types.ts`
- `src/domain/data.ts`

## 2. UI State Machine

Top-level tabs:
- `Campus Plan`
- `Homerooms`

Homeroom lock behavior:
- Homeroom is enabled only when:
  - campus flow is complete (`step0 && step1 && step2`), and
  - a plan has been applied, and
  - `planApplied === true`.
- Any edit to Step 0/1/2 marks plan stale (`planApplied = false`).
- Re-applying marks plan fresh (`planApplied = true`).
- If user is on Homeroom and plan becomes stale, app redirects to Campus.

## 3. Apply Pipeline

Implemented in `useCampusFlow` + `buildCampusAssignments`.

On `Apply`:
1. Build whitelist from selected leveled streams + grade-wide selections.
2. Build assignments from Step 1 room-map previews and Step 2 selections.
3. Apply Grade 12 Qudrat/Tahsili coupling.
4. Auto-resolve move destinations for all `mustMoveOut` students.
5. Save assignments + move resolutions and navigate to Homeroom.

## 4. Movement Model

For each room/day/slot:
- `aligned`: student matches current room course.
- `mustMoveOut`: mismatch with valid destination options.
- `forcedStay`: mismatch with no valid destination options.
- `moveIns`: students assigned from another room.

Manual actions:
- In Homeroom side panel, `Change` updates move destination per `(studentId, blockKey)`.

## 5. Shared Policy Assumptions

Centralized in `src/domain/plannerPolicy.ts`:
- `PLANNING_ROOM_CAPACITY = 22`
- `ROOM_PRESSURE_ALWAYS_CONSTRAINED = true`
- Shared destination ranking policy:
  - lower current load first,
  - stable tie-break,
  - same-grade preferred only when not more loaded than cross-grade option.

## 6. Important Invariants

- Step 1 options are gated so selected bundles keep Step 2 feasible.
- Step 2 options are auto-cleaned when upstream constraints change.
- Step 2 allows apply only when all required offerings are satisfiable and selected.
- Movement resolution is deterministic (sort + tie-breakers).

## 7. Safe Change Points

If you need to change behavior, start here:
- Step 0 thresholds/capacity assumptions:
  - `campusFlow.ts` + `plannerPolicy.ts`
- Step 1 stream feasibility constraints:
  - `useCampusFlow.ts` feasibility block and `canSatisfyRequiredGradeWideSubjects`
- Auto-route strategy:
  - `plannerMovement.ts` + `plannerPolicy.ts`
- Homeroom lock semantics:
  - `useCampusFlow.ts` (`planApplied`, `markPlanDirty`, `homeroomEnabled`)

## 8. Recommended Guard Tests

Before major changes, ensure these remain green:
- `src/appv6/campusFlow.test.ts`
- `src/domain/planner.test.ts`
- `src/domain/plannerV6.test.ts`

Add tests when changing:
- same-grade vs cross-grade ranking decisions,
- homeroom relock behavior after Step edits,
- Step 1 feasibility gating.

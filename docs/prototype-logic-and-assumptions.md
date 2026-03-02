# Prototype Logic and Assumptions (Tracks Scheduler v6)

This document explains how the current prototype makes planning and assignment decisions, and what assumptions it is explicitly built on.

## Scope

- Applies to the current React + TypeScript prototype in this repo (`AppV6` flow).
- Focuses on campus setup (Step 0-2), auto-assignment defaults, and homeroom movement behavior.
- Describes current behavior, not ideal future-state behavior.

## End-to-End Workflow Logic

### Step 0: Demand Snapshot and Level Policy

The app computes base demand per leveled subject (`kammi`, `lafthi`, `esl`) using student needs, excluding students already marked `done` for that subject.

Then it flags underfilled levels as decision points:

- `underfilled` if level demand is `> 0` and `< 50%` of planning capacity.
- Planning capacity is fixed at `22` for this pre-flight logic.
- Current prototype assumes room pressure is always constrained (`noSpareRooms = true`), so underfilled levels always trigger explicit RUN/CLOSE decisions.

Decisions produce a routing policy:

- `RUN`: level remains open.
- `CLOSE`: students are remapped by rule:
  - `L1 -> L2` (or fallback `L3` if needed),
  - `L3 -> L2` (or fallback `L1`),
  - `L2 -> split between L1 and L3`.

Guardrail:

- A subject with demand cannot end with all levels closed.

## Step 1: Bundle Selection and Room-Map Preview

For each leveled subject with a selected stream bundle:

1. The system remaps students to effective levels according to Step 0 policy.
2. It estimates rooms needed per running level (`ceil(levelDemand / 22)`, min 1 when demand > 0).
3. If required rooms exceed host-room supply, it reduces rooms by minimizing overflow penalty.
4. It assigns each room a host level using "best fit" by existing in-room level concentration.
5. For Qudrat subjects, Grade 12 rooms are fixed to `AUTO_TAHSILI` and excluded from host candidates.

The preview then places students to rooms:

- Keep student in home room if host matches target level.
- Otherwise choose destination room using two signals:
  1. Prefer same-grade when roster load is comparable.
  2. Keep receiving-room rosters balanced by choosing the lower current load.
- Tie-breaker uses lower room id.

If no valid destination exists, student stays in home room as forced stay.

### Step 2: Grade-Wide Course Selection

For each grade and grade-wide subject:

- Valid options are filtered by leveled-blocked meetings (time collisions with activated leveled streams in that grade).
- If only one valid option exists, it is auto-fixed.
- If multiple exist, lead must choose.
- If zero exist, Step 2 is not complete.

### Apply: Build Assignments and Pre-Resolve Moves

On `Apply`:

1. A campus whitelist is built from selected stream courses and selected grade-wide courses.
2. Room assignments are generated from Step 1 previews + Step 2 selections.
3. Qudrat/Tahsili coupling is applied for Grade 12 via auto Tahsili fill on Qudrat slots.
4. Grade-wide writes can overwrite seeded cells for the same room/day/slot.
5. Must-move students are auto-resolved into destination rooms before opening homeroom view.

## Homeroom Movement Logic

For each room + timetable block, movement is computed as:

- `aligned`: correctly placed.
- `mustMoveOut`: has valid destination options.
- `forcedStay`: mismatch with no available valid option.
- `moveIns`: assigned into this room from elsewhere.

Must-move auto-resolution is block-based and deterministic:

- Moves are deduplicated by `student + blockKey`.
- Destination scoring uses the same two biases:
  - Prefer same-grade when possible,
  - Keep destination-room rosters balanced.
- Capacity is a soft signal, not a hard blocker.

Manual edits happen in Homeroom side panel via `Change` on each student row.
There is no separate reconciliation tab in the current prototype.

## Key Assumptions in This Prototype

- Step 0 planning uses fixed capacity `22` (not per-room real capacity).
- Room pressure is treated as constrained in Step 0 (`noSpareRooms = true`).
- Capacity does not hard-block assignment; it only influences ranking.
- Student level is never persisted as changed; remap is planning-time routing only.
- Students marked `done` in a leveled subject are excluded from that subject demand.
- Grade 12 students not done with Qudrat are gated out of Tahsili.
- Qudrat subjects reserve Grade 12 rooms for Tahsili (`AUTO_TAHSILI`) in preview/apply logic.
- Time-block identity for movement uses subject + first meeting slot + pattern (`blockKey`).
- If no valid destination exists, student remains in place as forced stay.
- Auto-resolution is deterministic via sort/tie-break order (room id/student id).

## Non-Goals (Current)

- No global timetable optimization beyond current heuristics.
- No hard-capacity enforcement with failure states.
- No social graph optimization; only grade/cohesion heuristics.
- No full-school schedule integration beyond this planner surface.

## Code Map (Main Entry Points)

- Flow orchestration: `src/AppV6.tsx`
- Step 0/1/2 policy helpers: `src/appv6/campusFlow.ts`
- Apply-time assignment build: `src/appv6/applyCampusPlan.ts`
- Room-map preview and placement heuristics: `src/domain/plannerV6RoomMap.ts`
- Movement classification and auto-resolve: `src/domain/plannerMovement.ts`
- Matching rules (student vs course): `src/domain/rules.ts`
- Shared domain constants/types: `src/domain/constants.ts`, `src/domain/types.ts`

import { LEVELS, SUBJECTS } from "./constants";
import type { Assignments, Course, Day, Homeroom, LeveledSubject, Level, StreamGroup, Student } from "./types";
import type { RoomHost, RoomMapPreview, RoomMapRow, RoomMapSummary, SubjectRoutingPlan } from "./plannerV6Core";

function emptyCounts(): Record<Level, number> {
  return { L1: 0, L2: 0, L3: 0 };
}

function cloneCounts(input: Record<Level, number>): Record<Level, number> {
  return { L1: input.L1, L2: input.L2, L3: input.L3 };
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSingleTarget(source: Level, target: Level): Level {
  if (target !== source) return target;
  if (source === "L1") return "L2";
  if (source === "L3") return "L2";
  return "L1";
}

function runningLevels(plan: SubjectRoutingPlan): Level[] {
  return LEVELS.filter((level) => plan.run[level]);
}

function normalizedPlan(plan: SubjectRoutingPlan): SubjectRoutingPlan {
  return {
    run: {
      L1: Boolean(plan.run.L1),
      L2: Boolean(plan.run.L2),
      L3: Boolean(plan.run.L3),
    },
    forceMove: {
      L1: {
        target: normalizeSingleTarget("L1", plan.forceMove.L1.target),
        count: clampInt(plan.forceMove.L1.count, 0, Number.MAX_SAFE_INTEGER),
      },
      L2: {
        toL1: clampInt(plan.forceMove.L2.toL1, 0, Number.MAX_SAFE_INTEGER),
        toL3: clampInt(plan.forceMove.L2.toL3, 0, Number.MAX_SAFE_INTEGER),
      },
      L3: {
        target: normalizeSingleTarget("L3", plan.forceMove.L3.target),
        count: clampInt(plan.forceMove.L3.count, 0, Number.MAX_SAFE_INTEGER),
      },
    },
  };
}

function buildRemap(students: Student[], subject: LeveledSubject, planInput: SubjectRoutingPlan) {
  const plan = normalizedPlan(planInput);

  const grouped: Record<Level, Student[]> = { L1: [], L2: [], L3: [] };
  for (const student of students) {
    if (student.done[subject]) continue;
    grouped[student.needs[subject]].push(student);
  }

  for (const level of LEVELS) {
    grouped[level].sort((a, b) => a.id.localeCompare(b.id));
  }

  const remappedLevelByStudent = new Map<string, Level>();
  const base = emptyCounts();
  const effective = emptyCounts();

  for (const level of LEVELS) {
    base[level] = grouped[level].length;
  }

  for (const level of LEVELS) {
    const source = grouped[level];

    if (plan.run[level]) {
      for (const student of source) remappedLevelByStudent.set(student.id, level);
      effective[level] += source.length;
      continue;
    }

    if (level === "L2") {
      const moveToL1 = clampInt(plan.forceMove.L2.toL1, 0, source.length);
      const moveToL3 = clampInt(plan.forceMove.L2.toL3, 0, source.length - moveToL1);

      for (let i = 0; i < source.length; i += 1) {
        const student = source[i];
        if (i < moveToL1) {
          remappedLevelByStudent.set(student.id, "L1");
          effective.L1 += 1;
        } else if (i < moveToL1 + moveToL3) {
          remappedLevelByStudent.set(student.id, "L3");
          effective.L3 += 1;
        } else {
          remappedLevelByStudent.set(student.id, "L2");
          effective.L2 += 1;
        }
      }
      continue;
    }

    const target = level === "L1" ? plan.forceMove.L1.target : plan.forceMove.L3.target;
    const count = level === "L1" ? plan.forceMove.L1.count : plan.forceMove.L3.count;
    const normalizedTarget = normalizeSingleTarget(level, target);
    const moveCount = clampInt(count, 0, source.length);

    for (let i = 0; i < source.length; i += 1) {
      const student = source[i];
      if (i < moveCount) {
        remappedLevelByStudent.set(student.id, normalizedTarget);
        effective[normalizedTarget] += 1;
      } else {
        remappedLevelByStudent.set(student.id, level);
        effective[level] += 1;
      }
    }
  }

  let moved = 0;
  for (const student of students) {
    if (student.done[subject]) continue;
    const next = remappedLevelByStudent.get(student.id);
    if (next && next !== student.needs[subject]) moved += 1;
  }

  return {
    base,
    effective,
    moved,
    levelsRunning: runningLevels(plan),
    remappedLevelByStudent,
  };
}

function pickBestRoom(
  rooms: Homeroom[],
  assigned: Set<number>,
  roomLevelCounts: Record<number, Record<Level, number>>,
  level: Level
) {
  let best: Homeroom | null = null;
  let bestCount = -1;

  for (const room of rooms) {
    if (assigned.has(room.id)) continue;
    const count = roomLevelCounts[room.id]?.[level] ?? 0;
    if (count > bestCount) {
      best = room;
      bestCount = count;
    }
  }

  return best;
}

function meetingKey(day: Day, slot: number) {
  return `${day}|${slot}`;
}

export function autoAssignTahsiliForQudrat(
  assignments: Assignments,
  courses: Course[],
  group: StreamGroup,
  homerooms: Homeroom[]
) {
  const qudratMeetings = new Set<string>();
  for (const course of group.courses) {
    for (const meeting of course.meetings) {
      qudratMeetings.add(meetingKey(meeting.day, meeting.slot));
    }
  }

  const tahsiliCourses = courses.filter((course) => course.grade === 12 && SUBJECTS[course.subject].tahsili);

  for (const room of homerooms) {
    if (room.grade !== 12) continue;
    for (const course of tahsiliCourses) {
      for (const meeting of course.meetings) {
        const key = meetingKey(meeting.day, meeting.slot);
        if (!qudratMeetings.has(key)) continue;
        if (!assignments[room.id]) assignments[room.id] = {};
        if (!assignments[room.id]![meeting.day]) assignments[room.id]![meeting.day] = {};
        assignments[room.id]![meeting.day]![meeting.slot] = course.id;
      }
    }
  }
}

export function buildRoomMapPreview(
  subject: LeveledSubject,
  streamGroup: StreamGroup,
  planInput: SubjectRoutingPlan,
  students: Student[],
  homerooms: Homeroom[],
  hostOverrides: Partial<Record<number, RoomHost>> = {}
): RoomMapPreview {
  const remap = buildRemap(students, subject, planInput);
  const levelsRunning = remap.levelsRunning;
  const qudratSubject = SUBJECTS[subject].qudrat === true;

  const hostCandidates = homerooms.filter((room) => !(qudratSubject && room.grade === 12));

  const roomLevelCounts: Record<number, Record<Level, number>> = {};
  for (const room of hostCandidates) {
    roomLevelCounts[room.id] = emptyCounts();
  }

  for (const student of students) {
    const roomCounts = roomLevelCounts[student.homeroom];
    if (!roomCounts) continue;
    if (student.done[subject]) continue;

    const mapped = remap.remappedLevelByStudent.get(student.id) ?? student.needs[subject];
    roomCounts[mapped] += 1;
  }

  const roomsNeeded: Record<Level, number> = { L1: 0, L2: 0, L3: 0 };
  let targetRooms = 0;
  for (const level of levelsRunning) {
    const demand = remap.effective[level];
    if (demand > 0) {
      roomsNeeded[level] = Math.max(1, Math.ceil(demand / 22));
      targetRooms += roomsNeeded[level];
    }
  }

  const overflowFor = (level: Level, rooms: number) => Math.max(0, remap.effective[level] - rooms * 22);

  while (targetRooms > hostCandidates.length) {
    const reducible = levelsRunning
      .filter((level) => roomsNeeded[level] > 1)
      .sort((a, b) => {
        const aCurrentRooms = roomsNeeded[a];
        const bCurrentRooms = roomsNeeded[b];

        const aOverflowBefore = overflowFor(a, aCurrentRooms);
        const bOverflowBefore = overflowFor(b, bCurrentRooms);
        const aOverflowAfter = overflowFor(a, aCurrentRooms - 1);
        const bOverflowAfter = overflowFor(b, bCurrentRooms - 1);

        const aPenalty = aOverflowAfter - aOverflowBefore;
        const bPenalty = bOverflowAfter - bOverflowBefore;
        if (aPenalty !== bPenalty) return aPenalty - bPenalty;

        if (aOverflowAfter !== bOverflowAfter) return aOverflowAfter - bOverflowAfter;

        const aSpareAfter = (aCurrentRooms - 1) * 22 - remap.effective[a];
        const bSpareAfter = (bCurrentRooms - 1) * 22 - remap.effective[b];
        if (aSpareAfter !== bSpareAfter) return bSpareAfter - aSpareAfter;

        if (aCurrentRooms !== bCurrentRooms) return bCurrentRooms - aCurrentRooms;

        return remap.effective[a] - remap.effective[b];
      })[0];
    if (!reducible) break;
    roomsNeeded[reducible] -= 1;
    targetRooms -= 1;
  }

  const assignedRooms = new Set<number>();
  const hostByRoom: Record<number, RoomHost> = {};

  const levelOrder = [...levelsRunning].sort((a, b) => remap.effective[b] - remap.effective[a]);
  for (const level of levelOrder) {
    for (let i = 0; i < roomsNeeded[level]; i += 1) {
      const best = pickBestRoom(hostCandidates, assignedRooms, roomLevelCounts, level);
      if (!best) break;
      hostByRoom[best.id] = level;
      assignedRooms.add(best.id);
    }
  }

  for (const room of hostCandidates) {
    if (hostByRoom[room.id]) continue;
    const fallback = levelOrder[0] ?? "L2";
    hostByRoom[room.id] = fallback;
  }

  if (qudratSubject) {
    for (const room of homerooms) {
      if (room.grade === 12) hostByRoom[room.id] = "AUTO_TAHSILI";
    }
  }

  for (const room of homerooms) {
    const override = hostOverrides[room.id];
    if (!override) continue;
    if (override === "AUTO_TAHSILI") continue;
    if (!levelsRunning.includes(override)) continue;
    if (qudratSubject && room.grade === 12) continue;
    hostByRoom[room.id] = override;
  }

  const assignedCounts: Record<number, number> = {};
  const moveInsByRoom: Record<number, number> = {};
  for (const room of homerooms) {
    assignedCounts[room.id] = 0;
    moveInsByRoom[room.id] = 0;
  }

  const roomCap = Object.fromEntries(homerooms.map((room) => [room.id, room.capacity])) as Record<number, number>;
  const pickDestinationRoom = (candidateRooms: Homeroom[], studentGrade: number) => {
    const scored = candidateRooms.map((room) => {
      const current = assignedCounts[room.id] ?? 0;
      const remaining = (roomCap[room.id] ?? 0) - current;
      return {
        room,
        current,
        remaining,
        clustered: moveInsByRoom[room.id] ?? 0,
        sameGrade: room.grade === studentGrade,
      };
    });

    const sameGrade = scored.filter((entry) => entry.sameGrade);
    const sameGradeWithSeats = sameGrade.filter((entry) => entry.remaining > 0);
    const withSeats = scored.filter((entry) => entry.remaining > 0);

    let pool = scored;
    if (sameGradeWithSeats.length > 0) {
      pool = sameGradeWithSeats;
    } else if (sameGrade.length > 0 && withSeats.length > 0) {
      // Only mix across grades after same-grade rooms have no available seats.
      pool = withSeats.filter((entry) => !entry.sameGrade);
    } else if (sameGrade.length > 0) {
      pool = sameGrade;
    } else if (withSeats.length > 0) {
      pool = withSeats;
    }

    return pool
      .slice()
      .sort((a, b) => {
        if (b.clustered !== a.clustered) return b.clustered - a.clustered;
        if (b.remaining !== a.remaining) return b.remaining - a.remaining;
        if (a.current !== b.current) return a.current - b.current;
        return a.room.id - b.room.id;
      })[0]?.room;
  };

  const placements: Record<string, number> = {};
  let forcedStays = 0;

  for (const student of students) {
    if (student.done[subject]) {
      placements[student.id] = student.homeroom;
      assignedCounts[student.homeroom] += 1;
      continue;
    }

    if (qudratSubject && student.grade === 12 && student.doneQ) {
      placements[student.id] = student.homeroom;
      assignedCounts[student.homeroom] += 1;
      continue;
    }

    const targetLevel = remap.remappedLevelByStudent.get(student.id) ?? student.needs[subject];

    if (!levelsRunning.includes(targetLevel)) {
      placements[student.id] = student.homeroom;
      assignedCounts[student.homeroom] += 1;
      forcedStays += 1;
      continue;
    }

    const homeHost = hostByRoom[student.homeroom];
    if (homeHost === targetLevel) {
      placements[student.id] = student.homeroom;
      assignedCounts[student.homeroom] += 1;
      continue;
    }

    const candidateRooms = homerooms.filter((room) => hostByRoom[room.id] === targetLevel);
    if (candidateRooms.length === 0) {
      placements[student.id] = student.homeroom;
      assignedCounts[student.homeroom] += 1;
      forcedStays += 1;
      continue;
    }

    const chosen = pickDestinationRoom(candidateRooms, student.grade);
    if (!chosen) {
      placements[student.id] = student.homeroom;
      assignedCounts[student.homeroom] += 1;
      forcedStays += 1;
      continue;
    }

    placements[student.id] = chosen.id;
    assignedCounts[chosen.id] += 1;
    moveInsByRoom[chosen.id] += 1;
  }

  const rows: RoomMapRow[] = homerooms.map((room) => {
    let stay = 0;
    let inCount = 0;
    let outCount = 0;

    for (const student of students) {
      const targetRoom = placements[student.id];
      if (student.homeroom === room.id && targetRoom === room.id) stay += 1;
      if (student.homeroom !== room.id && targetRoom === room.id) inCount += 1;
      if (student.homeroom === room.id && targetRoom !== room.id) outCount += 1;
    }

    return {
      roomId: room.id,
      roomName: room.name,
      grade: room.grade,
      host: hostByRoom[room.id],
      fixed: qudratSubject && room.grade === 12,
      stay,
      inCount,
      outCount,
      effectiveCount: assignedCounts[room.id] ?? 0,
      capacity: room.capacity,
    };
  });

  const summary: RoomMapSummary = {
    stay: rows.reduce((sum, row) => sum + row.stay, 0),
    move: rows.reduce((sum, row) => sum + row.outCount, 0),
    forcedStays,
    worstRoom: null,
  };

  for (const row of rows) {
    if (!summary.worstRoom || row.effectiveCount > summary.worstRoom.effective) {
      summary.worstRoom = {
        roomId: row.roomId,
        effective: row.effectiveCount,
        capacity: row.capacity,
      };
    }
  }

  return {
    hostByRoom,
    rows,
    summary,
    levelDemand: cloneCounts(remap.effective),
    levelsRunning,
  };
}

import { LEVELS, SUBJECTS } from "./constants";
import type { Assignments, Course, Day, Homeroom, LeveledSubject, Level, StreamGroup, Student } from "./types";

export type SacrificePolicy = "run_all" | "merge_l3_to_l2" | "merge_l1_to_l2";
export type RoomHost = Level | "AUTO_TAHSILI";

export interface Step0Demand {
  base: Record<Level, number>;
  effective: Record<Level, number>;
  mergedCount: number;
  levelsRunning: Level[];
}

export interface RoomMapRow {
  roomId: number;
  roomName: string;
  grade: number;
  host: RoomHost;
  fixed: boolean;
  stay: number;
  inCount: number;
  outCount: number;
  effectiveCount: number;
  capacity: number;
}

export interface RoomMapSummary {
  stay: number;
  move: number;
  forcedStays: number;
  worstRoom: { roomId: number; effective: number; capacity: number } | null;
}

export interface RoomMapPreview {
  hostByRoom: Record<number, RoomHost>;
  rows: RoomMapRow[];
  summary: RoomMapSummary;
  levelDemand: Record<Level, number>;
  levelsRunning: Level[];
}

export interface SubjectBundlePlan {
  subject: LeveledSubject;
  streamGroupId: string;
  policy: SacrificePolicy;
  hostByRoom: Record<number, RoomHost>;
}

function emptyCounts(): Record<Level, number> {
  return { L1: 0, L2: 0, L3: 0 };
}

function cloneCounts(input: Record<Level, number>): Record<Level, number> {
  return { L1: input.L1, L2: input.L2, L3: input.L3 };
}

export function policyLabel(policy: SacrificePolicy) {
  if (policy === "merge_l3_to_l2") return "L3 -> L2";
  if (policy === "merge_l1_to_l2") return "L1 -> L2";
  return "Run L1 + L2 + L3";
}

export function levelAfterPolicy(level: Level, policy: SacrificePolicy): Level {
  if (policy === "merge_l3_to_l2" && level === "L3") return "L2";
  if (policy === "merge_l1_to_l2" && level === "L1") return "L2";
  return level;
}

export function levelsForPolicy(policy: SacrificePolicy): Level[] {
  if (policy === "merge_l3_to_l2") return ["L1", "L2"];
  if (policy === "merge_l1_to_l2") return ["L2", "L3"];
  return [...LEVELS];
}

function subjectDemand(students: Student[], subject: LeveledSubject, policy: SacrificePolicy): Step0Demand {
  const base = emptyCounts();
  const effective = emptyCounts();

  for (const student of students) {
    if (student.done[subject]) continue;
    const needs = student.needs[subject];
    base[needs] += 1;
    effective[levelAfterPolicy(needs, policy)] += 1;
  }

  return {
    base,
    effective,
    mergedCount: Math.abs(base.L1 - effective.L1) + Math.abs(base.L3 - effective.L3),
    levelsRunning: levelsForPolicy(policy),
  };
}

export function buildStep0DemandBySubject(
  students: Student[],
  policies: Record<LeveledSubject, SacrificePolicy>
): Record<LeveledSubject, Step0Demand> {
  return {
    kammi: subjectDemand(students, "kammi", policies.kammi),
    lafthi: subjectDemand(students, "lafthi", policies.lafthi),
    esl: subjectDemand(students, "esl", policies.esl),
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
  policy: SacrificePolicy,
  students: Student[],
  homerooms: Homeroom[],
  hostOverrides: Partial<Record<number, RoomHost>> = {}
): RoomMapPreview {
  const levelsRunning = levelsForPolicy(policy);
  const qudratSubject = SUBJECTS[subject].qudrat === true;

  const baseDemand = emptyCounts();
  for (const student of students) {
    if (student.done[subject]) continue;
    const lvl = levelAfterPolicy(student.needs[subject], policy);
    baseDemand[lvl] += 1;
  }

  const hostCandidates = homerooms.filter((room) => !(qudratSubject && room.grade === 12));

  const roomLevelCounts: Record<number, Record<Level, number>> = {};
  for (const room of hostCandidates) {
    roomLevelCounts[room.id] = emptyCounts();
  }

  for (const student of students) {
    const roomCounts = roomLevelCounts[student.homeroom];
    if (!roomCounts) continue;
    if (student.done[subject]) continue;
    const lvl = levelAfterPolicy(student.needs[subject], policy);
    roomCounts[lvl] += 1;
  }

  const roomsNeeded: Record<Level, number> = { L1: 0, L2: 0, L3: 0 };
  let targetRooms = 0;
  for (const level of levelsRunning) {
    if (baseDemand[level] > 0) {
      roomsNeeded[level] = Math.max(1, Math.ceil(baseDemand[level] / 22));
      targetRooms += roomsNeeded[level];
    }
  }

  while (targetRooms > hostCandidates.length) {
    const reducible = levelsRunning
      .filter((level) => roomsNeeded[level] > 1)
      .sort((a, b) => baseDemand[a] - baseDemand[b])[0];
    if (!reducible) break;
    roomsNeeded[reducible] -= 1;
    targetRooms -= 1;
  }

  const assignedRooms = new Set<number>();
  const hostByRoom: Record<number, RoomHost> = {};

  const levelOrder = [...levelsRunning].sort((a, b) => baseDemand[b] - baseDemand[a]);
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
  for (const room of homerooms) {
    assignedCounts[room.id] = 0;
  }

  const roomCap = Object.fromEntries(homerooms.map((room) => [room.id, room.capacity])) as Record<number, number>;

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

    const targetLevel = levelAfterPolicy(student.needs[subject], policy);
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

    const chosen = candidateRooms
      .slice()
      .sort((a, b) => {
        const aRemaining = (roomCap[a.id] ?? 0) - (assignedCounts[a.id] ?? 0);
        const bRemaining = (roomCap[b.id] ?? 0) - (assignedCounts[b.id] ?? 0);
        if (bRemaining !== aRemaining) return bRemaining - aRemaining;
        return a.id - b.id;
      })[0];

    placements[student.id] = chosen.id;
    assignedCounts[chosen.id] += 1;
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
    levelDemand: cloneCounts(baseDemand),
    levelsRunning,
  };
}

export function levelOpenFromPolicies(policies: Record<LeveledSubject, SacrificePolicy>) {
  const defaultState = { L1: false, L2: false, L3: false };
  const result: Record<LeveledSubject, Record<Level, boolean>> = {
    kammi: { ...defaultState },
    lafthi: { ...defaultState },
    esl: { ...defaultState },
  };

  (Object.keys(result) as LeveledSubject[]).forEach((subject) => {
    const running = new Set(levelsForPolicy(policies[subject]));
    for (const level of LEVELS) {
      result[subject][level] = running.has(level);
    }
  });

  return result;
}

export function effectiveNeedLabel(level: Level, policy: SacrificePolicy) {
  const mapped = levelAfterPolicy(level, policy);
  if (mapped === level) return level;
  return `${level} -> ${mapped}`;
}

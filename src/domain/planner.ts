import { DAYS, LEVELS, SLOTS, SUBJECTS } from "./constants";
import { getSubjectLabelFromT } from "./i18n";
import { blockKeyForCourse, courseMatchesStudent } from "./rules";
import type {
  Assignments,
  Course,
  Day,
  Homeroom,
  Level,
  MoveResolutions,
  MovementResult,
  MustMoveStudent,
  Student,
  StreamGroup,
  SubjectKey,
  Translations,
} from "./types";

export type SelectedStreams = Partial<Record<"kammi" | "lafthi" | "esl", string | undefined>>;

export type LevelOpenState = Record<"kammi" | "lafthi" | "esl", Record<Level, boolean>>;

export type GradeCourseSelections = Partial<Record<number, Partial<Record<SubjectKey, string | undefined>>>>;

export function getAssignment(assignments: Assignments, roomId: number, day: Day, slot: number) {
  return assignments?.[roomId]?.[day]?.[slot] || null;
}

export function buildCampusWhitelist(selectedStreams: SelectedStreams, gradeCourseSelections: GradeCourseSelections, levelOpen: LevelOpenState, streamGroups: StreamGroup[]) {
  const set = new Set<string>();

  for (const [subjectRaw, streamGroupId] of Object.entries(selectedStreams)) {
    if (!streamGroupId) continue;
    const subject = subjectRaw as "kammi" | "lafthi" | "esl";
    const streamGroup = streamGroups.find((entry) => entry.id === streamGroupId);
    if (!streamGroup) continue;
    for (const course of streamGroup.courses) {
      if (course.level && levelOpen[subject]?.[course.level] === false) continue;
      set.add(course.id);
    }
  }

  for (const gradeMap of Object.values(gradeCourseSelections)) {
    for (const courseId of Object.values(gradeMap || {})) {
      if (courseId) set.add(courseId);
    }
  }

  return set;
}

function setMeeting(assignments: Assignments, roomId: number, day: Day, slot: number, courseId: string) {
  if (!assignments[roomId]) assignments[roomId] = {};
  if (!assignments[roomId][day]) assignments[roomId][day] = {};
  assignments[roomId][day]![slot] = courseId;
}

export function assignCourseMeetings(assignments: Assignments, roomId: number, course: Course) {
  for (const meeting of course.meetings) {
    setMeeting(assignments, roomId, meeting.day, meeting.slot, course.id);
  }
}

export function clearCourseMeetingsForRoom(assignments: Assignments, roomId: number, course: Course) {
  const next: Assignments = { ...assignments };
  for (const meeting of course.meetings) {
    if (!next[roomId]?.[meeting.day]) continue;
    const dayState = { ...(next[roomId]?.[meeting.day] || {}) };
    if (dayState[meeting.slot] === course.id) delete dayState[meeting.slot];
    next[roomId] = { ...(next[roomId] || {}), [meeting.day]: dayState };
  }
  return next;
}

export function seedAssignmentsFromCampusPlan(
  whitelist: Set<string>,
  selectedStreams: SelectedStreams,
  levelOpen: LevelOpenState,
  gradeCourseSelections: GradeCourseSelections,
  students: Student[],
  courses: Course[],
  streamGroups: StreamGroup[],
  homerooms: Homeroom[]
) {
  const next: Assignments = {};

  const getCourse = (courseId: string) => courses.find((entry) => entry.id === courseId);

  for (const [subjectRaw, streamGroupId] of Object.entries(selectedStreams)) {
    if (!streamGroupId) continue;
    const subject = subjectRaw as "kammi" | "lafthi" | "esl";
    const streamGroup = streamGroups.find((entry) => entry.id === streamGroupId);
    if (!streamGroup) continue;

    const levelToCourseId: Partial<Record<Level, string>> = {};
    for (const course of streamGroup.courses) {
      if (!course.level) continue;
      if (levelOpen[subject]?.[course.level] === false) continue;
      levelToCourseId[course.level] = course.id;
    }

    const roomLevelCounts = homerooms.filter((room) => room.grade !== 12).map((room) => {
      const roomStudents = students.filter((student) => student.homeroom === room.id);
      const dist: Record<Level, number> = { L1: 0, L2: 0, L3: 0 };
      for (const student of roomStudents) {
        if (student.done[subject]) continue;
        dist[student.needs[subject]] += 1;
      }
      return { roomId: room.id, dist };
    });

    const openedLevels = LEVELS.filter((level) => levelToCourseId[level]);
    const totalDemand: Record<Level, number> = { L1: 0, L2: 0, L3: 0 };
    for (const roomEntry of roomLevelCounts) {
      for (const level of LEVELS) totalDemand[level] += roomEntry.dist[level];
    }

    const anchors: Record<number, Level> = {};
    const usedRooms = new Set<number>();

    for (const level of openedLevels) {
      if (totalDemand[level] <= 0) continue;
      const bestRoom = roomLevelCounts
        .filter((entry) => !usedRooms.has(entry.roomId))
        .sort((a, b) => b.dist[level] - a.dist[level])[0];
      if (!bestRoom) continue;
      anchors[bestRoom.roomId] = level;
      usedRooms.add(bestRoom.roomId);
    }

    for (const room of homerooms) {
      if (room.grade === 12) continue;

      const roomLevel = roomLevelCounts.find((entry) => entry.roomId === room.id);
      const dist = roomLevel?.dist || { L1: 0, L2: 0, L3: 0 };

      let chosen = anchors[room.id] || null;
      if (!chosen) {
        let best: Level | null = openedLevels[0] || null;
        let bestCount = -1;
        for (const level of openedLevels) {
          const count = dist[level] || 0;
          if (count > bestCount) {
            bestCount = count;
            best = level;
          }
        }
        if (!best && levelToCourseId.L2) best = "L2";
        chosen = best;
      }

      const courseId = chosen ? levelToCourseId[chosen] : null;
      if (!courseId || !whitelist.has(courseId)) continue;
      const course = getCourse(courseId);
      if (!course) continue;
      assignCourseMeetings(next, room.id, course);
    }
  }

  for (const [gradeRaw, map] of Object.entries(gradeCourseSelections)) {
    const grade = Number(gradeRaw);
    const rooms = homerooms.filter((room) => room.grade === grade);
    for (const courseId of Object.values(map || {})) {
      if (!courseId || !whitelist.has(courseId)) continue;
      const course = getCourse(courseId);
      if (!course) continue;

      for (const room of rooms) {
        for (const meeting of course.meetings) {
          if (!next[room.id]) next[room.id] = {};
          if (!next[room.id][meeting.day]) next[room.id][meeting.day] = {};
          if (!next[room.id][meeting.day]![meeting.slot]) {
            next[room.id][meeting.day]![meeting.slot] = course.id;
          }
        }
      }
    }
  }

  return next;
}

export function getAvailableCourses(
  courses: Course[],
  whitelist: Set<string> | null,
  assignments: Assignments,
  day: Day,
  slot: number,
  roomId: number,
  subjectFilter: SubjectKey | "all",
  homerooms: Homeroom[]
) {
  return courses.filter((course) => {
    if (!whitelist || !whitelist.has(course.id)) return false;
    if (!course.meetings.some((meeting) => meeting.day === day && meeting.slot === slot)) return false;
    if (subjectFilter !== "all" && course.subject !== subjectFilter) return false;

    const roomGrade = homerooms.find((room) => room.id === roomId)?.grade;
    if ((course.subject === "ministry" || course.subject === "future" || SUBJECTS[course.subject].tahsili) && course.grade !== roomGrade) {
      return false;
    }

    if (getAssignment(assignments, roomId, day, slot) === course.id) return false;
    return true;
  });
}

export function effectiveRoomCountForBlock(students: Student[], moveResolutions: MoveResolutions, blockKey: string, roomId: number) {
  const base = students.filter((student) => student.homeroom === roomId).length;
  let out = 0;
  let inn = 0;

  for (const student of students) {
    const destination = moveResolutions?.[student.id]?.[blockKey];
    if (destination === undefined || destination === null) continue;
    if (student.homeroom === roomId && destination !== roomId) out += 1;
    if (student.homeroom !== roomId && destination === roomId) inn += 1;
  }

  return base - out + inn;
}

export function computeMovement(
  roomId: number,
  day: Day,
  slotId: number,
  assignments: Assignments,
  courses: Course[],
  students: Student[],
  moveResolutions: MoveResolutions,
  whitelist: Set<string> | null,
  t: Translations,
  homerooms: Homeroom[]
): MovementResult {
  const assignment = getAssignment(assignments, roomId, day, slotId);
  const empty: MovementResult = { aligned: [], mustMoveOut: [], forcedStay: [], moveIns: [], blockKey: "", effectiveHere: 0 };
  if (!assignment) return empty;

  const course = courses.find((entry) => entry.id === assignment);
  if (!course) return empty;

  const blockKey = blockKeyForCourse(course);
  const subject = SUBJECTS[course.subject];
  const subjectLabel = getSubjectLabelFromT(t, course.subject);
  const roomStudents = students.filter((student) => student.homeroom === roomId);

  const inThisRoom = (student: Student) => {
    const destination = moveResolutions?.[student.id]?.[blockKey];
    if (destination === undefined || destination === null) return student.homeroom === roomId;
    return destination === roomId;
  };

  const optionsFor = (student: Student) => {
    const options: Array<{ roomId: number; courseId: string }> = [];
    for (const room of homerooms) {
      if (room.id === roomId) continue;
      const otherCourseId = getAssignment(assignments, room.id, day, slotId);
      if (!otherCourseId) continue;
      const otherCourse = courses.find((entry) => entry.id === otherCourseId);
      if (!otherCourse) continue;
      if (!whitelist || !whitelist.has(otherCourse.id)) continue;
      if (courseMatchesStudent(otherCourse, student)) {
        options.push({ roomId: room.id, courseId: otherCourse.id });
      }
    }
    return options;
  };

  const aligned: Student[] = [];
  const mustMoveOut: MustMoveStudent[] = [];
  const forcedStay: Array<Student & { reason: string }> = [];

  for (const student of roomStudents) {
    if (!inThisRoom(student)) continue;

    if (subject.tahsili && student.grade === 12 && !student.doneQ) {
      const slotHasQudratSupply = homerooms.some((room) => {
        const candidateId = getAssignment(assignments, room.id, day, slotId);
        if (!candidateId) return false;
        const candidate = courses.find((entry) => entry.id === candidateId);
        if (!candidate) return false;
        return SUBJECTS[candidate.subject].qudrat === true;
      });

      if (!slotHasQudratSupply) {
        aligned.push(student);
        continue;
      }

      const options = optionsFor(student);
      const qudratOptions = options.filter((option) => SUBJECTS[courses.find((entry) => entry.id === option.courseId)!.subject].qudrat);
      if (qudratOptions.length > 0) {
        mustMoveOut.push({
          ...student,
          neededLabel: `${t.qudratLabel} (${t.notDone})`,
          options: qudratOptions,
          resolved: moveResolutions?.[student.id]?.[blockKey],
        });
      } else {
        // Keep the student in the current roster without marking as a forced-stay in this Tahsili cell.
        // Missing Qudrat supply/level is surfaced via top-level flags instead of per-cell status.
        aligned.push(student);
      }
      continue;
    }

    if (courseMatchesStudent(course, student)) {
      aligned.push(student);
      continue;
    }

    if (subject.leveled && student.done[course.subject as "kammi" | "lafthi" | "esl"]) {
      let options = optionsFor(student);
      if (subject.qudrat && student.doneQ) {
        options = options.filter((option) => SUBJECTS[courses.find((entry) => entry.id === option.courseId)!.subject].tahsili);
      }
      if (options.length > 0) {
        mustMoveOut.push({
          ...student,
          neededLabel: subject.qudrat && student.doneQ ? `${t.tahsiliLabel} ${t.grade} ${student.grade}` : `${subjectLabel} ${t.done}`,
          options,
          resolved: moveResolutions?.[student.id]?.[blockKey],
        });
      } else {
        forcedStay.push({ ...student, reason: subject.qudrat && student.doneQ ? t.reasonDoneQudrat : `${subjectLabel} ${t.done}` });
      }
      continue;
    }

    const options = optionsFor(student);

    if (options.length > 0) {
      const need = subject.leveled ? student.needs[course.subject as "kammi" | "lafthi" | "esl"] : `${t.grade} ${student.grade}`;
      mustMoveOut.push({
        ...student,
        neededLabel: `${subjectLabel} ${need}`,
        options,
        resolved: moveResolutions?.[student.id]?.[blockKey],
      });
    } else {
      const need = subject.leveled ? student.needs[course.subject as "kammi" | "lafthi" | "esl"] : `${t.grade} ${student.grade}`;
      forcedStay.push({ ...student, reason: `${t.reasonNoSupply} (${subjectLabel} ${need})` });
    }
  }

  const moveIns = students.filter((student) => student.homeroom !== roomId && moveResolutions?.[student.id]?.[blockKey] === roomId);
  const effectiveHere = effectiveRoomCountForBlock(students, moveResolutions, blockKey, roomId);

  return { aligned, mustMoveOut, forcedStay, moveIns, blockKey, effectiveHere };
}

export function unresolvedMoves(
  assignments: Assignments,
  courses: Course[],
  students: Student[],
  moveResolutions: MoveResolutions,
  whitelist: Set<string> | null,
  t: Translations,
  homerooms: Homeroom[]
) {
  const byKey = new Map<string, MustMoveStudent & { day: Day; slotId: number; fromRoom: number; blockKey: string }>();

  for (const room of homerooms) {
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const assignment = getAssignment(assignments, room.id, day, slot.id);
        if (!assignment) continue;

        const movement = computeMovement(room.id, day, slot.id, assignments, courses, students, moveResolutions, whitelist, t, homerooms);
        if (!movement.blockKey) continue;

        for (const move of movement.mustMoveOut) {
          if (move.resolved !== undefined && move.resolved !== null) continue;
          const key = `${move.id}|${movement.blockKey}`;
          if (!byKey.has(key)) {
            byKey.set(key, {
              ...move,
              day,
              slotId: slot.id,
              fromRoom: room.id,
              blockKey: movement.blockKey,
            });
          }
        }
      }
    }
  }

  return Array.from(byKey.values());
}

export function autoResolveMustMoves(
  assignments: Assignments,
  courses: Course[],
  students: Student[],
  whitelist: Set<string> | null,
  t: Translations,
  homerooms: Homeroom[]
) {
  const resolutions: MoveResolutions = {};
  const pending = unresolvedMoves(assignments, courses, students, resolutions, whitelist, t, homerooms).sort((a, b) => {
    if (a.blockKey !== b.blockKey) return a.blockKey.localeCompare(b.blockKey);
    if (a.fromRoom !== b.fromRoom) return a.fromRoom - b.fromRoom;
    return a.id.localeCompare(b.id);
  });

  for (const move of pending) {
    const existing = resolutions[move.id]?.[move.blockKey];
    if (existing !== undefined && existing !== null) continue;

    const bestOption = move.options
      .slice()
      .sort((a, b) => {
        const roomA = homerooms.find((room) => room.id === a.roomId);
        const roomB = homerooms.find((room) => room.id === b.roomId);

        const capA = roomA?.capacity ?? 0;
        const capB = roomB?.capacity ?? 0;

        const currentA = effectiveRoomCountForBlock(students, resolutions, move.blockKey, a.roomId);
        const currentB = effectiveRoomCountForBlock(students, resolutions, move.blockKey, b.roomId);

        const remainingA = capA - currentA;
        const remainingB = capB - currentB;

        if (remainingB !== remainingA) return remainingB - remainingA;
        if (currentA !== currentB) return currentA - currentB;
        return a.roomId - b.roomId;
      })[0];

    if (!bestOption) continue;

    resolutions[move.id] = {
      ...(resolutions[move.id] || {}),
      [move.blockKey]: bestOption.roomId,
    };
  }

  return resolutions;
}

export function scheduleStats(assignments: Assignments, unresolvedCount: number, homerooms: Homeroom[]) {
  let total = 0;
  let filled = 0;

  for (const room of homerooms) {
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        total += 1;
        if (getAssignment(assignments, room.id, day, slot.id)) filled += 1;
      }
    }
  }

  return {
    total,
    filled,
    unresolved: unresolvedCount,
    done: filled === total && unresolvedCount === 0,
  };
}

export function demandSnapshot(students: Student[]) {
  const totals = {
    lafthi: { L1: 0, L2: 0, L3: 0 },
    kammi: { L1: 0, L2: 0, L3: 0 },
    esl: { L1: 0, L2: 0, L3: 0 },
  };

  let doneQ = 0;
  let stillQ = 0;

  for (const student of students) {
    if (student.doneQ) doneQ += 1;
    else stillQ += 1;

    for (const subject of ["lafthi", "kammi", "esl"] as const) {
      if (student.done[subject]) continue;
      totals[subject][student.needs[subject]] += 1;
    }
  }

  return { totals, doneQ, stillQ };
}

export function roomProfile(students: Student[], selectedRoom: number, homerooms: Homeroom[]) {
  const roomStudents = students.filter((student) => student.homeroom === selectedRoom);
  const grade = homerooms.find((room) => room.id === selectedRoom)?.grade || 10;
  const ld = {
    kammi: { L1: 0, L2: 0, L3: 0 },
    lafthi: { L1: 0, L2: 0, L3: 0 },
    esl: { L1: 0, L2: 0, L3: 0 },
  };

  let qDone = 0;
  let qNotDone = 0;

  for (const student of roomStudents) {
    if (student.doneQ) qDone += 1;
    else if (student.grade === 12) qNotDone += 1;

    for (const subject of ["kammi", "lafthi", "esl"] as const) {
      if (student.done[subject]) continue;
      ld[subject][student.needs[subject]] += 1;
    }
  }

  return {
    grade,
    ld,
    qD: qDone,
    qN: qNotDone,
    total: roomStudents.length,
    students: roomStudents,
  };
}

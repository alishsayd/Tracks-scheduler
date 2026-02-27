import { DAYS, HOMEROOMS, LEVELS, SLOTS, SUBJECTS } from "./constants";
import { getSubjectLabelFromT } from "./i18n";
import { blockKeyForCourse, courseMatchesStudent } from "./rules";
import type {
  Assignments,
  Course,
  Day,
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
  streamGroups: StreamGroup[]
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

    const roomLevelCounts = HOMEROOMS.filter((room) => room.grade !== 12).map((room) => {
      const roomStudents = students.filter((student) => student.homeroom === room.id);
      const dist: Record<Level, number> = { L1: 0, L2: 0, L3: 0 };
      for (const student of roomStudents) {
        if ((subject === "kammi" || subject === "lafthi") && student.doneQ) continue;
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

    for (const room of HOMEROOMS) {
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
    const rooms = HOMEROOMS.filter((room) => room.grade === grade);
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
  subjectFilter: SubjectKey | "all"
) {
  return courses.filter((course) => {
    if (!whitelist || !whitelist.has(course.id)) return false;
    if (!course.meetings.some((meeting) => meeting.day === day && meeting.slot === slot)) return false;
    if (subjectFilter !== "all" && course.subject !== subjectFilter) return false;

    const roomGrade = HOMEROOMS.find((room) => room.id === roomId)?.grade;
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
  t: Translations
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
    for (const room of HOMEROOMS) {
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

    if (courseMatchesStudent(course, student)) {
      aligned.push(student);
      continue;
    }

    if (subject.qudrat && student.doneQ) {
      const options = optionsFor(student).filter((option) => SUBJECTS[courses.find((entry) => entry.id === option.courseId)!.subject].tahsili);
      if (options.length > 0) {
        mustMoveOut.push({
          ...student,
          neededLabel: `${t.tahsiliLabel} ${t.grade} ${student.grade}`,
          options,
          resolved: moveResolutions?.[student.id]?.[blockKey],
        });
      } else {
        forcedStay.push({ ...student, reason: t.reasonDoneQudrat });
      }
      continue;
    }

    const options = optionsFor(student);

    if (subject.tahsili && student.grade === 12 && !student.doneQ) {
      const qudratOptions = options.filter((option) => SUBJECTS[courses.find((entry) => entry.id === option.courseId)!.subject].qudrat);
      if (qudratOptions.length > 0) {
        mustMoveOut.push({
          ...student,
          neededLabel: `${t.qudratLabel} (${t.notDone})`,
          options: qudratOptions,
          resolved: moveResolutions?.[student.id]?.[blockKey],
        });
      } else {
        forcedStay.push({ ...student, reason: `${t.reasonNoSupply} (${t.qudratLabel})` });
      }
      continue;
    }

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
  t: Translations
) {
  const byKey = new Map<string, MustMoveStudent & { day: Day; slotId: number; fromRoom: number; blockKey: string }>();

  for (const room of HOMEROOMS) {
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const assignment = getAssignment(assignments, room.id, day, slot.id);
        if (!assignment) continue;

        const movement = computeMovement(room.id, day, slot.id, assignments, courses, students, moveResolutions, whitelist, t);
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

export function scheduleStats(assignments: Assignments, unresolvedCount: number) {
  let total = 0;
  let filled = 0;

  for (const room of HOMEROOMS) {
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
      if ((subject === "lafthi" || subject === "kammi") && student.doneQ) continue;
      totals[subject][student.needs[subject]] += 1;
    }
  }

  return { totals, doneQ, stillQ };
}

export function roomProfile(students: Student[], selectedRoom: number) {
  const roomStudents = students.filter((student) => student.homeroom === selectedRoom);
  const grade = HOMEROOMS[selectedRoom].grade;
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
      if ((subject === "kammi" || subject === "lafthi") && student.doneQ) continue;
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

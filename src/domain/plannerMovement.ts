import { DAYS, SLOTS, SUBJECTS } from "./constants";
import { getSubjectLabelFromT } from "./i18n";
import { pickDestinationByGradeAndLoad } from "./plannerPolicy";
import { blockKeyForCourse, courseMatchesStudent } from "./rules";
import { getAssignment } from "./plannerCore";
import type {
  Assignments,
  Course,
  Day,
  Homeroom,
  MoveResolutions,
  MovementResult,
  MustMoveStudent,
  Student,
  Translations,
} from "./types";

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

export function autoResolveMustMoves(
  assignments: Assignments,
  courses: Course[],
  students: Student[],
  whitelist: Set<string> | null,
  t: Translations,
  homerooms: Homeroom[]
) {
  const resolutions: MoveResolutions = {};
  const homeroomById = new Map(homerooms.map((room) => [room.id, room]));
  const pendingByKey = new Map<string, MustMoveStudent & { day: Day; slotId: number; fromRoom: number; blockKey: string }>();

  for (const room of homerooms) {
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const assignment = getAssignment(assignments, room.id, day, slot.id);
        if (!assignment) continue;

        const movement = computeMovement(room.id, day, slot.id, assignments, courses, students, resolutions, whitelist, t, homerooms);
        if (!movement.blockKey) continue;

        for (const move of movement.mustMoveOut) {
          const key = `${move.id}|${movement.blockKey}`;
          if (pendingByKey.has(key)) continue;
          pendingByKey.set(key, {
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

  const pending = Array.from(pendingByKey.values()).sort((a, b) => {
    if (a.blockKey !== b.blockKey) return a.blockKey.localeCompare(b.blockKey);
    if (a.fromRoom !== b.fromRoom) return a.fromRoom - b.fromRoom;
    return a.id.localeCompare(b.id);
  });

  const scoreOptions = (move: (typeof pending)[number]) =>
    move.options
      .map((option) => {
        const room = homeroomById.get(option.roomId);
        if (!room) return null;

        const current = effectiveRoomCountForBlock(students, resolutions, move.blockKey, option.roomId);
        return {
          option,
          current,
          sameGrade: room.grade === move.grade,
        };
      })
      .filter(Boolean) as Array<{
      option: { roomId: number; courseId: string };
      current: number;
      sameGrade: boolean;
    }>;

  const pickBestOption = (move: (typeof pending)[number]) => {
    const ranked = scoreOptions(move).map((entry) => ({
      option: entry.option,
      current: entry.current,
      sameGrade: entry.sameGrade,
      tieBreaker: entry.option.roomId,
    }));
    return pickDestinationByGradeAndLoad(ranked);
  };

  for (const move of pending) {
    const existing = resolutions[move.id]?.[move.blockKey];
    if (existing !== undefined && existing !== null) continue;

    const bestOption = pickBestOption(move);

    if (!bestOption) continue;

    resolutions[move.id] = {
      ...(resolutions[move.id] || {}),
      [move.blockKey]: bestOption.roomId,
    };
  }

  return resolutions;
}

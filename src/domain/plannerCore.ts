import { DAYS, SLOTS, SUBJECTS } from "./constants";
import type { Assignments, Course, Day, Homeroom, StreamGroup, SubjectKey } from "./types";
import type { GradeCourseSelections, LevelOpenState, SelectedStreams } from "./plannerShared";

export function getAssignment(assignments: Assignments, roomId: number, day: Day, slot: number) {
  return assignments?.[roomId]?.[day]?.[slot] || null;
}

export function buildCampusWhitelist(
  selectedStreams: SelectedStreams,
  gradeCourseSelections: GradeCourseSelections,
  levelOpen: LevelOpenState,
  streamGroups: StreamGroup[]
) {
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

import { DAYS, SLOTS } from "./constants";
import type { Assignments, Day, Homeroom, StreamGroup } from "./types";
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

export function scheduleStats(assignments: Assignments, homerooms: Homeroom[]) {
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
    unresolved: 0,
    done: filled === total,
  };
}

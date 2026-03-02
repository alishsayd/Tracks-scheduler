import { SUBJECTS } from "../domain/constants";
import { autoAssignTahsiliForQudrat } from "../domain/plannerV6";
import type { RoomMapPreview } from "../domain/plannerV6";
import type { Assignments, Course, Homeroom, LeveledSubject, Level, StreamGroup } from "../domain/types";
import type { GradeCourseSelections, SelectedStreams } from "../domain/planner";

type BuildCampusAssignmentsParams = {
  whitelist: Set<string>;
  selectedStreams: SelectedStreams;
  subjectPreviews: Partial<Record<LeveledSubject, RoomMapPreview>>;
  gradeCourseSelections: GradeCourseSelections;
  courses: Course[];
  homerooms: Homeroom[];
  streamGroups: StreamGroup[];
};

export function buildCampusAssignments({
  whitelist,
  selectedStreams,
  subjectPreviews,
  gradeCourseSelections,
  courses,
  homerooms,
  streamGroups,
}: BuildCampusAssignmentsParams) {
  const assignments: Assignments = {};

  for (const subject of (["lafthi", "kammi", "esl"] as const)) {
    const streamGroupId = selectedStreams[subject];
    const preview = subjectPreviews[subject];
    if (!streamGroupId || !preview) continue;

    const group = streamGroups.find((entry) => entry.id === streamGroupId);
    if (!group) continue;

    const levelToCourse: Partial<Record<Level, string>> = {};
    for (const course of group.courses) {
      if (!course.level) continue;
      if (!preview.levelsRunning.includes(course.level)) continue;
      levelToCourse[course.level] = course.id;
    }

    for (const room of homerooms) {
      const host = preview.hostByRoom[room.id];
      if (host === "AUTO_TAHSILI") continue;
      const courseId = levelToCourse[host];
      if (!courseId || !whitelist.has(courseId)) continue;
      const course = courses.find((entry) => entry.id === courseId);
      if (!course) continue;
      if (!assignments[room.id]) assignments[room.id] = {};
      for (const meeting of course.meetings) {
        if (!assignments[room.id][meeting.day]) assignments[room.id][meeting.day] = {};
        assignments[room.id][meeting.day]![meeting.slot] = course.id;
      }
    }

    if (SUBJECTS[subject].qudrat) {
      autoAssignTahsiliForQudrat(assignments, courses, group, homerooms);
    }
  }

  for (const [gradeRaw, selection] of Object.entries(gradeCourseSelections)) {
    const grade = Number(gradeRaw);
    const gradeRooms = homerooms.filter((room) => room.grade === grade);

    for (const courseId of Object.values(selection || {})) {
      if (!courseId || !whitelist.has(courseId)) continue;
      const course = courses.find((entry) => entry.id === courseId);
      if (!course) continue;

      for (const room of gradeRooms) {
        if (!assignments[room.id]) assignments[room.id] = {};
        for (const meeting of course.meetings) {
          if (!assignments[room.id][meeting.day]) assignments[room.id][meeting.day] = {};
          assignments[room.id][meeting.day]![meeting.slot] = course.id;
        }
      }
    }
  }

  return { assignments };
}

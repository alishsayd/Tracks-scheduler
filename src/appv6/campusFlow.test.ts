import { describe, expect, it } from "vitest";
import { DAYS } from "../domain/constants";
import { genCourses } from "../domain/data";
import type { Course } from "../domain/types";
import { canSatisfyRequiredGradeWideSubjects, isMeetingBlockedByLeveled, meetingKey, type LeveledBlockersByGrade } from "./campusFlow";

function emptyBlockers(): LeveledBlockersByGrade {
  return {
    10: new Map(),
    11: new Map(),
    12: new Map(),
  };
}

describe("campus flow feasibility", () => {
  it("keeps required grade-wide subjects feasible with no leveled blockers", () => {
    const courses = genCourses();
    expect(canSatisfyRequiredGradeWideSubjects(courses, emptyBlockers())).toBe(true);
  });

  it("flags infeasibility when all Grade 10 Tahsili Math options are blocked", () => {
    const courses = genCourses();
    const blockers = emptyBlockers();

    for (const day of DAYS) {
      blockers[10].set(meetingKey(day, 6), new Set(["esl"]));
      blockers[10].set(meetingKey(day, 7), new Set(["esl"]));
    }

    expect(canSatisfyRequiredGradeWideSubjects(courses, blockers)).toBe(false);
  });

  it("allows Qudrat_Done sessions when only Qudrat blockers exist in that slot", () => {
    const blockers = emptyBlockers();
    blockers[12].set(meetingKey("Sun", 1), new Set(["kammi"]));

    const course: Course = {
      id: "test-qdone",
      subject: "t_physics",
      level: null,
      grade: 12,
      segment: null,
      teacherName: "Teacher",
      startTime: "07:45",
      audienceTag: "Qudrat_Done",
      meetings: [{ day: "Sun", slot: 1 }],
      pattern: "Sun",
    };

    expect(isMeetingBlockedByLeveled(blockers, 12, course, course.meetings[0])).toBe(false);
  });
});


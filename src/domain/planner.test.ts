import { describe, expect, it } from "vitest";
import { buildHomerooms, getDefaultAdminConfig } from "./adminConfig";
import { buildStreamGroups, genCourses, genStudents } from "./data";
import { courseMatchesStudent } from "./rules";
import { buildCampusWhitelist, demandSnapshot, seedAssignmentsFromCampusPlan, unresolvedMoves } from "./planner";
import { getT } from "./i18n";
import type { Student } from "./types";
import type { LevelOpenState, SelectedStreams } from "./planner";

const adminConfig = getDefaultAdminConfig();
const homerooms = buildHomerooms(adminConfig);
const students = genStudents(homerooms, adminConfig);
const courses = genCourses();
const streamGroups = buildStreamGroups(courses);

describe("stream planner domain", () => {
  it("builds stream groups with full L1/L2/L3 bundles", () => {
    expect(streamGroups.length).toBeGreaterThan(0);
    for (const group of streamGroups) {
      expect(group.levels.filter(Boolean)).toHaveLength(3);
    }
  });

  it("enforces G12 Tahsili gating for non-done Qudrat students", () => {
    const g12NotDone: Student = {
      id: "x",
      name: "X",
      homeroom: 4,
      grade: 12,
      doneQ: false,
      done: { kammi: false, lafthi: false, esl: false },
      needs: { kammi: "L2", lafthi: "L2", esl: "L1" },
      strength: 0.5,
    } as const;
    const g12Done = { ...g12NotDone, doneQ: true, done: { kammi: true, lafthi: true, esl: false } };

    const tahsili = courses.find((course) => course.subject === "t_math" && course.grade === 12);
    expect(tahsili).toBeTruthy();
    expect(courseMatchesStudent(tahsili!, g12NotDone)).toBe(false);
    expect(courseMatchesStudent(tahsili!, g12Done)).toBe(true);
  });

  it("deduplicates unresolved moves by student + blockKey", () => {
    const selectedStreams: SelectedStreams = {
      kammi: streamGroups.find((group) => group.subject === "kammi")?.id,
      lafthi: streamGroups.find((group) => group.subject === "lafthi")?.id,
      esl: streamGroups.find((group) => group.subject === "esl")?.id,
    };

    const levelOpen: LevelOpenState = {
      kammi: { L1: true, L2: true, L3: true },
      lafthi: { L1: true, L2: true, L3: true },
      esl: { L1: true, L2: true, L3: true },
    };

    const gradeCourseSelections = {};
    const whitelist = buildCampusWhitelist(selectedStreams, gradeCourseSelections, levelOpen, streamGroups);
    const assignments = seedAssignmentsFromCampusPlan(whitelist, selectedStreams, levelOpen, gradeCourseSelections, students, courses, streamGroups, homerooms);

    const unresolved = unresolvedMoves(assignments, courses, students, {}, whitelist, getT("en"), homerooms);
    const keys = new Set(unresolved.map((row) => `${row.id}|${row.blockKey}`));

    expect(unresolved.length).toBe(keys.size);
  });

  it("produces demand snapshot totals", () => {
    const snapshot = demandSnapshot(students);
    expect(snapshot.doneQ + snapshot.stillQ).toBe(students.length);
  });
});

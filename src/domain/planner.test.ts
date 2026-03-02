import { describe, expect, it } from "vitest";
import { buildStreamGroups, genCourses } from "./data";
import { courseMatchesStudent } from "./rules";
import { autoResolveMustMoves, unresolvedMoves } from "./planner";
import { getT } from "./i18n";
import type { Assignments, Course, Homeroom, Student } from "./types";
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
    const localHomerooms: Homeroom[] = [
      { id: 0, name: "Room 101", grade: 10, capacity: 22 },
      { id: 1, name: "Room 102", grade: 10, capacity: 22 },
      { id: 2, name: "Room 103", grade: 10, capacity: 22 },
    ];
    const localCourses: Course[] = [
      {
        id: "c-l1",
        subject: "kammi",
        level: "L1",
        grade: null,
        segment: null,
        teacherName: "T1",
        startTime: "07:45",
        meetings: [
          { day: "Sun", slot: 1 },
          { day: "Mon", slot: 1 },
        ],
        pattern: "Sun/Mon",
      },
      {
        id: "c-l2-a",
        subject: "kammi",
        level: "L2",
        grade: null,
        segment: null,
        teacherName: "T2",
        startTime: "07:45",
        meetings: [
          { day: "Sun", slot: 1 },
          { day: "Mon", slot: 1 },
        ],
        pattern: "Sun/Mon",
      },
      {
        id: "c-l2-b",
        subject: "kammi",
        level: "L2",
        grade: null,
        segment: null,
        teacherName: "T3",
        startTime: "07:45",
        meetings: [
          { day: "Sun", slot: 1 },
          { day: "Mon", slot: 1 },
        ],
        pattern: "Sun/Mon",
      },
    ];
    const localStudents: Student[] = Array.from({ length: 2 }, (_, index) => ({
      id: `s${index + 1}`,
      name: `Student ${index + 1}`,
      homeroom: 0,
      grade: 10,
      doneQ: false,
      done: { kammi: false, lafthi: false, esl: false },
      needs: { kammi: "L2", lafthi: "L1", esl: "L1" },
      strength: 0.5,
    }));
    const localAssignments: Assignments = {
      0: { Sun: { 1: "c-l1" }, Mon: { 1: "c-l1" } },
      1: { Sun: { 1: "c-l2-a" }, Mon: { 1: "c-l2-a" } },
      2: { Sun: { 1: "c-l2-b" }, Mon: { 1: "c-l2-b" } },
    };

    const whitelist = new Set(["c-l1", "c-l2-a", "c-l2-b"]);
    const unresolved = unresolvedMoves(localAssignments, localCourses, localStudents, {}, whitelist, getT("en"), localHomerooms);
    const keys = new Set(unresolved.map((row) => `${row.id}|${row.blockKey}`));

    expect(unresolved.length).toBe(keys.size);
    expect(unresolved).toHaveLength(2);
  });

  it("prefers same-grade move destinations before cross-grade rooms", () => {
    const localHomerooms: Homeroom[] = [
      { id: 0, name: "Room 101", grade: 10, capacity: 30 },
      { id: 1, name: "Room 102", grade: 10, capacity: 2 },
      { id: 2, name: "Room 201", grade: 11, capacity: 10 },
    ];

    const localCourses: Course[] = [
      {
        id: "c-l1",
        subject: "kammi",
        level: "L1",
        grade: null,
        segment: null,
        teacherName: "T1",
        startTime: "07:45",
        meetings: [{ day: "Sun", slot: 1 }],
        pattern: "Sun",
      },
      {
        id: "c-l2-a",
        subject: "kammi",
        level: "L2",
        grade: null,
        segment: null,
        teacherName: "T2",
        startTime: "07:45",
        meetings: [{ day: "Sun", slot: 1 }],
        pattern: "Sun",
      },
      {
        id: "c-l2-b",
        subject: "kammi",
        level: "L2",
        grade: null,
        segment: null,
        teacherName: "T3",
        startTime: "07:45",
        meetings: [{ day: "Sun", slot: 1 }],
        pattern: "Sun",
      },
    ];

    const localStudents: Student[] = Array.from({ length: 4 }, (_, index) => ({
      id: `s${index + 1}`,
      name: `Student ${index + 1}`,
      homeroom: 0,
      grade: 10,
      doneQ: false,
      done: { kammi: false, lafthi: false, esl: false },
      needs: { kammi: "L2", lafthi: "L1", esl: "L1" },
      strength: 0.5,
    }));

    const localAssignments: Assignments = {
      0: { Sun: { 1: "c-l1" } },
      1: { Sun: { 1: "c-l2-a" } },
      2: { Sun: { 1: "c-l2-b" } },
    };

    const resolutions = autoResolveMustMoves(
      localAssignments,
      localCourses,
      localStudents,
      new Set(["c-l1", "c-l2-a", "c-l2-b"]),
      getT("en"),
      localHomerooms
    );

    const destinations = Object.values(resolutions).map((entry) => Object.values(entry)[0]);
    const sameGradeCount = destinations.filter((roomId) => roomId === 1).length;
    const crossGradeCount = destinations.filter((roomId) => roomId === 2).length;

    expect(sameGradeCount).toBe(2);
    expect(crossGradeCount).toBe(2);
  });

  it("clusters auto-moves into fewer rooms before opening another destination", () => {
    const localHomerooms: Homeroom[] = [
      { id: 0, name: "Room 101", grade: 10, capacity: 30 },
      { id: 1, name: "Room 102", grade: 10, capacity: 3 },
      { id: 2, name: "Room 103", grade: 10, capacity: 3 },
    ];

    const localCourses: Course[] = [
      {
        id: "c-l1",
        subject: "kammi",
        level: "L1",
        grade: null,
        segment: null,
        teacherName: "T1",
        startTime: "07:45",
        meetings: [{ day: "Sun", slot: 1 }],
        pattern: "Sun",
      },
      {
        id: "c-l2-a",
        subject: "kammi",
        level: "L2",
        grade: null,
        segment: null,
        teacherName: "T2",
        startTime: "07:45",
        meetings: [{ day: "Sun", slot: 1 }],
        pattern: "Sun",
      },
      {
        id: "c-l2-b",
        subject: "kammi",
        level: "L2",
        grade: null,
        segment: null,
        teacherName: "T3",
        startTime: "07:45",
        meetings: [{ day: "Sun", slot: 1 }],
        pattern: "Sun",
      },
    ];

    const localStudents: Student[] = Array.from({ length: 5 }, (_, index) => ({
      id: `s${index + 1}`,
      name: `Student ${index + 1}`,
      homeroom: 0,
      grade: 10,
      doneQ: false,
      done: { kammi: false, lafthi: false, esl: false },
      needs: { kammi: "L2", lafthi: "L1", esl: "L1" },
      strength: 0.5,
    }));

    const localAssignments: Assignments = {
      0: { Sun: { 1: "c-l1" } },
      1: { Sun: { 1: "c-l2-a" } },
      2: { Sun: { 1: "c-l2-b" } },
    };

    const resolutions = autoResolveMustMoves(
      localAssignments,
      localCourses,
      localStudents,
      new Set(["c-l1", "c-l2-a", "c-l2-b"]),
      getT("en"),
      localHomerooms
    );

    const destinations = Object.values(resolutions).map((entry) => Object.values(entry)[0]);
    const roomOneCount = destinations.filter((roomId) => roomId === 1).length;
    const roomTwoCount = destinations.filter((roomId) => roomId === 2).length;

    expect(roomOneCount).toBe(3);
    expect(roomTwoCount).toBe(2);
  });
});

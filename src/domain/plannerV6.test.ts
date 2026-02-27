import { describe, expect, it } from "vitest";
import { buildStreamGroups, genCourses } from "./data";
import { buildRoomMapPreview, createDefaultSubjectRoutingPlan } from "./plannerV6";
import type { Homeroom, Student } from "./types";

function makeHomerooms(count: number): Homeroom[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `Room ${101 + index}`,
    grade: 10,
    capacity: 22,
  }));
}

function makeStudentsByDemand(demand: { L1: number; L2: number; L3: number }, roomCount: number): Student[] {
  const students: Student[] = [];
  let id = 1;

  const push = (level: "L1" | "L2" | "L3", count: number) => {
    for (let i = 0; i < count; i += 1) {
      students.push({
        id: `s${id}`,
        name: `Student ${id}`,
        homeroom: (id - 1) % roomCount,
        grade: 10,
        doneQ: false,
        done: { kammi: false, lafthi: false, esl: false },
        needs: { kammi: "L1", lafthi: "L1", esl: level },
        strength: 0.5,
      });
      id += 1;
    }
  };

  push("L1", demand.L1);
  push("L2", demand.L2);
  push("L3", demand.L3);

  return students;
}

describe("plannerV6 room reduction", () => {
  it("reduces from the level with lowest overflow penalty", () => {
    const homerooms = makeHomerooms(7);
    const students = makeStudentsByDemand({ L1: 64, L2: 67, L3: 1 }, homerooms.length);

    const courses = genCourses();
    const streamGroup = buildStreamGroups(courses).find((group) => group.subject === "esl");
    expect(streamGroup).toBeTruthy();

    const preview = buildRoomMapPreview("esl", streamGroup!, createDefaultSubjectRoutingPlan(), students, homerooms);

    const hostCounts = { L1: 0, L2: 0, L3: 0 };
    for (const row of preview.rows) {
      if (row.host === "L1") hostCounts.L1 += 1;
      if (row.host === "L2") hostCounts.L2 += 1;
      if (row.host === "L3") hostCounts.L3 += 1;
    }

    expect(hostCounts).toEqual({ L1: 3, L2: 3, L3: 1 });
  });
});


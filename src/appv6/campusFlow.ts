import { GRADE_SUBJECTS, GRADES, LEVELS, SUBJECTS } from "../domain/constants";
import type { RoomMapPreview, SubjectRoutingPlan } from "../domain/plannerV6";
import { createDefaultSubjectRoutingPlan } from "../domain/plannerV6";
import type { Course, Day, LeveledSubject, Level, StreamGroup, Student, SubjectKey, Translations } from "../domain/types";
import type { GradeCourseSelections, SelectedStreams } from "../domain/planner";

export const LEVELED_SUBJECTS = ["lafthi", "kammi", "esl"] as const;
export const PLANNING_ROOM_CAPACITY = 22;

export type Step0Decision = "RUN" | "CLOSE";

export interface PreFlightIssue {
  id: string;
  subject: LeveledSubject;
  level: Level;
  levelDemand: number;
  totalDemand: number;
  roomsTotal: number;
  roomsRemainingIfRun: number;
  remainingDemandIfRun: number;
  avgIfRun: number;
  avgIfClose: number;
  closeMergeTarget: "L2" | "L1+L3";
  closeTargetCount: number;
  closeSplit?: { toL1: number; toL3: number };
  closeSplitTargetCounts?: { L1: number; L3: number };
}

export interface LevelPolicyEntry {
  status: Step0Decision;
  mergeTargetLevel: "L2" | "L1+L3" | null;
  movedStudentsCount: number;
  roomCost: 0 | 1;
}

export interface ConflictFlag {
  roomId: number;
  day: Day;
  slotId: number;
  previousCourseId: string;
  nextCourseId: string;
}

export interface Step2SubjectOptionState {
  grade: number;
  subject: SubjectKey;
  options: Course[];
  validOptions: Course[];
  decisionRequired: boolean;
  fixedCourseId: string | null;
  unavailable: boolean;
}

export type LeveledBlockersByGrade = Record<number, Map<string, Set<LeveledSubject>>>;

export function meetingKey(day: Day, slot: number) {
  return `${day}|${slot}`;
}

export function toMeetingKeys(meetings: Array<{ day: Day; slot: number }>) {
  return meetings.map((meeting) => meetingKey(meeting.day, meeting.slot));
}

export function defaultRoutingPlans(): Record<LeveledSubject, SubjectRoutingPlan> {
  return {
    kammi: createDefaultSubjectRoutingPlan(),
    lafthi: createDefaultSubjectRoutingPlan(),
    esl: createDefaultSubjectRoutingPlan(),
  };
}

export function sameGradeCourseSelections(a: GradeCourseSelections, b: GradeCourseSelections) {
  for (const grade of GRADES) {
    for (const subject of GRADE_SUBJECTS[grade].all as SubjectKey[]) {
      const left = a[grade]?.[subject] || null;
      const right = b[grade]?.[subject] || null;
      if (left !== right) return false;
    }
  }
  return true;
}

export function buildBaseDemandBySubject(students: Student[]) {
  const counts: Record<LeveledSubject, Record<Level, number>> = {
    kammi: { L1: 0, L2: 0, L3: 0 },
    lafthi: { L1: 0, L2: 0, L3: 0 },
    esl: { L1: 0, L2: 0, L3: 0 },
  };

  for (const student of students) {
    for (const subject of LEVELED_SUBJECTS) {
      if (student.done[subject]) continue;
      counts[subject][student.needs[subject]] += 1;
    }
  }

  return counts;
}

export function buildRoomsTotalBySubject(homerooms: Array<{ grade: number }>) {
  return {
    kammi: homerooms.filter((room) => room.grade !== 12).length,
    lafthi: homerooms.filter((room) => room.grade !== 12).length,
    esl: homerooms.length,
  } as Record<LeveledSubject, number>;
}

export function buildStep0Issues(
  baseDemandBySubject: Record<LeveledSubject, Record<Level, number>>,
  roomsTotalBySubject: Record<LeveledSubject, number>
) {
  const issues: PreFlightIssue[] = [];
  // v1 assumption from product brief: treat rooms as constrained until spare-room modeling is added.
  const noSpareRooms = true;

  for (const subject of LEVELED_SUBJECTS) {
    const demand = baseDemandBySubject[subject];
    const totalDemand = LEVELS.reduce((sum, level) => sum + demand[level], 0);
    const roomsTotal = roomsTotalBySubject[subject];
    const roomsNeededForSubject = Math.ceil(totalDemand / PLANNING_ROOM_CAPACITY);
    const roomsConstrained = noSpareRooms || roomsTotal <= roomsNeededForSubject;

    for (const level of LEVELS) {
      const levelDemand = demand[level];
      const underfilled = levelDemand > 0 && levelDemand < PLANNING_ROOM_CAPACITY * 0.5;
      if (!underfilled || !roomsConstrained) continue;

      const remainingDemandIfRun = Math.max(0, totalDemand - levelDemand);
      const roomsRemainingIfRun = Math.max(0, roomsTotal - 1);
      const avgIfRun = roomsRemainingIfRun > 0 ? remainingDemandIfRun / roomsRemainingIfRun : remainingDemandIfRun;
      const avgIfClose = roomsTotal > 0 ? totalDemand / roomsTotal : totalDemand;

      if (level === "L2") {
        const toL1 = Math.floor(levelDemand / 2);
        const toL3 = Math.max(0, levelDemand - toL1);
        issues.push({
          id: `${subject}|${level}`,
          subject,
          level,
          levelDemand,
          totalDemand,
          roomsTotal,
          roomsRemainingIfRun,
          remainingDemandIfRun,
          avgIfRun,
          avgIfClose,
          closeMergeTarget: "L1+L3",
          closeTargetCount: 0,
          closeSplit: { toL1, toL3 },
          closeSplitTargetCounts: { L1: demand.L1 + toL1, L3: demand.L3 + toL3 },
        });
        continue;
      }

      issues.push({
        id: `${subject}|${level}`,
        subject,
        level,
        levelDemand,
        totalDemand,
        roomsTotal,
        roomsRemainingIfRun,
        remainingDemandIfRun,
        avgIfRun,
        avgIfClose,
        closeMergeTarget: "L2",
        closeTargetCount: demand.L2 + levelDemand,
      });
    }
  }

  return issues;
}

export function buildLevelPolicyBySubject(
  baseDemandBySubject: Record<LeveledSubject, Record<Level, number>>,
  step0Issues: PreFlightIssue[],
  step0Decisions: Partial<Record<string, Step0Decision>>
) {
  const next: Record<LeveledSubject, Record<Level, LevelPolicyEntry>> = {
    kammi: {
      L1: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
      L2: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
      L3: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
    },
    lafthi: {
      L1: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
      L2: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
      L3: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
    },
    esl: {
      L1: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
      L2: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
      L3: { status: "CLOSE", mergeTargetLevel: null, movedStudentsCount: 0, roomCost: 0 },
    },
  };

  const issueByKey = new Map(step0Issues.map((issue) => [issue.id, issue]));

  for (const subject of LEVELED_SUBJECTS) {
    const demand = baseDemandBySubject[subject];

    for (const level of LEVELS) {
      const levelDemand = demand[level];
      const issue = issueByKey.get(`${subject}|${level}`);
      const decision = issue ? step0Decisions[issue.id] : undefined;
      const status: Step0Decision = levelDemand === 0 ? "CLOSE" : decision || "RUN";
      const movedStudentsCount = status === "CLOSE" ? levelDemand : 0;
      const mergeTargetLevel = status === "CLOSE" ? (level === "L2" ? "L1+L3" : "L2") : null;

      next[subject][level] = {
        status,
        mergeTargetLevel,
        movedStudentsCount,
        roomCost: status === "RUN" ? 1 : 0,
      };
    }
  }

  return next;
}

export function findSubjectsWithoutRunningLevels(
  baseDemandBySubject: Record<LeveledSubject, Record<Level, number>>,
  levelPolicyBySubject: Record<LeveledSubject, Record<Level, LevelPolicyEntry>>
) {
  return LEVELED_SUBJECTS.filter((subject) => {
    const totalDemand = LEVELS.reduce((sum, level) => sum + baseDemandBySubject[subject][level], 0);
    if (totalDemand === 0) return false;
    return LEVELS.every((level) => levelPolicyBySubject[subject][level].status === "CLOSE");
  });
}

export function buildRoutingPlans(
  baseDemandBySubject: Record<LeveledSubject, Record<Level, number>>,
  levelPolicyBySubject: Record<LeveledSubject, Record<Level, LevelPolicyEntry>>
) {
  const plans = defaultRoutingPlans();

  for (const subject of LEVELED_SUBJECTS) {
    const policy = levelPolicyBySubject[subject];
    const demand = baseDemandBySubject[subject];

    for (const level of LEVELS) {
      plans[subject].run[level] = policy[level].status === "RUN" && demand[level] > 0;
    }

    if (policy.L1.status === "CLOSE" && demand.L1 > 0) {
      const target: Level = plans[subject].run.L2 ? "L2" : "L3";
      plans[subject].forceMove.L1 = { target, count: demand.L1 };
    } else {
      plans[subject].forceMove.L1 = { target: "L2", count: 0 };
    }

    if (policy.L3.status === "CLOSE" && demand.L3 > 0) {
      const target: Level = plans[subject].run.L2 ? "L2" : "L1";
      plans[subject].forceMove.L3 = { target, count: demand.L3 };
    } else {
      plans[subject].forceMove.L3 = { target: "L2", count: 0 };
    }

    if (policy.L2.status === "CLOSE" && demand.L2 > 0) {
      if (plans[subject].run.L1 && plans[subject].run.L3) {
        const toL1 = Math.floor(demand.L2 / 2);
        plans[subject].forceMove.L2 = { toL1, toL3: demand.L2 - toL1 };
      } else if (plans[subject].run.L1) {
        plans[subject].forceMove.L2 = { toL1: demand.L2, toL3: 0 };
      } else if (plans[subject].run.L3) {
        plans[subject].forceMove.L2 = { toL1: 0, toL3: demand.L2 };
      } else {
        plans[subject].forceMove.L2 = { toL1: 0, toL3: 0 };
      }
    } else {
      plans[subject].forceMove.L2 = { toL1: 0, toL3: 0 };
    }
  }

  return plans;
}

export function buildStep1Issues(
  selectedStreams: SelectedStreams,
  subjectPreviews: Partial<Record<LeveledSubject, RoomMapPreview>>,
  t: Translations,
  fmt: (key: string, vars: Record<string, string | number>) => string
) {
  const issues: Record<LeveledSubject, string[]> = {
    kammi: [],
    lafthi: [],
    esl: [],
  };

  for (const subject of LEVELED_SUBJECTS) {
    const streamId = selectedStreams[subject];
    if (!streamId) {
      issues[subject].push(t.stepIssueSelectBundle);
      continue;
    }

    const preview = subjectPreviews[subject];
    if (!preview) {
      issues[subject].push(t.stepIssueRoomMapMissing);
      continue;
    }

    const hostRows = preview.rows.filter((row) => !row.fixed);
    for (const level of preview.levelsRunning) {
      const hasRoom = hostRows.some((row) => row.host === level);
      if (!hasRoom) {
        issues[subject].push(fmt("stepIssueMissingLevelRoom", { level }));
      }
    }
  }

  return issues;
}

export function buildStep2OptionsBySubject(
  courses: Course[],
  gradeCourseSelections: GradeCourseSelections,
  meetingBlockedByLeveled: (grade: number, course: Course, meeting: { day: Day; slot: number }) => boolean
) {
  const optionState: Record<number, Partial<Record<SubjectKey, Step2SubjectOptionState>>> = {};
  const courseById = new Map(courses.map((course) => [course.id, course]));

  for (const grade of GRADES) {
    optionState[grade] = {};
    const selected = gradeCourseSelections[grade] || {};
    const selectedBySubject: Partial<Record<SubjectKey, Course>> = {};

    for (const subject of GRADE_SUBJECTS[grade].all as SubjectKey[]) {
      const selectedId = selected[subject];
      if (!selectedId) continue;
      const picked = courseById.get(selectedId);
      if (!picked) continue;
      selectedBySubject[subject] = picked;
    }

    for (const subject of GRADE_SUBJECTS[grade].all as SubjectKey[]) {
      const options = courses.filter((course) => course.grade === grade && course.subject === subject);
      if (!options.length) continue;

      const validOptions = options.filter((course) => {
        if (course.meetings.some((meeting) => meetingBlockedByLeveled(grade, course, meeting))) return false;

        const optionMeetingKeys = new Set(toMeetingKeys(course.meetings));
        const conflictsWithPicked = Object.entries(selectedBySubject).some(([pickedSubject, pickedCourse]) => {
          if (!pickedCourse) return false;
          if (pickedSubject === subject) return false;
          return pickedCourse.meetings.some((meeting) => optionMeetingKeys.has(meetingKey(meeting.day, meeting.slot)));
        });
        return !conflictsWithPicked;
      });

      optionState[grade][subject] = {
        grade,
        subject,
        options,
        validOptions,
        decisionRequired: validOptions.length > 1,
        fixedCourseId: validOptions.length === 1 ? validOptions[0].id : null,
        unavailable: validOptions.length === 0,
      };
    }
  }

  return optionState;
}

export function buildLeveledBlockersByGrade(
  selectedStreams: SelectedStreams,
  subjectPreviews: Partial<Record<LeveledSubject, RoomMapPreview>>,
  streamGroups: StreamGroup[],
  homerooms: Array<{ id: number; grade: number }>
): LeveledBlockersByGrade {
  const blocked: LeveledBlockersByGrade = {};
  for (const grade of GRADES) blocked[grade] = new Map<string, Set<LeveledSubject>>();

  for (const subject of LEVELED_SUBJECTS) {
    const streamId = selectedStreams[subject];
    const preview = subjectPreviews[subject];
    if (!streamId || !preview) continue;

    const group = streamGroups.find((entry) => entry.id === streamId);
    const meetings = group?.courses[0]?.meetings || [];
    if (!meetings.length) continue;

    for (const room of homerooms) {
      const host = preview.hostByRoom[room.id];
      if (!host) continue;
      for (const meeting of meetings) {
        const key = meetingKey(meeting.day, meeting.slot);
        const gradeBlockers = blocked[room.grade];
        if (!gradeBlockers.has(key)) gradeBlockers.set(key, new Set<LeveledSubject>());
        gradeBlockers.get(key)!.add(subject);
      }
    }
  }

  return blocked;
}

export function isMeetingBlockedByLeveled(
  blockedByGrade: LeveledBlockersByGrade,
  grade: number,
  course: Course,
  meeting: { day: Day; slot: number }
) {
  const blockerSubjects = blockedByGrade[grade]?.get(meetingKey(meeting.day, meeting.slot));
  if (!blockerSubjects || blockerSubjects.size === 0) return false;

  if (grade === 12 && course.audienceTag === "Qudrat_Done") {
    return [...blockerSubjects].some((subject) => SUBJECTS[subject].qudrat !== true);
  }

  return true;
}

export function canSatisfyRequiredGradeWideSubjects(courses: Course[], blockedByGrade: LeveledBlockersByGrade) {
  for (const grade of GRADES) {
    const requiredSubjects = (GRADE_SUBJECTS[grade].all as SubjectKey[]).filter((subject) =>
      courses.some((course) => course.grade === grade && course.subject === subject)
    );

    const validBySubject = new Map<SubjectKey, Course[]>();

    for (const subject of requiredSubjects) {
      const valid = courses.filter((course) => {
        if (course.grade !== grade || course.subject !== subject) return false;
        return !course.meetings.some((meeting) => isMeetingBlockedByLeveled(blockedByGrade, grade, course, meeting));
      });

      if (valid.length === 0) return false;
      validBySubject.set(subject, valid);
    }

    const orderedSubjects = requiredSubjects.slice().sort((a, b) => {
      return (validBySubject.get(a)?.length || 0) - (validBySubject.get(b)?.length || 0);
    });
    const occupied = new Set<string>();

    const dfs = (index: number): boolean => {
      if (index >= orderedSubjects.length) return true;
      const subject = orderedSubjects[index];
      const options = validBySubject.get(subject) || [];

      for (const option of options) {
        const keys = toMeetingKeys(option.meetings);
        if (keys.some((key) => occupied.has(key))) continue;
        keys.forEach((key) => occupied.add(key));
        if (dfs(index + 1)) return true;
        keys.forEach((key) => occupied.delete(key));
      }

      return false;
    };

    if (!dfs(0)) return false;
  }

  return true;
}

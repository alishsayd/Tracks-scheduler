import { useCallback, useEffect, useMemo, useState } from "react";
import { GRADE_SUBJECTS, GRADES } from "../domain/constants";
import {
  autoResolveMustMoves,
  buildCampusWhitelist,
  type GradeCourseSelections,
  type SelectedStreams,
} from "../domain/planner";
import { buildRoomMapPreview, levelOpenFromRouting, type RoomHost } from "../domain/plannerV6";
import type {
  Assignments,
  Course,
  Day,
  Homeroom,
  LeveledSubject,
  MoveResolutions,
  Student,
  StreamGroup,
  SubjectKey,
  TabPage,
  Translations,
} from "../domain/types";
import {
  LEVELED_SUBJECTS,
  buildBaseDemandBySubject,
  buildLeveledBlockersByGrade,
  buildLevelPolicyBySubject,
  buildRoomsTotalBySubject,
  buildRoutingPlans,
  buildStep0Issues,
  buildStep1Issues,
  buildStep2OptionsBySubject,
  canSatisfyRequiredGradeWideSubjects,
  findSubjectsWithoutRunningLevels,
  isMeetingBlockedByLeveled,
  sameGradeCourseSelections,
  type PreFlightIssue,
  type Step0Decision,
} from "./campusFlow";
import { buildCampusAssignments } from "./applyCampusPlan";

type UseCampusFlowParams = {
  students: Student[];
  courses: Course[];
  homerooms: Homeroom[];
  streamGroups: StreamGroup[];
  t: Translations;
  fmt: (key: string, vars: Record<string, string | number>) => string;
  page: TabPage;
  setPage: (page: TabPage) => void;
};

export function useCampusFlow({
  students,
  courses,
  homerooms,
  streamGroups,
  t,
  fmt,
  page,
  setPage,
}: UseCampusFlowParams) {
  const [assignments, setAssignments] = useState<Assignments>({});
  const [moveResolutions, setMoveResolutions] = useState<MoveResolutions>({});

  const [selectedStreams, setSelectedStreams] = useState<SelectedStreams>({});
  const [step0Decisions, setStep0Decisions] = useState<Partial<Record<string, Step0Decision>>>({});
  const [hostOverrides, setHostOverrides] = useState<Record<LeveledSubject, Partial<Record<number, RoomHost>>>>({
    kammi: {},
    lafthi: {},
    esl: {},
  });
  const [gradeCourseSelections, setGradeCourseSelections] = useState<GradeCourseSelections>({});
  const [campusWhitelist, setCampusWhitelist] = useState<Set<string> | null>(null);
  const [planApplied, setPlanApplied] = useState(false);
  const [activeCampusStep, setActiveCampusStep] = useState<0 | 1 | 2>(0);

  const streamGroupById = useMemo(() => new Map(streamGroups.map((group) => [group.id, group])), [streamGroups]);
  const streamGroupsBySubject = useMemo(
    () => ({
      kammi: streamGroups.filter((group) => group.subject === "kammi"),
      lafthi: streamGroups.filter((group) => group.subject === "lafthi"),
      esl: streamGroups.filter((group) => group.subject === "esl"),
    }),
    [streamGroups]
  );

  const baseDemandBySubject = useMemo(() => buildBaseDemandBySubject(students), [students]);
  const roomsTotalBySubject = useMemo(() => buildRoomsTotalBySubject(homerooms), [homerooms]);

  const step0Issues = useMemo(
    () => buildStep0Issues(baseDemandBySubject, roomsTotalBySubject),
    [baseDemandBySubject, roomsTotalBySubject]
  );

  useEffect(() => {
    const validIds = new Set(step0Issues.map((issue) => issue.id));
    setStep0Decisions((prev) => {
      const next: Partial<Record<string, Step0Decision>> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (!validIds.has(key)) continue;
        next[key] = value;
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [step0Issues]);

  const step0IssueCount = step0Issues.length;
  const step0ResolvedIssueCount = useMemo(
    () => step0Issues.filter((issue) => Boolean(step0Decisions[issue.id])).length,
    [step0Issues, step0Decisions]
  );

  const levelPolicyBySubject = useMemo(
    () => buildLevelPolicyBySubject(baseDemandBySubject, step0Issues, step0Decisions),
    [baseDemandBySubject, step0Issues, step0Decisions]
  );

  const subjectsWithoutRunningLevels = useMemo(
    () => findSubjectsWithoutRunningLevels(baseDemandBySubject, levelPolicyBySubject),
    [baseDemandBySubject, levelPolicyBySubject]
  );

  const step0Complete = useMemo(() => {
    const allIssuesResolved = step0IssueCount === 0 || step0ResolvedIssueCount === step0IssueCount;
    return allIssuesResolved && subjectsWithoutRunningLevels.length === 0;
  }, [step0IssueCount, step0ResolvedIssueCount, subjectsWithoutRunningLevels.length]);

  const routingPlans = useMemo(
    () => buildRoutingPlans(baseDemandBySubject, levelPolicyBySubject),
    [baseDemandBySubject, levelPolicyBySubject]
  );

  const policyLevelOpen = useMemo(() => levelOpenFromRouting(routingPlans), [routingPlans]);

  const computedWhitelist = useMemo(
    () => buildCampusWhitelist(selectedStreams, gradeCourseSelections, policyLevelOpen, streamGroups),
    [selectedStreams, gradeCourseSelections, policyLevelOpen, streamGroups]
  );

  const subjectPreviews = useMemo(() => {
    const previews: Partial<Record<LeveledSubject, ReturnType<typeof buildRoomMapPreview>>> = {};

    for (const subject of LEVELED_SUBJECTS) {
      const streamId = selectedStreams[subject];
      if (!streamId) continue;
      const group = streamGroups.find((entry) => entry.id === streamId);
      if (!group) continue;
      previews[subject] = buildRoomMapPreview(subject, group, routingPlans[subject], students, homerooms, hostOverrides[subject]);
    }

    return previews;
  }, [selectedStreams, streamGroups, routingPlans, students, homerooms, hostOverrides]);

  const step1EnabledStreamIds = useMemo(() => {
    const enabled: Record<LeveledSubject, Set<string>> = {
      kammi: new Set<string>(),
      lafthi: new Set<string>(),
      esl: new Set<string>(),
    };

    const buildPreviews = (selection: SelectedStreams) => {
      const previews: Partial<Record<LeveledSubject, ReturnType<typeof buildRoomMapPreview>>> = {};

      for (const subject of LEVELED_SUBJECTS) {
        const streamId = selection[subject];
        if (!streamId) return null;
        const group = streamGroupById.get(streamId);
        if (!group || group.subject !== subject) return null;
        previews[subject] = buildRoomMapPreview(subject, group, routingPlans[subject], students, homerooms, hostOverrides[subject]);
      }

      return previews;
    };

    const isFeasible = (selection: SelectedStreams) => {
      const previews = buildPreviews(selection);
      if (!previews) return false;
      const blockers = buildLeveledBlockersByGrade(selection, previews, streamGroups, homerooms);
      return canSatisfyRequiredGradeWideSubjects(courses, blockers);
    };

    const canComplete = (candidate: SelectedStreams): boolean => {
      const missing = LEVELED_SUBJECTS.filter((subject) => !candidate[subject]);
      if (missing.length === 0) return isFeasible(candidate);

      if (missing.length === 1) {
        const [subject] = missing;
        return streamGroupsBySubject[subject].some((group) => isFeasible({ ...candidate, [subject]: group.id }));
      }

      const [first, second] = missing;
      return streamGroupsBySubject[first].some((firstGroup) =>
        streamGroupsBySubject[second].some((secondGroup) =>
          isFeasible({
            ...candidate,
            [first]: firstGroup.id,
            [second]: secondGroup.id,
          })
        )
      );
    };

    for (const subject of LEVELED_SUBJECTS) {
      for (const group of streamGroupsBySubject[subject]) {
        const candidate: SelectedStreams = {
          ...selectedStreams,
          [subject]: group.id,
        };
        if (canComplete(candidate)) {
          enabled[subject].add(group.id);
        }
      }
    }

    return enabled;
  }, [selectedStreams, streamGroupById, streamGroupsBySubject, routingPlans, students, homerooms, hostOverrides, courses, streamGroups]);

  const selectedStreamCount = useMemo(() => LEVELED_SUBJECTS.filter((subject) => Boolean(selectedStreams[subject])).length, [selectedStreams]);

  const step1Issues = useMemo(
    () => buildStep1Issues(selectedStreams, subjectPreviews, t, fmt),
    [selectedStreams, subjectPreviews, t, fmt]
  );

  const step1SelectionFeasible = useMemo(() => {
    return LEVELED_SUBJECTS.every((subject) => {
      const streamId = selectedStreams[subject];
      if (!streamId) return false;
      return step1EnabledStreamIds[subject].has(streamId);
    });
  }, [selectedStreams, step1EnabledStreamIds]);

  const step1Complete = useMemo(() => {
    return LEVELED_SUBJECTS.every((subject) => step1Issues[subject].length === 0) && step1SelectionFeasible;
  }, [step1Issues, step1SelectionFeasible]);

  const requiredGradeOfferings = useMemo(() => {
    const required: Array<{ grade: number; subject: SubjectKey }> = [];
    for (const grade of GRADES) {
      for (const subject of GRADE_SUBJECTS[grade].all as SubjectKey[]) {
        const hasOptions = courses.some((course) => course.grade === grade && course.subject === subject);
        if (hasOptions) required.push({ grade, subject });
      }
    }
    return required;
  }, [courses]);

  const leveledBlockersByGrade = useMemo(
    () => buildLeveledBlockersByGrade(selectedStreams, subjectPreviews, streamGroups, homerooms),
    [selectedStreams, subjectPreviews, streamGroups, homerooms]
  );

  const meetingBlockedByLeveled = useCallback(
    (grade: number, course: Course, meeting: { day: Day; slot: number }) =>
      isMeetingBlockedByLeveled(leveledBlockersByGrade, grade, course, meeting),
    [leveledBlockersByGrade]
  );

  const step2OptionsBySubject = useMemo(
    () => buildStep2OptionsBySubject(courses, gradeCourseSelections, meetingBlockedByLeveled),
    [courses, gradeCourseSelections, meetingBlockedByLeveled]
  );

  useEffect(() => {
    setGradeCourseSelections((prev) => {
      const next: GradeCourseSelections = {};

      for (const grade of GRADES) {
        const cleaned: Partial<Record<SubjectKey, string | undefined>> = {};

        for (const subject of GRADE_SUBJECTS[grade].all as SubjectKey[]) {
          const state = step2OptionsBySubject[grade]?.[subject];
          if (!state || state.unavailable) continue;

          if (state.fixedCourseId) {
            cleaned[subject] = state.fixedCourseId;
            continue;
          }

          const selectedCourseId = prev[grade]?.[subject];
          if (!selectedCourseId) continue;
          const stillValid = state.validOptions.some((option) => option.id === selectedCourseId);
          if (!stillValid) continue;
          cleaned[subject] = selectedCourseId;
        }

        if (Object.keys(cleaned).length > 0) {
          next[grade] = cleaned;
        }
      }

      return sameGradeCourseSelections(prev, next) ? prev : next;
    });
  }, [step2OptionsBySubject]);

  const step2Stats = useMemo(() => {
    let decisionCount = 0;
    let selectedDecisionCount = 0;
    let unavailableCount = 0;

    for (const { grade, subject } of requiredGradeOfferings) {
      const state = step2OptionsBySubject[grade]?.[subject];
      if (!state || state.unavailable) {
        unavailableCount += 1;
        continue;
      }

      if (!state.decisionRequired) continue;
      decisionCount += 1;

      const selectedId = gradeCourseSelections[grade]?.[subject];
      const selectedValid = selectedId && state.validOptions.some((option) => option.id === selectedId);
      if (selectedValid) selectedDecisionCount += 1;
    }

    return { decisionCount, selectedDecisionCount, unavailableCount };
  }, [requiredGradeOfferings, step2OptionsBySubject, gradeCourseSelections]);

  const step2Ready = step2Stats.unavailableCount === 0 && step2Stats.selectedDecisionCount === step2Stats.decisionCount;
  const step2AutoResolved = step2Ready && step2Stats.decisionCount === 0;
  const campusFlowComplete = step0Complete && step1Complete && step2Ready;
  const homeroomEnabled = campusFlowComplete && campusWhitelist !== null && planApplied;

  const hasStep1Progress = useMemo(() => LEVELED_SUBJECTS.some((subject) => Boolean(selectedStreams[subject])), [selectedStreams]);
  const hasStep2Progress = useMemo(
    () => Object.values(gradeCourseSelections).some((selection) => Object.values(selection || {}).some((courseId) => Boolean(courseId))),
    [gradeCourseSelections]
  );

  useEffect(() => {
    if (!step0Complete && activeCampusStep !== 0) {
      setActiveCampusStep(0);
      return;
    }
    if (step0Complete && !step1Complete && activeCampusStep === 2) {
      setActiveCampusStep(1);
    }
  }, [step0Complete, step1Complete, activeCampusStep]);

  useEffect(() => {
    if (activeCampusStep === 0 && step0IssueCount === 0 && step0Complete) {
      setActiveCampusStep(1);
    }
  }, [activeCampusStep, step0IssueCount, step0Complete]);

  useEffect(() => {
    if (!homeroomEnabled && page === "homeroom") {
      setPage("campus");
    }
  }, [homeroomEnabled, page, setPage]);

  const markPlanDirty = useCallback(() => {
    setPlanApplied(false);
  }, []);

  const resetFromStep0 = useCallback(() => {
    setSelectedStreams({});
    setHostOverrides({ kammi: {}, lafthi: {}, esl: {} });
    setGradeCourseSelections({});
    setCampusWhitelist(null);
    setAssignments({});
    setMoveResolutions({});
    setPlanApplied(false);
  }, []);

  const resetFromStep1 = useCallback(() => {
    setGradeCourseSelections({});
    setCampusWhitelist(null);
    setAssignments({});
    setMoveResolutions({});
    setPlanApplied(false);
  }, []);

  const jumpBackToStep = useCallback(
    (target: 0 | 1) => {
      if (target === 0) {
        if ((hasStep1Progress || hasStep2Progress || campusWhitelist) && !window.confirm(t.confirmBackToStep0)) {
          return;
        }
        resetFromStep0();
        setPage("campus");
        setActiveCampusStep(0);
        return;
      }

      if ((hasStep2Progress || campusWhitelist) && !window.confirm(t.confirmBackToStep1)) {
        return;
      }
      resetFromStep1();
      setPage("campus");
      setActiveCampusStep(1);
    },
    [hasStep1Progress, hasStep2Progress, campusWhitelist, resetFromStep0, resetFromStep1, t, setPage]
  );

  const applyCampusPlan = useCallback(() => {
    if (!step2Ready) {
      setPage("campus");
      return;
    }

    const whitelist = new Set(computedWhitelist);
    setCampusWhitelist(whitelist);

    const { assignments: nextAssignments } = buildCampusAssignments({
      whitelist,
      selectedStreams,
      subjectPreviews,
      gradeCourseSelections,
      courses,
      homerooms,
      streamGroups,
    });

    const autoResolvedMoves = autoResolveMustMoves(nextAssignments, courses, students, whitelist, t, homerooms);
    setMoveResolutions(autoResolvedMoves);
    setAssignments(nextAssignments);
    setPlanApplied(true);
    setPage("homeroom");
  }, [
    step2Ready,
    computedWhitelist,
    selectedStreams,
    subjectPreviews,
    gradeCourseSelections,
    courses,
    homerooms,
    streamGroups,
    students,
    t,
    setPage,
  ]);

  const setIssueDecision = useCallback(
    (issue: PreFlightIssue, decision: Step0Decision) => {
      markPlanDirty();
      setStep0Decisions((prev) => ({
        ...prev,
        [issue.id]: decision,
      }));
      setHostOverrides((prev) => ({ ...prev, [issue.subject]: {} }));
    },
    [markPlanDirty]
  );

  const pickStream = useCallback(
    (subject: LeveledSubject, streamGroupId: string) => {
      markPlanDirty();
      setSelectedStreams((prev) => ({ ...prev, [subject]: streamGroupId }));
      setHostOverrides((prev) => ({ ...prev, [subject]: {} }));
    },
    [markPlanDirty]
  );

  const setHostForRoom = useCallback(
    (subject: LeveledSubject, roomId: number, host: RoomHost) => {
      markPlanDirty();
      setHostOverrides((prev) => ({
        ...prev,
        [subject]: {
          ...(prev[subject] || {}),
          [roomId]: host,
        },
      }));
    },
    [markPlanDirty]
  );

  const selectGradeCourse = useCallback(
    (grade: number, subject: SubjectKey, courseId: string) => {
      markPlanDirty();
      setGradeCourseSelections((prev) => ({
        ...prev,
        [grade]: {
          ...(prev[grade] || {}),
          [subject]: courseId,
        },
      }));
    },
    [markPlanDirty]
  );

  return {
    assignments,
    moveResolutions,
    setMoveResolutions,
    selectedStreams,
    step0Decisions,
    hostOverrides,
    gradeCourseSelections,
    campusWhitelist,
    activeCampusStep,
    setActiveCampusStep,
    step0Issues,
    step0IssueCount,
    step0ResolvedIssueCount,
    subjectsWithoutRunningLevels,
    step0Complete,
    routingPlans,
    computedWhitelist,
    subjectPreviews,
    step1EnabledStreamIds,
    selectedStreamCount,
    step1Issues,
    step1Complete,
    step2OptionsBySubject,
    step2DecisionCount: step2Stats.decisionCount,
    step2SelectedDecisionCount: step2Stats.selectedDecisionCount,
    step2UnavailableCount: step2Stats.unavailableCount,
    step2Ready,
    step2AutoResolved,
    campusFlowComplete,
    homeroomEnabled,
    jumpBackToStep,
    applyCampusPlan,
    setIssueDecision,
    pickStream,
    setHostForRoom,
    selectGradeCourse,
  };
}

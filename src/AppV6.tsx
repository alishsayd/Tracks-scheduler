import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { DAYS, GRADE_SUBJECTS, GRADES, LEVELS, SLOTS, SUBJECTS } from "./domain/constants";
import { buildHomerooms, getRuntimeAdminConfig } from "./domain/adminConfig";
import { buildStreamGroups, genCourses, genStudents } from "./domain/data";
import { formatDayPattern, getDayLabel, getSubjectLabelFromT, getT, localizePersonName, localizeRoomName, localizeSegment } from "./domain/i18n";
import {
  autoResolveMustMoves,
  buildCampusWhitelist,
  clearCourseMeetingsForRoom,
  computeMovement,
  getAssignment,
  getAvailableCourses,
  scheduleStats,
  unresolvedMoves,
  type GradeCourseSelections,
  type SelectedStreams,
} from "./domain/planner";
import {
  buildRoomMapPreview,
  levelOpenFromRouting,
  type RoomHost,
} from "./domain/plannerV6";
import { courseLabel, courseMatchesStudent } from "./domain/rules";
import type {
  Assignments,
  Course,
  Day,
  Lang,
  MoveModalState,
  MoveResolutions,
  PickerState,
  SidePanelState,
  SubjectKey,
  TabPage,
  LeveledSubject,
} from "./domain/types";
import {
  buildLeveledBlockersByGrade,
  canSatisfyRequiredGradeWideSubjects,
  isMeetingBlockedByLeveled,
  LEVELED_SUBJECTS,
  type ConflictFlag,
  type PreFlightIssue,
  type Step0Decision,
  buildBaseDemandBySubject,
  buildLevelPolicyBySubject,
  buildRoomsTotalBySubject,
  buildRoutingPlans,
  buildStep0Issues,
  buildStep1Issues,
  buildStep2OptionsBySubject,
  findSubjectsWithoutRunningLevels,
  meetingKey,
  sameGradeCourseSelections,
} from "./appv6/campusFlow";
import { buildCampusAssignments } from "./appv6/applyCampusPlan";
import "./styles/app.css";

const ADMIN_CONFIG = getRuntimeAdminConfig();
const HOMEROOMS = buildHomerooms(ADMIN_CONFIG);
const INIT_STUDENTS = genStudents(HOMEROOMS, ADMIN_CONFIG);
const INIT_COURSES = genCourses();
const STREAM_GROUPS = buildStreamGroups(INIT_COURSES);

function cx(...parts: Array<string | boolean | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AppV6() {
  const [lang, setLang] = useState<Lang>("en");
  const t = getT(lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const subjectLabel = useCallback((subject: SubjectKey) => getSubjectLabelFromT(t, subject), [t]);
  const dayLabel = useCallback((day: Day) => getDayLabel(lang, day), [lang]);
  const patternLabel = useCallback((pattern: string) => formatDayPattern(lang, pattern), [lang]);
  const roomLabel = useCallback((roomName: string) => localizeRoomName(lang, roomName), [lang]);
  const personLabel = useCallback((name: string) => localizePersonName(lang, name), [lang]);
  const segmentLabel = useCallback((segment: string | null) => localizeSegment(lang, segment), [lang]);
  const fmt = useCallback(
    (key: string, vars: Record<string, string | number>) => {
      let message = t[key] || key;
      for (const [name, value] of Object.entries(vars)) {
        message = message.split(`{${name}}`).join(String(value));
      }
      return message;
    },
    [t]
  );
  const fmtAvg = useCallback((value: number) => (Number.isFinite(value) ? value.toFixed(1) : "0.0"), []);

  const [students] = useState(INIT_STUDENTS);
  const [courses] = useState(INIT_COURSES);

  const [assignments, setAssignments] = useState<Assignments>({});
  const [moveResolutions, setMoveResolutions] = useState<MoveResolutions>({});

  const [page, setPage] = useState<TabPage>("campus");
  const [selectedRoom, setSelectedRoom] = useState(0);

  const [picker, setPicker] = useState<PickerState | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<SubjectKey | "all">("all");

  const [sidePanel, setSidePanel] = useState<SidePanelState | null>(null);
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null);

  const [selectedStreams, setSelectedStreams] = useState<SelectedStreams>({});
  const [step0Decisions, setStep0Decisions] = useState<Partial<Record<string, Step0Decision>>>({});
  const [hostOverrides, setHostOverrides] = useState<Record<LeveledSubject, Partial<Record<number, RoomHost>>>>({
    kammi: {},
    lafthi: {},
    esl: {},
  });
  const [gradeCourseSelections, setGradeCourseSelections] = useState<GradeCourseSelections>({});
  const [step2Conflicts, setStep2Conflicts] = useState<ConflictFlag[]>([]);
  const [campusWhitelist, setCampusWhitelist] = useState<Set<string> | null>(null);
  const [activeCampusStep, setActiveCampusStep] = useState<0 | 1 | 2>(0);
  const [step2Collapsed, setStep2Collapsed] = useState(false);

  const getCourse = useCallback((courseId: string) => courses.find((course) => course.id === courseId), [courses]);
  const streamGroupById = useMemo(() => new Map(STREAM_GROUPS.map((group) => [group.id, group])), []);
  const streamGroupsBySubject = useMemo(
    () => ({
      kammi: STREAM_GROUPS.filter((group) => group.subject === "kammi"),
      lafthi: STREAM_GROUPS.filter((group) => group.subject === "lafthi"),
      esl: STREAM_GROUPS.filter((group) => group.subject === "esl"),
    }),
    []
  );

  const baseDemandBySubject = useMemo(() => buildBaseDemandBySubject(students), [students]);

  const roomsTotalBySubject = useMemo(() => buildRoomsTotalBySubject(HOMEROOMS), []);

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
    () => buildCampusWhitelist(selectedStreams, gradeCourseSelections, policyLevelOpen, STREAM_GROUPS),
    [selectedStreams, gradeCourseSelections, policyLevelOpen]
  );

  const subjectPreviews = useMemo(() => {
    const previews: Partial<Record<LeveledSubject, ReturnType<typeof buildRoomMapPreview>>> = {};

    for (const subject of LEVELED_SUBJECTS) {
      const streamId = selectedStreams[subject];
      if (!streamId) continue;
      const group = STREAM_GROUPS.find((entry) => entry.id === streamId);
      if (!group) continue;
      previews[subject] = buildRoomMapPreview(subject, group, routingPlans[subject], students, HOMEROOMS, hostOverrides[subject]);
    }

    return previews;
  }, [selectedStreams, routingPlans, students, hostOverrides]);

  const step1EnabledStreamIds = useMemo(() => {
    const enabled: Record<LeveledSubject, Set<string>> = {
      kammi: new Set<string>(),
      lafthi: new Set<string>(),
      esl: new Set<string>(),
    };
    const feasibilityCache = new Map<string, boolean>();

    const selectionKey = (selection: SelectedStreams) =>
      LEVELED_SUBJECTS.map((subject) => `${subject}:${selection[subject] || "-"}`).join("|");

    const buildPreviewsForSelection = (selection: SelectedStreams) => {
      const previews: Partial<Record<LeveledSubject, ReturnType<typeof buildRoomMapPreview>>> = {};

      for (const subject of LEVELED_SUBJECTS) {
        const streamId = selection[subject];
        if (!streamId) return null;
        const group = streamGroupById.get(streamId);
        if (!group || group.subject !== subject) return null;
        previews[subject] = buildRoomMapPreview(subject, group, routingPlans[subject], students, HOMEROOMS, hostOverrides[subject]);
      }

      return previews;
    };

    const isStep2FeasibleForSelection = (selection: SelectedStreams) => {
      const previews = buildPreviewsForSelection(selection);
      if (!previews) return false;
      const blockers = buildLeveledBlockersByGrade(selection, previews, STREAM_GROUPS, HOMEROOMS);
      return canSatisfyRequiredGradeWideSubjects(courses, blockers);
    };

    const canCompleteWithSelection = (selection: SelectedStreams): boolean => {
      const key = selectionKey(selection);
      const cached = feasibilityCache.get(key);
      if (cached !== undefined) return cached;

      const missingSubjects = LEVELED_SUBJECTS.filter((subject) => !selection[subject]).sort(
        (left, right) => streamGroupsBySubject[left].length - streamGroupsBySubject[right].length
      );

      let feasible = false;
      if (missingSubjects.length === 0) {
        feasible = isStep2FeasibleForSelection(selection);
      } else {
        const nextSubject = missingSubjects[0];
        feasible = streamGroupsBySubject[nextSubject].some((group) =>
          canCompleteWithSelection({
            ...selection,
            [nextSubject]: group.id,
          })
        );
      }

      feasibilityCache.set(key, feasible);
      return feasible;
    };

    for (const subject of LEVELED_SUBJECTS) {
      for (const group of streamGroupsBySubject[subject]) {
        const candidate: SelectedStreams = {
          ...selectedStreams,
          [subject]: group.id,
        };
        if (canCompleteWithSelection(candidate)) {
          enabled[subject].add(group.id);
        }
      }
    }

    return enabled;
  }, [selectedStreams, streamGroupById, streamGroupsBySubject, routingPlans, students, hostOverrides, courses]);

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
    () => buildLeveledBlockersByGrade(selectedStreams, subjectPreviews, STREAM_GROUPS, HOMEROOMS),
    [selectedStreams, subjectPreviews]
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

  const step2DecisionOfferings = useMemo(
    () =>
      requiredGradeOfferings.filter(({ grade, subject }) => {
        const state = step2OptionsBySubject[grade]?.[subject];
        return Boolean(state?.decisionRequired);
      }),
    [requiredGradeOfferings, step2OptionsBySubject]
  );

  const step2UnavailableOfferings = useMemo(
    () =>
      requiredGradeOfferings.filter(({ grade, subject }) => {
        const state = step2OptionsBySubject[grade]?.[subject];
        return Boolean(state?.unavailable);
      }),
    [requiredGradeOfferings, step2OptionsBySubject]
  );

  const selectedDecisionOfferings = useMemo(
    () =>
      step2DecisionOfferings.filter(({ grade, subject }) => {
        const selectedId = gradeCourseSelections[grade]?.[subject];
        if (!selectedId) return false;
        const state = step2OptionsBySubject[grade]?.[subject];
        return Boolean(state?.validOptions.some((option) => option.id === selectedId));
      }).length,
    [step2DecisionOfferings, gradeCourseSelections, step2OptionsBySubject]
  );

  const step2Complete = useMemo(
    () => step2UnavailableOfferings.length === 0 && selectedDecisionOfferings === step2DecisionOfferings.length,
    [step2UnavailableOfferings.length, selectedDecisionOfferings, step2DecisionOfferings.length]
  );

  const step2Ready = step2Complete;
  const step2AutoResolved = step2Ready && step2DecisionOfferings.length === 0 && step2UnavailableOfferings.length === 0;

  const campusFlowComplete = step0Complete && step1Complete && step2Ready;
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
    if (activeCampusStep !== 2) {
      setStep2Collapsed(false);
      return;
    }
    if (step2Ready && !step2AutoResolved) {
      setStep2Collapsed(true);
    } else {
      setStep2Collapsed(false);
    }
  }, [activeCampusStep, step2Ready, step2AutoResolved]);

  useEffect(() => {
    if (page !== "campus") return;
    const mainLeft = document.querySelector(".ml");
    if (mainLeft instanceof HTMLElement) {
      mainLeft.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeCampusStep, page]);

  const resetFromStep0 = useCallback(() => {
    setSelectedStreams({});
    setHostOverrides({ kammi: {}, lafthi: {}, esl: {} });
    setGradeCourseSelections({});
    setStep2Conflicts([]);
    setCampusWhitelist(null);
    setAssignments({});
    setMoveResolutions({});
    setStep2Collapsed(false);
  }, []);

  const resetFromStep1 = useCallback(() => {
    setGradeCourseSelections({});
    setStep2Conflicts([]);
    setCampusWhitelist(null);
    setAssignments({});
    setMoveResolutions({});
    setStep2Collapsed(false);
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
    [hasStep1Progress, hasStep2Progress, campusWhitelist, resetFromStep0, resetFromStep1, t]
  );

  const applyCampusPlan = useCallback(() => {
    if (!step2Ready) {
      setPage("campus");
      return;
    }

    const whitelist = new Set(computedWhitelist);
    setCampusWhitelist(whitelist);

    const { assignments: nextAssignments, conflicts } = buildCampusAssignments({
      whitelist,
      selectedStreams,
      subjectPreviews,
      gradeCourseSelections,
      courses,
      homerooms: HOMEROOMS,
      streamGroups: STREAM_GROUPS,
    });

    setStep2Conflicts(conflicts);
    const autoResolvedMoves = autoResolveMustMoves(nextAssignments, courses, students, whitelist, t, HOMEROOMS);
    setMoveResolutions(autoResolvedMoves);
    setAssignments(nextAssignments);
    setStep2Collapsed(true);
    setPage("homeroom");
  }, [step2Ready, computedWhitelist, selectedStreams, subjectPreviews, gradeCourseSelections, courses, students, t]);

  const setIssueDecision = useCallback((issue: PreFlightIssue, decision: Step0Decision) => {
    setStep0Decisions((prev) => ({
      ...prev,
      [issue.id]: decision,
    }));
    setHostOverrides((prev) => ({ ...prev, [issue.subject]: {} }));
  }, []);

  const pickStream = useCallback((subject: LeveledSubject, streamGroupId: string) => {
    setSelectedStreams((prev) => ({ ...prev, [subject]: streamGroupId }));
    setHostOverrides((prev) => ({ ...prev, [subject]: {} }));
  }, []);

  const setHostForRoom = useCallback((subject: LeveledSubject, roomId: number, host: RoomHost) => {
    setHostOverrides((prev) => ({
      ...prev,
      [subject]: {
        ...(prev[subject] || {}),
        [roomId]: host,
      },
    }));
  }, []);

  const assignCourseToRoom = useCallback(
    (roomId: number, courseId: string) => {
      const course = getCourse(courseId);
      if (!course) return;

      setAssignments((prev) => {
        const next: Assignments = { ...prev };
        if (!next[roomId]) next[roomId] = {};

        for (const meeting of course.meetings) {
          const dayState = { ...(next[roomId]?.[meeting.day] || {}) };
          dayState[meeting.slot] = course.id;
          next[roomId] = { ...(next[roomId] || {}), [meeting.day]: dayState };
        }

        return next;
      });

      setPicker(null);
      setSubjectFilter("all");
    },
    [getCourse]
  );

  const clearSlot = useCallback(
    (roomId: number, day: Day, slotId: number) => {
      const currentId = getAssignment(assignments, roomId, day, slotId);
      if (!currentId) return;

      const currentCourse = getCourse(currentId);
      if (!currentCourse) return;

      setAssignments((prev) => clearCourseMeetingsForRoom(prev, roomId, currentCourse));
      if (sidePanel?.day === day && sidePanel?.slotId === slotId) setSidePanel(null);
    },
    [assignments, getCourse, sidePanel]
  );

  const getAvailable = useCallback(
    (day: Day, slotId: number, roomId: number) =>
      getAvailableCourses(courses, campusWhitelist, assignments, day, slotId, roomId, subjectFilter, HOMEROOMS),
    [courses, campusWhitelist, assignments, subjectFilter]
  );

  const computeMovementForCell = useCallback(
    (roomId: number, day: Day, slotId: number) =>
      computeMovement(roomId, day, slotId, assignments, courses, students, moveResolutions, campusWhitelist, t, HOMEROOMS),
    [assignments, courses, students, moveResolutions, campusWhitelist, t]
  );

  const resolveMove = useCallback((studentId: string, blockKey: string, destination: number) => {
    setMoveResolutions((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [blockKey]: destination,
      },
    }));
    setMoveModal(null);
  }, []);

  const unresolved = useMemo(
    () => unresolvedMoves(assignments, courses, students, moveResolutions, campusWhitelist, t, HOMEROOMS),
    [assignments, courses, students, moveResolutions, campusWhitelist, t]
  );

  const stats = useMemo(() => scheduleStats(assignments, unresolved.length, HOMEROOMS), [assignments, unresolved.length]);

  const sidePanelData = useMemo(() => {
    if (!sidePanel) return null;
    const assignment = getAssignment(assignments, selectedRoom, sidePanel.day, sidePanel.slotId);
    if (!assignment) return null;
    const course = getCourse(assignment);
    if (!course) return null;
    return {
      course,
      movement: computeMovementForCell(selectedRoom, sidePanel.day, sidePanel.slotId),
    };
  }, [sidePanel, selectedRoom, assignments, getCourse, computeMovementForCell]);

  const buildManualOverrideOptions = useCallback(
    (day: Day, slotId: number, sourceRoomId: number) => {
      const options: Array<{ roomId: number; courseId: string }> = [];
      for (const room of HOMEROOMS) {
        if (room.id === sourceRoomId) continue;
        const courseId = getAssignment(assignments, room.id, day, slotId);
        if (!courseId) continue;
        if (campusWhitelist && !campusWhitelist.has(courseId)) continue;
        options.push({ roomId: room.id, courseId });
      }
      return options;
    },
    [assignments, campusWhitelist]
  );

  const manualOverrideOptions = useMemo(() => {
    if (!sidePanel) return [];
    return buildManualOverrideOptions(sidePanel.day, sidePanel.slotId, selectedRoom);
  }, [sidePanel, selectedRoom, buildManualOverrideOptions]);

  const roomFlags = useMemo(() => {
    if (!campusWhitelist) return [];
    const flags: string[] = [];
    const seen = new Set<string>();
    const roomCapacity = HOMEROOMS[selectedRoom].capacity;
    const roomPrepG12Students = students.filter((student) => student.homeroom === selectedRoom && student.grade === 12 && !student.doneQ);
    const offlineSlots = DAYS.reduce((sum, day) => {
      return sum + SLOTS.filter((slot) => !getAssignment(assignments, selectedRoom, day, slot.id)).length;
    }, 0);
    flags.push(fmt("roomFlagOfflineSlots", { count: offlineSlots }));

    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const assignment = getAssignment(assignments, selectedRoom, day, slot.id);
        if (!assignment) continue;
        const course = getCourse(assignment);
        if (!course) continue;

        const movement = computeMovementForCell(selectedRoom, day, slot.id);
        if (movement.forcedStay.length > 0) {
          const reason = movement.forcedStay[0]?.reason ? ` (${movement.forcedStay[0].reason})` : "";
          const line = fmt("roomFlagForcedStay", { count: movement.forcedStay.length, course: courseLabel(course, lang), reason });
          if (!seen.has(line)) {
            seen.add(line);
            flags.push(line);
          }
        }

        if (movement.effectiveHere > roomCapacity) {
          const line = fmt("roomFlagRosterOverflow", { course: courseLabel(course, lang), count: movement.effectiveHere });
          if (!seen.has(line)) {
            seen.add(line);
            flags.push(line);
          }
        }

        if (SUBJECTS[course.subject].tahsili && roomPrepG12Students.length > 0) {
          const qudratCoursesInSlot = HOMEROOMS
            .map((room) => {
              const candidateId = getAssignment(assignments, room.id, day, slot.id);
              if (!candidateId) return null;
              const candidate = getCourse(candidateId);
              if (!candidate || SUBJECTS[candidate.subject].qudrat !== true) return null;
              return candidate;
            })
            .filter(Boolean) as Course[];

          if (qudratCoursesInSlot.length > 0) {
            const subjectsInSlot = Array.from(new Set(qudratCoursesInSlot.map((entry) => entry.subject))).filter(
              (entry): entry is "kammi" | "lafthi" => entry === "kammi" || entry === "lafthi"
            );
            const unmetByNeed = new Map<string, number>();
            let unmetGeneric = 0;

            for (const student of roomPrepG12Students) {
              const hasQudratOption = qudratCoursesInSlot.some((candidate) => courseMatchesStudent(candidate, student));
              if (hasQudratOption) continue;

              if (subjectsInSlot.length === 1) {
                const qSubject = subjectsInSlot[0];
                const qLevel = student.needs[qSubject];
                const key = `${qSubject}|${qLevel}`;
                unmetByNeed.set(key, (unmetByNeed.get(key) || 0) + 1);
              } else {
                unmetGeneric += 1;
              }
            }

            unmetByNeed.forEach((count, key) => {
              const [qSubject, qLevel] = key.split("|");
              const line = `${count} students need ${subjectLabel(qSubject as SubjectKey)} ${qLevel} on ${dayLabel(day)} · ${t.slot} ${slot.id}, but no matching section is running.`;
              if (!seen.has(line)) {
                seen.add(line);
                flags.push(line);
              }
            });

            if (unmetGeneric > 0) {
              const line = `${unmetGeneric} students need Qudrat on ${dayLabel(day)} · ${t.slot} ${slot.id}, but no matching section is running.`;
              if (!seen.has(line)) {
                seen.add(line);
                flags.push(line);
              }
            }
          }
        }
      }
    }

    return flags;
  }, [campusWhitelist, assignments, selectedRoom, getCourse, computeMovementForCell, lang, fmt, students, subjectLabel, dayLabel, t.slot]);

  const openManualMoveModal = useCallback(
    (studentId: string) => {
      if (!sidePanel || !sidePanelData || manualOverrideOptions.length === 0) return;
      setMoveModal({
        studentId,
        day: sidePanel.day,
        slotId: sidePanel.slotId,
        options: manualOverrideOptions,
        blockKey: sidePanelData.movement.blockKey,
      });
    },
    [sidePanel, sidePanelData, manualOverrideOptions]
  );

  return (
    <div dir={dir}>
      <div className="app">
        <div className="topbar">
          <div className="tb-l">
            <div className="logo">NOON</div>
            <div>
              <div className="tb-t">{t.appTitle} v6</div>
              <div className="tb-s">
                {t.campusName} · {HOMEROOMS.length} {t.roomsLabel} · {students.length} {t.studentsLabel}
              </div>
            </div>
          </div>
          <div className="pills">
            <div className="topbar-stat">
              {stats.filled}/{stats.total} {t.slots} · {stats.unresolved} {t.moves}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginInlineStart: 6 }}>
              <span style={{ fontSize: 11, color: "#94908A" }}>{t.language}</span>
              <div style={{ display: "inline-flex", border: "1px solid #E8E4DD", borderRadius: 999, overflow: "hidden" }}>
                <button
                  style={{ padding: "4px 10px", fontSize: 11, border: "none", cursor: "pointer", background: lang === "en" ? "#1a1a1a" : "#fff", color: lang === "en" ? "#fff" : "#6B665F" }}
                  onClick={() => setLang("en")}
                >
                  {t.english}
                </button>
                <button
                  style={{ padding: "4px 10px", fontSize: 11, border: "none", cursor: "pointer", background: lang === "ar" ? "#1a1a1a" : "#fff", color: lang === "ar" ? "#fff" : "#6B665F" }}
                  onClick={() => setLang("ar")}
                >
                  {t.arabic}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="nav">
          <button className={cx("nt", page === "campus" && "on")} onClick={() => setPage("campus")}>
            {t.campusPlan}
          </button>
          <button className={cx("nt", page === "homeroom" && "on")} onClick={() => setPage("homeroom")}>
            {t.homerooms}
          </button>
          <button className={cx("nt", page === "reconciliation" && "on")} onClick={() => setPage("reconciliation")}>
            {t.reconciliation}
            {unresolved.length + step2Conflicts.length > 0 && <span className="nbadge">{unresolved.length + step2Conflicts.length}</span>}
          </button>
        </div>

        <div className="main">
          <div className="ml">
            {page !== "campus" && !campusFlowComplete && <div className="under-construction">{t.underConstructionBanner}</div>}

            {page === "campus" && (
              <>
                <div className="cycle-stack">
                  <div className="cycle-card current">
                    <div className="cycle-head">
                      <div>
                        <div className="cycle-title">{t.cycleCurrentTitle}</div>
                        <div className="cycle-sub">{t.cycleCurrentSub}</div>
                      </div>
                      <span className="cycle-status on">{t.cycleCurrentStatus}</span>
                    </div>

                    <div className="step-shell">
                      <div className="step-shell-head">
                        <span>{fmt("cycleStepProgress", { step: activeCampusStep + 1 })}</span>
                        <span className="step-shell-sub">{t.cycleStepGuidedSetup}</span>
                      </div>
                      <div className="step-track">
                        {[0, 1, 2].map((step) => (
                          <div
                            key={step}
                            className={cx(
                              "step-node",
                              activeCampusStep === step && !((step === 2) && step2Collapsed) && "on",
                              (activeCampusStep > step || (step === 2 && step2Collapsed)) && "done"
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {activeCampusStep > 0 && (
                      <div className="step-mini">
                        <div>
                          <div className="step-mini-title">{t.cycleStep0CompleteTitle}</div>
                          <div className="step-mini-copy">
                            {step0IssueCount === 0
                              ? t.cycleStep0NoIssuesCopy
                              : fmt("cycleStep0CompleteCopy", { resolved: step0ResolvedIssueCount, total: step0IssueCount })}
                          </div>
                        </div>
                        <button className="step-mini-btn" onClick={() => jumpBackToStep(0)}>
                          {t.cycleEditStep0}
                        </button>
                      </div>
                    )}

                    {activeCampusStep > 1 && (
                      <div className="step-mini">
                        <div>
                          <div className="step-mini-title">{t.cycleStep1CompleteTitle}</div>
                          <div className="step-mini-copy">{fmt("cycleStep1CompleteCopy", { selected: selectedStreamCount, total: LEVELED_SUBJECTS.length })}</div>
                        </div>
                        <button className="step-mini-btn" onClick={() => jumpBackToStep(1)}>
                          {t.cycleEditStep1}
                        </button>
                      </div>
                    )}

                    {activeCampusStep === 0 && step0IssueCount > 0 && (
                      <div className="card step-focus">
                        <div className="card-t">{t.v6Step0Title}</div>
                        <div className="step-inline-note" style={{ marginBottom: 10 }}>
                          {t.preflightSubtitle}
                        </div>

                        <div className="preflight-list">
                          {step0Issues.map((issue) => {
                            const decision = step0Decisions[issue.id];
                            const closeLine = issue.closeSplit
                              ? fmt("preflightCloseSplitLine", {
                                count: issue.levelDemand,
                                toL1: issue.closeSplit.toL1,
                                toL3: issue.closeSplit.toL3,
                                l1Count: issue.closeSplitTargetCounts?.L1 ?? 0,
                                l3Count: issue.closeSplitTargetCounts?.L3 ?? 0,
                              })
                              : fmt("preflightCloseLine", {
                                count: issue.levelDemand,
                                target: issue.closeMergeTarget,
                                targetCount: issue.closeTargetCount,
                              });
                            return (
                              <div key={issue.id} className="preflight-card">
                                <div className="preflight-title">
                                  {fmt("preflightIssueTitle", {
                                    subject: subjectLabel(issue.subject),
                                    level: issue.level,
                                  })}
                                </div>
                                <div className="preflight-fact">{fmt("preflightIssueFact", { count: issue.levelDemand, level: issue.level })}</div>
                                <div className="preflight-fact">
                                  {fmt("preflightConstraintLine", {
                                    level: issue.level,
                                    roomsTotal: issue.roomsTotal,
                                    roomsRemaining: issue.roomsRemainingIfRun,
                                    remaining: issue.remainingDemandIfRun,
                                  })}
                                </div>
                                <div className="preflight-metrics">
                                  <div>{fmt("preflightIfRun", { avg: fmtAvg(issue.avgIfRun) })}</div>
                                  <div>{closeLine}</div>
                                  <div>{fmt("preflightIfCloseAvg", { avg: fmtAvg(issue.avgIfClose) })}</div>
                                </div>
                                <div className="preflight-actions">
                                  <button
                                    className={cx("preflight-btn", decision === "RUN" && "on")}
                                    onClick={() => setIssueDecision(issue, "RUN")}
                                  >
                                    {fmt("preflightRunAnyway", { subject: subjectLabel(issue.subject), level: issue.level })}
                                  </button>
                                  <button
                                    className={cx("preflight-btn", decision === "CLOSE" && "on")}
                                    onClick={() => setIssueDecision(issue, "CLOSE")}
                                  >
                                    {issue.closeSplit
                                      ? fmt("preflightCloseSplit", { level: issue.level })
                                      : fmt("preflightCloseSingle", { level: issue.level, target: issue.closeMergeTarget })}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="step-inline-note" style={{ marginTop: 10 }}>
                          {step0Complete
                            ? t.readyForStep1
                            : step0ResolvedIssueCount < step0IssueCount
                              ? fmt("preflightResolveLine", { resolved: step0ResolvedIssueCount, total: step0IssueCount })
                              : fmt("preflightNeedRunningLevelLine", { subjects: subjectsWithoutRunningLevels.map((subject) => subjectLabel(subject)).join(", ") })}
                        </div>
                        <div className="step-actions">
                          <button className="apply-btn" disabled={!step0Complete} onClick={() => setActiveCampusStep(1)}>
                            {t.continueToStep1}
                          </button>
                        </div>
                      </div>
                    )}

                    {activeCampusStep === 1 && (
                      <div className="card step-focus">
                        <div className="card-t">{t.v6Step1Title}</div>

                        {LEVELED_SUBJECTS.map((subject) => {
                          const subjectDef = SUBJECTS[subject];
                          const options = STREAM_GROUPS.filter((group) => group.subject === subject);
                          const pickedId = selectedStreams[subject];
                          const preview = subjectPreviews[subject];
                          const issues = step1Issues[subject];

                          return (
                            <div key={subject} style={{ marginBottom: 24 }}>
                              <div style={{ fontSize: 12, fontWeight: 900, color: subjectDef.color, marginBottom: 6 }}>{subjectLabel(subject)}</div>

                              {options.map((group) => {
                                const picked = pickedId === group.id;
                                const enabled = step1EnabledStreamIds[subject].has(group.id);
                                return (
                                  <div
                                    key={group.id}
                                    className={cx("stream-opt", picked && "picked", !enabled && "disabled")}
                                    onClick={() => {
                                      if (!enabled) return;
                                      pickStream(subject, group.id);
                                    }}
                                    aria-disabled={!enabled}
                                  >
                                    <div className="so-radio">{picked && <div className="so-dot" />}</div>
                                    <div className="so-info">
                                      <div className="so-slot">{fmt("slotLabelWithValue", { slot: group.slot })} · {group.slotLabel}</div>
                                      <div className="so-pattern">{patternLabel(group.pattern)}</div>
                                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                        {LEVELS.map((level) => {
                                          const course = group.levels.find((entry) => entry?.level === level);
                                          if (!course) return null;
                                          const isOpen = routingPlans[subject].run[level];
                                          return (
                                            <div key={level} className={cx("bundle-row", !isOpen && "closed")}>
                                              <span
                                                className={cx("bundle-level", !isOpen && "closed")}
                                                style={{ background: subjectDef.bg, color: subjectDef.color }}
                                              >
                                                {level}
                                              </span>
                                              <span className="bundle-teacher">{personLabel(course.teacherName)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {preview ? (
                                <div style={{ marginTop: 10, overflowX: "auto", border: "1px solid #F0EDE8", borderRadius: 10 }}>
                                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", background: "#F5F3EE" }}>{t.roomHeader}</th>
                                        <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", background: "#F5F3EE" }}>{t.hostHeader}</th>
                                        <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", background: "#F5F3EE" }}>{t.projectedRosterHeader}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {preview.rows.map((row, index) => (
                                        <tr key={`${subject}-${row.roomId}`} style={{ background: index % 2 ? "#FAFAF7" : "#fff" }}>
                                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8", whiteSpace: "nowrap" }}>
                                            {roomLabel(row.roomName)} <span style={{ color: "#94908A", fontSize: 10 }}>{t.grade} {row.grade}</span>
                                          </td>
                                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8" }}>
                                            {row.fixed ? (
                                              <span style={{ fontWeight: 700, color: "#6B665F" }}>{t.tahsiliAuto}</span>
                                            ) : (
                                              <select
                                                value={row.host}
                                                onChange={(event) => setHostForRoom(subject, row.roomId, event.target.value as RoomHost)}
                                                style={{ border: "1px solid #E8E4DD", borderRadius: 6, padding: "4px 8px", background: "#fff" }}
                                              >
                                                {preview.levelsRunning.map((level) => (
                                                  <option key={`${subject}-${row.roomId}-${level}`} value={level}>
                                                    {subjectLabel(subject)} {level}
                                                  </option>
                                                ))}
                                              </select>
                                            )}
                                          </td>
                                          <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                                            {fmt("roomProjectedStudents", { count: row.effectiveCount })}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}

                              {preview ? (
                                <div className="step-inline-note" style={{ marginTop: 8 }}>
                                  {fmt("step1Summary", {
                                    stay: preview.summary.stay,
                                    move: preview.summary.move,
                                    forced: preview.summary.forcedStays,
                                  })}
                                  {preview.summary.worstRoom
                                    ? ` · ${fmt("maxRosterSummary", { count: preview.summary.worstRoom.effective })}`
                                    : ""}
                                </div>
                              ) : (
                                <div className="step-inline-note" style={{ marginTop: 8 }}>
                                  {t.chooseBundleRoomMap}
                                </div>
                              )}

                              {issues.length > 0 ? (
                                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                                  {issues.map((issue) => (
                                    <span key={`${subject}-${issue}`} style={{ fontSize: 11, color: "#B91C1C", fontWeight: 700 }}>
                                      {issue}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        <div className="step-inline-note">
                          {step1Complete
                            ? step2AutoResolved
                              ? t.step2AutoResolvedFromStep1
                              : t.readyForStep2
                            : fmt("step1ProgressLine", { selected: selectedStreamCount, total: LEVELED_SUBJECTS.length })}
                        </div>
                        <div className="step-actions">
                          <button className="apply-btn" disabled={!step1Complete} onClick={() => setActiveCampusStep(2)}>
                            {t.continueToStep2}
                          </button>
                        </div>
                      </div>
                    )}

                    {activeCampusStep === 2 && !step2Collapsed && (
                      <div className="card step-focus">
                        <div className="card-t">{t.step2}</div>
                        <div className="step-inline-note" style={{ marginBottom: 10 }}>
                          {step2AutoResolved ? t.step2AutoResolvedHint : t.step2DecisionOnlyHint}
                        </div>

                        {GRADES.map((grade) => {
                          const subjects = GRADE_SUBJECTS[grade].all;
                          return (
                            <div key={grade} style={{ padding: "10px 0", borderTop: grade === 10 ? "none" : "1px solid #F0EDE8" }}>
                              <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>{t.grade} {grade}</div>
                              {subjects.map((subject) => {
                                const subjectDef = SUBJECTS[subject];
                                const state = step2OptionsBySubject[grade]?.[subject];
                                if (!state || !state.options.length) return null;
                                const selected = gradeCourseSelections[grade]?.[subject];
                                const fixedCourse = state.fixedCourseId
                                  ? state.validOptions.find((course) => course.id === state.fixedCourseId) || null
                                  : null;

                                return (
                                  <div key={`${grade}-${subject}`} className="step2-subject-block">
                                    <div className="step2-subject-title" style={{ color: subjectDef.color }}>
                                      {subjectLabel(subject)}
                                    </div>
                                    {state.unavailable ? (
                                      <div className="step-inline-note">{t.step2NoValidBundle}</div>
                                    ) : fixedCourse ? (
                                      <div className="step2-fixed-opt">
                                        <div className="step2-fixed-line">
                                          {fmt("step2FixedBundleLine", {
                                            subject: subjectLabel(subject),
                                            slotLabel: t.slot,
                                            slot: fixedCourse.meetings[0]?.slot ?? "-",
                                          })}
                                        </div>
                                        <div className="step2-fixed-meta">
                                          {fixedCourse.startTime} · {patternLabel(fixedCourse.pattern)} · {personLabel(fixedCourse.teacherName)}
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {state.validOptions.map((course) => {
                                          const picked = selected === course.id;
                                          return (
                                            <div
                                              key={course.id}
                                              className={cx("stream-opt", "step2-stream-opt", picked && "picked")}
                                              onClick={() => {
                                                setGradeCourseSelections((prev) => ({
                                                  ...prev,
                                                  [grade]: {
                                                    ...(prev[grade] || {}),
                                                    [subject]: course.id,
                                                  },
                                                }));
                                              }}
                                            >
                                              <div className="so-radio">{picked && <div className="so-dot" />}</div>
                                              <div className="so-info">
                                                <div className="so-slot">{fmt("slotLabelWithValue", { slot: course.meetings[0]?.slot || "-" })} · {course.startTime}</div>
                                                <div className="so-pattern">{patternLabel(course.pattern)}</div>
                                                <div className="step2-option-meta">{personLabel(course.teacherName)}</div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}

                        <div className="step-inline-note">
                          {step2Ready
                            ? t.readyToApply
                            : step2UnavailableOfferings.length > 0
                              ? fmt("step2NoValidBundlesLine", { count: step2UnavailableOfferings.length })
                              : fmt("step2DecisionSelectionsCompleted", { selected: selectedDecisionOfferings, total: step2DecisionOfferings.length })}
                        </div>
                        <div className="step-actions">
                          <button className="apply-btn" onClick={applyCampusPlan} disabled={!campusFlowComplete || computedWhitelist.size === 0}>
                            {t.apply}
                          </button>
                        </div>
                      </div>
                    )}

                    {activeCampusStep === 2 && step2Collapsed && (
                      <>
                        <div className="step-mini done">
                          <div>
                            <div className="step-mini-title">{t.step2CompleteTitle}</div>
                            <div className="step-mini-copy">{t.step2CompleteCopy}</div>
                          </div>
                          <button className="step-mini-btn" onClick={() => setStep2Collapsed(false)}>
                            {t.editStep2}
                          </button>
                        </div>
                        <div className="card step-focus">
                          <div className="card-t">{t.cycleReadyTitle}</div>
                          <div className="step-inline-note">{t.cycleReadyCopy}</div>
                          <div className="step-actions">
                            <button className="apply-btn" onClick={applyCampusPlan} disabled={!campusFlowComplete || computedWhitelist.size === 0}>
                              {t.apply}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="cycle-card upcoming">
                    <div className="cycle-head">
                      <div>
                        <div className="cycle-title">{t.cycleUpcomingTitle}</div>
                        <div className="cycle-sub">{t.cycleUpcomingSub}</div>
                      </div>
                      <span className="cycle-status off">{t.cycleUpcomingStatus}</span>
                    </div>
                    <div className="cycle-locked-copy">
                      {t.cycleLockedCopy}
                    </div>
                  </div>
                </div>
              </>
            )}

            {page === "homeroom" && (
              <>
                <div className="rtabs">
                  {HOMEROOMS.map((room) => {
                    const count = students.filter((student) => student.homeroom === room.id).length;
                    return (
                      <button
                        key={room.id}
                        className={cx("rtab", selectedRoom === room.id && "on")}
                        onClick={() => {
                          setSelectedRoom(room.id);
                          setSidePanel(null);
                        }}
                      >
                        {roomLabel(room.name)} <span style={{ fontSize: 10, opacity: 0.5 }}>{t.grade} {room.grade}</span> <span className="rtab-n">{count}</span>
                      </button>
                    );
                  })}
                </div>

                {!campusWhitelist ? (
                  <div className="card">
                    <div className="card-t">{t.openCoursesFirstTitle}</div>
                    <div style={{ fontSize: 12, color: "#94908A" }}>{t.openCoursesFirstBody}</div>
                  </div>
                ) : null}

                <div className="room-flags">
                  <div className="room-flags-title">{t.roomFlagsTitle}</div>
                  {roomFlags.length === 0 ? (
                    <div className="room-flags-empty">{t.roomFlagsEmpty}</div>
                  ) : (
                    <ul>
                      {roomFlags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid">
                  <div className="gh"></div>
                  {DAYS.map((day) => (
                    <div key={day} className="gh">{dayLabel(day)}</div>
                  ))}

                  {SLOTS.map((slot, index) => (
                    <Fragment key={slot.id}>
                      {index === 3 && <div className="gbrk">{t.break}</div>}
                      <div className="gtime">
                        <div className="gtime-m">{slot.start}</div>
                        <div className="gtime-s">{slot.end}</div>
                      </div>

                      {DAYS.map((day) => {
                        const assignment = getAssignment(assignments, selectedRoom, day, slot.id);
                        const course = assignment ? getCourse(assignment) : null;
                        const movement = course ? computeMovementForCell(selectedRoom, day, slot.id) : null;
                        const subject = course ? SUBJECTS[course.subject] : null;
                        const selected = sidePanel?.day === day && sidePanel?.slotId === slot.id;
                        const unresolvedCount = movement?.mustMoveOut.filter((move) => move.resolved === undefined || move.resolved === null).length || 0;

                        return (
                          <div
                            key={`${day}-${slot.id}`}
                            className={cx("cell", !assignment && "empty", selected && "sel")}
                            onClick={() => {
                              if (!campusWhitelist || !assignment) return;
                              setSidePanel(selected ? null : { day, slotId: slot.id });
                            }}
                          >
                            {!assignment && (
                              <div className="ci-e">
                                <span>{t.offlineCourseSlot}</span>
                              </div>
                            )}

                            {course && (
                              <div className="ci" style={{ background: subject?.bg, color: subject?.accent }}>
                                <button
                                  className="ci-x"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    clearSlot(selectedRoom, day, slot.id);
                                  }}
                                >
                                  ×
                                </button>
                                <div className="ci-s">{course ? subjectLabel(course.subject) : ""}</div>
                                <div className="ci-l">{[course.level, course.grade ? `${t.grade} ${course.grade}` : ""].filter(Boolean).join(" · ")}</div>
                                <div className="ci-t">{personLabel(course.teacherName)}</div>
                                {movement && (
                                  <div className="badges">
                                    {movement.aligned.length > 0 && <span className="bg bgg">✓{movement.aligned.length}</span>}
                                    {unresolvedCount > 0 && <span className="bg bgr">↗{unresolvedCount}</span>}
                                    {movement.forcedStay.length > 0 && <span className="bg bgy">⚠{movement.forcedStay.length}</span>}
                                    {movement.moveIns.length > 0 && <span className="bg bgb">↙{movement.moveIns.length}</span>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </>
            )}

            {page === "reconciliation" &&
              (unresolved.length === 0 && step2Conflicts.length === 0 ? (
                <div className="rc-empty">
                  <div className="rc-ei">{stats.filled === stats.total ? "🎉" : "📋"}</div>
                  <div className="rc-et">{stats.filled === stats.total ? t.scheduleComplete : t.noUnresolvedMoves}</div>
                  <div className="rc-es">{stats.filled < stats.total ? `${stats.total - stats.filled} ${t.emptySlots}` : t.allResolved}</div>
                </div>
              ) : (
                <>
                  {step2Conflicts.length > 0 && (
                    <div className="rc">
                      <div className="rc-hd">
                        <span className="rc-d">{t.step2OverwriteConflicts}</span>
                        <span className="rc-sl">{t.manualReconciliationRequired}</span>
                        <span className="rc-c">{step2Conflicts.length}</span>
                      </div>
                      <div className="rc-bd">
                        {step2Conflicts.map((conflict, index) => {
                          const room = HOMEROOMS.find((entry) => entry.id === conflict.roomId);
                          const previousCourse = getCourse(conflict.previousCourseId);
                          const nextCourse = getCourse(conflict.nextCourseId);
                          const slot = SLOTS.find((entry) => entry.id === conflict.slotId);
                          return (
                            <div key={`${conflict.roomId}-${conflict.day}-${conflict.slotId}-${index}`} className="rc-st">
                              <span className="sr-n" style={{ flex: 1, fontWeight: 800 }}>
                                {room ? roomLabel(room.name) : ""}
                              </span>
                                <span className="sr-g">{dayLabel(conflict.day)} {slot?.start}</span>
                                <span style={{ fontSize: 10, color: "#94908A" }}>
                                  {previousCourse ? courseLabel(previousCourse, lang) : t.unknown} {"->"} {nextCourse ? courseLabel(nextCourse, lang) : t.unknown}
                                </span>
                              </div>
                            );
                        })}
                      </div>
                    </div>
                  )}

                  {(() => {
                    if (unresolved.length === 0) return null;

                    const grouped: Record<
                      string,
                      {
                        blockKey: string;
                        day: (typeof unresolved)[number]["day"];
                        slotId: number;
                        students: Array<(typeof unresolved)[number]>;
                      }
                    > = {};
                    for (const move of unresolved) {
                      const key = move.blockKey || `${move.day}-${move.slotId}`;
                      if (!grouped[key]) grouped[key] = { blockKey: key, day: move.day, slotId: move.slotId, students: [] };
                      grouped[key].students.push(move);
                    }

                    return Object.values(grouped).map((group) => {
                      const slot = SLOTS.find((entry) => entry.id === group.slotId);
                      return (
                        <div key={group.blockKey} className="rc">
                          <div className="rc-hd">
                            <span className="rc-d">{subjectLabel(group.blockKey.split("|")[0] as SubjectKey)}</span>
                            <span className="rc-sl">{dayLabel(group.day)} · {slot?.start}–{slot?.end}</span>
                            <span className="rc-c">{group.students.length}</span>
                          </div>
                          <div className="rc-bd">
                            {group.students.map((student) => {
                              const fromRoom = HOMEROOMS.find((room) => room.id === student.fromRoom);
                              return (
                                <div key={`${student.id}-${group.blockKey}`} className="rc-st">
                                  <span className="sr-n" style={{ flex: 1, fontWeight: 800 }}>{personLabel(student.name)}</span>
                                  <span className="sr-g">{t.grade} {student.grade}</span>
                                  <span style={{ fontSize: 10, color: "#94908A" }}>{fromRoom ? roomLabel(fromRoom.name) : ""}</span>
                                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#FEF3C7", color: "#B45309" }}>{student.neededLabel}</span>
                                  <button
                                    className="sr-btn"
                                    onClick={() =>
                                      setMoveModal({
                                        studentId: student.id,
                                        day: group.day,
                                        slotId: group.slotId,
                                        options: student.options,
                                        blockKey: group.blockKey,
                                      })
                                    }
                                  >
                                    {t.assign}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </>
              ))}
          </div>

          {sidePanel && sidePanelData && page === "homeroom" && (
            <div className="sp">
              <div className="sp-hd">
                <div>
                  <div className="sp-t" style={{ color: SUBJECTS[sidePanelData.course.subject].color }}>{courseLabel(sidePanelData.course, lang)}</div>
                  <div className="sp-s">
                    {dayLabel(sidePanel.day)} · {SLOTS.find((slot) => slot.id === sidePanel.slotId)?.start} · {personLabel(sidePanelData.course.teacherName)} · {t.roster} {sidePanelData.movement.effectiveHere}/{HOMEROOMS[selectedRoom].capacity}
                  </div>
                </div>
                <button className="sp-x" onClick={() => setSidePanel(null)}>×</button>
              </div>

              <div className="sp-bd">
                <div className="sp-sec">
                  <div className="sp-st">✅ {t.aligned} <span className="sp-cnt">{sidePanelData.movement.aligned.length}</span></div>
                  {sidePanelData.movement.aligned.map((student) => (
                    <div key={student.id} className="sr">
                      <span className="sr-n">{personLabel(student.name)}</span>
                      <span className="sr-g">{t.grade} {student.grade}</span>
                      <button
                        className="sr-btn"
                        disabled={manualOverrideOptions.length === 0}
                        onClick={() => openManualMoveModal(student.id)}
                      >
                        {t.moveAction}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="sp-sec">
                  <div className="sp-st">🔴 {t.mustMoveOut} <span className="sp-cnt">{sidePanelData.movement.mustMoveOut.length}</span></div>
                  {sidePanelData.movement.mustMoveOut.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94908A" }}>—</div>
                  ) : (
                    sidePanelData.movement.mustMoveOut.map((student) => (
                      <div key={student.id} className="sr">
                        <span className="sr-n">{personLabel(student.name)}</span>
                        <span className="sr-g">{t.grade} {student.grade}</span>
                        <span className="sr-lv" style={{ background: "#FEF3C7", color: "#B45309" }}>{student.neededLabel}</span>
                        {student.resolved !== undefined && student.resolved !== null ? (
                          <button
                            className="sr-btn ok"
                            onClick={() =>
                              setMoveModal({
                                studentId: student.id,
                                day: sidePanel.day,
                                slotId: sidePanel.slotId,
                                options: student.options,
                                blockKey: sidePanelData.movement.blockKey,
                              })
                            }
                          >
                            → {(() => {
                              const resolved = HOMEROOMS.find((room) => room.id === student.resolved);
                              return resolved ? roomLabel(resolved.name) : "";
                            })()}
                          </button>
                        ) : (
                          <button
                            className="sr-btn"
                            onClick={() =>
                              setMoveModal({
                                studentId: student.id,
                                day: sidePanel.day,
                                slotId: sidePanel.slotId,
                                options: student.options,
                                blockKey: sidePanelData.movement.blockKey,
                              })
                            }
                          >
                            {t.destination}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="sp-sec">
                  <div className="sp-st">🟡 {t.forcedStay} <span className="sp-cnt">{sidePanelData.movement.forcedStay.length}</span></div>
                  {sidePanelData.movement.forcedStay.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94908A" }}>—</div>
                  ) : (
                    sidePanelData.movement.forcedStay.map((student) => (
                      <div key={student.id} className="sr">
                        <span className="sr-n">{personLabel(student.name)}</span>
                        <span className="sr-g">{t.grade} {student.grade}</span>
                        <span className="sr-r">{student.reason}</span>
                        <button
                          className="sr-btn"
                          disabled={manualOverrideOptions.length === 0}
                          onClick={() => openManualMoveModal(student.id)}
                        >
                          {t.moveAction}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="sp-sec">
                  <div className="sp-st">🔵 {t.movingIn} <span className="sp-cnt">{sidePanelData.movement.moveIns.length}</span></div>
                  {sidePanelData.movement.moveIns.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94908A" }}>—</div>
                  ) : (
                    sidePanelData.movement.moveIns.map((student) => (
                      <div key={student.id} className="sr">
                        <span className="sr-n">{personLabel(student.name)}</span>
                        <span className="sr-g">{t.grade} {student.grade}</span>
                        <span className="sr-r">{t.from} {roomLabel(HOMEROOMS[student.homeroom]?.name || "")}</span>
                        <button
                          className="sr-btn"
                          disabled={manualOverrideOptions.length === 0}
                          onClick={() => openManualMoveModal(student.id)}
                        >
                          {t.moveAction}
                        </button>
                      </div>
                    ))
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <div
          className="ov"
          onClick={() => {
            setPicker(null);
            setSubjectFilter("all");
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="m-hd">
              <div>
                <h3>{t.availableCourses}</h3>
                <div className="m-hd-s">{dayLabel(picker.day)} · {SLOTS.find((slot) => slot.id === picker.slotId)?.start} · {roomLabel(HOMEROOMS[selectedRoom].name)}</div>
              </div>
              <button
                className="m-x"
                onClick={() => {
                  setPicker(null);
                  setSubjectFilter("all");
                }}
              >
                ×
              </button>
            </div>

            <div className="pk-fl">
              <button className={cx("pk-ch", subjectFilter === "all" && "on")} onClick={() => setSubjectFilter("all")}>{t.all}</button>
              {Object.entries(SUBJECTS).map(([key, subject]) => (
                <button key={key} className={cx("pk-ch", subjectFilter === key && "on")} onClick={() => setSubjectFilter(key as SubjectKey)}>
                  {subjectLabel(key as SubjectKey)}
                </button>
              ))}
            </div>

            <div className="pk-bd">
              {(() => {
                const available = getAvailable(picker.day, picker.slotId, selectedRoom);
                if (!available.length) return <div className="pk-empty">{t.noCourses}</div>;

                const grouped: Record<string, typeof available> = {};
                for (const course of available) {
                  if (!grouped[course.subject]) grouped[course.subject] = [];
                  grouped[course.subject].push(course);
                }

                return Object.entries(grouped).map(([subjectKey, list]) => {
                  const subject = SUBJECTS[subjectKey as SubjectKey];
                  return (
                    <div key={subjectKey}>
                      <div className="pk-sec">{subjectLabel(subjectKey as SubjectKey)}</div>
                      {list.map((course) => (
                        <div
                          key={course.id}
                          className="pk-opt"
                          onClick={() => {
                            const current = getAssignment(assignments, selectedRoom, picker.day, picker.slotId);
                            if (current) {
                              const currentCourse = getCourse(current);
                              if (currentCourse) {
                                setAssignments((prev) => clearCourseMeetingsForRoom(prev, selectedRoom, currentCourse));
                              }
                            }
                            assignCourseToRoom(selectedRoom, course.id);
                          }}
                        >
                          <div className="pk-cl" style={{ background: subject.color }} />
                          <div className="pk-i">
                            <div className="pk-sn">{courseLabel(course, lang)}</div>
                            <div className="pk-mt">{personLabel(course.teacherName)}{course.segment ? ` · ${segmentLabel(course.segment)}` : ""}</div>
                            <div className="pk-pt">📅 {patternLabel(course.pattern)}</div>
                          </div>
                          <div className="pk-lv" style={{ background: subject.bg, color: subject.color }}>{course.level || (course.grade ? `${t.grade} ${course.grade}` : t.all)}</div>
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {moveModal && (
        <div className="ov" onClick={() => setMoveModal(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="m-hd" style={{ padding: "14px 16px" }}>
              <div>
                <h3>{t.destination}</h3>
                <p className="m-hd-s">{personLabel(students.find((student) => student.id === moveModal.studentId)?.name || "")} · {dayLabel(moveModal.day)} {SLOTS.find((slot) => slot.id === moveModal.slotId)?.start}</p>
              </div>
              <button className="m-x" onClick={() => setMoveModal(null)}>×</button>
            </div>
            <div className="pk-bd">
              {moveModal.options?.map((option) => {
                const room = HOMEROOMS.find((entry) => entry.id === option.roomId);
                const course = getCourse(option.courseId);
                const subject = course ? SUBJECTS[course.subject] : null;
                const blockKey = moveModal.blockKey;
                const base = students.filter((student) => student.homeroom === option.roomId).length;
                let out = 0;
                let incoming = 0;
                for (const student of students) {
                  const destination = moveResolutions?.[student.id]?.[blockKey];
                  if (destination === undefined || destination === null) continue;
                  if (student.homeroom === option.roomId && destination !== option.roomId) out += 1;
                  if (student.homeroom !== option.roomId && destination === option.roomId) incoming += 1;
                }
                const current = base - out + incoming;
                const after = current + 1;

                return (
                  <div key={option.roomId} className="pk-opt" onClick={() => resolveMove(moveModal.studentId, moveModal.blockKey, option.roomId)}>
                    <div className="pk-cl" style={{ background: subject?.color || "#999" }} />
                    <div className="pk-i">
                      <div className="pk-sn">{room ? roomLabel(room.name) : ""}</div>
                      <div className="pk-mt">{courseLabel(course, lang)} · {personLabel(course?.teacherName || "")}</div>
                      <div className="pk-pt">{t.capacity}: {current}/{room?.capacity} → {after}/{room?.capacity}</div>
                    </div>
                    <div className="pk-lv" style={{ background: "#F0EDE8", color: "#6B665F" }}>{t.assign}</div>
                  </div>
                );
              })}
              {!moveModal.options?.length ? <div className="pk-empty">{t.noValidDestinations}</div> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

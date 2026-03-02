import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { DAYS, SLOTS, SUBJECTS } from "../domain/constants";
import { computeMovement, getAssignment } from "../domain/planner";
import { courseLabel, courseMatchesStudent } from "../domain/rules";
import type {
  Assignments,
  Course,
  Day,
  Homeroom,
  Lang,
  MoveModalState,
  MoveResolutions,
  SidePanelState,
  Student,
  SubjectKey,
  Translations,
} from "../domain/types";

type UseHomeroomMovementParams = {
  assignments: Assignments;
  courses: Course[];
  students: Student[];
  moveResolutions: MoveResolutions;
  setMoveResolutions: Dispatch<SetStateAction<MoveResolutions>>;
  campusWhitelist: Set<string> | null;
  selectedRoom: number;
  homerooms: Homeroom[];
  t: Translations;
  lang: Lang;
  fmt: (key: string, vars: Record<string, string | number>) => string;
  subjectLabel: (subject: SubjectKey) => string;
};

export function useHomeroomMovement({
  assignments,
  courses,
  students,
  moveResolutions,
  setMoveResolutions,
  campusWhitelist,
  selectedRoom,
  homerooms,
  t,
  lang,
  fmt,
  subjectLabel,
}: UseHomeroomMovementParams) {
  const [sidePanel, setSidePanel] = useState<SidePanelState | null>(null);
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null);

  const getCourse = useCallback((courseId: string) => courses.find((course) => course.id === courseId), [courses]);

  const computeMovementForCell = useCallback(
    (roomId: number, day: Day, slotId: number) =>
      computeMovement(roomId, day, slotId, assignments, courses, students, moveResolutions, campusWhitelist, t, homerooms),
    [assignments, courses, students, moveResolutions, campusWhitelist, t, homerooms]
  );

  const computeMustMoveRosterForCell = useCallback(
    (roomId: number, day: Day, slotId: number) => {
      const baseline = computeMovement(roomId, day, slotId, assignments, courses, students, {}, campusWhitelist, t, homerooms);
      if (!baseline.blockKey) {
        return { blockKey: "", mustMoveOut: [] as ReturnType<typeof computeMovement>["mustMoveOut"] };
      }

      const withDestinations = baseline.mustMoveOut.map((student) => ({
        ...student,
        resolved: moveResolutions?.[student.id]?.[baseline.blockKey],
      }));

      return {
        blockKey: baseline.blockKey,
        mustMoveOut: withDestinations,
      };
    },
    [assignments, courses, students, campusWhitelist, t, moveResolutions, homerooms]
  );

  const resolveMove = useCallback(
    (studentId: string, blockKey: string, destination: number) => {
      setMoveResolutions((prev) => ({
        ...prev,
        [studentId]: {
          ...(prev[studentId] || {}),
          [blockKey]: destination,
        },
      }));
      setMoveModal(null);
    },
    [setMoveResolutions]
  );

  const sidePanelData = useMemo(() => {
    if (!sidePanel) return null;
    const assignment = getAssignment(assignments, selectedRoom, sidePanel.day, sidePanel.slotId);
    if (!assignment) return null;
    const course = getCourse(assignment);
    if (!course) return null;
    const movement = computeMovementForCell(selectedRoom, sidePanel.day, sidePanel.slotId);
    const mustMoveRoster = computeMustMoveRosterForCell(selectedRoom, sidePanel.day, sidePanel.slotId);
    return {
      course,
      movement,
      blockKey: movement.blockKey || mustMoveRoster.blockKey,
      mustMoveOutRoster: mustMoveRoster.mustMoveOut,
    };
  }, [sidePanel, selectedRoom, assignments, getCourse, computeMovementForCell, computeMustMoveRosterForCell]);

  const manualOverrideOptions = useMemo(() => {
    if (!sidePanel) return [];
    const options: Array<{ roomId: number; courseId: string }> = [];

    for (const room of homerooms) {
      if (room.id === selectedRoom) continue;
      const courseId = getAssignment(assignments, room.id, sidePanel.day, sidePanel.slotId);
      if (!courseId) continue;
      if (campusWhitelist && !campusWhitelist.has(courseId)) continue;
      options.push({ roomId: room.id, courseId });
    }

    return options;
  }, [assignments, campusWhitelist, homerooms, selectedRoom, sidePanel]);

  const roomFlags = useMemo(() => {
    if (!campusWhitelist) return [];
    const flags: string[] = [];
    const seen = new Set<string>();
    const pushFlag = (line: string) => {
      if (seen.has(line)) return;
      seen.add(line);
      flags.push(line);
    };
    const roomCapacity = homerooms[selectedRoom].capacity;
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
          pushFlag(line);
        }

        if (movement.effectiveHere > roomCapacity) {
          const line = fmt("roomFlagRosterOverflow", { course: courseLabel(course, lang), count: movement.effectiveHere });
          pushFlag(line);
        }

        if (SUBJECTS[course.subject].tahsili && roomPrepG12Students.length > 0) {
          const qudratCoursesInSlot = homerooms
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
              const line = fmt("roomFlagQudratLevelClosed", {
                count,
                subject: subjectLabel(qSubject as SubjectKey),
                level: qLevel,
              });
              pushFlag(line);
            });

            if (unmetGeneric > 0) {
              const line = fmt("roomFlagQudratNoCompatible", { count: unmetGeneric });
              pushFlag(line);
            }
          }
        }
      }
    }

    return flags;
  }, [campusWhitelist, assignments, selectedRoom, getCourse, computeMovementForCell, lang, fmt, students, subjectLabel, homerooms]);

  const openManualMoveModal = useCallback(
    (studentId: string) => {
      if (!sidePanel || !sidePanelData || manualOverrideOptions.length === 0) return;
      setMoveModal({
        studentId,
        day: sidePanel.day,
        slotId: sidePanel.slotId,
        options: manualOverrideOptions,
        blockKey: sidePanelData.blockKey,
      });
    },
    [sidePanel, sidePanelData, manualOverrideOptions]
  );

  return {
    sidePanel,
    setSidePanel,
    moveModal,
    setMoveModal,
    resolveMove,
    sidePanelData,
    manualOverrideOptions,
    roomFlags,
    openManualMoveModal,
    computeMovementForCell,
    getCourse,
  };
}

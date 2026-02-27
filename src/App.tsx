import { Fragment, useCallback, useMemo, useState } from "react";
import { DAYS, GRADE_SUBJECTS, GRADES, HOMEROOMS, LEVELS, SLOTS, SUBJECTS } from "./domain/constants";
import { buildStreamGroups, genCourses, genStudents } from "./domain/data";
import { formatDayPattern, getDayLabel, getSubjectLabelFromT, getT, localizePersonName, localizeRoomName, localizeSegment } from "./domain/i18n";
import {
  buildCampusWhitelist,
  clearCourseMeetingsForRoom,
  computeMovement,
  demandSnapshot,
  getAssignment,
  getAvailableCourses,
  roomProfile,
  scheduleStats,
  seedAssignmentsFromCampusPlan,
  unresolvedMoves,
  type GradeCourseSelections,
  type LevelOpenState,
  type SelectedStreams,
} from "./domain/planner";
import { courseLabel } from "./domain/rules";
import type {
  Assignments,
  Day,
  Lang,
  MoveModalState,
  MoveResolutions,
  PickerState,
  SidePanelState,
  SubjectKey,
  TabPage,
  Level,
} from "./domain/types";
import "./styles/app.css";

const INIT_STUDENTS = genStudents();
const INIT_COURSES = genCourses();
const STREAM_GROUPS = buildStreamGroups(INIT_COURSES);

function cx(...parts: Array<string | boolean | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Bar({ dist, color }: { dist: Record<Level, number>; color: string }) {
  const total = dist.L1 + dist.L2 + dist.L3;
  if (total === 0) {
    return <div style={{ flex: 1, fontSize: 10, color: "#B0ABA3", padding: "2px 6px" }}>—</div>;
  }

  const colors = [`${color}dd`, `${color}99`, `${color}55`];

  return (
    <div style={{ flex: 1, display: "flex", height: 22, borderRadius: 3, overflow: "hidden", background: "#F0EDE8", gap: 1 }}>
      {LEVELS.map((level, index) => {
        const percentage = (dist[level] / total) * 100;
        return percentage > 0 ? (
          <div
            key={level}
            style={{
              width: `${percentage}%`,
              background: colors[index],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10,
              fontWeight: 600,
              color: "#fff",
              borderRadius: 2,
            }}
          >
            {percentage >= 14 && `${level}:${dist[level]}`}
          </div>
        ) : null;
      })}
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const t = getT(lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const subjectLabel = useCallback((subject: SubjectKey) => getSubjectLabelFromT(t, subject), [t]);
  const dayLabel = useCallback((day: Day) => getDayLabel(lang, day), [lang]);
  const patternLabel = useCallback((pattern: string) => formatDayPattern(lang, pattern), [lang]);
  const roomLabel = useCallback((roomName: string) => localizeRoomName(lang, roomName), [lang]);
  const personLabel = useCallback((name: string) => localizePersonName(lang, name), [lang]);
  const segmentLabel = useCallback((segment: string | null) => localizeSegment(lang, segment), [lang]);

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
  const [showProfile, setShowProfile] = useState(true);

  const [selectedStreams, setSelectedStreams] = useState<SelectedStreams>({});
  const [levelOpen, setLevelOpen] = useState<LevelOpenState>({
    kammi: { L1: true, L2: true, L3: true },
    lafthi: { L1: true, L2: true, L3: true },
    esl: { L1: true, L2: true, L3: true },
  });
  const [gradeCourseSelections, setGradeCourseSelections] = useState<GradeCourseSelections>({});
  const [campusWhitelist, setCampusWhitelist] = useState<Set<string> | null>(null);

  const getCourse = useCallback((courseId: string) => courses.find((course) => course.id === courseId), [courses]);

  const computedWhitelist = useMemo(
    () => buildCampusWhitelist(selectedStreams, gradeCourseSelections, levelOpen, STREAM_GROUPS),
    [selectedStreams, gradeCourseSelections, levelOpen]
  );

  const applyCampusPlan = useCallback(() => {
    const whitelist = new Set(computedWhitelist);
    setCampusWhitelist(whitelist);
    setMoveResolutions({});

    const seeded = seedAssignmentsFromCampusPlan(
      whitelist,
      selectedStreams,
      levelOpen,
      gradeCourseSelections,
      students,
      courses,
      STREAM_GROUPS
    );

    setAssignments(seeded);
    setPage("homeroom");
  }, [computedWhitelist, selectedStreams, levelOpen, gradeCourseSelections, students, courses]);

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
      getAvailableCourses(courses, campusWhitelist, assignments, day, slotId, roomId, subjectFilter),
    [courses, campusWhitelist, assignments, subjectFilter]
  );

  const computeMovementForCell = useCallback(
    (roomId: number, day: Day, slotId: number) =>
      computeMovement(roomId, day, slotId, assignments, courses, students, moveResolutions, campusWhitelist, t),
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
    () => unresolvedMoves(assignments, courses, students, moveResolutions, campusWhitelist, t),
    [assignments, courses, students, moveResolutions, campusWhitelist, t]
  );

  const stats = useMemo(() => scheduleStats(assignments, unresolved.length), [assignments, unresolved.length]);
  const campusDemand = useMemo(() => demandSnapshot(students), [students]);
  const profile = useMemo(() => roomProfile(students, selectedRoom), [students, selectedRoom]);

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

  return (
    <div dir={dir}>
      <div className="app">
        <div className="topbar">
          <div className="tb-l">
            <div className="logo">NOON</div>
            <div>
              <div className="tb-t">{t.appTitle}</div>
              <div className="tb-s">
                {t.campusName} · {HOMEROOMS.length} {t.roomsLabel} · {students.length} {t.studentsLabel}
              </div>
            </div>
          </div>
          <div className="pills">
            <div className={cx("pill", stats.filled === stats.total ? "po" : "pd")}>{stats.filled}/{stats.total} {t.slots}</div>
            <div className={cx("pill", stats.unresolved === 0 ? "po" : "pb")}>{stats.unresolved === 0 ? "✓" : stats.unresolved} {t.moves}</div>
            {stats.done && <div className="pill pp">✓ {t.done}</div>}
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
            {unresolved.length > 0 && <span className="nbadge">{unresolved.length}</span>}
          </button>
        </div>

        <div className="main">
          <div className="ml">
            {page === "campus" && (
              <>
                <div className="card">
                  <div className="card-t">
                    {t.step0}
                    <span className="meta">{t.step0Hint}</span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#DEF7EC", color: "#059669", fontWeight: 900 }}>
                      ✓ {campusDemand.doneQ} {t.doneQShort}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#FEF3C7", color: "#B45309", fontWeight: 900 }}>
                      {campusDemand.stillQ} {t.stillQShort}
                    </span>
                    <span style={{ fontSize: 11, color: "#94908A", alignSelf: "center" }}>{t.noteExcludesDoneQ}</span>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", textTransform: "uppercase", letterSpacing: 0.6, background: "#F5F3EE" }}>{t.subject}</th>
                          <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", textTransform: "uppercase", letterSpacing: 0.6, background: "#F5F3EE" }}>L1</th>
                          <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", textTransform: "uppercase", letterSpacing: 0.6, background: "#F5F3EE" }}>L2</th>
                          <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", textTransform: "uppercase", letterSpacing: 0.6, background: "#F5F3EE" }}>L3</th>
                          <th style={{ textAlign: "start", fontSize: 10, fontWeight: 900, color: "#94908A", padding: "8px 10px", borderBottom: "1px solid #F0EDE8", textTransform: "uppercase", letterSpacing: 0.6, background: "#F5F3EE" }}>{t.decision}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {["lafthi", "kammi", "esl"].map((subject, index) => {
                          const dist = campusDemand.totals[subject as "lafthi" | "kammi" | "esl"];
                          const subjectDef = SUBJECTS[subject as SubjectKey];
                          return (
                            <tr key={subject} style={{ background: index % 2 ? "#FAFAF7" : "#fff" }}>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8", fontSize: 12, fontWeight: 900, color: subjectDef.color, whiteSpace: "nowrap" }}>{subjectLabel(subject as SubjectKey)}</td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800 }}>{dist.L1}</td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800 }}>{dist.L2}</td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800 }}>{dist.L3}</td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid #F0EDE8" }}>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {LEVELS.map((level) => {
                                    const open = levelOpen[subject as "kammi" | "lafthi" | "esl"][level] !== false;
                                    return (
                                      <button
                                        key={level}
                                        type="button"
                                        onClick={() =>
                                          setLevelOpen((prev) => ({
                                            ...prev,
                                            [subject]: {
                                              ...prev[subject as "kammi" | "lafthi" | "esl"],
                                              [level]: !open,
                                            },
                                          }))
                                        }
                                        style={{
                                          border: `1px solid ${open ? "#1a1a1a" : "#E8E4DD"}`,
                                          background: open ? "#1a1a1a" : "#fff",
                                          color: open ? "#fff" : "#6B665F",
                                          borderRadius: 999,
                                          padding: "4px 10px",
                                          fontSize: 10,
                                          fontWeight: 900,
                                          cursor: "pointer",
                                          fontFamily: "'JetBrains Mono',monospace",
                                        }}
                                      >
                                        {level}: {open ? t.run : t.sacrifice}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 11, color: "#6B665F" }}>{t.prototypePolicyG12}</div>
                </div>

                <div className="card">
                  <div className="card-t">
                    {t.step1}
                    <span className="meta">{t.step1Hint}</span>
                  </div>

                  {(["lafthi", "kammi", "esl"] as const).map((subject) => {
                    const subjectDef = SUBJECTS[subject];
                    const options = STREAM_GROUPS.filter((group) => group.subject === subject);
                    const pickedId = selectedStreams[subject];

                    return (
                      <div key={subject} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: subjectDef.color, marginBottom: 6 }}>{subjectLabel(subject)}</div>

                        {options.map((group) => {
                          const picked = pickedId === group.id;
                          return (
                            <div
                              key={group.id}
                              className={cx("stream-opt", picked && "picked")}
                              onClick={() =>
                                setSelectedStreams((prev) => ({
                                  ...prev,
                                  [subject]: picked ? undefined : group.id,
                                }))
                              }
                            >
                              <div className="so-radio">{picked && <div className="so-dot" />}</div>
                              <div className="so-info">
                                <div className="so-slot">{t.bundleMeetings}: {t.slot} {group.slot} · {group.slotLabel}</div>
                                <div className="so-pattern">📅 {patternLabel(group.pattern)}</div>
                                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                  {LEVELS.map((level) => {
                                    const course = group.levels.find((entry) => entry?.level === level);
                                    if (!course) return null;
                                    return (
                                      <div key={level} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#6B665F" }}>
                                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 900, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: subjectDef.bg, color: subjectDef.color }}>{level}</span>
                                        <span style={{ flex: 1, fontWeight: 800 }}>{personLabel(course.teacherName)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                <div className="card">
                  <div className="card-t">
                    {t.step2}
                    <span className="meta">{t.step2Hint}</span>
                  </div>

                  {GRADES.map((grade) => {
                    const subjects = GRADE_SUBJECTS[grade].all;
                    return (
                      <div key={grade} style={{ padding: "10px 0", borderTop: grade === 10 ? "none" : "1px solid #F0EDE8" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>{t.grade} {grade}</div>
                        {subjects.map((subject) => {
                          const subjectDef = SUBJECTS[subject];
                          const options = courses.filter((course) => course.subject === subject && course.grade === grade);
                          if (!options.length) return null;
                          const selected = gradeCourseSelections[grade]?.[subject];

                          return (
                            <div key={subject} className="grade-course-row">
                              <div className="gcr-name">
                                <div className="gcr-dot" style={{ background: subjectDef.color }} />
                                {subjectLabel(subject)}
                              </div>
                              <div className="gcr-options">
                                {options.map((course) => {
                                  const slotInfo = SLOTS.find((slot) => slot.id === course.meetings[0]?.slot);
                                  const isOn = selected === course.id;
                                  return (
                                    <button
                                      key={course.id}
                                      className={cx("gcr-opt", isOn && "on")}
                                      onClick={() =>
                                        setGradeCourseSelections((prev) => ({
                                          ...prev,
                                          [grade]: {
                                            ...(prev[grade] || {}),
                                            [subject]: isOn ? undefined : course.id,
                                          },
                                        }))
                                      }
                                    >
                                      {t.slot} {course.meetings[0]?.slot} · {slotInfo?.start} · {patternLabel(course.pattern)} · {personLabel(course.teacherName)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#94908A" }}>{t.applyHint}</span>
                  <button className="apply-btn" onClick={applyCampusPlan} disabled={computedWhitelist.size === 0}>
                    {t.apply}
                  </button>
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
                          setShowProfile(true);
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

                <div className="rp">
                  <div className="rp-top" onClick={() => setShowProfile(!showProfile)}>
                    <div className="rp-tl">
                      {roomLabel(HOMEROOMS[selectedRoom].name)}
                      <span className="rp-m">{t.grade} {profile.grade} · {profile.total} {t.studentsLabel}</span>
                      {profile.qD > 0 && <span className="rp-tag" style={{ background: "#DEF7EC", color: "#059669" }}>✓{profile.qD} {t.doneQShort}</span>}
                      {profile.qN > 0 && <span className="rp-tag" style={{ background: "#FEF3C7", color: "#B45309" }}>{profile.qN} {t.stillQShort}</span>}
                    </div>
                    <span className={cx("rp-arr", showProfile && "open")}>▼</span>
                  </div>
                  {showProfile && (
                    <div className="rp-body">
                      {(["kammi", "lafthi", "esl"] as const).map((subject) => {
                        const subjectDef = SUBJECTS[subject];
                        return (
                          <div key={subject} className="rp-row">
                            <div className="rp-sn" style={{ color: subjectDef.color }}>{subjectLabel(subject)}</div>
                            <Bar dist={profile.ld[subject]} color={subjectDef.color} />
                          </div>
                        );
                      })}
                    </div>
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
                              if (!campusWhitelist) return;
                              if (!assignment) setPicker({ day, slotId: slot.id, mode: "add" });
                              else setSidePanel(selected ? null : { day, slotId: slot.id });
                            }}
                          >
                            {!assignment && (
                              <div className="ci-e">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <path d="M12 5v14M5 12h14" />
                                </svg>
                                <span>{t.pickCourse}</span>
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
              (unresolved.length === 0 ? (
                <div className="rc-empty">
                  <div className="rc-ei">{stats.filled === stats.total ? "🎉" : "📋"}</div>
                  <div className="rc-et">{stats.filled === stats.total ? t.scheduleComplete : t.noUnresolvedMoves}</div>
                  <div className="rc-es">{stats.filled < stats.total ? `${stats.total - stats.filled} ${t.emptySlots}` : t.allResolved}</div>
                </div>
              ) : (
                (() => {
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
                })()
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
                    <div key={student.id} className="sr"><span className="sr-n">{personLabel(student.name)}</span><span className="sr-g">{t.grade} {student.grade}</span></div>
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
                      <div key={student.id} className="sr"><span className="sr-n">{personLabel(student.name)}</span><span className="sr-g">{t.grade} {student.grade}</span><span className="sr-r">{student.reason}</span></div>
                    ))
                  )}
                </div>

                <div className="sp-sec">
                  <div className="sp-st">🔵 {t.movingIn} <span className="sp-cnt">{sidePanelData.movement.moveIns.length}</span></div>
                  {sidePanelData.movement.moveIns.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94908A" }}>—</div>
                  ) : (
                    sidePanelData.movement.moveIns.map((student) => (
                      <div key={student.id} className="sr"><span className="sr-n">{personLabel(student.name)}</span><span className="sr-g">{t.grade} {student.grade}</span><span className="sr-r">{t.from} {roomLabel(HOMEROOMS[student.homeroom]?.name || "")}</span></div>
                    ))
                  )}
                </div>

                <div className="sp-sec">
                  <div className="sp-st">{t.replaceCourse}</div>
                  <button
                    className="sr-btn"
                    onClick={() => {
                      setPicker({ day: sidePanel.day, slotId: sidePanel.slotId, mode: "replace" });
                      setSidePanel(null);
                    }}
                  >
                    {t.replaceCourse}
                  </button>
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

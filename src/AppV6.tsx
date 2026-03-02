import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { DAYS, GRADE_SUBJECTS, GRADES, LEVELS, SLOTS, SUBJECTS } from "./domain/constants";
import { buildHomerooms, getRuntimeAdminConfig } from "./domain/adminConfig";
import { buildStreamGroups, genCourses, genStudents } from "./domain/data";
import { formatDayPattern, getDayLabel, getSubjectLabelFromT, getT, localizePersonName, localizeRoomName } from "./domain/i18n";
import { getAssignment, scheduleStats } from "./domain/planner";
import type { RoomHost } from "./domain/plannerV6";
import { courseLabel } from "./domain/rules";
import type {
  Day,
  Lang,
  SubjectKey,
  TabPage,
} from "./domain/types";
import { LEVELED_SUBJECTS } from "./appv6/campusFlow";
import { useCampusFlow } from "./appv6/useCampusFlow";
import { useHomeroomMovement } from "./appv6/useHomeroomMovement";
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

  const [page, setPage] = useState<TabPage>("campus");
  const [selectedRoom, setSelectedRoom] = useState(0);

  const {
    assignments,
    moveResolutions,
    setMoveResolutions,
    selectedStreams,
    step0Decisions,
    gradeCourseSelections,
    campusWhitelist,
    activeCampusStep,
    step2Collapsed,
    setActiveCampusStep,
    setStep2Collapsed,
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
    step2DecisionOfferings,
    step2UnavailableOfferings,
    selectedDecisionOfferings,
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
  } = useCampusFlow({
    students,
    courses,
    homerooms: HOMEROOMS,
    streamGroups: STREAM_GROUPS,
    t,
    fmt,
    page,
    setPage,
  });

  useEffect(() => {
    if (page !== "campus") return;
    const mainLeft = document.querySelector(".ml");
    if (mainLeft instanceof HTMLElement) {
      mainLeft.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeCampusStep, page]);

  const {
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
  } = useHomeroomMovement({
    assignments,
    courses,
    students,
    moveResolutions,
    setMoveResolutions,
    campusWhitelist,
    selectedRoom,
    homerooms: HOMEROOMS,
    t,
    lang,
    fmt,
    subjectLabel,
    roomLabel,
  });

  const stats = useMemo(() => scheduleStats(assignments, HOMEROOMS), [assignments]);

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
              {stats.filled}/{stats.total} {t.slots}
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
          <button
            className={cx("nt", page === "homeroom" && "on")}
            disabled={!homeroomEnabled}
            onClick={() => {
              if (!homeroomEnabled) return;
              setPage("homeroom");
            }}
          >
            {t.homerooms}
          </button>
        </div>

        <div className="main">
          <div className="ml">
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
                                                selectGradeCourse(grade, subject, course.id);
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
                  <div className="sp-st">🔴 {t.mustMoveOut} <span className="sp-cnt">{sidePanelData.mustMoveOutRoster.length}</span></div>
                  {sidePanelData.mustMoveOutRoster.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94908A" }}>—</div>
                  ) : (
                    sidePanelData.mustMoveOutRoster.map((student) => (
                      <div key={student.id} className="sr">
                        <span className="sr-n">{personLabel(student.name)}</span>
                        <span className="sr-g">{t.grade} {student.grade}</span>
                        <span className="sr-lv" style={{ background: "#FEF3C7", color: "#B45309" }}>{student.neededLabel}</span>
                        <span className="sr-r" style={student.resolved === undefined || student.resolved === null ? { color: "#B45309", fontWeight: 700 } : undefined}>
                          {student.resolved !== undefined && student.resolved !== null
                            ? fmt("mustMoveDestinationSet", {
                                room: (() => {
                                  const resolved = HOMEROOMS.find((room) => room.id === student.resolved);
                                  return resolved ? roomLabel(resolved.name) : t.unknown;
                                })(),
                              })
                            : t.mustMoveDestinationMissing}
                        </span>
                        <button
                          className="sr-btn"
                          onClick={() =>
                            setMoveModal({
                              studentId: student.id,
                              day: sidePanel.day,
                              slotId: sidePanel.slotId,
                              options: student.options,
                              blockKey: sidePanelData.blockKey,
                            })
                          }
                        >
                          {t.moveAction}
                        </button>
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

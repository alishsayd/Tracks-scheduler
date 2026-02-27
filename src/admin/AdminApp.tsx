import { useMemo, useState } from "react";
import {
  IDEAL_ROOM_CAPACITY,
  MAX_ROOM_CAPACITY,
  getDefaultAdminConfig,
  loadAdminConfig,
  saveAdminConfig,
  validateAdminConfig,
  type AdminConfig,
  type AdminGrade,
} from "../domain/adminConfig";
import type { LeveledSubject } from "../domain/types";
import "../styles/admin.css";

const SUBJECTS: Array<{ key: LeveledSubject; label: string }> = [
  { key: "kammi", label: "Kammi" },
  { key: "lafthi", label: "Lafthi" },
  { key: "esl", label: "ESL" },
];

const GRADES: AdminGrade[] = [10, 11, 12];

function toInt(value: string, fallback: number) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function AdminApp() {
  const [draft, setDraft] = useState<AdminConfig>(() => loadAdminConfig());
  const [notice, setNotice] = useState("");
  const validation = useMemo(() => validateAdminConfig(draft), [draft]);

  const canApply = validation.errors.length === 0;
  const base = import.meta.env.BASE_URL || "/";
  const schedulerHref = base;
  const schedulerV6Href = `${base}Tracks-scheduler1/`;

  const setRoomCount = (value: string) => {
    setDraft((prev) => ({
      ...prev,
      roomCount: Math.max(1, toInt(value, prev.roomCount)),
    }));
  };

  const setGradeTotal = (grade: AdminGrade, value: string) => {
    setDraft((prev) => ({
      ...prev,
      gradeTotals: {
        ...prev.gradeTotals,
        [grade]: Math.max(0, toInt(value, prev.gradeTotals[grade])),
      },
    }));
  };

  const setDoneRate = (subject: "qudrat" | "esl", grade: AdminGrade, value: string) => {
    setDraft((prev) => ({
      ...prev,
      doneRates: {
        ...prev.doneRates,
        [subject]: {
          ...prev.doneRates[subject],
          [grade]: Math.max(0, Math.min(100, toInt(value, prev.doneRates[subject][grade]))),
        },
      },
    }));
  };

  const setDistribution = (subject: LeveledSubject, grade: AdminGrade, field: "L1" | "L2" | "L3", value: string) => {
    setDraft((prev) => ({
      ...prev,
      subjectDistributions: {
        ...prev.subjectDistributions,
        [subject]: {
          ...prev.subjectDistributions[subject],
          [grade]: {
            ...prev.subjectDistributions[subject][grade],
            [field]: Math.max(0, Math.min(100, toInt(value, prev.subjectDistributions[subject][grade][field]))),
          },
        },
      },
    }));
  };

  const apply = () => {
    if (!canApply) return;
    saveAdminConfig(draft);
    setNotice("Saved. Refresh /Tracks-scheduler to apply these settings.");
  };

  const reset = () => {
    const defaults = getDefaultAdminConfig();
    setDraft(defaults);
    saveAdminConfig(defaults);
    setNotice("Defaults restored.");
  };

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>Tracks Scheduler Admin</h1>
          <p>Control the synthetic dataset used by the scheduler prototype.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="admin-link" href={schedulerHref}>
            Open Scheduler
          </a>
          <a className="admin-link" href={schedulerV6Href}>
            Open Scheduler v6
          </a>
        </div>
      </header>

      <section className="admin-card">
        <h2>Campus Capacity</h2>
        <div className="admin-grid-two">
          <label>
            Rooms on campus
            <input type="number" min={1} step={1} value={draft.roomCount} onChange={(event) => setRoomCount(event.target.value)} />
          </label>
        </div>

        <h3>Students per grade</h3>
        <div className="admin-grid-three">
          {GRADES.map((grade) => (
            <label key={grade}>
              Grade {grade}
              <input type="number" min={0} step={1} value={draft.gradeTotals[grade]} onChange={(event) => setGradeTotal(grade, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <h2>Done Status by Grade (%)</h2>
        <p>Student-level status. If a student is done with Qudrat, they are done with both Kammi and Lafthi. Grade 10 is locked to 0%.</p>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Grade 10</th>
              <th>Grade 11</th>
              <th>Grade 12</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Done with Qudrat</td>
              {GRADES.map((grade) => (
                <td key={`done-qudrat-${grade}`}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.doneRates.qudrat[grade]}
                    disabled={grade === 10}
                    onChange={(event) => setDoneRate("qudrat", grade, event.target.value)}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td>Done with ESL</td>
              {GRADES.map((grade) => (
                <td key={`done-esl-${grade}`}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.doneRates.esl[grade]}
                    disabled={grade === 10}
                    onChange={(event) => setDoneRate("esl", grade, event.target.value)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      <section className="admin-card">
        <h2>Distribution by Subject and Grade (%)</h2>
        <p>Each row must sum to 100 across L1/L2/L3.</p>

        {SUBJECTS.map((subject) => (
          <div key={subject.key} className="admin-subject-block">
            <h3>{subject.label}</h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>L1</th>
                  <th>L2</th>
                  <th>L3</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {GRADES.map((grade) => {
                  const row = draft.subjectDistributions[subject.key][grade];
                  const sum = row.L1 + row.L2 + row.L3;
                  return (
                    <tr key={`${subject.key}-${grade}`}>
                      <td>Grade {grade}</td>
                      <td>
                        <input type="number" min={0} max={100} step={1} value={row.L1} onChange={(event) => setDistribution(subject.key, grade, "L1", event.target.value)} />
                      </td>
                      <td>
                        <input type="number" min={0} max={100} step={1} value={row.L2} onChange={(event) => setDistribution(subject.key, grade, "L2", event.target.value)} />
                      </td>
                      <td>
                        <input type="number" min={0} max={100} step={1} value={row.L3} onChange={(event) => setDistribution(subject.key, grade, "L3", event.target.value)} />
                      </td>
                      <td className={sum === 100 ? "ok" : "bad"}>{sum}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="admin-card">
        <h2>Validation</h2>
        {validation.allocation ? (
          <div className="admin-alloc">
            <div>Grade 10: {validation.allocation.roomsByGrade[10]} rooms, max {validation.allocation.maxByGrade[10]} students/room</div>
            <div>Grade 11: {validation.allocation.roomsByGrade[11]} rooms, max {validation.allocation.maxByGrade[11]} students/room</div>
            <div>Grade 12: {validation.allocation.roomsByGrade[12]} rooms, max {validation.allocation.maxByGrade[12]} students/room</div>
            <div className="hint">
              Ideal target: {IDEAL_ROOM_CAPACITY} students/room. Hard max: {MAX_ROOM_CAPACITY}.
            </div>
          </div>
        ) : null}

        {validation.errors.length > 0 ? (
          <ul className="admin-errors">
            {validation.errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <div className="admin-ok">No hard validation errors.</div>
        )}

        {validation.warnings.length > 0 ? (
          <ul className="admin-warnings">
            {validation.warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <footer className="admin-footer">
        <button className="secondary" onClick={reset} type="button">
          Reset to defaults
        </button>
        <button className="primary" onClick={apply} type="button" disabled={!canApply}>
          Apply
        </button>
      </footer>

      {notice ? <div className="admin-notice">{notice}</div> : null}
    </div>
  );
}

import type { Day, Homeroom, Slot, SubjectDef, SubjectKey, Level } from "./types";

export const DAYS: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu"];

export const SLOTS: Slot[] = [
  { id: 1, start: "07:47", end: "08:32" },
  { id: 2, start: "08:35", end: "09:20" },
  { id: 3, start: "09:23", end: "10:08" },
  { id: 4, start: "10:18", end: "11:03" },
  { id: 5, start: "11:06", end: "11:51" },
  { id: 6, start: "11:54", end: "12:39" },
  { id: 7, start: "12:42", end: "13:27" },
];

export const LEVELS: Level[] = ["L1", "L2", "L3"];
export const GRADES = [10, 11, 12];

export const HOMEROOMS: Homeroom[] = [
  { id: 0, name: "Room 101", grade: 10, capacity: 22 },
  { id: 1, name: "Room 102", grade: 10, capacity: 22 },
  { id: 2, name: "Room 103", grade: 11, capacity: 22 },
  { id: 3, name: "Room 104", grade: 11, capacity: 22 },
  { id: 4, name: "Room 105", grade: 12, capacity: 18 },
];

export const SUBJECTS: Record<SubjectKey, SubjectDef> = {
  kammi: { name: "Qudrat Kammi", color: "#059669", bg: "#ecfdf5", accent: "#065f46", leveled: true, qudrat: true },
  lafthi: { name: "Qudrat Lafthi", color: "#2563eb", bg: "#eff6ff", accent: "#1e40af", leveled: true, qudrat: true },
  esl: { name: "ESL (IELTS)", color: "#d97706", bg: "#fffbeb", accent: "#92400e", leveled: true, qudrat: false },
  ministry: { name: "Ministry English", color: "#ea580c", bg: "#fff7ed", accent: "#9a3412", leveled: false, qudrat: false },
  future: { name: "Future Skills", color: "#8b5cf6", bg: "#f5f3ff", accent: "#6d28d9", leveled: false, qudrat: false },
  t_math: { name: "Tahsili Math", color: "#7c3aed", bg: "#f5f3ff", accent: "#5b21b6", leveled: false, qudrat: false, tahsili: true },
  t_chem: { name: "Tahsili Chem", color: "#dc2626", bg: "#fef2f2", accent: "#991b1b", leveled: false, qudrat: false, tahsili: true },
  t_bio: { name: "Tahsili Bio", color: "#0891b2", bg: "#ecfeff", accent: "#155e75", leveled: false, qudrat: false, tahsili: true },
  t_physics: { name: "Tahsili Physics", color: "#4f46e5", bg: "#eef2ff", accent: "#3730a3", leveled: false, qudrat: false, tahsili: true },
};

export const GRADE_SUBJECTS = {
  10: { leveled: ["kammi", "lafthi", "esl"], all: ["ministry", "future", "t_math"] },
  11: { leveled: ["kammi", "lafthi", "esl"], all: ["ministry", "future", "t_math"] },
  12: { leveled: ["kammi", "lafthi", "esl"], all: ["ministry", "future", "t_math", "t_chem", "t_bio", "t_physics"] },
} as const;

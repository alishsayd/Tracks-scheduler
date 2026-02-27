export type Lang = "en" | "ar";
export type Day = "Sun" | "Mon" | "Tue" | "Wed" | "Thu";
export type Level = "L1" | "L2" | "L3";

export type LeveledSubject = "kammi" | "lafthi" | "esl";
export type GradeWideSubject = "ministry" | "future" | "t_math" | "t_chem" | "t_bio" | "t_physics";
export type SubjectKey = LeveledSubject | GradeWideSubject;

export type TabPage = "campus" | "homeroom" | "reconciliation";

export interface Slot {
  id: number;
  start: string;
  end: string;
}

export interface Homeroom {
  id: number;
  name: string;
  grade: number;
  capacity: number;
}

export interface SubjectDef {
  name: string;
  color: string;
  bg: string;
  accent: string;
  leveled: boolean;
  qudrat?: boolean;
  tahsili?: boolean;
}

export interface StudentNeeds {
  kammi: Level;
  lafthi: Level;
  esl: Level;
}

export interface Student {
  id: string;
  name: string;
  homeroom: number;
  grade: number;
  doneQ: boolean;
  needs: StudentNeeds;
  strength: number;
}

export interface Meeting {
  day: Day;
  slot: number;
}

export interface Course {
  id: string;
  subject: SubjectKey;
  level: Level | null;
  grade: number | null;
  segment: string | null;
  teacherName: string;
  meetings: Meeting[];
  pattern: string;
}

export interface StreamGroup {
  id: string;
  subject: LeveledSubject;
  slot: number;
  slotLabel: string;
  pattern: string;
  courses: Course[];
  levels: Array<Course | undefined>;
}

export type Assignments = Record<number, Partial<Record<Day, Partial<Record<number, string>>>>>;

export type MoveResolutions = Record<string, Record<string, number | null>>;

export interface MustMoveStudent extends Student {
  neededLabel: string;
  options: Array<{ roomId: number; courseId: string }>;
  resolved?: number | null;
}

export interface ForcedStayStudent extends Student {
  reason: string;
}

export interface MovementResult {
  aligned: Student[];
  mustMoveOut: MustMoveStudent[];
  forcedStay: ForcedStayStudent[];
  moveIns: Student[];
  blockKey: string;
  effectiveHere: number;
}

export interface MoveModalState {
  studentId: string;
  day: Day;
  slotId: number;
  options: Array<{ roomId: number; courseId: string }>;
  blockKey: string;
}

export interface PickerState {
  day: Day;
  slotId: number;
  mode: "add" | "replace";
}

export interface SidePanelState {
  day: Day;
  slotId: number;
}

export interface Translations {
  [key: string]: string;
}

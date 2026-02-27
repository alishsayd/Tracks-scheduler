import { DAYS, GRADES, HOMEROOMS, LEVELS, SLOTS } from "./constants";
import type { Course, Day, Level, StreamGroup, Student, SubjectKey } from "./types";

const TEACHERS = [
  "Abdullah Al-Qahtani",
  "Fahad Al-Dosari",
  "Omar Al-Shehri",
  "Khalid Al-Ghamdi",
  "Saud Al-Harbi",
  "Turki Al-Otaibi",
  "Nasser Al-Zahrani",
  "Majed Al-Malki",
  "Yazeed Al-Anazi",
  "Sultan Al-Rashid",
  "Badr Al-Shammari",
  "Hamdan Al-Sabah",
  "Rayan Al-Farhan",
  "Talal Al-Hazmi",
  "Ziyad Al-Amri",
  "Hamad Al-Mutairi",
  "Saleh Al-Jasser",
  "Mishaal Al-Salem",
  "Yahya Al-Harthi",
  "Ali Al-Fayez",
];

let teacherIndex = 0;
const nextTeacher = () => TEACHERS[teacherIndex++ % TEACHERS.length];

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function genStudents() {
  const r = seededRandom(42);
  const first = [
    "Abdullah",
    "Faisal",
    "Omar",
    "Khalid",
    "Tariq",
    "Zaid",
    "Hamad",
    "Nasser",
    "Sultan",
    "Badr",
    "Saud",
    "Majed",
    "Yazeed",
    "Turki",
    "Rayan",
    "Talal",
    "Ziyad",
    "Ali",
    "Saleh",
    "Mishaal",
  ];
  const last = ["Al-Qahtani", "Al-Dosari", "Al-Shehri", "Al-Ghamdi", "Al-Harbi", "Al-Otaibi", "Al-Zahrani", "Al-Malki"];

  const pick = (levels: Level[], weights: number[]) => {
    const total = weights.reduce((sum, value) => sum + value, 0);
    let rolling = r() * total;
    for (let i = 0; i < levels.length; i++) {
      rolling -= weights[i];
      if (rolling <= 0) return levels[i];
    }
    return levels[levels.length - 1];
  };

  const levelWeights = {
    kammi: { 10: [50, 40, 10], 11: [25, 45, 30], 12: [10, 35, 55] },
    lafthi: { 10: [50, 45, 5], 11: [20, 50, 30], 12: [5, 40, 55] },
    esl: { 10: [55, 40, 5], 11: [30, 50, 20], 12: [15, 45, 40] },
  } as const;

  const students: Student[] = [];
  let sid = 1;

  for (const hr of HOMEROOMS) {
    for (let i = 0; i < hr.capacity; i++) {
      const name = `${first[(hr.id * 13 + i) % first.length]} ${last[(hr.id * 7 + i) % last.length]}`;
      const grade = hr.grade;
      const doneQ = grade === 12 ? r() < 0.65 : false;
      students.push({
        id: `s${sid++}`,
        name,
        homeroom: hr.id,
        grade,
        doneQ,
        needs: {
          kammi: pick(LEVELS, levelWeights.kammi[grade]),
          lafthi: pick(LEVELS, levelWeights.lafthi[grade]),
          esl: pick(LEVELS, levelWeights.esl[grade]),
        },
        strength: r(),
      });
    }
  }

  return students;
}

export function genCourses() {
  teacherIndex = 0;
  const courses: Course[] = [];
  let cid = 1;

  const mk = (subject: SubjectKey, level: Level | null, grade: number | null, meetings: Array<{ day: Day; slot: number }>, segment: string | null = null) => {
    const course: Course = {
      id: `c${cid++}`,
      subject,
      level,
      grade,
      segment,
      teacherName: nextTeacher(),
      meetings,
      pattern: [...new Set(meetings.map((m) => m.day))].join("/"),
    };
    courses.push(course);
  };

  for (const lv of LEVELS) mk("kammi", lv, null, ["Sun", "Mon", "Tue", "Thu"].map((d) => ({ day: d as Day, slot: 1 })), "Ufuq");
  for (const lv of LEVELS) mk("kammi", lv, null, ["Sun", "Mon", "Wed", "Thu"].map((d) => ({ day: d as Day, slot: 3 })), "Tracks");

  for (const lv of LEVELS) mk("lafthi", lv, null, ["Sun", "Tue", "Wed", "Thu"].map((d) => ({ day: d as Day, slot: 2 })), "Ufuq");
  for (const lv of LEVELS) mk("lafthi", lv, null, ["Sun", "Tue", "Wed", "Thu"].map((d) => ({ day: d as Day, slot: 5 })), "Tracks");

  for (const lv of LEVELS) mk("esl", lv, null, ["Sun", "Tue", "Thu"].map((d) => ({ day: d as Day, slot: 4 })));
  for (const lv of LEVELS) mk("esl", lv, null, ["Sun", "Tue", "Thu"].map((d) => ({ day: d as Day, slot: 6 })));

  for (const g of GRADES) mk("ministry", null, g, ["Mon", "Wed"].map((d) => ({ day: d as Day, slot: 4 })));
  for (const g of GRADES) mk("ministry", null, g, ["Mon", "Wed"].map((d) => ({ day: d as Day, slot: 6 })));

  for (const g of GRADES) mk("future", null, g, ["Wed"].map((d) => ({ day: d as Day, slot: 7 })));
  for (const g of GRADES) mk("t_math", null, g, DAYS.map((d) => ({ day: d, slot: 7 })));

  mk("t_physics", null, 12, ["Sun", "Tue"].map((d) => ({ day: d as Day, slot: 1 })));
  mk("t_chem", null, 12, ["Mon", "Thu"].map((d) => ({ day: d as Day, slot: 2 })));
  mk("t_bio", null, 12, ["Wed", "Thu"].map((d) => ({ day: d as Day, slot: 3 })));

  return courses;
}

export function buildStreamGroups(courses: Course[]) {
  const groups: StreamGroup[] = [];
  const leveled: SubjectKey[] = ["kammi", "lafthi", "esl"];

  for (const subject of leveled) {
    const subjectCourses = courses.filter((course) => course.subject === subject);
    const bySlot: Record<number, Course[]> = {};

    for (const course of subjectCourses) {
      const slot = course.meetings[0]?.slot;
      if (!slot) continue;
      if (!bySlot[slot]) bySlot[slot] = [];
      bySlot[slot].push(course);
    }

    for (const [slotRaw, group] of Object.entries(bySlot)) {
      const levels = group.map((c) => c.level).filter(Boolean);
      if (levels.length !== 3) continue;
      const slot = Number(slotRaw);
      const slotInfo = SLOTS.find((entry) => entry.id === slot);
      groups.push({
        id: `sg-${subject}-${slot}`,
        subject: subject as "kammi" | "lafthi" | "esl",
        slot,
        slotLabel: slotInfo?.start || String(slot),
        pattern: group[0].pattern,
        courses: group,
        levels: LEVELS.map((level) => group.find((course) => course.level === level)),
      });
    }
  }

  return groups;
}

import { DAYS, GRADES, LEVELS, SLOTS } from "./constants";
import { buildRoomStudentTargets, type AdminConfig } from "./adminConfig";
import type { Course, Day, Homeroom, Level, StreamGroup, Student, SubjectKey } from "./types";

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

function pickWeighted<T>(rand: () => number, values: T[], weights: number[]) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let rolling = rand() * total;
  for (let i = 0; i < values.length; i++) {
    rolling -= weights[i];
    if (rolling <= 0) return values[i];
  }
  return values[values.length - 1];
}

function pickLevel(rand: () => number, dist: AdminConfig["subjectDistributions"]["kammi"][10]) {
  return pickWeighted(rand, LEVELS, [dist.L1, dist.L2, dist.L3]);
}

export function genStudents(homerooms: Homeroom[], config: AdminConfig) {
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

  const students: Student[] = [];
  const roomTargets = buildRoomStudentTargets(config, homerooms);
  let sid = 1;

  for (const hr of homerooms) {
    const grade = hr.grade as 10 | 11 | 12;
    const roomCount = roomTargets[hr.id] || 0;

    for (let i = 0; i < roomCount; i++) {
      const name = `${first[(hr.id * 13 + i) % first.length]} ${last[(hr.id * 7 + i) % last.length]}`;
      const doneQRate = config.doneRates.qudrat[grade] / 100;
      const doneEslRate = config.doneRates.esl[grade] / 100;
      const doneQ = grade === 10 ? false : r() < doneQRate;
      const doneEsl = grade === 10 ? false : r() < doneEslRate;

      const done = {
        kammi: doneQ,
        lafthi: doneQ,
        esl: doneEsl,
      };

      students.push({
        id: `s${sid++}`,
        name,
        homeroom: hr.id,
        grade,
        doneQ: done.kammi && done.lafthi,
        done,
        needs: {
          kammi: pickLevel(r, config.subjectDistributions.kammi[grade]),
          lafthi: pickLevel(r, config.subjectDistributions.lafthi[grade]),
          esl: pickLevel(r, config.subjectDistributions.esl[grade]),
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

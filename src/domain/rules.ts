import { SUBJECTS } from "./constants";
import { getSubjectLabelFromT, getT } from "./i18n";
import type { Course, Student } from "./types";

export function courseLabel(course: Course | null | undefined, lang: "en" | "ar" = "en") {
  if (!course) return "";
  const t = getT(lang);
  let label = getSubjectLabelFromT(t, course.subject);
  if (course.level) label += ` ${course.level}`;
  if (course.grade) label += ` G${course.grade}`;
  return label;
}

export function blockKeyForCourse(course: Course | null | undefined) {
  if (!course) return "";
  const slot = course.meetings?.[0]?.slot ?? "?";
  return `${course.subject}|slot${slot}|${course.pattern}`;
}

export function courseMatchesStudent(course: Course, student: Student) {
  const subject = SUBJECTS[course.subject];

  if (subject?.tahsili) {
    if (course.grade !== student.grade) return false;
    if (student.grade === 12 && !student.doneQ) return false;
    return true;
  }

  if (course.subject === "ministry" || course.subject === "future") {
    return course.grade === student.grade;
  }

  if (subject?.qudrat) {
    if (student.doneQ) return false;
    return student.needs[course.subject] === course.level;
  }

  if (subject?.leveled) {
    return student.needs[course.subject] === course.level;
  }

  return true;
}

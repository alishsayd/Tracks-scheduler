import type { Day, Lang, SubjectKey, Translations } from "./types";

const I18N: Record<Lang, Translations> = {
  en: {
    appTitle: "Stream Planner",
    campusPlan: "Campus Plan",
    homerooms: "Homerooms",
    reconciliation: "Reconciliation",
    apply: "Seed Homerooms →",
    applyHint: "Seeds homeroom timetables from selected courses (and opens them on campus). You can tweak per homeroom after.",
    step0: "Step 0 — Demand Snapshot",
    step0Hint: "Decide which levels you will run on this campus before choosing bundles.",
    run: "Run",
    sacrifice: "Sacrifice",
    noteExcludesDoneQ: "Qudrat demand excludes students who are done with Qudrat",
    step1: "Step 1 — Choose Course Bundles",
    step1Hint: "Pick a bundle (L1/L2/L3 taught by specific teachers) for each leveled subject.",
    step2: "Step 2 — Grade-wide Courses",
    step2Hint: "Pick one course per subject for this grade (optional).",
    openLevels: "Open levels",
    empty: "Empty",
    pickCourse: "Pick a course",
    availableCourses: "Available Courses",
    replaceCourse: "Replace course",
    selectedCourse: "Selected course",
    filters: "Filters",
    all: "All",
    close: "Close",
    clear: "Clear",
    aligned: "Aligned",
    mustMoveOut: "Must Move Out",
    forcedStay: "Forced Stay",
    movingIn: "Moving In",
    assign: "Assign →",
    destination: "Assign destination",
    unresolved: "Unresolved",
    done: "Complete",
    slots: "slots",
    moves: "moves",
    noCourses: "No eligible courses for this day + slot.",
    reasonNoSupply: "No matching course running somewhere on campus for this slot",
    reasonDoneQudrat: "Done with Qudrat → self-study (no Tahsili option this slot)",
    language: "Language",
    english: "English",
    arabic: "العربية",
    break: "break",
    campusName: "DAB Campus",
    roomsLabel: "Rooms",
    studentsLabel: "Students",
    subject: "Subject",
    decision: "Decision",
    level: "Level",
    grade: "Grade",
    slot: "Slot",
    bundleMeetings: "Bundle meetings",
    doneQShort: "done Q",
    stillQShort: "still Q",
    prototypePolicyG12: "Prototype policy: Grade 12 homerooms are Tahsili. Any Grade 12 student still on Qudrat must move out.",
    openCoursesFirstTitle: "Open courses first",
    openCoursesFirstBody: "Go to Campus Plan and click Apply so this campus has an opened course set.",
    scheduleComplete: "Schedule Complete",
    noUnresolvedMoves: "No Unresolved Moves",
    emptySlots: "empty slots.",
    allResolved: "All resolved.",
    roster: "Roster",
    from: "from",
    capacity: "Capacity",
    noValidDestinations: "No valid destinations.",
    qudratLabel: "Qudrat",
    tahsiliLabel: "Tahsili",
    notDone: "not done",
    subjectKammi: "Qudrat Kammi",
    subjectLafthi: "Qudrat Lafthi",
    subjectEsl: "ESL (IELTS)",
    subjectMinistry: "Ministry English",
    subjectFuture: "Future Skills",
    subjectTMath: "Tahsili Math",
    subjectTChem: "Tahsili Chem",
    subjectTBio: "Tahsili Bio",
    subjectTPhysics: "Tahsili Physics",
  },
  ar: {
    appTitle: "مخطط المسارات",
    campusPlan: "خطة المدرسة",
    homerooms: "الفصول",
    reconciliation: "تسوية الحركة",
    apply: "تعبئة الفصول →",
    applyHint: "يعبّي جداول الفصول بناءً على الدورات المختارة (ويفتحها على مستوى المدرسة). بعدها تقدر تعدّل لكل فصل.",
    step0: "الخطوة 0 — صورة الطلب",
    step0Hint: "قرر أي مستويات ستشغّلها في المدرسة قبل اختيار الباقات.",
    run: "تشغيل",
    sacrifice: "إيقاف",
    noteExcludesDoneQ: "طلب القدرات لا يشمل الطلاب المنتهين من القدرات",
    step1: "الخطوة 1 — اختيار باقات الدورات",
    step1Hint: "اختر باقة (L1/L2/L3 بمدرسين محددين) لكل مادة متعددة المستويات.",
    step2: "الخطوة 2 — دورات الصف بالكامل",
    step2Hint: "اختر دورة لكل مادة لهذا الصف (اختياري).",
    openLevels: "فتح المستويات",
    empty: "فارغ",
    pickCourse: "اختر دورة",
    availableCourses: "الدورات المتاحة",
    replaceCourse: "استبدال الدورة",
    selectedCourse: "الدورة المختارة",
    filters: "فلاتر",
    all: "الكل",
    close: "إغلاق",
    clear: "مسح",
    aligned: "متوافق",
    mustMoveOut: "لازم يطلع",
    forcedStay: "يبقى (بدون بديل)",
    movingIn: "داخل",
    assign: "تعيين →",
    destination: "تعيين الوجهة",
    unresolved: "غير مُعيّن",
    done: "مكتمل",
    slots: "حصص",
    moves: "حركات",
    noCourses: "لا توجد دورات مناسبة لهذا اليوم والوقت.",
    reasonNoSupply: "لا توجد دورة مناسبة شغّالة في المدرسة (في أي فصل) لهذا الوقت",
    reasonDoneQudrat: "منتهي من القدرات → دراسة ذاتية (لا يوجد تحصيلي هنا)",
    language: "اللغة",
    english: "الإنجليزية",
    arabic: "العربية",
    break: "استراحة",
    campusName: "حرم DAB",
    roomsLabel: "فصول",
    studentsLabel: "طلاب",
    subject: "المادة",
    decision: "القرار",
    level: "المستوى",
    grade: "الصف",
    slot: "الحصة",
    bundleMeetings: "اجتماعات الباقة",
    doneQShort: "منتهي قدرات",
    stillQShort: "مستمر قدرات",
    prototypePolicyG12: "سياسة النموذج: فصول الصف 12 تحصيلي. أي طالب صف 12 ما خلص القدرات لازم يطلع.",
    openCoursesFirstTitle: "افتح الدورات أولاً",
    openCoursesFirstBody: "اذهب إلى خطة المدرسة ثم اضغط تعبئة الفصول حتى يتم فتح الدورات على مستوى المدرسة.",
    scheduleComplete: "اكتمل الجدول",
    noUnresolvedMoves: "لا توجد حركات غير مُعيّنة",
    emptySlots: "حصص فارغة.",
    allResolved: "تمت التسوية بالكامل.",
    roster: "قائمة الطلاب",
    from: "من",
    capacity: "السعة",
    noValidDestinations: "لا توجد وجهات صالحة.",
    qudratLabel: "القدرات",
    tahsiliLabel: "التحصيلي",
    notDone: "غير منتهٍ",
    subjectKammi: "قدرات كمي",
    subjectLafthi: "قدرات لفظي",
    subjectEsl: "ESL (IELTS)",
    subjectMinistry: "الإنجليزي الوزاري",
    subjectFuture: "مهارات المستقبل",
    subjectTMath: "تحصيلي رياضيات",
    subjectTChem: "تحصيلي كيمياء",
    subjectTBio: "تحصيلي أحياء",
    subjectTPhysics: "تحصيلي فيزياء",
  },
};

const SUBJECT_KEY_TO_TRANSLATION: Record<SubjectKey, string> = {
  kammi: "subjectKammi",
  lafthi: "subjectLafthi",
  esl: "subjectEsl",
  ministry: "subjectMinistry",
  future: "subjectFuture",
  t_math: "subjectTMath",
  t_chem: "subjectTChem",
  t_bio: "subjectTBio",
  t_physics: "subjectTPhysics",
};

const DAY_LABELS: Record<Lang, Record<Day, string>> = {
  en: { Sun: "Sun", Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu" },
  ar: { Sun: "الأحد", Mon: "الاثنين", Tue: "الثلاثاء", Wed: "الأربعاء", Thu: "الخميس" },
};

const SEGMENT_LABELS: Record<Lang, Record<string, string>> = {
  en: { Ufuq: "Ufuq", Tracks: "Tracks" },
  ar: { Ufuq: "أفق", Tracks: "تراكس" },
};

const NAME_PARTS_AR: Record<string, string> = {
  Abdullah: "عبدالله",
  Faisal: "فيصل",
  Omar: "عمر",
  Khalid: "خالد",
  Tariq: "طارق",
  Zaid: "زيد",
  Hamad: "حمد",
  Nasser: "ناصر",
  Sultan: "سلطان",
  Badr: "بدر",
  Saud: "سعود",
  Majed: "ماجد",
  Yazeed: "يزيد",
  Turki: "تركي",
  Rayan: "ريان",
  Talal: "طلال",
  Ziyad: "زياد",
  Ali: "علي",
  Saleh: "صالح",
  Mishaal: "مشعل",
  Fahad: "فهد",
  Hamdan: "حمدان",
  Yahya: "يحيى",
  "Al-Qahtani": "القحطاني",
  "Al-Dosari": "الدوسري",
  "Al-Shehri": "الشهري",
  "Al-Ghamdi": "الغامدي",
  "Al-Harbi": "الحربي",
  "Al-Otaibi": "العتيبي",
  "Al-Zahrani": "الزهراني",
  "Al-Malki": "المالكي",
  "Al-Anazi": "العنزي",
  "Al-Rashid": "الرشيد",
  "Al-Shammari": "الشمري",
  "Al-Sabah": "الصباح",
  "Al-Farhan": "الفرحان",
  "Al-Hazmi": "الحازمي",
  "Al-Amri": "العمري",
  "Al-Mutairi": "المطيري",
  "Al-Jasser": "الجاسر",
  "Al-Salem": "السالم",
  "Al-Harthi": "الحارثي",
  "Al-Fayez": "الفايز",
};

export function getT(lang: Lang) {
  return I18N[lang];
}

export function getDayLabel(lang: Lang, day: Day) {
  return DAY_LABELS[lang][day] || day;
}

export function formatDayPattern(lang: Lang, pattern: string) {
  return pattern
    .split("/")
    .map((day) => DAY_LABELS[lang][day as Day] || day)
    .join(" / ");
}

export function getSubjectLabelFromT(t: Translations, subject: SubjectKey) {
  return t[SUBJECT_KEY_TO_TRANSLATION[subject]] || subject;
}

export function localizeRoomName(lang: Lang, roomName: string) {
  if (lang !== "ar") return roomName;
  return roomName.replace(/^Room\s+/i, "فصل ");
}

export function localizePersonName(lang: Lang, name: string) {
  if (lang !== "ar") return name;
  return name
    .split(" ")
    .map((token) => NAME_PARTS_AR[token] || token)
    .join(" ");
}

export function localizeSegment(lang: Lang, segment: string | null) {
  if (!segment) return "";
  return SEGMENT_LABELS[lang][segment] || segment;
}

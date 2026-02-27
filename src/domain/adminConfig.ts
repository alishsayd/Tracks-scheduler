import { GRADES } from "./constants";
import type { Homeroom, LeveledSubject } from "./types";

export const ADMIN_CONFIG_STORAGE_KEY = "tracks-scheduler-admin-config-v1";
export const IDEAL_ROOM_CAPACITY = 22;
export const MAX_ROOM_CAPACITY = 28;

export type AdminGrade = 10 | 11 | 12;

export interface LevelDistribution {
  L1: number;
  L2: number;
  L3: number;
}

export type GradeTotals = Record<AdminGrade, number>;
export type SubjectDistributions = Record<LeveledSubject, Record<AdminGrade, LevelDistribution>>;

export interface DoneRates {
  qudrat: Record<AdminGrade, number>;
  esl: Record<AdminGrade, number>;
}

export interface AdminConfig {
  roomCount: number;
  gradeTotals: GradeTotals;
  doneRates: DoneRates;
  subjectDistributions: SubjectDistributions;
}

export interface RoomAllocation {
  roomsByGrade: Record<AdminGrade, number>;
  avgByGrade: Record<AdminGrade, number>;
  maxByGrade: Record<AdminGrade, number>;
}

export interface AdminConfigValidation {
  errors: string[];
  warnings: string[];
  allocation: RoomAllocation | null;
}

const DEFAULT_CONFIG: AdminConfig = {
  roomCount: 5,
  gradeTotals: {
    10: 44,
    11: 44,
    12: 18,
  },
  doneRates: {
    qudrat: { 10: 0, 11: 0, 12: 65 },
    esl: { 10: 0, 11: 0, 12: 0 },
  },
  subjectDistributions: {
    kammi: {
      10: { L1: 50, L2: 40, L3: 10 },
      11: { L1: 25, L2: 45, L3: 30 },
      12: { L1: 10, L2: 35, L3: 55 },
    },
    lafthi: {
      10: { L1: 50, L2: 45, L3: 5 },
      11: { L1: 20, L2: 50, L3: 30 },
      12: { L1: 5, L2: 40, L3: 55 },
    },
    esl: {
      10: { L1: 55, L2: 40, L3: 5 },
      11: { L1: 30, L2: 50, L3: 20 },
      12: { L1: 15, L2: 45, L3: 40 },
    },
  },
};

function cloneLevelDistribution(input: LevelDistribution): LevelDistribution {
  return {
    L1: input.L1,
    L2: input.L2,
    L3: input.L3,
  };
}

function cloneConfig(input: AdminConfig): AdminConfig {
  return {
    roomCount: input.roomCount,
    gradeTotals: { ...input.gradeTotals },
    doneRates: {
      qudrat: { ...input.doneRates.qudrat },
      esl: { ...input.doneRates.esl },
    },
    subjectDistributions: {
      kammi: {
        10: cloneLevelDistribution(input.subjectDistributions.kammi[10]),
        11: cloneLevelDistribution(input.subjectDistributions.kammi[11]),
        12: cloneLevelDistribution(input.subjectDistributions.kammi[12]),
      },
      lafthi: {
        10: cloneLevelDistribution(input.subjectDistributions.lafthi[10]),
        11: cloneLevelDistribution(input.subjectDistributions.lafthi[11]),
        12: cloneLevelDistribution(input.subjectDistributions.lafthi[12]),
      },
      esl: {
        10: cloneLevelDistribution(input.subjectDistributions.esl[10]),
        11: cloneLevelDistribution(input.subjectDistributions.esl[11]),
        12: cloneLevelDistribution(input.subjectDistributions.esl[12]),
      },
    },
  };
}

function asInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function clampPercent(value: unknown, fallback: number) {
  const n = asInt(value, fallback);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function normalizeToHundred(values: [number, number, number]): [number, number, number] {
  const total = values[0] + values[1] + values[2];
  if (total <= 0) return [0, 0, 100];

  const normalized = values.map((value) => (value / total) * 100);
  const floored = normalized.map((value) => Math.floor(value));
  let remainder = 100 - (floored[0] + floored[1] + floored[2]);

  const order = normalized
    .map((value, index) => ({ index, fraction: value - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    floored[order[i].index] += 1;
    remainder -= 1;
  }

  return [floored[0], floored[1], floored[2]];
}

function normalizeLevelDistribution(raw: any, fallback: LevelDistribution): LevelDistribution {
  const l1 = clampPercent(raw?.L1, fallback.L1);
  const l2 = clampPercent(raw?.L2, fallback.L2);
  const l3 = clampPercent(raw?.L3, fallback.L3);
  const sum = l1 + l2 + l3;

  if (sum === 100) return { L1: l1, L2: l2, L3: l3 };

  // Migrate legacy rows where L1/L2/L3 + done = 100.
  const legacyDone = raw && Object.prototype.hasOwnProperty.call(raw, "done") ? clampPercent(raw.done, 0) : null;
  if (legacyDone !== null && sum > 0 && sum + legacyDone === 100) {
    const [n1, n2, n3] = normalizeToHundred([l1, l2, l3]);
    return { L1: n1, L2: n2, L3: n3 };
  }

  return cloneLevelDistribution(fallback);
}

function normalizeConfig(raw: unknown): AdminConfig {
  const defaults = getDefaultAdminConfig();
  if (!raw || typeof raw !== "object") return defaults;

  const obj = raw as Partial<AdminConfig> & { doneRates?: any; subjectDistributions?: any };

  const roomCount = asInt(obj.roomCount, defaults.roomCount);
  const gradeTotalsRaw = obj.gradeTotals || defaults.gradeTotals;
  const subjectRaw = obj.subjectDistributions || defaults.subjectDistributions;
  const doneRaw = obj.doneRates || {};

  const gradeTotals: GradeTotals = {
    10: Math.max(0, asInt(gradeTotalsRaw[10], defaults.gradeTotals[10])),
    11: Math.max(0, asInt(gradeTotalsRaw[11], defaults.gradeTotals[11])),
    12: Math.max(0, asInt(gradeTotalsRaw[12], defaults.gradeTotals[12])),
  };

  const legacyQDone = (grade: AdminGrade) => {
    const fromKammi = subjectRaw?.kammi?.[grade]?.done;
    const fromLafthi = subjectRaw?.lafthi?.[grade]?.done;
    return clampPercent(fromKammi ?? fromLafthi, defaults.doneRates.qudrat[grade]);
  };

  const legacyEslDone = (grade: AdminGrade) => clampPercent(subjectRaw?.esl?.[grade]?.done, defaults.doneRates.esl[grade]);

  const doneRates: DoneRates = {
    qudrat: {
      10: clampPercent(doneRaw?.qudrat?.[10], legacyQDone(10)),
      11: clampPercent(doneRaw?.qudrat?.[11], legacyQDone(11)),
      12: clampPercent(doneRaw?.qudrat?.[12], legacyQDone(12)),
    },
    esl: {
      10: clampPercent(doneRaw?.esl?.[10], legacyEslDone(10)),
      11: clampPercent(doneRaw?.esl?.[11], legacyEslDone(11)),
      12: clampPercent(doneRaw?.esl?.[12], legacyEslDone(12)),
    },
  };

  const subjectDistributions: SubjectDistributions = {
    kammi: {
      10: normalizeLevelDistribution(subjectRaw?.kammi?.[10], defaults.subjectDistributions.kammi[10]),
      11: normalizeLevelDistribution(subjectRaw?.kammi?.[11], defaults.subjectDistributions.kammi[11]),
      12: normalizeLevelDistribution(subjectRaw?.kammi?.[12], defaults.subjectDistributions.kammi[12]),
    },
    lafthi: {
      10: normalizeLevelDistribution(subjectRaw?.lafthi?.[10], defaults.subjectDistributions.lafthi[10]),
      11: normalizeLevelDistribution(subjectRaw?.lafthi?.[11], defaults.subjectDistributions.lafthi[11]),
      12: normalizeLevelDistribution(subjectRaw?.lafthi?.[12], defaults.subjectDistributions.lafthi[12]),
    },
    esl: {
      10: normalizeLevelDistribution(subjectRaw?.esl?.[10], defaults.subjectDistributions.esl[10]),
      11: normalizeLevelDistribution(subjectRaw?.esl?.[11], defaults.subjectDistributions.esl[11]),
      12: normalizeLevelDistribution(subjectRaw?.esl?.[12], defaults.subjectDistributions.esl[12]),
    },
  };

  return {
    roomCount: Math.max(1, roomCount),
    gradeTotals,
    doneRates,
    subjectDistributions,
  };
}

function distributeGradeStudents(totalStudents: number, rooms: number) {
  if (rooms <= 0) return [];
  const base = Math.floor(totalStudents / rooms);
  const extra = totalStudents % rooms;
  return Array.from({ length: rooms }, (_, index) => base + (index < extra ? 1 : 0));
}

export function getDefaultAdminConfig() {
  return cloneConfig(DEFAULT_CONFIG);
}

export function loadAdminConfig() {
  if (typeof window === "undefined") return getDefaultAdminConfig();

  try {
    const raw = window.localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY);
    if (!raw) return getDefaultAdminConfig();
    const parsed = JSON.parse(raw) as unknown;
    return normalizeConfig(parsed);
  } catch {
    return getDefaultAdminConfig();
  }
}

export function saveAdminConfig(config: AdminConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(normalizeConfig(config)));
}

export function computeRoomAllocation(config: AdminConfig) {
  const activeGrades = (GRADES as AdminGrade[]).filter((grade) => config.gradeTotals[grade] > 0);
  if (activeGrades.length === 0) return null;

  const minRoomsByGrade: Record<AdminGrade, number> = { 10: 0, 11: 0, 12: 0 };

  for (const grade of activeGrades) {
    minRoomsByGrade[grade] = Math.ceil(config.gradeTotals[grade] / MAX_ROOM_CAPACITY);
  }

  const minRoomsNeeded = minRoomsByGrade[10] + minRoomsByGrade[11] + minRoomsByGrade[12];
  if (minRoomsNeeded > config.roomCount) return null;

  const roomsByGrade: Record<AdminGrade, number> = { ...minRoomsByGrade };
  let remaining = config.roomCount - minRoomsNeeded;

  while (remaining > 0) {
    const pick = activeGrades
      .slice()
      .sort((a, b) => config.gradeTotals[b] / roomsByGrade[b] - config.gradeTotals[a] / roomsByGrade[a])[0];

    if (pick === undefined) break;
    roomsByGrade[pick] += 1;
    remaining -= 1;
  }

  const avgByGrade: Record<AdminGrade, number> = { 10: 0, 11: 0, 12: 0 };
  const maxByGrade: Record<AdminGrade, number> = { 10: 0, 11: 0, 12: 0 };

  for (const grade of GRADES as AdminGrade[]) {
    const rooms = roomsByGrade[grade];
    if (rooms <= 0) continue;
    avgByGrade[grade] = Number((config.gradeTotals[grade] / rooms).toFixed(1));
    maxByGrade[grade] = Math.ceil(config.gradeTotals[grade] / rooms);
  }

  return {
    roomsByGrade,
    avgByGrade,
    maxByGrade,
  };
}

export function validateAdminConfig(config: AdminConfig): AdminConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isInteger(config.roomCount) || config.roomCount < 1) {
    errors.push("Room count must be a positive integer.");
  }

  for (const grade of GRADES as AdminGrade[]) {
    const total = config.gradeTotals[grade];
    if (!Number.isInteger(total) || total < 0) {
      errors.push(`Grade ${grade} total students must be a whole number >= 0.`);
    }
  }

  if (config.gradeTotals[10] + config.gradeTotals[11] + config.gradeTotals[12] <= 0) {
    errors.push("At least one grade must have students.");
  }

  for (const doneType of ["qudrat", "esl"] as const) {
    for (const grade of GRADES as AdminGrade[]) {
      const value = config.doneRates[doneType][grade];
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        errors.push(`${doneType.toUpperCase()} Grade ${grade} done rate must be between 0% and 100%.`);
      }
      if (grade === 10 && value !== 0) {
        errors.push(`${doneType.toUpperCase()} Grade 10 done rate must stay 0%.`);
      }
    }
  }

  for (const subject of ["kammi", "lafthi", "esl"] as const) {
    for (const grade of GRADES as AdminGrade[]) {
      const dist = config.subjectDistributions[subject][grade];
      const sum = dist.L1 + dist.L2 + dist.L3;
      if (sum !== 100) {
        errors.push(`${subject.toUpperCase()} Grade ${grade} L1/L2/L3 must add up to 100%.`);
      }
    }
  }

  const allocation = computeRoomAllocation(config);
  if (!allocation) {
    errors.push(
      `Room count is infeasible. At least ${
        Math.ceil(config.gradeTotals[10] / MAX_ROOM_CAPACITY) +
        Math.ceil(config.gradeTotals[11] / MAX_ROOM_CAPACITY) +
        Math.ceil(config.gradeTotals[12] / MAX_ROOM_CAPACITY)
      } rooms are required to keep all grades separate and <= ${MAX_ROOM_CAPACITY} students per room.`
    );
    return { errors, warnings, allocation: null };
  }

  for (const grade of GRADES as AdminGrade[]) {
    const max = allocation.maxByGrade[grade];
    if (max > MAX_ROOM_CAPACITY) {
      errors.push(`Grade ${grade} exceeds hard capacity (${max}/${MAX_ROOM_CAPACITY}).`);
    }
    if (max > IDEAL_ROOM_CAPACITY && max <= MAX_ROOM_CAPACITY) {
      warnings.push(`Grade ${grade} is above ideal capacity (${max}/${IDEAL_ROOM_CAPACITY}).`);
    }
  }

  return { errors, warnings, allocation };
}

export function buildHomerooms(config: AdminConfig): Homeroom[] {
  const normalized = normalizeConfig(config);
  const validation = validateAdminConfig(normalized);
  const source = validation.errors.length === 0 ? normalized : getDefaultAdminConfig();
  const allocation = computeRoomAllocation(source);

  if (!allocation) return [];

  const homerooms: Homeroom[] = [];
  let roomId = 0;

  for (const grade of GRADES as AdminGrade[]) {
    const rooms = allocation.roomsByGrade[grade];
    const studentCounts = distributeGradeStudents(source.gradeTotals[grade], rooms);

    for (const count of studentCounts) {
      const capacity = Math.min(MAX_ROOM_CAPACITY, Math.max(IDEAL_ROOM_CAPACITY, count));
      homerooms.push({
        id: roomId,
        name: `Room ${101 + roomId}`,
        grade,
        capacity,
      });
      roomId += 1;
    }
  }

  return homerooms;
}

export function buildRoomStudentTargets(config: AdminConfig, homerooms: Homeroom[]) {
  const normalized = normalizeConfig(config);
  const validation = validateAdminConfig(normalized);
  const source = validation.errors.length === 0 ? normalized : getDefaultAdminConfig();
  const targets: Record<number, number> = {};

  for (const grade of GRADES as AdminGrade[]) {
    const gradeRooms = homerooms.filter((room) => room.grade === grade);
    const counts = distributeGradeStudents(source.gradeTotals[grade], gradeRooms.length);
    for (let i = 0; i < gradeRooms.length; i++) {
      targets[gradeRooms[i].id] = counts[i] || 0;
    }
  }

  return targets;
}

export function getRuntimeAdminConfig() {
  const loaded = loadAdminConfig();
  const validation = validateAdminConfig(loaded);
  if (validation.errors.length > 0) return getDefaultAdminConfig();
  return loaded;
}

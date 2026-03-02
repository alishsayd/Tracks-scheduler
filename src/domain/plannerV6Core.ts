import { LEVELS } from "./constants";
import type { LeveledSubject, Level } from "./types";

export type RoomHost = Level | "AUTO_TAHSILI";

export interface SubjectRoutingPlan {
  run: Record<Level, boolean>;
  forceMove: {
    L1: { target: Level; count: number };
    L2: { toL1: number; toL3: number };
    L3: { target: Level; count: number };
  };
}

export interface RoomMapRow {
  roomId: number;
  roomName: string;
  grade: number;
  host: RoomHost;
  fixed: boolean;
  stay: number;
  inCount: number;
  outCount: number;
  effectiveCount: number;
  capacity: number;
}

export interface RoomMapSummary {
  stay: number;
  move: number;
  forcedStays: number;
  worstRoom: { roomId: number; effective: number; capacity: number } | null;
}

export interface RoomMapPreview {
  hostByRoom: Record<number, RoomHost>;
  rows: RoomMapRow[];
  summary: RoomMapSummary;
  levelDemand: Record<Level, number>;
  levelsRunning: Level[];
}

export function createDefaultSubjectRoutingPlan(): SubjectRoutingPlan {
  return {
    run: { L1: true, L2: true, L3: true },
    forceMove: {
      L1: { target: "L2", count: 0 },
      L2: { toL1: 0, toL3: 0 },
      L3: { target: "L2", count: 0 },
    },
  };
}

export function levelOpenFromRouting(plans: Record<LeveledSubject, SubjectRoutingPlan>) {
  const defaultState = { L1: false, L2: false, L3: false };
  const result: Record<LeveledSubject, Record<Level, boolean>> = {
    kammi: { ...defaultState },
    lafthi: { ...defaultState },
    esl: { ...defaultState },
  };

  (Object.keys(result) as LeveledSubject[]).forEach((subject) => {
    for (const level of LEVELS) {
      result[subject][level] = Boolean(plans[subject].run[level]);
    }
  });

  return result;
}

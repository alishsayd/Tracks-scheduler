import type { Level, StreamGroup, SubjectKey } from "./types";

export type SelectedStreams = Partial<Record<"kammi" | "lafthi" | "esl", string | undefined>>;

export type LevelOpenState = Record<"kammi" | "lafthi" | "esl", Record<Level, boolean>>;

export type GradeCourseSelections = Partial<Record<number, Partial<Record<SubjectKey, string | undefined>>>>;

export type CampusWhitelistParams = {
  selectedStreams: SelectedStreams;
  gradeCourseSelections: GradeCourseSelections;
  levelOpen: LevelOpenState;
  streamGroups: StreamGroup[];
};

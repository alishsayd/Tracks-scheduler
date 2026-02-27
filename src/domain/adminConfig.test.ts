import { describe, expect, it } from "vitest";
import { buildHomerooms, buildRoomStudentTargets, getDefaultAdminConfig, validateAdminConfig } from "./adminConfig";

describe("admin config", () => {
  it("validates default config", () => {
    const config = getDefaultAdminConfig();
    const validation = validateAdminConfig(config);
    expect(validation.errors).toHaveLength(0);
    expect(validation.allocation).toBeTruthy();
  });

  it("flags impossible room count", () => {
    const config = getDefaultAdminConfig();
    config.roomCount = 2;
    const validation = validateAdminConfig(config);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it("builds homerooms and student targets from config", () => {
    const config = getDefaultAdminConfig();
    config.roomCount = 7;
    config.gradeTotals = { 10: 58, 11: 51, 12: 45 };

    const homerooms = buildHomerooms(config);
    const targets = buildRoomStudentTargets(config, homerooms);

    expect(homerooms).toHaveLength(7);
    expect(Object.values(targets).reduce((sum, n) => sum + n, 0)).toBe(154);
    expect(Math.max(...Object.values(targets))).toBeLessThanOrEqual(28);
  });
});

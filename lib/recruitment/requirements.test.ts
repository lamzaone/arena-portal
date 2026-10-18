import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRecruitmentRequirements, RECRUITMENT_MINIMUM_AGE, RECRUITMENT_MINIMUM_PLAYTIME_SECONDS } from "./requirements.ts";

const complete = { age: 18, playtimeSeconds: 108000, discordLinked: true, steamGroupMember: true };

test("the age 18 and 30-hour baselines are inclusive advisory criteria", () => {
  assert.equal(RECRUITMENT_MINIMUM_AGE, 18);
  assert.equal(RECRUITMENT_MINIMUM_PLAYTIME_SECONDS, 108000);
  const assessment = evaluateRecruitmentRequirements(complete);
  assert.equal(assessment.allMet, true);
  assert.equal(assessment.requiresAttention, false);
  assert.deepEqual(assessment.criteria.map(criterion => criterion.state), ["met", "met", "met", "met"]);
});

test("each missed criterion stays visible without changing basic application validation", () => {
  const assessment = evaluateRecruitmentRequirements({ age: "17", playtimeSeconds: 107999, discordLinked: false, steamGroupMember: false });
  assert.equal(assessment.hasUnmet, true);
  assert.equal(assessment.requiresAttention, true);
  assert.equal(assessment.allMet, false);
  assert.deepEqual(assessment.criteria.map(criterion => criterion.key), ["age", "playtime", "discord_link", "steam_group"]);
  assert.ok(assessment.criteria.every(criterion => criterion.state === "unmet"));
});

test("unanswered age and group are pending; unavailable hours are explicitly unverified", () => {
  const assessment = evaluateRecruitmentRequirements({ age: "", playtimeSeconds: null, discordLinked: true, steamGroupMember: null });
  assert.deepEqual(assessment.criteria.map(criterion => criterion.state), ["pending", "unverified", "met", "pending"]);
  assert.equal(assessment.hasUnmet, false);
  assert.equal(assessment.hasUnverified, true);
  assert.equal(assessment.requiresAttention, true);
});

test("malformed ages and nonfinite playtime never appear to satisfy the baseline", () => {
  for (const age of ["seventeen", "18.5", 121, -1]) assert.equal(evaluateRecruitmentRequirements({ ...complete, age }).criteria[0].state, "unmet");
  for (const playtimeSeconds of [NaN, Infinity, -1]) assert.equal(evaluateRecruitmentRequirements({ ...complete, playtimeSeconds }).criteria[1].state, "unverified");
  assert.equal(evaluateRecruitmentRequirements({ ...complete, age: null }).criteria[0].state, "pending");
});

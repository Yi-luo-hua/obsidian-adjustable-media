import assert from "node:assert/strict";
import { test } from "node:test";
import { ConvergenceBudget, MAX_LAYOUT_MEASUREMENT_ROUNDS } from "../src/layout/convergenceBudget.ts";

test("oscillating measurements stop within the calibrated scope and only external invalidation resumes", () => {
  const budget = new ConvergenceBudget();
  for (let round = 0; round < MAX_LAYOUT_MEASUREMENT_ROUNDS; round++) assert.equal(budget.take("pane/version/environment/viewport"), true);
  for (let round = 0; round < 40; round++) assert.equal(budget.take("pane/version/environment/viewport"), false);
  assert.equal(budget.blocked, true);
  assert.equal(budget.rounds, MAX_LAYOUT_MEASUREMENT_ROUNDS);
  budget.reset();
  assert.equal(budget.take("pane/version/environment/viewport"), true);
  assert.equal(budget.blocked, false);
  assert.equal(budget.take("pane/version/newEnvironment/viewport"), true);
  assert.equal(budget.rounds, 1);
});

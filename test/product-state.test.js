import test from "node:test";
import assert from "node:assert/strict";

import {
  PRODUCT_STATES,
  buildRecoverySteps,
  buildHistoryRecoveryPlan,
  buildProductState
} from "../src/product-state.js";

test("product state maps healthy, recoverable, and compatibility states from one source", () => {
  const healthy = buildProductState({
    historyVisibility: { severity: "ok", primaryAction: "继续使用即可。" }
  });
  assert.equal(healthy.kind, PRODUCT_STATES.HEALTHY);
  assert.equal(healthy.recoveryNeeded, false);

  const recoverable = buildProductState({
    historyVisibility: { severity: "warning", primaryAction: "先点修复历史显示。" }
  });
  assert.equal(recoverable.kind, PRODUCT_STATES.RECOVERABLE);
  assert.equal(recoverable.recoveryNeeded, true);

  const compatibility = buildProductState({
    historyVisibility: { severity: "warning", primaryAction: "先点修复历史显示。" },
    diagnosis: { status: "unsupported" }
  });
  assert.equal(compatibility.kind, PRODUCT_STATES.COMPATIBILITY);
  assert.equal(compatibility.compatibilityMode, true);
  assert.equal(compatibility.canContinue, true);
});

test("recovery plan carries the same product state contract", () => {
  const plan = buildHistoryRecoveryPlan(
    {
      severity: "ok",
      summary: "历史状态看起来正常。",
      primaryAction: "继续使用即可。"
    },
    { status: "unsupported" }
  );

  assert.equal(plan.state, PRODUCT_STATES.COMPATIBILITY);
  assert.equal(plan.productState.kind, PRODUCT_STATES.COMPATIBILITY);
  assert.equal(plan.uiMode, "compatibility_ready");
  assert.match(plan.summary, /兼容模式|历史保护仍生效/);
  assert.equal(Array.isArray(plan.nextSteps), true);
  assert.deepEqual(buildRecoverySteps(), [
    "先点修复历史显示。",
    "如果还没恢复，再点重建历史索引。",
    "如果还是不对，再点打开高级修复。"
  ]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAdminAnalytics } from "../lib/admin-analytics.ts";

test("funnel uses a new-user cohort while clicks count activity in the period", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const leads = [
    { id: "new", created_at: "2026-09-29T12:00:00Z", status: "qualified", current_stage: "handoff", gift_link_clicked_at: null },
    { id: "old", created_at: "2026-09-01T12:00:00Z", status: "active", current_stage: "ecosystem_menu", gift_link_clicked_at: null },
  ];
  const event = (user_id, event_name, extra = {}) => ({
    user_id, event_name, category: null, metadata: {}, created_at: "2026-09-30T10:00:00Z", ...extra,
  });
  const events = [
    event("new", "category_selected", { category: "life" }),
    event("new", "category_selected", { category: "life" }),
    event("old", "category_selected", { category: "business" }),
    event("new", "material_presented", { metadata: { title: "Тест" } }),
    event("new", "material_link_clicked"),
    event("new", "marketing_quiz_answered", { metadata: { question: "marketing_roi_quiz_q1" } }),
  ];

  const summary = buildAdminAnalytics(leads, events, 7, now);
  assert.equal(summary.people, 1);
  assert.equal(summary.category, 1);
  assert.equal(summary.life, 1);
  assert.equal(summary.business, 0);
  assert.equal(summary.clicks.category, 3);
  assert.equal(summary.categoryClicks.business, 1);
  assert.equal(summary.materialLinkClicked, 1);
  assert.deepEqual(summary.quizAnswers, [1, 0, 0]);
  assert.deepEqual(summary.topMaterials, [{ title: "Тест", clicks: 1 }]);
});

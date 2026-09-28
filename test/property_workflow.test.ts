import assert from "node:assert/strict";
import test from "node:test";
import { planPropertyWork, propertyWorkSchema } from "../src/property_workflow.js";

test("maintenance without access authorization requires human review", () => {
  const request = propertyWorkSchema.parse({
    kind: "maintenance_request",
    propertyId: "OAK-12",
    tenantName: "Sam Rivera",
    details: "Water is collecting beneath the kitchen sink.",
    accessAllowed: false
  });

  const plan = planPropertyWork(request);

  assert.equal(plan.action, "draft_vendor_brief");
  assert.equal(plan.needsHumanReview, true);
  assert.match(plan.instruction, /Access authorized: no/);
});

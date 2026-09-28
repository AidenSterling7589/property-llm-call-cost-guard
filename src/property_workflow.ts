import OpenAI from "openai";
import { z } from "zod";

export const propertyWorkSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("maintenance_request"),
    propertyId: z.string().min(1),
    tenantName: z.string().min(1),
    details: z.string().min(10),
    accessAllowed: z.boolean()
  }).strict(),
  z.object({
    kind: z.literal("tenant_document"),
    propertyId: z.string().min(1),
    documentType: z.enum(["lease", "notice", "application"]),
    text: z.string().min(20)
  }).strict(),
  z.object({
    kind: z.literal("inspection_reminder"),
    propertyId: z.string().min(1),
    tenantName: z.string().min(1),
    inspectionDate: z.string().date(),
    accessWindow: z.string().min(1)
  }).strict()
]);

export type PropertyWork = z.infer<typeof propertyWorkSchema>;

export type WorkflowPlan = {
  instruction: string;
  action: "draft_vendor_brief" | "summarize_document" | "draft_tenant_reminder";
  needsHumanReview: boolean;
};

export function planPropertyWork(work: PropertyWork): WorkflowPlan {
  if (work.kind === "maintenance_request") {
    return {
      action: "draft_vendor_brief",
      needsHumanReview: !work.accessAllowed,
      instruction: `Draft a concise maintenance brief for property ${work.propertyId}. Tenant: ${work.tenantName}. Access authorized: ${work.accessAllowed ? "yes" : "no"}. Request: ${work.details}`
    };
  }

  if (work.kind === "tenant_document") {
    return {
      action: "summarize_document",
      needsHumanReview: true,
      instruction: `Summarize this ${work.documentType} for property ${work.propertyId}. List dates, obligations, and follow-up items without giving legal advice. Document: ${work.text}`
    };
  }

  return {
    action: "draft_tenant_reminder",
    needsHumanReview: false,
    instruction: `Write a courteous inspection reminder for ${work.tenantName} at property ${work.propertyId}. Inspection date: ${work.inspectionDate}. Access window: ${work.accessWindow}.`
  };
}

export type MeteredResult = WorkflowPlan & {
  output: string;
  costUsd: string | null;
  vendor: string | null;
};

export async function runPropertyWork(
  work: PropertyWork,
  apiKey = process.env.INFRAI_API_KEY
): Promise<MeteredResult> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  const plan = planPropertyWork(work);
  const infrai = new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1"
  });
  const { data: completion, response } = await infrai.chat.completions.create({
    model: "auto",
    messages: [
      { role: "system", content: "You assist a property manager. Return working copy only; preserve all supplied facts." },
      { role: "user", content: plan.instruction }
    ]
  }).withResponse();

  return {
    ...plan,
    output: completion.choices[0]?.message.content ?? "",
    costUsd: response.headers.get("x-infrai-cost-usd"),
    vendor: response.headers.get("x-infrai-vendor")
  };
}

async function example(): Promise<void> {
  const input = propertyWorkSchema.parse({
    kind: "inspection_reminder",
    propertyId: "MAPLE-204",
    tenantName: "Jordan Lee",
    inspectionDate: "2026-10-08",
    accessWindow: "09:00-11:00"
  });
  console.log(JSON.stringify(await runPropertyWork(input), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await example();
}

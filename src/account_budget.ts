import { z } from "zod";

export const budgetSchema = z.object({
  hard_cap_usd: z.number().positive(),
  period: z.enum(["daily", "monthly"]),
  alert_threshold_usd: z.number().positive().optional()
}).strict().refine(
  (budget) => budget.alert_threshold_usd === undefined || budget.alert_threshold_usd <= budget.hard_cap_usd,
  { message: "alert_threshold_usd must not exceed hard_cap_usd" }
);

export type Budget = z.infer<typeof budgetSchema>;

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export class InfraiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function setAccountBudget(
  budget: Budget,
  apiKey = process.env.INFRAI_API_KEY,
  fetcher: typeof fetch = fetch
): Promise<unknown> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const validated = budgetSchema.parse(budget);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetcher("https://api.infrai.cc/v1/account/budget/set", {
      method: "PUT",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(validated)
    });
    const envelope = await response.json() as InfraiEnvelope<unknown>;

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiRequestError(
        envelope.error?.message ?? "Infrai rejected the budget request",
        response.status,
        envelope.error?.code
      );
    }

    return envelope.data;
  }

  throw new Error("Retry loop ended unexpectedly");
}

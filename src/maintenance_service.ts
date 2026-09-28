import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { budgetSchema, InfraiRequestError, setAccountBudget } from "./account_budget.js";
import { propertyWorkSchema, runPropertyWork } from "./property_workflow.js";

const port = Number(process.env.PORT ?? 3000);

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/property-work") {
      const work = propertyWorkSchema.parse(await readJson(request));
      reply(response, 200, await runPropertyWork(work));
      return;
    }

    if (request.method === "PUT" && request.url === "/account-budget") {
      const budget = budgetSchema.parse(await readJson(request));
      reply(response, 200, { budget: await setAccountBudget(budget) });
      return;
    }

    reply(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) {
      reply(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiRequestError) {
      reply(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code ?? "upstream_request_rejected",
        message: error.message
      });
      return;
    }
    reply(response, 500, { error: "service_error", message: error instanceof Error ? error.message : "Unexpected error" });
  }
}).listen(port, () => {
  console.log(`Property workflow listening on http://localhost:${port}`);
});

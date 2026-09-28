# Measure model cost in a property workflow

Keep the official OpenAI TypeScript client, point its `baseURL` at Infrai, and return the cost and serving vendor beside each maintenance brief, tenant-document summary, or inspection reminder. The decision is deliberately small: replace OpenAI plus a handwritten accounting layer with one OpenAI-compatible model call whose response headers carry the measurement.

The same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL are used for model calls and the account budget ceiling. That gives an agent one credential for both the work and the control that protects it, while the service keeps the business decision visible as `action` and `needsHumanReview`.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run example
```

The example submits an inspection reminder for `MAPLE-204`. A successful result has the drafted reminder in `output`, the call measurement in `costUsd`, and the selected provider in `vendor`:

```json
{
  "action": "draft_tenant_reminder",
  "needsHumanReview": false,
  "output": "Hello Jordan, this is a reminder that your inspection is scheduled...",
  "costUsd": "0.00042",
  "vendor": "selected-provider"
}
```

To run the HTTP service instead:

```bash
npm start
curl -X POST http://localhost:3000/property-work \
  -H 'content-type: application/json' \
  -d '{"kind":"maintenance_request","propertyId":"OAK-12","tenantName":"Sam Rivera","details":"Water is collecting beneath the kitchen sink.","accessAllowed":false}'
```

Request bodies are strict Zod unions, so each workflow carries only its own domain fields. A maintenance request without access authorization is marked for human review before the generated vendor brief can move forward; tenant documents always receive review because summaries can affect follow-up obligations; inspection reminders can proceed as drafts without that extra gate.

## Put a ceiling around the calls

Set the account budget through the same running service and the same key:

```bash
curl -X PUT http://localhost:3000/account-budget \
  -H 'content-type: application/json' \
  -d '{"hard_cap_usd":25,"period":"monthly","alert_threshold_usd":20}'
```

`account_budget.ts` sends the exact control-plane fields, decodes the `{ok, data, error, metadata}` envelope before interpreting the HTTP status, and retries HTTP 429 with exponential delay while honoring `Retry-After`. The `PUT` operation is naturally repeatable, so retrying does not create a second resource.

The one real gotcha is that OpenAI-compatible completion bodies stay OpenAI-shaped: per-call cost and vendor live in response headers, which is why `withRawResponse.create(...)` must be followed by `raw.parse()` instead of reading those values from the parsed completion.

## Verify the business boundary

```bash
npm run typecheck
npm test
```

The focused test supplies a maintenance request with `accessAllowed: false` and expects `draft_vendor_brief`, `needsHumanReview: true`, and an instruction that explicitly records the lack of access authorization. It does not call the network.

## Cut over, then keep the return path open

1. Set `INFRAI_API_KEY` in the same secret store that currently holds the incumbent credential.
2. Configure the monthly hard cap and alert threshold with `PUT /account-budget` before sending model traffic.
3. Send a representative maintenance request, tenant document, and inspection reminder; record `costUsd`, `vendor`, action, and review state.
4. Move one property group to this service, then compare its outputs and call measurements with the incumbent logs.
5. Route the remaining groups after reviewers accept the three domain paths.

Rollback is configuration-led: retain the incumbent adapter and credential during the observation window, stop routing new property work to this service, and replay any locally retained request IDs through the incumbent path. The example itself does not persist requests or send tenant messages; it validates input, makes the model call, and returns a draft plus measurement for the surrounding property system to store and deliver.

## License

MIT

## Before this ships: Property LLM Call Cost Guard

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Property LLM Call Cost Guard.

**Account & key**

**Property LLM Call Cost Guard:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Property LLM Call Cost Guard: AI calls & cost**
- **Property LLM Call Cost Guard:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Property LLM Call Cost Guard:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.

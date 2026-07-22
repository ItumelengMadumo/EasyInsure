# EasyInsure Amplify Gen 2

The repository now contains the new Amplify-native application alongside the legacy stack. The legacy `frontend/`, `llm_insurance_backend/`, and Docker files remain temporarily for parity comparison and must not be deployed with the new application.

## Architecture

- React and TypeScript SPA hosted by Amplify Hosting.
- Cognito email authentication with business-role groups defined in `amplify/auth/resource.ts`.
- AppSync and DynamoDB models defined in `amplify/data/resource.ts`.
- Private S3 evidence paths defined in `amplify/storage/resource.ts`.
- A Python 3.12 Lambda containing deterministic insurance calculations.
- Retained, KMS-encrypted dead-letter queue and baseline CloudWatch alarms.

AI output is advisory. No model or deterministic function can approve, reject, price, or pay a claim.

## Local validation

Prerequisites are Node.js 22, npm 10.9.4, Python 3.12, an AWS profile, and access to `us-east-1`.

```powershell
npm ci
python -m unittest discover amplify/functions/insurance-engine -p "test_*.py"
npm run typecheck
npm test
npm run build
npx ampx sandbox --profile <profile>
```

The committed `amplify_outputs.json` is a non-secret placeholder so local type checking succeeds before a sandbox exists. `ampx sandbox` replaces it with real resource endpoints.

## Required production setup

1. Bootstrap the AWS account and connect the repository to Amplify Hosting in `us-east-1`.
2. Create `staging` and `production` branches. Never use a personal sandbox for real claim data.
3. The application stack and durable data are hosted in `us-east-1`. A deployment-time check refuses a different primary region.
4. Bedrock uses the `us-east-1` endpoint with the approved `us.anthropic.claude-haiku-4-5-20251001-v1:0` US inference profile. AWS may route inference among the US destination regions belonging to that profile.
5. Set the approved identifier with `npx ampx sandbox secret set BEDROCK_MODEL_ID` for sandboxes and add the same secret to each hosted branch. Never configure `AWS_BEARER_TOKEN_BEDROCK`; Lambda uses its IAM execution role.
6. Create Cognito staff group memberships through a controlled administrator process. Self-registration never grants a staff role.
7. Configure CloudWatch alarm destinations, AWS Budget notifications, WAF/rate limiting, retention periods, and deletion protection before production.
8. Complete a POPIA impact assessment covering US inference processing and approve evidence/audit retention periods.

## Deliberate rollout boundary

This changeset establishes the deployable foundation, data contract, private uploads, UI, portable calculation engine, DLQ, and alarms. Before production, the next implementation slice must connect the claim command mutations and S3 scan events to a Step Functions workflow, add malware scanning, persist immutable audit events from server-side handlers, and connect the structured Bedrock copilot. Until that slice is complete, the UI submission is suitable for sandbox evaluation only and the legacy application remains the parity reference.

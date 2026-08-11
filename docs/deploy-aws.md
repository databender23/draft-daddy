# Deploy: draftdaddy.databender.co on AWS App Runner

Runbook to put this app at **https://draftdaddy.databender.co** using ECR + AWS App Runner in the
Databender AWS account. Every step is idempotent — re-running a completed step is a no-op or a
harmless UPSERT, so the runbook can be resumed from anywhere after a failure.

Read the whole thing once before running anything. Commands are literal; placeholders are
`<ANGLE_BRACKETED>` and must be substituted. **Account-specific values (account ID, service
ARN, hosted-zone ID, Amplify app ID) live in `docs/deploy.local.md` — gitignored, never
committed. Copy them from there wherever a placeholder appears below.**

> **Legacy domain (2026-08-11 rename):** `draftiq.databender.co` remains associated with the
> service and keeps its Route 53 CNAME so old links resolve; the app itself 301s every
> request on that Host to `https://draftdaddy.databender.co` (see `redirect_legacy_host` in
> `backend/app/main.py`). Do not remove the old association without breaking shared links.

| Fact | Value |
| --- | --- |
| AWS CLI profile | `default` (the `default` profile IS the Databender account `<AWS_ACCOUNT_ID>`; a separate `databender` profile does **not** exist — export `AWS_PROFILE=default`) |
| App Runner service ARN | `<APP_RUNNER_SERVICE_ARN>` (see `deploy.local.md`) |
| Region | `us-east-2` |
| Route 53 hosted zone (`databender.co`) | `<ZONE_ID>` (see `deploy.local.md`) |
| ECR repository | `draft-app` |
| App Runner service | `draft-app` |
| Container port | `8000` |
| Health check path | `/api/health` |
| Size | 0.25 vCPU / 0.5 GB |
| Website Amplify app (source of the Slack webhook value) | `<AMPLIFY_APP_ID>` (us-east-2, see `deploy.local.md`) |

---

## 0. Prerequisites

**0.1 — Website-side prerequisite (do this first).** Draft-app telemetry posts to the marketing
site's `POST /api/analytics/event` with `page: "/draft"`. That endpoint drops any event whose
first path segment is not in `VALID_TOP_LEVEL_SEGMENTS`
(`website_dev/src/lib/analytics/valid-routes.ts`). The one-line allowlist change adding `draft`
must be **merged and deployed to main** (Amplify auto-deploys) or every event is silently
discarded. Verify after the site deploy:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://databender.co/api/analytics/event \
  -H 'content-type: application/json' \
  -d '{"event":{"eventType":"pageview","page":"/draft","referrer":""},
       "visitorId":"deploy-smoke","sessionId":"deploy-smoke-1","device":"desktop"}'
# expect 200. NOTE the shape: the site's route requires visitorId, sessionId and device as
# top-level siblings of the "event" object (a flat AnalyticsEvent body returns 400).
# A 200 with the allowlist missing still happens — confirm in the admin analytics
# dashboard that a /draft row appears.
```

**0.2 — Local tooling.**

```bash
aws --version     # aws-cli/2.x
docker --version  # Docker running (Desktop or colima)
jq --version      # used to build the Route 53 change batch
```

**0.3 — AWS profile.** The `default` profile on this machine IS the Databender account
(`<AWS_ACCOUNT_ID>`) and owns the hosted zone — use `AWS_PROFILE=default`. (A separate
`databender` profile does not exist.) Confirm it can see the zone:

```bash
aws sts get-caller-identity --profile default
aws route53 get-hosted-zone --id <ZONE_ID> --profile default \
  --query 'HostedZone.Name'    # expect "databender.co."
```

**0.4 — Fresh player data in the image.** The image bakes `backend/data/projections.csv` and the
context JSON artifacts. Run the season refresh (`data-pipeline/README.md`) **before** building if
the data is stale — there is no runtime data upload path.

---

## 1. Shell variables

Export these in the terminal you will run the rest of the runbook from. Re-export them if you
open a new shell.

```bash
export AWS_PROFILE=default
export AWS_REGION=us-east-2
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REPO=draft-app
export SERVICE=draft-app
export ZONE_ID=<ZONE_ID>                  # from docs/deploy.local.md
export DOMAIN=draftdaddy.databender.co
export ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO}"
export IMAGE_TAG=$(date +%Y%m%d-%H%M)     # immutable, human-readable tag
echo "$ECR_URI:$IMAGE_TAG"
```

**Secrets.** Copy the Slack webhook value used by the website (same webhook, so draft pings land
in the same channel). Console: Amplify → app `<AMPLIFY_APP_ID>` → Hosting → Environment variables →
`SLACK_WEBHOOK_URL`. Or via CLI:

```bash
aws amplify get-app --app-id <AMPLIFY_APP_ID> --query 'app.environmentVariables' --output json
aws amplify get-branch --app-id <AMPLIFY_APP_ID> --branch-name main \
  --query 'branch.environmentVariables' --output json
```

```bash
export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/<COPY_FROM_AMPLIFY>'
export ANALYTICS_ENDPOINT='https://databender.co/api/analytics/event'
```

Both are optional at runtime — the backend silently skips whichever is unset (that is why local
dev is quiet). Setting them is what turns telemetry on in production.

**Yahoo sync (optional).** To enable the Yahoo provider, also set the credentials from the Yahoo
developer app (registration walkthrough in `yahoo-setup.md`):

```bash
export YAHOO_CLIENT_ID='<from developer.yahoo.com app>'
export YAHOO_CLIENT_SECRET='<from developer.yahoo.com app>'
# YAHOO_REDIRECT_URI is optional — defaults to https://<host>/api/yahoo/callback, which is
# correct for prod. Only set it to override (e.g. a dev HTTPS tunnel).
```

Unset, `/api/yahoo/status` reports `configured:false` and the app runs Yahoo-less. **These are
part of the same `RuntimeEnvironmentVariables` map as the telemetry vars — see the warning in §9:
every deploy must pass the WHOLE map or the omitted vars are cleared.** The Yahoo app's registered
redirect URI must be exactly `https://draftdaddy.databender.co/api/yahoo/callback`.

---

## 2. ECR repository (idempotent)

```bash
aws ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1 \
  || aws ecr create-repository \
       --repository-name "$REPO" \
       --image-scanning-configuration scanOnPush=true \
       --image-tag-mutability MUTABLE \
       --query 'repository.repositoryUri' --output text
```

Optional but recommended — keep storage costs flat by expiring old images:

```bash
aws ecr put-lifecycle-policy --repository-name "$REPO" --lifecycle-policy-text '{
  "rules":[{"rulePriority":1,"description":"keep last 5 images",
            "selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":5},
            "action":{"type":"expire"}}]}'
```

---

## 3. Build and push the image

App Runner runs **linux/amd64**. On an Apple Silicon Mac the `--platform` flag is mandatory —
without it the service fails at deploy time with an exec-format / image-pull error.

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo ~/Databender/Fantasy\ Football/draft-app)"
# build context is the draft-app root (the Dockerfile builds the frontend, then the runtime image)

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker build --platform linux/amd64 -t "${REPO}:${IMAGE_TAG}" .
docker tag "${REPO}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker tag "${REPO}:${IMAGE_TAG}" "${ECR_URI}:latest"
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"
```

Smoke-test the exact image locally before shipping it (amd64 runs under emulation, slowly, but
it does run):

```bash
docker run --rm -p 8000:8000 "${ECR_URI}:${IMAGE_TAG}" &
sleep 8 && curl -s localhost:8000/api/health && curl -s -o /dev/null -w '%{http_code}\n' localhost:8000/
kill %1
```

---

## 4. ECR access role for App Runner (idempotent)

App Runner needs a role it can assume to pull from a private ECR repo. If the account already
has `AppRunnerECRAccessRole` from another service, this step is a no-op.

```bash
cat > /tmp/apprunner-ecr-trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON

aws iam get-role --role-name AppRunnerECRAccessRole >/dev/null 2>&1 \
  || aws iam create-role --role-name AppRunnerECRAccessRole \
       --assume-role-policy-document file:///tmp/apprunner-ecr-trust.json

aws iam attach-role-policy --role-name AppRunnerECRAccessRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess

export ECR_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/AppRunnerECRAccessRole"
```

`attach-role-policy` is idempotent. Note the trust principal is `build.apprunner`, not
`tasks.apprunner` — the latter is for instance roles, which this app does not need (it calls no
AWS APIs at runtime).

---

## 5. Create the App Runner service

The env vars carry the secret, so write the input file with a tight umask and delete it after.

```bash
umask 077
cat > /tmp/apprunner-draft-app.json <<JSON
{
  "ServiceName": "${SERVICE}",
  "SourceConfiguration": {
    "AuthenticationConfiguration": { "AccessRoleArn": "${ECR_ROLE_ARN}" },
    "AutoDeploymentsEnabled": false,
    "ImageRepository": {
      "ImageIdentifier": "${ECR_URI}:${IMAGE_TAG}",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "8000",
        "RuntimeEnvironmentVariables": {
          "ANALYTICS_ENDPOINT": "${ANALYTICS_ENDPOINT}",
          "SLACK_WEBHOOK_URL": "${SLACK_WEBHOOK_URL}"
        }
      }
    }
  },
  "InstanceConfiguration": { "Cpu": "0.25 vCPU", "Memory": "0.5 GB" },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP", "Path": "/api/health",
    "Interval": 10, "Timeout": 5, "HealthyThreshold": 1, "UnhealthyThreshold": 5
  },
  "NetworkConfiguration": { "IngressConfiguration": { "IsPubliclyAccessible": true } }
}
JSON

aws apprunner create-service --cli-input-json file:///tmp/apprunner-draft-app.json \
  --query 'Service.ServiceArn' --output text
```

**Capture the service ARN — every later step needs it.** Either paste the output above or
re-derive it at any time (this is the safe, resumable form):

```bash
export SERVICE_ARN=$(aws apprunner list-services \
  --query "ServiceSummaryList[?ServiceName=='${SERVICE}'].ServiceArn" --output text)
echo "$SERVICE_ARN"
rm -f /tmp/apprunner-draft-app.json /tmp/apprunner-ecr-trust.json
```

Wait for it to come up (3–6 minutes on first create):

```bash
until [ "$(aws apprunner describe-service --service-arn "$SERVICE_ARN" \
        --query 'Service.Status' --output text)" = RUNNING ]; do
  echo "waiting..."; sleep 20
done

export DEFAULT_DOMAIN=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" \
  --query 'Service.ServiceUrl' --output text)
curl -s "https://${DEFAULT_DOMAIN}/api/health"      # {"status":"ok"}
```

If `Status` goes to `CREATE_FAILED`, see Troubleshooting below; fix the cause and re-run
`create-service` after `aws apprunner delete-service --service-arn "$SERVICE_ARN"`.

---

## 6. Associate the custom domain

```bash
aws apprunner associate-custom-domain \
  --service-arn "$SERVICE_ARN" \
  --domain-name "$DOMAIN" \
  --no-enable-www-subdomain
```

Re-running this on an already-associated domain returns
`InvalidRequestException: domain ... already associated` — that is the idempotent no-op; skip to
the next step. Read the records App Runner wants:

```bash
aws apprunner describe-custom-domains --service-arn "$SERVICE_ARN" --output json
```

Two things come out of that response:

- `DNSTarget` — the App Runner endpoint hostname the site's CNAME must point at.
- `CustomDomains[0].CertificateValidationRecords[]` — ACM DNS validation CNAMEs (usually 2).

`Status` starts at `PENDING_CERTIFICATE_DNS_VALIDATION` and becomes `ACTIVE` once the records
resolve.

---

## 7. Route 53 records (idempotent UPSERTs)

This builds the change batch straight from the API response, so there is nothing to transcribe
by hand. It writes both the ACM validation CNAMEs and the `draftdaddy.databender.co` CNAME.

```bash
aws apprunner describe-custom-domains --service-arn "$SERVICE_ARN" --output json > /tmp/cd.json

jq --arg domain "$DOMAIN" '
  {Comment: "draft-app App Runner custom domain",
   Changes: (
     ([.CustomDomains[0].CertificateValidationRecords[]?
       | {Action:"UPSERT", ResourceRecordSet:{
            Name:.Name, Type:.Type, TTL:300, ResourceRecords:[{Value:.Value}]}}])
     + [{Action:"UPSERT", ResourceRecordSet:{
            Name:$domain, Type:"CNAME", TTL:300,
            ResourceRecords:[{Value:.DNSTarget}]}}]
   )}' /tmp/cd.json > /tmp/r53-batch.json

cat /tmp/r53-batch.json      # eyeball it before mutating DNS

aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --change-batch file:///tmp/r53-batch.json --query 'ChangeInfo.Id' --output text
```

Notes:

- `draftdaddy.databender.co` gets a **CNAME**, not an alias — Route 53 has no alias target type for
  App Runner. That is fine because it is a subdomain, not the zone apex.
- `UPSERT` means re-running after a failed association (which mints new validation records) just
  overwrites the stale ones.
- If the zone has a `CAA` record set, it must permit `amazon.com` or ACM validation never
  completes: `aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" --query "ResourceRecordSets[?Type=='CAA']"`.

Wait for the domain to go active (typically 5–20 minutes, occasionally longer):

```bash
until [ "$(aws apprunner describe-custom-domains --service-arn "$SERVICE_ARN" \
        --query 'CustomDomains[0].Status' --output text)" = ACTIVE ]; do
  echo "waiting on cert validation..."; sleep 30
done
rm -f /tmp/cd.json /tmp/r53-batch.json
```

---

## 8. Verify

```bash
# DNS resolves to the App Runner target
dig +short draftdaddy.databender.co

# API health over the custom domain (TLS from ACM)
curl -s https://draftdaddy.databender.co/api/health                     # {"status":"ok"}

# Board data loads (should be a large JSON body, not an error)
curl -s 'https://draftdaddy.databender.co/api/players?scoring=PPR&avg=average' \
  | head -c 200; echo

# SPA shell is served
curl -s -o /dev/null -w '%{http_code}\n' https://draftdaddy.databender.co/     # 200

# Telemetry endpoint always answers 204, never an error
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://draftdaddy.databender.co/api/telemetry \
  -H 'content-type: application/json' \
  -d '{"visitor_id":"smoke","session_id":"smoke-1","referrer":"","screen_width":1440,
       "screen_height":900,"viewport_width":1440,"viewport_height":800,"utm":{}}'   # 204
```

Then confirm the end of the chain by hand:

1. Open https://draftdaddy.databender.co in a real browser (this fires the frontend beacon once).
2. A `🏈 Draft board visitor` message lands in Slack (first sighting of that session id; the
   backend dedupes for 6h in memory, so a reload in the same tab will not re-ping).
3. The visit appears in the site's admin analytics dashboard under `/draft`. If it does not,
   the allowlist change from step 0.1 is not deployed.
4. Toggle light/dark in the app and reload — the theme persists and there is no flash.
5. Run one ESPN sync from the settings drawer against a real league.
6. Provider endpoints answer:

```bash
curl -s https://draftdaddy.databender.co/api/yahoo/status          # {"configured":true} once env vars set, else false
curl -s -o /dev/null -w '%{http_code}\n' https://draftdaddy.databender.co/tap/draftdaddy-espn-tap.user.js  # 200
```

If Yahoo is configured, also click **Connect Yahoo** in Settings once and confirm the popup
completes and the drawer shows "Yahoo connected" (proves the redirect URI + client secret line up).

Logs, when something is off:

```bash
aws logs tail /aws/apprunner/${SERVICE}/<SERVICE_ID>/application --follow --since 15m
aws logs describe-log-groups --log-group-name-prefix /aws/apprunner/${SERVICE}
```

---

## 9. Shipping updates

New data, new frontend, new backend — all the same motion: build, push, deploy.

```bash
export IMAGE_TAG=$(date +%Y%m%d-%H%M)
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
docker build --platform linux/amd64 -t "${ECR_URI}:${IMAGE_TAG}" .
docker tag "${ECR_URI}:${IMAGE_TAG}" "${ECR_URI}:latest"
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"

# point the service at the new tag, then deploy
aws apprunner update-service --service-arn "$SERVICE_ARN" \
  --source-configuration "ImageRepository={ImageIdentifier=${ECR_URI}:${IMAGE_TAG},ImageRepositoryType=ECR,ImageConfiguration={Port=8000}}"

aws apprunner start-deployment --service-arn "$SERVICE_ARN" \
  --query 'OperationId' --output text
```

**Careful:** `update-service --source-configuration` replaces `ImageConfiguration` wholesale, so
omitting `RuntimeEnvironmentVariables` **clears the env vars**. Either keep pushing the same
`:latest` tag and use `start-deployment` alone (no `update-service` needed), or include the env
vars every time:

```bash
aws apprunner update-service --service-arn "$SERVICE_ARN" --source-configuration "$(cat <<JSON
{"ImageRepository":{"ImageIdentifier":"${ECR_URI}:${IMAGE_TAG}","ImageRepositoryType":"ECR",
 "ImageConfiguration":{"Port":"8000","RuntimeEnvironmentVariables":{
   "ANALYTICS_ENDPOINT":"${ANALYTICS_ENDPOINT}","SLACK_WEBHOOK_URL":"${SLACK_WEBHOOK_URL}",
   "YAHOO_CLIENT_ID":"${YAHOO_CLIENT_ID}","YAHOO_CLIENT_SECRET":"${YAHOO_CLIENT_SECRET}"}}}}
JSON
)"
```

**Safest pattern (no secrets typed):** read the live env map, merge in changes with `jq`, and
pass that back — this is exactly how the 2026-08-07 Yahoo deploy set its vars without
transcribing the Slack webhook:

```bash
CUR_ENV=$(aws apprunner describe-service --service-arn "$SERVICE_ARN" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables' --output json)
# add/replace only what you need, keep the rest:
NEW_ENV=$(jq -c --arg id "$YAHOO_CLIENT_ID" --arg sec "$YAHOO_CLIENT_SECRET" \
  '. + {YAHOO_CLIENT_ID:$id, YAHOO_CLIENT_SECRET:$sec}' <<<"$CUR_ENV")
SRC=$(jq -nc --arg img "${ECR_URI}:${IMAGE_TAG}" --argjson env "$NEW_ENV" \
  '{ImageRepository:{ImageIdentifier:$img,ImageRepositoryType:"ECR",ImageConfiguration:{Port:"8000",RuntimeEnvironmentVariables:$env}}}')
aws apprunner update-service --service-arn "$SERVICE_ARN" --source-configuration "$SRC"
```

To deploy a new image while keeping ALL current env vars untouched, use the same snippet with
`NEW_ENV="$CUR_ENV"` (no jq merge) — updating the image tag alone.

Verify what is actually set (this prints the webhook in plaintext — do not paste the output
anywhere):

```bash
aws apprunner describe-service --service-arn "$SERVICE_ARN" \
  --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables'
```

Rollback: point `update-service` at the previous tag (ECR keeps the last 5 per the lifecycle
policy) and `start-deployment` again.

**Hardening (optional).** Runtime env vars are readable by anyone with `apprunner:DescribeService`.
To keep the webhook out of the API response, put it in Secrets Manager and reference it with
`RuntimeEnvironmentSecrets` instead — that requires an *instance* role
(`tasks.apprunner.amazonaws.com` trust) with `secretsmanager:GetSecretValue` on that secret.

---

## 10. Costs

App Runner (us-east-2, 0.25 vCPU / 0.5 GB), approximate:

| Line item | Rate | Monthly |
| --- | --- | --- |
| Provisioned container memory (always billed while the service is not paused) | $0.007 / GB-hr × 0.5 GB | ~$2.55 |
| Active CPU (billed only while requests are being served) | $0.064 / vCPU-hr × 0.25 | pennies at draft-app traffic |
| ECR storage | $0.10 / GB-mo | ~$0.10 (≈1 GB image, 5 kept ⇒ layer-shared) |
| ACM certificate | free | $0 |
| Route 53 | zone already exists | ~$0 |

**Realistic total: about $3/month idle**, a few cents more on draft day. Pausing between seasons
stops the compute meter:

```bash
aws apprunner pause-service  --service-arn "$SERVICE_ARN"    # keeps domain + config
aws apprunner resume-service --service-arn "$SERVICE_ARN"    # ~1-2 min to come back
```

---

## 11. Teardown

In this order (the domain must be disassociated before the service is deleted):

```bash
aws apprunner disassociate-custom-domain --service-arn "$SERVICE_ARN" --domain-name "$DOMAIN"
aws apprunner delete-service --service-arn "$SERVICE_ARN"

# remove the DNS records — same batch as step 7 with Action DELETE (values must match exactly)
aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
  --query "ResourceRecordSets[?contains(Name, 'draftdaddy.databender.co')]"

# optional
aws ecr delete-repository --repository-name "$REPO" --force
aws iam detach-role-policy --role-name AppRunnerECRAccessRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
aws iam delete-role --role-name AppRunnerECRAccessRole
```

Leave the `draft` entry in the website's analytics allowlist — it is inert without the app.

---

## 12. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `CREATE_FAILED`, logs mention exec format or "image manifest" | Built for arm64. Rebuild with `--platform linux/amd64` and push a new tag. |
| Service healthy on the default domain, custom domain stuck `PENDING_CERTIFICATE_DNS_VALIDATION` | Validation CNAMEs missing/typo'd, or a `CAA` record blocks Amazon. Re-run step 7 (UPSERT is safe) and check `dig +short <validation-name> CNAME`. |
| Health check failing | Path must be `/api/health` and the container must listen on 8000. Confirm locally with the same image (step 3). |
| ESPN sync returns 401/404 from the deployed app | Cookies are per-user and travel from the browser per request — nothing server-side to fix. Re-copy `espn_s2`/`SWID`. |
| No Slack ping | `SLACK_WEBHOOK_URL` unset on the service (check with `describe-service`), or the session id was already seen inside the 6h in-memory dedupe window — the window resets on redeploy. |
| Slack pings but nothing in the analytics dashboard | The website allowlist change (step 0.1) is not deployed, or `ANALYTICS_ENDPOINT` is unset. |
| Board renders but every tooltip is empty | `team_context.json` / `player_context.json` were missing at image build time. Rebuild after running the data pipeline. |
| `docker push` denied | ECR login token expired (12h). Re-run `get-login-password | docker login`. |

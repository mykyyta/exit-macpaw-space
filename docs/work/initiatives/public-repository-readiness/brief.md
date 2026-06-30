---
state: complete
owner: Planner
created: 2026-06-30
last_updated: 2026-06-30
---

# Public Repository Readiness Brief

## Purpose

Make the already-public `mykyyta/exit-macpaw-space` repository safe, coherent,
and presentable as a public artifact.

## Outcome Shape

The repository should be understandable from the first GitHub page, have no
known committed secrets, pass the project's normal local validation, avoid
known dependency audit findings where practical, and expose only intentional
infrastructure and project metadata.

## Why This Is Initiative-Scale

This needs multiple ordered packets across dependency hygiene, public-facing
docs, licensing/repository policy, infrastructure disclosure choices, and GitHub
repository settings. Some packets can execute independently, but the final
readiness decision depends on their combined result.

## Scope In

- Resolve current `npm audit` findings with the smallest dependency updates.
- Align public docs with the current **Exit MacPaw Space: Badge Not Found**
  product direction.
- Decide and record repository licensing posture.
- Review and either retain intentionally or generalize public infrastructure
  identifiers in docs/config examples.
- Configure basic GitHub repository metadata and branch hygiene.
- Re-run public-readiness checks and record the final result.

## Scope Out

- Rewriting product direction.
- Rebuilding deployment architecture.
- Restarting the paused production backend.
- Rotating secrets unless a real exposure is found.
- Broad cleanup of old work docs unrelated to public readiness.

## Packet List

| # | Packet | Depends On | Owner | Status |
| --- | --- | --- | --- | --- |
| 1 | Dependency Audit Cleanup | None | Executor | Completed |
| 2 | Public Docs Alignment | None | Executor | Completed |
| 3 | License And Public Policy Decision | User decision | Strategist/Architect + Executor | Completed |
| 4 | Infrastructure Disclosure Review | Architect decision | Architect + Executor | Completed |
| 5 | GitHub Repository Hygiene And Final Readiness Check | Packets 1-4 | Orchestrator/Executor | Completed |

## Packet 1: Dependency Audit Cleanup

Goal: remove current npm audit findings without changing runtime behavior.

Scope in:

- Run `npm audit fix` or equivalent targeted dependency updates.
- Keep changes limited to `package.json` and `package-lock.json` unless a
  package update requires a small compatibility fix.
- Confirm whether remaining advisories are dev-only or runtime-relevant.

Scope out:

- Major dependency migrations.
- Framework changes.
- Feature work.

Likely files:

- `package.json`
- `package-lock.json`

Acceptance criteria:

- `npm audit --omit=dev` has no high or critical runtime findings.
- Prefer `npm audit` clean if achievable without major upgrades.
- `npm run typecheck`, `npm run test:quest`, and `npm run build` pass.

Validation:

- `npm audit`
- `npm audit --omit=dev`
- `npm run typecheck`
- `npm run test:quest`
- `npm run build`

## Packet 2: Public Docs Alignment

Goal: make the GitHub landing docs match the current product.

Scope in:

- Update `README.md` to describe Sofiia, Dan, Hoover, Fixel, bilingual
  voice play, paused production state, local setup, and required env variables.
- Update root `PRODUCT.md` to stop describing the superseded Oleg/Pixel or
  guard/room-voice scenario.
- Keep canonical product detail in `docs/product/product.md`; do not duplicate
  the whole apex into README.
- Ensure docs mention that provider keys stay server-side and `.env` is local.

Scope out:

- Rewriting `docs/product/product.md` unless a contradiction is found.
- Polishing all historical `docs/work/**` records.

Likely files:

- `README.md`
- `PRODUCT.md`
- possibly `docs/readme.md`

Acceptance criteria:

- No current public landing doc describes the old guard/Oleg/Pixel/room-voice
  scenario as current product behavior.
- A new reader can run the project locally from README.
- README clearly says production backend is currently paused.

Validation:

- `git grep -n -I -E 'guard|Oleg|Pixel|room voice' README.md PRODUCT.md`
- `npm run typecheck`

## Packet 3: License And Public Policy Decision

Goal: make the reuse and contribution posture explicit.

Required user decision:

- Choose a license/posture:
  - MIT for permissive reuse.
  - Apache-2.0 for permissive reuse with patent language.
  - No license / all rights reserved for visible source without reuse rights.

Scope in after decision:

- Add `LICENSE` when applicable.
- Add a short README license section.
- Optionally add `SECURITY.md` with "do not report secrets in public issues"
  and private contact guidance if the repo will stay public.

Scope out:

- Legal review beyond choosing a standard posture.
- Contributor governance beyond a minimal note.

Likely files:

- `LICENSE`
- `README.md`
- optional `SECURITY.md`

Acceptance criteria:

- Public reuse posture is explicit.
- README points to the license/posture.

Validation:

- File presence check.
- `git diff --check`

## Packet 4: Infrastructure Disclosure Review

Goal: decide what infrastructure identifiers should remain visible in public
docs and examples.

Scope in:

- Review tracked occurrences of Railway domain, CloudFront URL, custom domain,
  S3 bucket, distribution ID, AWS account ID/ARN, and tested ngrok URLs.
- Keep identifiers that are intentionally public operational references.
- Generalize or remove identifiers that are only internal implementation detail.
- Keep real secrets out of docs and examples.

Scope out:

- Terraform redesign.
- Destroying or recreating infrastructure.
- Secret rotation unless a secret is found.

Likely files:

- `infra/app.tfvars`
- `.github/workflows/deploy-main.yml`
- `docs/build-system/integrations/cloud-deployment.md`
- `docs/build-system/integrations/deployment-options.md`
- `docs/work/initiatives/cloudfront-railway-deploy/status.md`

Acceptance criteria:

- Every public infrastructure identifier left in the repository is intentional.
- `infra/app.tfvars` is either acceptable as a public single-environment config
  or replaced by an example pattern plus ignored local override.
- No secret values are introduced.

Validation:

- `git grep -n -I -E 'arn:aws|cloudfront.net|up.railway.app|mykyyta.link|ngrok-free.dev|AWS_ACCESS_KEY|RAILWAY_TOKEN'`
- `git diff --check`

## Packet 5: GitHub Repository Hygiene And Final Readiness Check

Goal: finish repository-level readiness after file changes land.

Scope in:

- Set repository description and homepage if desired.
- Enable `deleteBranchOnMerge` if desired.
- Decide whether to disable Wiki/Projects for this small project.
- Add branch protection or ruleset for `main` if available on the account.
- Run final secret and build checks.
- Record final readiness status.

Scope out:

- Paid GitHub plan changes.
- CI redesign.
- Re-enabling production deploy.

Acceptance criteria:

- GitHub repo metadata matches the product.
- `main` has an agreed branch hygiene posture.
- Final readiness report lists remaining accepted risks.

Validation:

- `gh repo view mykyyta/exit-macpaw-space --json ...`
- branch protection/ruleset check where available.
- `git status --short --branch`
- `npm audit`
- `npm run typecheck`
- `npm run test:quest`
- `npm run build`

## Open Questions

- Confirm whether future public promotion needs brand, venue, person, or
  generated-audio permission review outside the repository.

## First Execution Unit

All planned packets are complete. Next action is review, commit, and push the
public-readiness changes when accepted.

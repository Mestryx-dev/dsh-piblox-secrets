# Release runbook

Locked model **B** (integration `dev` + dual npm channels). Default branch stays **`master`** (not renamed to `main`).

```text
feature/*
   ↓ PR + CI
dev                     ← integration candidate (Pi / lab)
   ↓ tag vX.Y.Z-next.N
@next                   ← lab Pi install
   ↓ real validation
PR
   ↓
master                  ← releasable
   ↓ tag vX.Y.Z
@latest                 ← stable
```

## Hard rules

1. **No direct development** on `dev` or `master` — only merges via PR (hotfixes allowed as short `fix/*` → PR).
2. **`feature/*` → `dev`** via PR + green CI.
3. **`dev` must not stay weeks divergent** from `master`. After a stable cut: merge `dev` → `master`, publish `@latest`, then **fast-forward `dev` to `master` immediately**.

## CI

- Push / PR targeting `master` or `dev` → `.github/workflows/ci.yml` (`npm test`).

## Publish to npm

Tag must equal `package.json` `version` (with leading `v` on the git tag).

| Git tag | `package.json` version | npm dist-tag |
|---------|------------------------|--------------|
| `v0.3.0-next.1` | `0.3.0-next.1` | `next` |
| `v0.3.0` | `0.3.0` | `latest` |

### Prerelease (`@next`) — from `dev` after merge

```bash
# on a release commit on dev:
# package.json version = 0.3.0-next.1
git tag -a v0.3.0-next.1 -m "v0.3.0-next.1"
git push origin v0.3.0-next.1
```

Pi / lab:

```bash
dsh plugin --profile <name> add dsh-piblox-secrets@next
```

### Stable (`@latest`) — after PR `dev` → `master`

```bash
# on master, version = 0.3.0 (no prerelease suffix)
git tag -a v0.3.0 -m "v0.3.0"
git push origin v0.3.0
# then align integration:
git checkout dev && git merge --ff-only master && git push origin dev
```

Stable install:

```bash
dsh plugin --profile <name> add dsh-piblox-secrets
# or pin: "dsh-piblox-secrets": "^0.3.0"
```

### Prerequisites

- GitHub Actions secret **`NPM_TOKEN`**: npm Automation / Granular token with publish rights.
- First publish claims the package name on that npm account.

### Rollback

- npm versions are immutable. Ship a patch (`0.3.1`) or deprecate: `npm deprecate dsh-piblox-secrets@0.3.0 "reason"`.
- Do not force-delete published tags without coordinating consumers.

## Optional GitHub settings

Recommended (Settings → Branches): protect `master` and `dev` — require PR + status check `test`. Not enforced by this repo’s files alone.

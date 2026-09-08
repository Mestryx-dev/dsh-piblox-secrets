# Release runbook

Trunk-based on `master`. No long-lived `dev` branch.

## CI

- Push / PR to `master` → `.github/workflows/ci.yml` runs `npm test`.

## Publish to npm

1. Bump `version` in `package.json` on `master` (conventional commit, e.g. `chore: release 0.2.2`).
2. Push `master`.
3. Create and push an annotated tag matching that version:

```bash
git tag -a v0.2.2 -m "v0.2.2"
git push origin v0.2.2
```

4. `.github/workflows/publish.yml` runs tests, then `npm publish --access public`.

### Prerequisites

- GitHub Actions secret **`NPM_TOKEN`**: npm Automation or Granular Access Token with publish rights for `dsh-piblox-secrets`.
- First publish claims the package name on the npm account that owns the token.

### Rollback

- npm versions are immutable. Ship a patch release (`0.2.3`) that reverts bad behavior; optionally `npm deprecate dsh-piblox-secrets@0.2.2 "reason"`.
- Do not force-delete tags that already published unless coordinating consumers.

## Lab / Pi install after publish

```bash
dsh plugin --profile <name> add dsh-piblox-secrets
# or pin:
# "dsh-piblox-secrets": "^0.2.1"
```

# Releasing

How to cut a new version of the Zuper Importer wizard.

## Versioning scheme

Semantic versioning under the **0.x** line until the wizard hits a milestone (e.g. used in 10+ real customer onboardings without CSM intervention) — then bump to 1.0.0.

- **Minor** (`v0.4.0 → v0.5.0`) — new features, UX changes, or any user-visible behavioral change
- **Patch** (`v0.4.0 → v0.4.1`) — bug fixes and internal refactors only

## To cut a release

1. In `CHANGELOG.md`, move every entry under `## [Unreleased]` into a new section `## [v0.X.Y] - YYYY-MM-DD`. Leave a fresh empty `## [Unreleased]` header above it.
2. Bump `version` in `package.json` to `0.X.Y`.
3. Commit:
   ```
   git commit -am "Release v0.X.Y"
   ```
4. Tag the release commit and push both:
   ```
   git tag -a v0.X.Y -m "Release v0.X.Y"
   git push origin main v0.X.Y
   ```
5. Verify Vercel auto-deployed the release commit:
   https://vercel.com/dilith-zupers-projects/zuper-importer/deployments

## Rolling back production

**Preferred — Vercel one-click:** Dashboard → Deployments → find the deployment whose commit SHA matches the previous tag → click "Promote to Production". Instant, no rebuild.

**Code rollback (forward-fix):**
```
git revert <bad-sha>
git push origin main
```

Vercel auto-deploys the revert. This is the cleanest option when a release introduces a bug — keeps the tag history intact and audit-friendly.

**Inspect a previous tree locally:**
```
git checkout v0.X.Y
```

## During development

Add Changelog entries as you go — under `## [Unreleased]`, grouped by `### Added` / `### Changed` / `### Fixed` / `### Removed`. At release time, the section is already drafted.

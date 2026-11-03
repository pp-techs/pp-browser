# Changesets

Every change people will notice (CLI, desktop app, or web UI behavior) needs a changeset: a small Markdown file in this folder that names the release type and describes the change in a sentence or two. Create one with:

```bash
vp run changeset
```

Pick `@ppb/cli`, `@ppb/desktop`, or `@ppb/web` (whichever the change is most visible in; the whole workspace releases in lockstep) and the bump:

| Bump    | When                                                                     |
| ------- | ------------------------------------------------------------------------ |
| `patch` | Bug fixes and small improvements                                         |
| `minor` | New features, or (before 1.0) changes that need users to act             |
| `major` | Breaking changes to saved data or behavior, once the project reaches 1.0 |

Write the description for the release notes: what changed for the person using `ppb` or the app, not how it was implemented. Docs, CI, and internal refactors need no changeset.

The release workflow turns pending changesets into a "Version Packages" pull request; merging it releases. See [docs/release-process.md](../docs/release-process.md).

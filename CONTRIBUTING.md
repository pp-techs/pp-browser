# Contributing to pp-browser

Thanks for helping. This guide covers the setup, the checks a change must pass, and how releases work.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Report security problems privately (see [SECURITY.md](SECURITY.md)), not in public issues.

## Set up

Requires [Node.js ≥ 24](https://nodejs.org) and [pnpm](https://pnpm.io) (or the [Vite+ CLI](https://viteplus.dev), `vp`). See [README.md](README.md) for the full quick start.

```bash
git clone https://github.com/pp-techs/pp-browser.git
cd pp-browser
vp install
vp run build
```

## Make a change

1. Branch from `main`.
2. Keep UI copy plain for non-technical users.
3. Run the checks:

   ```bash
   vp check            # format, lint, type check
   vp run -r build     # web UI + CLI bundle + desktop
   ```

4. Exercise the change (`vp run dev:web`, or `cd apps/desktop && pnpm tauri dev`). Use a copy of your data (`PPB_HOME`) for testing, never your real `~/.ppb`.
5. Add a changeset if people using `ppb` or the app will notice the change:

   ```bash
   vp run changeset
   ```

   Pick `@ppb/cli` or `@ppb/desktop`, choose `patch` or `minor`, and describe the change for the release notes. Docs, CI, and internal refactors need no changeset.

6. Open a pull request with a [Conventional Commits](https://www.conventionalcommits.org) title, such as `feat(profiles): import profiles from a JSON file`.

## Releases

Maintainers release by merging the "Version Packages" pull request that the release workflow keeps up to date from pending changesets. The workflow then builds installers for macOS, Windows, and Linux and publishes a GitHub Release. Details: [docs/release-process.md](docs/release-process.md).

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).

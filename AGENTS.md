# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single Vite + React 19 + TypeScript app (`pob-app`) — a Path of Building
style passive skill tree editor built with `@xyflow/react` (React Flow). There is no
backend; everything runs client-side in the browser.

Standard commands live in `package.json` `scripts` (do not duplicate them here):
- `npm run dev` — Vite dev server (see notes below).
- `npm run build` — `tsc -b && vite build` (type-check + production build).
- `npm run lint` — oxlint (config in `.oxlintrc.json`).
- `npm run preview` — serve the production build.

Non-obvious notes:
- Package manager is npm (`package-lock.json`). The update script runs `npm install`, so
  dependencies are already present when a cloud agent starts; you normally do not need to
  reinstall.
- `npm run dev` serves on `http://localhost:5173/` and runs in the foreground — start it in
  a background/tmux terminal, not inline, or it will block the session.
- The dev server binds to localhost only. Use `npm run dev -- --host` if you need to reach
  it from outside the VM.
- Lint uses `oxlint` (the fast Rust linter), not ESLint — there is no `.eslintrc`.
- `tsconfig` requires the `@types/node` dev dependency (used by `vite.config.ts`); a plain
  `tsc` without deps installed will fail.

Hello-world sanity check (no login/secrets required): open the dev server, click "Add Node",
then rename the node and add a training entry in the right-side Inspector panel. Live updates
should appear on both the Inspector and the canvas node.

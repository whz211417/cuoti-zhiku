# Native Windows App Update Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Cuoti Zhiku into a standard current-user Windows app that launches from shortcuts and securely updates itself from signed GitHub Releases after one migration install.

**Architecture:** Tauri 2's official updater plugin owns signature verification, download, and Windows installation. A small TypeScript adapter isolates the native plugin; a controller owns throttling and state; one settings panel renders that state. GitHub Actions creates signed updater artifacts and `latest.json`, while the existing NSIS package remains the first-install and recovery path.

**Tech Stack:** Tauri 2.11.4, `@tauri-apps/plugin-updater` 2.12.0, React 19, TypeScript 5.7, Vitest, Testing Library, GitHub Actions, NSIS.

## Global Constraints

- Preserve every pre-existing uncommitted AI, credential, schema-generation, and Obsidian change; stage only files named by each task.
- Version `0.5.2` is the one-time migration release. It keeps `bundle.windows.nsis.installMode` at `currentUser` so installation stays under `%LOCALAPPDATA%` and does not require administrator privileges.
- The updater endpoint is exactly `https://github.com/whz211417/cuoti-zhiku/releases/latest/download/latest.json` and must remain HTTPS.
- Tauri updater signature verification is mandatory and cannot be bypassed. Never download and execute arbitrary installers through a shell command.
- The updater private key and its password never enter Git, application logs, frontend bundles, release notes, or installer resources.
- No forced updates and no background restart. The user explicitly confirms installation; an unsaved problem draft disables installation.
- Network or updater failure never blocks local study, import, editing, review, export, backup, or application launch.
- SQLite, originals, backups, AI credentials, and user preferences remain in their existing app-data or credential locations; installer migration must not relocate or delete user data.
- The old desktop program directory is never deleted automatically. Cleanup is a separate explicit user action after the new installation and data have been verified.

---

### Task 1: Establish the signed updater trust boundary

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `src/lib/releasePackaging.test.ts`

**Interfaces:**
- Consumes: the generated Tauri updater public key and the fixed GitHub `latest.json` endpoint.
- Produces: registered updater plugin, `updater:default` permission, signed updater artifact configuration, and a committed public verification key.

- [x] **Step 1: Write the failing configuration test**

Extend `src/lib/releasePackaging.test.ts` to parse `tauri.conf.json`, `main.json`, `Cargo.toml`, and `package.json`, then assert:

```ts
expect(config.bundle.createUpdaterArtifacts).toBe(true);
expect(config.plugins.updater.endpoints).toEqual([
  'https://github.com/whz211417/cuoti-zhiku/releases/latest/download/latest.json',
]);
expect(config.plugins.updater.pubkey).toMatch(/^untrusted comment: minisign public key:/);
expect(capability.permissions).toContain('updater:default');
expect(cargo).toContain('tauri-plugin-updater');
expect(pkg.dependencies['@tauri-apps/plugin-updater']).toBe('^2.12.0');
```

- [x] **Step 2: Run the red test**

Run: `npm.cmd test -- --run src/lib/releasePackaging.test.ts`

Expected: FAIL because updater dependencies and configuration do not exist.

- [x] **Step 3: Generate the updater key outside the repository**

Run the Tauri signer with an absolute path under the user's protected Codex state directory, never the worktree:

```powershell
pnpm.cmd tauri signer generate -- -w C:\Users\whz21\.codex\secrets\cuoti-zhiku-updater.key -p $env:CUOTI_UPDATER_KEY_PASSWORD
```

Confirm that the private key is outside the repository. Read only the generated `.pub` value for the next configuration edit. Never print or stage the private key.

- [x] **Step 4: Install and register the official plugin**

Run: `pnpm.cmd tauri add updater`

Pin the frontend dependency to `^2.12.0`, keep the compatible Rust version produced by the Tauri CLI, register:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

Add `updater:default` to `src-tauri/capabilities/main.json`. Set `bundle.createUpdaterArtifacts` to `true`, and add the exact HTTPS endpoint plus the generated public key under `plugins.updater`.

- [x] **Step 5: Verify and commit**

Run the focused test, `npm.cmd run typecheck`, and `npm.cmd run test:rust`. Expected: PASS; private-key scans return no matches.

Stage only Task 1 files and commit `feat: establish signed update trust`.

### Task 2: Isolate updater-native APIs behind a narrow client

**Files:**
- Create: `src/features/settings/updateClient.ts`
- Create: `src/features/settings/updateClient.test.ts`

**Interfaces:**
- Produces: `UpdateClient`, `UpdateDescriptor`, `UpdateProgress`, and `nativeUpdateClient`.

```ts
export type UpdateProgress = { downloaded: number; total: number | null };
export type UpdateDescriptor = {
  version: string;
  notes: string | null;
  downloadAndInstall(onProgress: (progress: UpdateProgress) => void): Promise<void>;
  close(): Promise<void>;
};
export type UpdateClient = {
  getCurrentVersion(): Promise<string>;
  check(): Promise<UpdateDescriptor | null>;
};
```

- [x] **Step 1: Write failing adapter tests**

Mock `@tauri-apps/api/app` and `@tauri-apps/plugin-updater`. Verify current-version forwarding, null when no update exists, normalized notes, cumulative progress from `Started`/`Progress` events, and `update.close()` forwarding.

```ts
expect(progress).toEqual([
  { downloaded: 0, total: 100 },
  { downloaded: 40, total: 100 },
  { downloaded: 100, total: 100 },
]);
```

- [x] **Step 2: Run the red test**

Run: `npm.cmd test -- --run src/features/settings/updateClient.test.ts`

Expected: FAIL because `updateClient.ts` does not exist.

- [x] **Step 3: Implement the adapter**

Import `getVersion` and `check`. Wrap the native `Update` object without exposing it to React. Accumulate `chunkLength`, preserve missing `contentLength` as `null`, and call native `downloadAndInstall` only from the explicit descriptor method.

- [x] **Step 4: Verify and commit**

Run the focused test and typecheck. Stage only the two Task 2 files and commit `feat: add native update client`.

### Task 3: Add deterministic throttling and update state

**Files:**
- Create: `src/features/settings/updatePolicy.ts`
- Create: `src/features/settings/updatePolicy.test.ts`
- Create: `src/features/settings/useUpdateController.ts`
- Create: `src/features/settings/useUpdateController.test.tsx`

**Interfaces:**
- Consumes: `UpdateClient` from Task 2.
- Produces: `shouldRunAutomaticCheck(lastCheckedAt, now)`, `useUpdateController(client, options)`, and the following state contract:

```ts
type UpdateState =
  | { status: 'idle'; currentVersion: string | null; lastCheckedAt: string | null }
  | { status: 'checking'; currentVersion: string | null; lastCheckedAt: string | null }
  | { status: 'current'; currentVersion: string; lastCheckedAt: string }
  | { status: 'available'; currentVersion: string; nextVersion: string; notes: string | null; lastCheckedAt: string }
  | { status: 'downloading'; currentVersion: string; nextVersion: string; progress: UpdateProgress }
  | { status: 'error'; currentVersion: string | null; message: string; lastCheckedAt: string | null };
```

- [x] **Step 1: Write policy tests**

Assert that no prior check is eligible, 23h59m is not eligible, 24h is eligible, invalid stored timestamps are eligible, and time moving backwards is eligible without throwing.

- [x] **Step 2: Write controller tests**

Use a fake client and fake timers. Assert the automatic check runs once after 15 seconds only when eligible; manual check ignores the throttle; concurrent checks coalesce; offline errors remain retryable; unmount closes a retained descriptor.

- [x] **Step 3: Run the red tests**

Run: `npm.cmd test -- --run src/features/settings/updatePolicy.test.ts src/features/settings/useUpdateController.test.tsx`

Expected: FAIL because the modules do not exist.

- [x] **Step 4: Implement policy and controller**

Use local-storage key `cuoti-zhiku:last-update-check`. Write the timestamp only after a completed check response, never after a network error. Store the native descriptor only in a ref and expose serializable state plus `checkNow()` and `install()` actions.

- [x] **Step 5: Verify and commit**

Run focused tests, typecheck, and lint. Commit only Task 3 files as `feat: coordinate low interruption updates`.

### Task 4: Add the About and Update settings panel

**Files:**
- Create: `src/features/settings/UpdatePanel.tsx`
- Create: `src/features/settings/UpdatePanel.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: controller state/actions and `hasUnsavedProblemDraft: boolean`.
- Produces: accessible “关于与更新” settings section with manual check and explicit install.

- [x] **Step 1: Write failing component tests**

Assert current version rendering, “检查更新”, “已是最新版本”, release notes, determinate/indeterminate progress, retryable error, and install disabled with copy `请先保存正在编辑的题目` when dirty.

- [x] **Step 2: Write failing App integration test**

Open settings and assert the new section appears after local-library status and before AI configuration. Verify opening settings does not itself cause a second check when the controller already checked in the background.

- [x] **Step 3: Run red tests**

Run: `npm.cmd test -- --run src/features/settings/UpdatePanel.test.tsx src/app/App.test.tsx`

Expected: FAIL because the panel is missing.

- [x] **Step 4: Implement the compact panel**

Render one quiet row in the existing inspector. Do not create a second modal. Use `aria-live="polite"` for state, a native `<progress>` when total size is known, and existing button tokens. Add no looping animation. Respect reduced motion and reduced transparency through existing global fallbacks.

- [x] **Step 5: Verify and commit**

Run focused tests, typecheck, lint, and a 760px browser screenshot check. Commit Task 4 files as `feat: add in-app update center`.

### Task 5: Prevent updates from interrupting unsaved work

**Files:**
- Modify: `src/features/problems/ProblemDocument.tsx`
- Modify: `src/features/problems/problems.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- `ProblemDocument` gains `onDirtyChange?: (dirty: boolean) => void`.
- Dirty means `editingKind !== null` and the draft differs from the persisted value for that field, or a field/AI save is currently in progress.

- [x] **Step 1: Write failing dirty-state tests**

Assert editing without changing text remains clean, changed text reports dirty, successful save reports clean, switching problems clears dirty, and an in-flight save remains dirty until it settles.

- [x] **Step 2: Run red tests**

Run: `npm.cmd test -- --run src/features/problems/problems.test.tsx src/app/App.test.tsx`

Expected: FAIL because `onDirtyChange` is not supported.

- [x] **Step 3: Implement dirty propagation**

Derive the persisted value from the current `document.fields`; emit changes from an effect and emit `false` during problem cleanup/unmount. App passes the value to `UpdatePanel`. Download may continue, but the install action stays disabled while dirty or saving.

- [x] **Step 4: Verify and commit**

Run focused tests, typecheck, and lint. Commit Task 5 files as `feat: protect drafts during app updates`.

### Task 6: Automate signed GitHub release metadata

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `scripts/verify-release-version.mjs`
- Create: `scripts/verify-release-version.test.ts`
- Modify: `package.json`
- Modify: `src/lib/releasePackaging.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Produces a draft GitHub Release containing NSIS installer, updater signature, `latest.json`, release notes, and SHA-256 for one identical final artifact.

- [x] **Step 1: Write failing version and workflow tests**

Test that the verification script rejects any mismatch among `package.json`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, and the `vX.Y.Z` tag. Test that the workflow is tag-only, has `contents: write`, references both signing secrets, runs all quality gates, and uses `tauri-apps/tauri-action@v0` with `releaseDraft: true`.

- [x] **Step 2: Run red tests**

Run: `npm.cmd test -- --run scripts/verify-release-version.test.ts src/lib/releasePackaging.test.ts`

Expected: FAIL because the script and workflow are missing.

- [x] **Step 3: Implement the verifier and release workflow**

The workflow trigger is:

```yaml
on:
  push:
    tags: ['v*']
permissions:
  contents: write
```

Run pnpm install, version verification, lint, frontend tests, typecheck, Rust tests, and Tauri build. Inject the signing secrets only into the build step. Let `tauri-action` generate the signed updater assets and static JSON, with a draft release requiring human promotion after post-build verification.

- [x] **Step 4: Protect secrets and generated artifacts**

Add updater private-key filenames and local signing output to `.gitignore`. Run a staged-diff scan for private-key headers, GitHub tokens, provider API keys, and updater passwords; expected: no matches.

- [x] **Step 5: Verify and commit**

Run focused tests plus a YAML parse check. Commit Task 6 files as `ci: publish signed desktop updates`.

### Task 7: Build and validate the 0.5.2 migration release

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`
- Modify: `docs/release/windows-installation.md`
- Create: `docs/release/0.5.2.md`
- Create: `docs/verification/2026-09-20-0.5.2-release.md`
- Modify: `docs/superpowers/plans/2026-09-20-native-app-update-delivery.md`

**Interfaces:**
- Produces: one migration installer that establishes the updater trust root and one verified standard Windows installation.

- [x] **Step 1: Set version 0.5.2 consistently**

Update all four version sources, run `node scripts/verify-release-version.mjs --version 0.5.2`, and expect a zero exit code.

- [x] **Step 2: Run the complete quality gate**

Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run test:rust`, and dependency audits. Expected: all tests pass, no new warnings attributable to this work, and no critical/high dependency advisory accepted without documentation.

- [x] **Step 3: Build signed updater artifacts**

Set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only in the build process, then run the fixed GNU Tauri build command. Verify the NSIS installer and matching `.sig` exist and hash the final copied release artifact, not an intermediate file.

- [x] **Step 4: Perform the one-time standard installation**

Back up the current local library first. Stop only the running Cuoti Zhiku process, install 0.5.2 in `currentUser` mode without a custom `/D` desktop path, and verify the installed executable resolves under `%LOCALAPPDATA%`. Verify desktop and Start Menu shortcuts target the new executable. Do not delete `C:\Users\whz21\Desktop\错题智库` automatically.

- [x] **Step 5: Verify launch, data, and updater UI**

Launch from the desktop shortcut. Confirm title, process response, installed file version, `WebView2Loader.dll`, existing courses/problems/materials, and the “关于与更新” state. Use a signed local/static test manifest to verify signature rejection and one successful update simulation without exposing the private key.

- [x] **Step 6: Record evidence and commit**

Write exact counts, file sizes, final SHA-256, installation path, shortcut targets, and every unperformed boundary. Mark all plan checkboxes. Stage only Task 7 files and commit `chore: prepare windows 0.5.2 migration release`.

## Final Review

- [x] Review the full branch diff against the design spec.
- [x] Confirm all unrelated dirty AI, credential, schema, and Obsidian files remain unstaged and unchanged by this plan.
- [x] Confirm no updater private key, password, API key, or GitHub token appears in Git history, frontend assets, logs, release notes, or installer resources.
- [x] Confirm the ordinary launch path is the desktop or Start Menu shortcut, while the installer is documented only for first install, repair, and offline recovery.

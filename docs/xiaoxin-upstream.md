# Xiaoxin downstream boundary

Xiaoxin Workstation is a thin downstream distribution of Interpreter
Workstation. It does not maintain a second agent loop, provider catalog, tool
protocol, approval queue, or local runtime.

## Pinned base

- Upstream: <https://github.com/openinterpreter/interpreter-workstation>
- Company fork: <https://github.com/heropopcorn/xiaoxin-workstation>
- Audited upstream base: `e7318fdfac932463f704ff8ce2cf257cbf0a043b`
- Nested pins at that base:
  - `apps/interpreter-extension`: `0eee03a0f1a58775245377e68067ca2ec74afa34`
  - `apps/interpreter-extension/playwright`: `d36d4155c75471e583b823c8194fc166866da961`
  - `submodules/interpreter-cua`: `c522652d4b11dc9cb50360d0192e7a6e2bab3157`

## OIX runtime source

This repository ships only the prebuilt runtime (`resources/oix/**`,
`VERSION` = `rust-v0.0.34`, fetched by `scripts/download-oix.mjs`). **The
matching OIX source is checked out separately and is available locally.** It is
outside this repository and outside the editor workspace, so a search scoped to
`xiaoxin-workstation` will not find it. Do not conclude from that absence that
the source is unavailable.

- Local checkout: `D:\project\openinterpreter-oix`
- Our fork (`origin`): <https://github.com/heropopcorn/xiaoxin-oix>, branch
  `xiaoxin/rust-v0.0.34`. A depth-1 vendored import of the pinned tag, not a
  full-history fork; upstream's `.github/workflows/` is excluded so its release
  and publish pipelines can never run under our account.
- Upstream (`upstream`): <https://github.com/openinterpreter/openinterpreter.git>
- Pinned at tag `rust-v0.0.34`, upstream commit
  `52a31019714294add53cafbc5268e1467b471263`
- Scale: 2,555 `.rs` files, 1,165,276 lines, 136 crates under `codex-rs/`
- App-server seam implementation: `codex-rs/app-server`,
  `app-server-protocol`, `app-server-transport`
- Harness auto-detect: `default_harness_for_provider_model` in the
  `model-provider-info` crate

Runtime changes belong in that fork, not in this repository.

Building it is verified: `cargo build --release -p codex-cli` with the pinned
1.95.0 toolchain produces a binary that, once renamed to `interpreter.exe`,
satisfies `defaultProbeBinary` in `server/utils/oixRuntime.ts` and is within
11 KB of the shipped release. Product identity is resolved at runtime from the
executable name, not at compile time, so no branding flag is needed. Build
obstacles and their fixes are recorded in
`docs/qa/2026-09-11-oix-selfbuild-and-wire-evidence.md`.

The remaining open question is behavioral reproducibility: the released binary
and this tag show an unexplained difference (no `inference_*` rollout-trace
events on the `stream_chat_completions_compat` path), recorded in
`docs/qa/2026-09-08-oix-provider-tool-audit-handoff.md`.

The parent Xiaoxin repository records the exact downstream commit as a Git
submodule. It must never follow `main` implicitly.

## Xiaoxin-owned files

- `distribution/product.xiaoxin.json`: public product identity and privacy-safe
  service defaults.
- `distribution/electron-builder.xiaoxin.yml`: isolated package identity and
  per-user internal-alpha packaging.
- `scripts/verify-xiaoxin-distribution.mjs`: secret/identity boundary checks.
- `scripts/xiaoxin-windows-gate.ps1`: source/build/manual acceptance evidence.
- `docs/xiaoxin-windows-gate.md`: employee Windows runbook.
- `docs/hosted-gateway/`: Xiaoxin hosted-gateway migration task book. Planning
  and acceptance records only; it must not become a second source of truth for
  application behavior.

The first alpha intentionally reuses the upstream icon assets. Replace those
only after Xiaoxin brand artwork is supplied and reviewed; do not synthesize a
new corporate logo in an implementation change.

## Build

```bash
pnpm run verify:xiaoxin-distribution
pnpm run build:xiaoxin
pnpm run package:smoke:xiaoxin
```

On Windows, build the unsigned per-user NSIS and zip artifacts with:

```powershell
pnpm run package:xiaoxin:windows
```

The overlay contains no model key, company access token, JWT, signing material,
telemetry destination, hosted update feed, or document-engine download source.
Credentials remain user-entered until the separate company-login milestone.

## Upstream updates

1. Fetch upstream into the company fork without changing the parent submodule.
2. Review the complete range from the current audited base to the candidate.
3. Recursively verify all submodule pin changes and license inventory.
4. Run upstream typecheck/unit/Vitest/Electron/package smoke.
5. Run `verify:xiaoxin-distribution` and the employee Windows gate.
6. Merge into the downstream branch, then update the parent gitlink in a
   separate commit with the evidence URL.

Do not patch OIX behavior in this repository. Runtime changes belong in an OIX
fork and must be pinned independently.

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

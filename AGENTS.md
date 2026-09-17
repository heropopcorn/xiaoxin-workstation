# Contributor and agent guidance

These rules are architecture constraints for this repository.

## Canonical checkout guard

This repository is the canonical OSS Workstation application. Before editing
or testing application code, run `git rev-parse --show-toplevel` and verify that
the result is this repository's root. Read every applicable ancestor
`AGENTS.md`; if one marks the checkout as legacy or migration-only, stop. Work
performed or tested in a copied legacy tree is not current Workstation work and
must never be reported as verification of this repository.

The product website is a separate repository. Do not add website source,
website build output, or website release configuration here. This repository
owns the official client configuration, packaging profiles, and client release
workflows as well as all application behavior and tests. A private operations
repository may trigger these workflows or hold deployment credentials,
organization-specific policy, and internal binary artifacts, but it must never
become a second application or owner of canonical client release logic.

## Before changing code

- Use `pnpm` for repository commands.
- Read `README.md` and the relevant document under `docs/` before editing that
  subsystem.
- Verify the canonical checkout guard above before making the first edit or
  running acceptance tests.
- Read `docs/agent-testing.md` before writing or running tests.
- Preserve user work and unrelated changes. Never publish, push, or create a
  public artifact without explicit authorization.

## Product boundaries

- Open Interpreter is the runtime core. Provider/model discovery, harness
  selection, agent execution, and app-server behavior belong there.
- Workstation is a client of the OIX app-server contract. Do not recreate OIX
  provider catalogs or harness logic in the Electron app.
- Model-facing Workstation tools use the `interpreter-app` CLI surface. Do not
  introduce a parallel direct-MCP tool surface for the model.
- File permissions are per agent. Every tool path must enforce the effective
  agent scope, not merely a global workspace setting.
- The community distribution is fully usable without hosted accounts,
  telemetry, or proprietary services.
- Official, internal, community, and enterprise profiles use the same open
  client capabilities. A subscription may authorize operated services; it must
  not unlock a private client feature.
- Distribution-specific endpoints and branding are injected through
  `product.json` overlays. Do not fork application behavior for a distribution.
- Rich document engines are optional external integrations. The default
  document workflow is code execution plus skills.

## Dependencies and provenance

- The OIX runtime source is the pinned submodule `submodules/xiaoxin-oix`
  (`https://github.com/heropopcorn/xiaoxin-oix`, branch `xiaoxin/rust-v0.0.34`),
  matching `resources/oix/VERSION` (`rust-v0.0.34`). Runtime changes belong
  there, not in this repository. A sibling checkout at
  `D:\project\openinterpreter-oix` may exist for local builds; it is the same
  pin. The tree is excluded from editor indexing (`.cursorignore`) so it does
  not drown Workstation searches — that absence is not “source missing”. See
  `docs/xiaoxin-upstream.md`.
- `apps/interpreter-extension` is the Open Interpreter browser-extension
  submodule and retains its independent release history and Playwriter ancestry.
- `submodules/interpreter-cua` is the Open Interpreter computer-use fork and
  retains its upstream attribution. Workstation consumes its pinned driver
  contract; a local checkout name does not imply cloud-provider compatibility.
- Never commit credentials, token backups, signing material, paid SDKs, or
  proprietary binary licenses.

## Forbidden: fake agent fixes

Never replace the model with regex, keyword gates, or hardcoded case
returns. If the model fails to call Computer Use (or any other tool),
fix the real path: tool injection, prompt names matching
`builtin-cua-driver__*`, and the model calling those tools itself.

Do not add intent matchers that run `list_apps` / `get_app_state` /
`type_text` / browser page inspect before the model, then tell the model
the action already happened. Do not expand regex to “cover more
phrasings.” That is fabrication — the same class as
`if (user==XXX) return XXX's data`.

Pass: the model invoked the correct tool and the target OS window
changed. Fail: text appeared because assist typed, or chat claimed
success after a pattern match.

## Code rules

- Prefer the simplest complete structural fix. Do not add compatibility
  fallbacks for obsolete local formats.
- Use Interpreter branding in user-facing copy.
- Route frontend path handling through the helpers in `src/ipc.ts`; read
  `docs/agent-paths.md` before changing path behavior.
- Read `docs/agent-ipc.md` before changing preload, IPC, or subscriptions.
- Read `docs/agent-tools.md` before changing tools, permissions, MCP bridging,
  or native modules.
- Read `docs/agent-frontend.md` before changing UI or interaction behavior.

## Verification

Run checks proportional to the change. The normal pre-commit floor is:

```bash
pnpm typecheck
pnpm run test:unit
pnpm run test:vitest
```

For app-server or bundled-runtime work, also download/build the pinned OIX
runtime and run `pnpm run test:interpreter:smoke`. For Electron behavior, run the
relevant Playwright project. For browser-extension or computer-use changes, test
the real pinned submodule path in addition to unit coverage.

Never claim an end-to-end path works from typechecking alone. Prove the actual
boundary and report any platform or credential-dependent step that was not run.

---
name: computer-use
description: Use this skill when the user asks which desktop apps or windows are open, or needs to inspect, click, type, or fill a native Windows desktop app, browser chrome, OS prompt, file chooser, menu, or hidden/background window. Start with list_apps for inventory. Use get_app_state, then click/type/scroll/drag, and verify with get_app_state again.
---

# Computer Use

This skill is workflow guidance, not a callable tool. Do not call a tool named
`computer-use`; use the actual `builtin-cua-driver` tools described below.

This workflow applies only to desktop GUI discovery and control. Keep using the
ordinary Shell tool for code, files, Git, builds, tests, and command-line
programs; do not route those tasks through Computer Use.

Workstation exposes `builtin-cua-driver` to the model through Interpreter's CLI
transport. In Windows command execution, call the fixed CLI path:

```text
cmd.exe /c "%INTERPRETER_CLI_PATH%" tools builtin-cua-driver <tool-name> --json "<json-object>"
```

Do not use `Start-Process`, shell app launchers, raw Windows UI Automation
scripts, PowerShell window enumeration, or ad hoc Python to inspect or control
desktop GUI state. The builtin driver owns native desktop discovery, capture,
and control.

## Tool Surface

The tool surface is app-scoped and intentionally matches Computer Use:

- `list_apps({})`
- `launch_app({app?, path?, executable?, arguments?, window_style?})`
- `get_app_state({app})`
- `click({app, element_index?, x?, y?, click_count?, mouse_button?})`
- `drag({app, from_x, from_y, to_x, to_y})`
- `press_key({app, key})`
- `scroll({app, element_index, direction, pages?})`
- `set_value({app, element_index, value})`
- `type_text({app, text})`
- `perform_secondary_action({app, element_index, action})`

Use `launch_app` only when the target app is not already open or the user asks
to open it. Start ordinary interaction with `get_app_state({app})` when the
target app is known. Use `list_apps({})` when the user asks which apps or
windows are open, or when the target app name is unclear. Do not enumerate
windows with `Get-Process`, `EnumWindows`, `tasklist`, or other PowerShell.

Do not say `list_apps`, `get_app_state`, or `type_text` are missing before
calling their `interpreter-app tools builtin-cua-driver` subcommands. If the
user already opened a text document window, that is an OS window, not Welcome.md.
Never ask the user to copy-paste, and never use PowerShell `AppActivate`,
`SendKeys`, `FindWindow`, `EnumWindows`, or `Get-Process`. A PowerShell
`MainWindowHandle` of 0 is not a reason to stop.

`get_app_state` returns a screenshot plus a text block shaped like:

```text
Computer Use state (CUA App Version: Interpreter)
<app_state>
App=Notepad (pid 123)
Window: "Untitled - Notepad", App: Notepad.
0 edit (settable, string), Name: Text editor, Value: ...
</app_state>
```

Use displayed `element_index` values only against the same app state. After any
UI-changing action, call `get_app_state({app})` again before reusing indices or
screenshot coordinates.

Electron, Chromium, and web-rendered desktop apps may expose broad `HTML
content`, `webarea`, or sparse UIA nodes instead of a clean settable field for
every visible control. That is still usable Computer Use state, not an
inaccessible app. Use exposed elements when available; otherwise use the
screenshot from `get_app_state`, screenshot coordinates, typing, keys, and a
fresh `get_app_state({app})` verification read. Do not tell the user the app
cannot be accessed just because a control is inside web content.

## Workflow

1. Observe:
   ```text
   cmd.exe /c "%INTERPRETER_CLI_PATH%" tools builtin-cua-driver launch_app --json "{\"app\":\"notepad.exe\",\"window_style\":\"normal\"}"
   cmd.exe /c "%INTERPRETER_CLI_PATH%" tools builtin-cua-driver get_app_state --json "{\"app\":\"Notepad\"}"
   ```
2. Act using an index or screenshot coordinate from that state:
   ```text
   cmd.exe /c "%INTERPRETER_CLI_PATH%" tools builtin-cua-driver click --json "{\"app\":\"Notepad\",\"element_index\":\"0\"}"
   cmd.exe /c "%INTERPRETER_CLI_PATH%" tools builtin-cua-driver type_text --json "{\"app\":\"Notepad\",\"text\":\"hello\"}"
   ```
3. Verify:
   ```text
   cmd.exe /c "%INTERPRETER_CLI_PATH%" tools builtin-cua-driver get_app_state --json "{\"app\":\"Notepad\"}"
   ```

## Choosing Actions

Prefer semantic element actions when `get_app_state` exposes the target:

- Use `click` with `element_index` for buttons, fields, rows, checkboxes, and
  menu-like targets.
- Use `set_value` for deterministic field assignment.
- Use `type_text` only after clicking/focusing the field or after
  `get_app_state` shows a focused editable element.
- Use `scroll` on a scrollable `element_index`; `pages` is a count, not pixels.
- Use `perform_secondary_action` only for actions listed in the state output.
- Use `press_key` for app-level keys such as `Return`, `Tab`, `Escape`,
  `ctrl+s`, or `shift+tab`.

Use screenshot coordinates only when the state image shows a target that UIA
does not expose. Coordinates are pixels in the most recent `get_app_state`
screenshot for that app.

## Browser Content

If Interpreter's browser extension can access the relevant browser tab,
use browser-control for page DOM work. Use Computer Use for browser chrome,
native dialogs, file choosers, permission prompts, menus, downloads UI, and web
content that specifically needs visual or native desktop interaction.

Sparse UIA is not proof that Computer Use is broken. If `get_app_state` returns
a screenshot but few elements, continue with screenshot coordinates or use
browser-control when an accessible browser tab exists. Do not activate the app or use shell
fallbacks unless the user explicitly asked for frontmost/manual desktop
behavior.

## Permissions

If `builtin-cua-driver` reports missing desktop automation or driver
availability, report that exact driver result. Do not claim sandboxing blocks
computer use unless the tool itself reports a sandbox or permission error.

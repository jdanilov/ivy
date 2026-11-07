# UX

How `/ux-check` drives this app and judges its screens. @UxCheck reads it first, and it wins over
the part's defaults. Seeded once by the Factory and owned by the project: `update` never rewrites
it. A line still reading `<…>` counts as absent.

## Driver

- Ready: `<command that exits 0 when the app is reachable>`, else the `e2e.ready` recipe in
  `.factory/factory.yaml`
- Driver: `<bridge base URL and its reference doc>` | `browse <url>` | `none` (static design pass)
- After an edit: `<how to reload the app and confirm the new build is live>`

| Need          | Call |
|---------------|------|
| Open screen   | <…>  |
| Screenshot    | <…>  |
| Hover, focus  | <…>  |
| Layout shift  | <…>  |
| Contrast      | <…>  |
| Theme         | <…>  |
| Type, keys    | <…>  |
| Toasts, logs  | <…>  |
| Persistence   | <…>  |

## Screens

- From a changed file to its screen: <how the code names screens, panels, routes>
- Masters: <screens whose components, density and spacing new work should match>

## Themes

<theme names and how to switch them; absent: light and dark>

## Safety

- <actions that write to real accounts, reach third parties or spend money: never trigger>
- <flags that must hold before touching a risky control>

## Design rules

- <the project's UI rules file; findings cite its rules>

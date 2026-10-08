# ACCA USA Design System

Source of truth for tokens: `src/app/globals.css`. Components: `src/components/ui`.

## Colour
| Token | Use |
|---|---|
| `foreground` / navy `#0b1f3a` | text, structure, **selected/active states** |
| `primary` ACCA red `#c8102e` | primary actions, ACCA, errors (never whole-page fills) |
| `cima` blue `#1e4fc2` | CIMA |
| `fia` green `#0f7b5a` | FIA |
| `success / warning / destructive / info` (+ `-soft`) | status — always with icon or text |
| `muted-foreground` `#475569`, `subtle-foreground` `#64748b` | secondary text (≥ 4.5:1) |
| `app` `#f6f8fb` | shell canvas behind cards |

## Type
`type-display`, `type-h1`–`type-h3`, `type-body`, `type-small`, `type-caption` (13px minimum), `type-eyebrow`. Font: Inter Variable (self-hosted, Latin + Cyrillic + Latin-ext for Uzbek).

## Shape and elevation
Radius scale `sm…2xl` from `--radius: 0.75rem`. Shadows `xs, sm, md, lg`. Borders `--border`, form borders `--input` (3:1).

## Components
Button (variants default/navy/secondary/outline/outline-primary/ghost/destructive/link/cima/fia, sizes sm/default/lg/icon, `loading`), Input/Textarea/Select, Field + form-fields (RHF), Checkbox, Card, Badge, Progress + ProgressRing, Tabs, Dialog (bottom sheet on phones), Sheet, DropdownMenu, Breadcrumbs, Table + DataTable (cards on phones), Skeleton, Alert, EmptyState/ErrorState/LoadingState/PageSkeleton, StatCard, PageHeader, DemoBadge, Avatar, Separator.

## Layout patterns
Public: header + mega menus + footer. App shells: ≥lg navy sidebar, md icon rail, <md top bar + drawer (+ bottom tab bar for students). Focus layout for tests (no navigation).

## Test states
Selected answer = navy border/fill + "Selected". Correct = green + check + "Correct answer". Wrong pick = red + cross + "Incorrect". Never rely on colour alone.

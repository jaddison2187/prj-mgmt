# PRJ_MGMT — Changelog

All changes to this project are documented here.  
Format: `[vX.Y.Z] — YYYY-MM-DD`  
**MAJOR.MINOR.PATCH** — Major = breaking change, Minor = new feature, Patch = bug fix

---

## [v7.2.0] — 2026-02-23

### Added
- **Saint-Gobain: CertainTeed Portfolio** — Imported from exported Google Sheets PM file
  - New `Work` Space added at top level
  - Portfolio: `Saint-Gobain: CertainTeed` inside Work Space
  - 11 Projects imported as separate projects (one per sheet):
    Manufacturing Analysis, PLM, 5S, Automation 300C, NPD Support,
    R&D Support, Laser Torsion Grid, Additional Testing, Bradbury, Meetings, MISC
  - All tasks imported with names, dates, and statuses (X = Done)
  - Objective ID, Task ID, Status column, Hours per Day columns excluded per spec
- **The Void tab** — Graveyard for permanently deleted items
  - All deletions (Space, Portfolio, Project, Task, Subtask) send a record to The Void
  - Shows type badge, name, breadcrumb path, deletion timestamp
  - Search and Purge All controls
  - Red badge on nav showing count of voided items
  - Spaces can be fully restored from The Void
- **Undo system (8x)** — Every delete captures a full state snapshot
  - Banner appears at bottom of screen for 6 seconds after any deletion
  - `↺ Undo` button restores previous state instantly
  - Up to 8 undo steps stacked
- **Capacity Planner view modes**
  - `Week` mode — 1 / 2 / 4 week views with prev/next navigation (existing, enhanced)
  - `Range` mode — custom date from/to picker, up to 90 days
  - `Month` mode — full calendar month with prev/next/this-month navigation
  - Summary card adapts label to active view mode
- **Gantt touch/pinch gestures**
  - One-finger pan — drag left/right to scroll timeline
  - Two-finger pinch — zoom in/out on timeline
  - `touch-action: none` CSS + `gantt-canvas` class for proper mobile handling
- **Teams & Collaborators framework scaffold**
  - Role hierarchy: `viewer → editor → admin → owner`
  - Scope levels: Space / Portfolio / Project
  - `usePermissions` hook and `checkPerm` function ready to wire to auth backend
  - Single-user mode: always grants (no enforcement yet)
  - Full architecture documented in code comments
  - Ready for Supabase/Clerk integration in v2.0
- **Responsive CSS enhancements**
  - Tablet (≤1024px): hours columns hidden, grid simplified
  - Mobile (≤640px): task table becomes card layout, nav labels hidden, padding tightened
  - `overscroll-behavior: none` to prevent bounce on mobile
  - `-webkit-text-size-adjust: 100%` to prevent iOS font scaling

### Fixed
- **Space dropdown** — Now opens rightward from `...` button instead of off-screen left
  - `CtxMenu` component refactored: defaults to `left:0` (opens right)
  - Auto-flip: if menu would overflow right edge of window, switches to `right:0`
  - Applies to all context menus (Space, Portfolio, Project, Task)
- **Gantt `#` icon** — Removed `#` from Gantt nav label, replaced with `~`
- **Gantt filter deselection** — Filters now allow full deselection (empty set = show nothing)
  - Previously forced back to "All" when last item was deselected
- **Garbled icons** — Fixed `?` placeholder characters appearing in:
  - Capacity task/subtask row indent markers (now `–` and `·`)
  - Archived portfolio restore button (now `↺ restore`)
  - Archive tab breadcrumb separator (now `›`)
- **Capacity grid** — Fixed `rangeW*7` hardcoded column count replaced with `displayDates.length`
  - Works correctly for all three view modes (week/range/month)
- **"Save Save Settings" typo** fixed in Data Manager Gist tab
- **v7.1.0 display** — Version now shown under PRJ_MGMT logo (bumped to v7.2.0)

### Changed
- **localStorage key** bumped from `prj_mgmt_0_v7` → `prj_mgmt_0_v71`
- **Auto-migration** — On first load, old keys (`v7`, `v6`, `v5`) are silently deleted
  - Ensures INIT data loads correctly after upgrades, no manual cache clearing needed
- **Data Manager** — Added green AUTO-SAVE CONFIRMATION banner in Gist tab
  - Explains that every change saves to localStorage (1s) and Gist (3s) automatically
- **Export version** bumped from `7` → `71` in JSON and CSV export payloads
- **Nav labels** use `nav-label` CSS class — hidden on mobile (≤640px)

---

## [v7.1.0] — 2026-02-23

### Added
- **Archive tab** — Dedicated tab for finding and restoring all archived items
  - Filter chips: All / Spaces / Portfolios / Projects / Tasks / Subtasks (with counts)
  - Search box filters by name or breadcrumb path
  - Item cards show type badge, name (strikethrough), full breadcrumb, `↺ restore` button
  - Border-left colored by item's original color
  - Empty state messages
- **The Void tab** (initial) — `x The Void` in nav
- **Undo banner** — Fixed-position bottom banner after deletions
- **Responsive CSS** — Initial mobile/tablet breakpoints added
- **Touch CSS** — `gantt-canvas` class with `touch-action: none`

### Fixed
- **Archived Spaces** — Now shown as dimmed tabs in tab bar with `↺` restore button
- **Archived Portfolios** section label fixed ("Archived Spaces" → "Archived Portfolios")
- **Archived Portfolio restore** — Now calls correct `archivePortfolio()` toggle function
- **ActionBtns** — Archive `▽` and delete `x` buttons now have visible borders (cyan/red)
- **Grid column width** — Task/subtask action column widened from 60px → 72px
- **All JSX build warnings** — 11 raw `>` characters replaced with `&gt;` HTML entity
- **Duplicate `background` key** in nav button style removed
- **Space tab bar** — `+ Portfolio` button label corrected to `+ Space`, pushed to far right
- **Space context menu** — Dropdown repositioned to align with `...` button

### Changed
- **Version display** — `v7` → `v7.1.0` shown under PRJ_MGMT logo as two-line stack
- **Nav Gantt icon** — `#` present (fixed in v7.2.0)

---

## [v7.0.0] — 2026-02-22

### Added
- **GitHub Gist sync** — Auto-push to Gist 3 seconds after last change
  - Pull from Gist (with local backup first)
- **Data Manager modal** — Export JSON, Import JSON, Export CSV, Factory Reset, Gist config
- **Vite + React project** — Full build system replacing HTML standalone
- **Vercel deployment** — Live at prj-mgmt-ten.vercel.app
- **GitHub repo** — github.com/jaddison2187/prj-mgmt

### Changed
- **Hierarchy renamed** — Space/Portfolio names swapped at code level
  - Old: Portfolio (top) → Space → Project → Task → Subtask
  - New: Space (top) → Portfolio → Project → Task → Subtask
- **localStorage key** set to `prj_mgmt_0_v7`

### Fixed
- esbuild JSX parser errors resolved
- Vercel build caching issues resolved
- Double-quote artifacts from placeholder-based rename cleaned up

---

## [v6.0.0] — 2026-02-20

### Added
- **Spaces tab redesign** — New sidebar layout with portfolio/project hierarchy
- **Assigned vs Actual hours** tracking (separate fields)
- **Copy/Paste/Clipboard system** — Copy Spaces, Portfolios, Projects, Tasks, Subtasks
- **Capacity Planner enhancements** — Day-detail modal, assigned vs actual bars
- **Calendar integration** — ICS export, shared calendar view
- **GitHub Gist sync layer** (initial scaffold)
- **HTML standalone version** — Single file with React 18 + Babel via CDN
- **DataManager modal** — Export/Import JSON, CSV export, Factory Reset, auto-save

### Changed
- Major rebuild from v5 foundation

---

## [v5.0.0] — 2026-02-15

### Added
- **Full hierarchy** — Portfolio → Space → Project → Task → Subtask (5 levels)
- **Gantt chart** — Multi-select filters, baseline snapshots, drift analysis
- **Capacity Planner** — Weekly heat map, day-detail modal
- **Calendar tab** — Monthly view, task markers
- **Today Focus tab** — Overdue, due today, due within 3 days, flagged items
- **localStorage persistence** — Auto-save on every change
- **INITIAL DATA** — Life OS sample data (Work + Personal portfolios)

---

## File Naming Convention

| File | Version | Notes |
|---|---|---|
| `App_v7.2.0.jsx` | v7.2.0 | Current |
| `App_v7.1.0.jsx` | v7.1.0 | Previous |
| `App.jsx` | legacy | Pre-versioning |

---

## Roadmap (Planned)

- `v7.3.0` — Supabase backend + real auth
- `v7.3.0` — Teams/Collaborators UI (permissions enforcement)
- `v7.4.0` — Mobile card view full implementation
- `v8.0.0` — Multi-user with real-time sync (breaking data schema change)

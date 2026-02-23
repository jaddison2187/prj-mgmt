# PRJ_MGMT Changelog

---

## v7.4.1 — Patch · 2026-02-23

### Fixed
- **Task ASGN column** was a read-only `<div>` showing the auto-computed `hpd × date range` value with no way to override it. Now an editable number input writing to `task.assignedHrs`. The auto-computed value pre-fills the field so it doesn't appear blank, but any typed value overrides it permanently.
- **Task ACTL column** had the same problem — read-only div. Now an editable number input writing to `task.actualHrs`, consistent with how SubRow already worked.
- **Project-level ASGN and ACTL** were plain text labels (`49.0h asgn`, `0.0h actual`) with no input. The project header now has two editable number inputs (ASGN / ACTL) that store values directly on the project object (`proj.assignedHrs`, `proj.actualHrs`). When null the fields default to the bottom-up task rollup sum. A small "tasks rollup: Xh / Yh" line shows the computed total for reference.

### Changed
- `mkProj` factory now includes `assignedHrs: null` and `actualHrs: null` fields so new projects start with clean override slots.
- Project header progress bar repositioned inside the right column to sit flush beneath the hours inputs; a second full-width bar remains below the flex row.

---

## v7.4.0 — Minor · 2026-02-23

### Added
- **Today Focus — subtasks included.** The Focus feed now scans subtasks in addition to tasks. Subtask cards show a purple `subtask` badge and an extended breadcrumb: `Space › Portfolio › Project › Parent Task`. Overdue / due-today / soon / flagged detection runs independently on each subtask's own dates.
- **Today Focus — inline editing.** Every Focus card now has live editable fields: START date, END date, STATUS select, ASGN hours, ACTL hours, and a progress % slider with bar. Edits write directly to the data store without leaving the Focus tab. Done ↔ 100% sync applies here too.
- **Today Focus — "Go to task ↗" button.** Switches to the Spaces tab, selects the correct Space / Portfolio / Project, scrolls to the target task row, and flashes a colored outline highlight for ~2 seconds. For subtask cards the button navigates to the parent task row.

### Changed
- Cross-tab navigation state (`navSpId`, `navPortId`, `navProjId`, `navTaskId`) lifted to `App()` so any tab can trigger deep-link navigation into SpacesTab.
- `SpacesTab` accepts nav props; a `useEffect` consumes them once and clears them to avoid re-triggering.
- `ProjectDetail` accepts `scrollToTaskId` + `onScrollConsumed`; wraps each active TaskRow in a ref-capturing div; calls `scrollIntoView` + outline flash on arrival.

---

## v7.3.1 — Patch · 2026-02-23

### Fixed
- **Progress slider drag-selection highlight.** While dragging the range slider, the browser's HTML5 drag also fired on the `SortableRow` wrapper, triggering the blue dashed `.drag-over` outline on adjacent rows. Fixed by adding `e.stopPropagation()` on slider `mousedown` / `touchstart`, and scoping `user-select: none` to `.sortable-row` via CSS class.
- **Done vs 100% now bidirectionally synced** on both Task rows and Subtask rows:
  - Slider → 100% auto-sets status to **Done**
  - Slider pulled back below 100% on a Done task → auto-sets **In Progress**
  - Status select → **Done** auto-sets progress to 100%

### Improved
- **Gantt mobile / tablet responsiveness:**
  - `LABEL` and chart width (`CW`) scale dynamically with `window.innerWidth`
  - Portrait orientation shows a "rotate to landscape" hint banner (hidden in landscape via CSS media query)
  - Chart wrapped in a horizontal scroll container on mobile so the timeline is never clipped
  - Legend hint text changes to "pinch=zoom  drag=pan" on mobile
  - `resize` + `orientationchange` events trigger a re-measure

---

## v7.3.0 — Minor · 2026-02-23

### Added
- **Project-level baseline snapshots.** "⊙ Snap Baseline" now captures `projectSnapshot` (start, end, status, progress, assignedHrs) alongside all task snapshots.
- **Drift tab — project drift card.** Shows schedule drift, start drift, expected % vs actual %, and a dual-layer progress bar (yellow = baseline, colored = current). Appears above the task drift table.
- **Drift tab — baseline selector.** Dropdown to compare against any saved baseline (Latest / BL1 / BL2 …) when multiple exist.
- **Drift tab — START DRIFT column** added to task table.
- **Baselines tab — PROJECT SNAPSHOT block** inside each collapsible baseline card showing BL start / end / progress / hours and current-vs-baseline comparison.
- **Baselines tab — CURR END column** added to task table so the live date is visible alongside the frozen baseline date.
- **Persistent filter state.** Gantt, Capacity, and Calendar filter state lifted to `App()` — switching tabs never resets filters for the session.
- **Gantt — ↺ Reset All Filters button** inside the filter panel.
- **Capacity — ↺ Reset button** in the controls bar.
- **Calendar — Space filter dropdown** (cascades to Portfolio filter); ↺ Reset button added.

### Changed
- "Snap Snapshot" button renamed to **"⊙ Snap Baseline"**.
- `computeDrift` now accepts an explicit baseline argument (defaults to the most recent one).
- Baseline labels now include the full date (e.g. `BL1 · Feb 23, 26`).

---

## v7.2.0 — Minor · 2026-02-23

### Added
- Saint-Gobain CertainTeed portfolio imported into Work Space (11 projects, 82 tasks).
- **The Void tab** with 8-level undo stack and undo banner.
- Capacity view modes: **Week / Range / Month**.
- Gantt **touch / pinch-to-zoom** gestures.
- Teams / Collaborators framework scaffold.
- Auto-migration system for localStorage keys (`v7 → v71`, self-cleaning on load).

### Fixed
- Space context menu dropdown opening off-screen to the left.
- Gantt baseline bar icon rendering.
- Filter deselection edge cases.
- Duplicate "Save Save" label in header.
- Capacity grid column widths.

### Changed
- `localStorage` key bumped: `prj_mgmt_0_v7` → `prj_mgmt_0_v71`.
- Export version field: `7` → `71`.

---

## v7.1.0 — Minor · 2026-02-23

### Added
- Archive tab.
- The Void tab (initial scaffolding).
- Undo banner.
- Responsive CSS breakpoints.
- Touch event CSS.

### Fixed
- Archived Spaces / Portfolios restore flow.
- `ActionBtns` border styling.
- JSX key warnings.

---

## v7.0.0 — Major · 2026-02-22

### Added
- GitHub Gist sync (load / save / auto-sync on change).
- Data Manager modal (import / export / danger zone).
- Vite + React build pipeline.
- Vercel deployment (`prj-mgmt-ten.vercel.app`).

### Changed
- Full hierarchy rename: Space ↔ Portfolio swap to match mental model.

---

## v6.0.0 · 2026-02-20

### Added
- Spaces redesign with color theming per space.
- Assigned vs Actual hours tracking introduced.
- Copy / paste for tasks and subtasks.
- Calendar ICS export.

---

## v5.0.0 — Initial public version · 2026-02-15

### Added
- 5-level hierarchy: Space → Portfolio → Project → Task → Subtask.
- Gantt timeline with baseline bars.
- Capacity Planner.
- Calendar view.
- Today Focus tab.
- `localStorage` persistence.
- Life OS sample data.

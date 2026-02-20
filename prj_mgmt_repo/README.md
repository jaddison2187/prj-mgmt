# PRJ_MGMT v6

Personal project management app — Spaces → Projects → Tasks → Subtasks, with Gantt, Capacity, Calendar, and GitHub Gist data sync.

---

## ⚡ Open in StackBlitz (instant, no install)

Click this link to open the project live:

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME)

> Replace `YOUR_GITHUB_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub username and this repo's name after you create it.

---

## 🗄️ Data Persistence Setup (GitHub Gist)

Your project data is stored in a **GitHub Gist** — a single JSON file, separate from this code repo. This means:
- Data survives across browsers and devices
- Full revision history (every save is a Gist revision)
- You own and control it entirely

### One-time setup (takes ~5 minutes):

**Step 1 — Create a Personal Access Token**
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it a name like `prj_mgmt_gist`
4. Tick **only** the `gist` scope
5. Click **Generate token** → copy it immediately (shown once only)

**Step 2 — Create a Gist**
1. Go to [gist.github.com](https://gist.github.com)
2. Filename: `prj_mgmt_data.json` (must be exact)
3. Content: `[]`
4. Click **Create secret Gist**
5. Copy the Gist ID from the URL:
   `gist.github.com/your-username/THIS_PART_IS_THE_ID`

**Step 3 — Connect in the app**
1. Open the app → click **⊙ Data** in the top bar
2. Paste your **token** and **Gist ID**
3. Click **Save Settings**
4. Click **↑ Push to Gist** to do the first save

From then on, every edit auto-pushes to Gist within ~3 seconds. The top bar shows `⊙ synced HH:MM` when working.

---

## 🔄 Workflow: Edit code → push to GitHub → see in StackBlitz

1. Open in StackBlitz via the button above
2. Make code changes in StackBlitz
3. StackBlitz → **Connect Repository** → push to this GitHub repo
4. Changes are live immediately next time you open the StackBlitz link

---

## 💾 Data Backup

Even with Gist sync, keep occasional JSON backups:
- **⊙ Data → JSON Backup → Export JSON** — saves a `.json` file
- Store on OneDrive / SharePoint
- To restore: **⊙ Data → JSON Backup → Import JSON**

Gist revision history is also a full changelog:
- Go to your Gist URL → click **Revisions** tab → see every auto-save

---

## 📁 Repo Structure

```
├── index.html          # HTML entry point
├── package.json        # Dependencies (React + Vite)
├── vite.config.js      # Vite config
├── src/
│   ├── main.jsx        # React root mount
│   └── App.jsx         # Entire application (single file)
└── README.md
```

---

## 🏗️ Features

- **Spaces → Projects → Tasks → Subtasks** hierarchy
- Assigned vs Actual hours tracking with roll-up math
- **Gantt** — Q1/Q2/Q3/Q4, year view, zoom/pan, baselines, drift analysis
- **Capacity** — weekly view, Space filter, day-click detail modal
- **Calendar** — project/task items overlaid, GCal/Outlook export, Space filter
- **Today Focus** — overdue, due today, due soon, flagged items
- Copy/paste/drag items across Spaces and Projects
- Archive system (soft delete, fully recoverable)
- Tag system, search, inline editing
- Auto-save to localStorage + GitHub Gist sync
- JSON export/import backup
- CSV export for Excel/Sheets

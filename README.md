# Tracks Scheduler

Homeroom-first stream planner prototype rebuilt as a maintainable React + TypeScript app.

## Run locally

1. Install Node.js 20+
2. Install dependencies
   - `npm install`
3. Start dev server
   - `npm run dev`
4. Open pages
   - Scheduler: `http://localhost:5173/`
   - Scheduler v6: `http://localhost:5173/Tracks-scheduler1/`
   - Admin: `http://localhost:5173/admin/`

## Test

- `npm run test`

## Build

- `npm run build`

## Deployment

GitHub Actions workflow at `.github/workflows/deploy.yml`:

- installs dependencies
- builds with Vite
- deploys `dist/` to GitHub Pages

The Vite `base` is derived from `GITHUB_REPOSITORY`, so it works on project pages.

## Admin dataset controls

- Admin page is published at `/admin/` (project pages: `https://alishsayd.github.io/Tracks-scheduler/admin/`).
- Scheduler v6 page is published at `/Tracks-scheduler1/` (project pages: `https://alishsayd.github.io/Tracks-scheduler/Tracks-scheduler1/`).
- Settings persist to browser `localStorage`.
- Click `Apply` in admin, then refresh the scheduler page to load the new dataset.

## Project structure

- `src/App.tsx`: main UX shell and orchestration
- `src/domain/constants.ts`: static domain constants
- `src/domain/data.ts`: seeded mock data + stream-group builder
- `src/domain/rules.ts`: matching and labeling rules
- `src/domain/planner.ts`: core planner/movement logic
- `src/domain/i18n.ts`: English/Arabic copy
- `src/domain/planner.test.ts`: domain tests
- `src/styles/app.css`: UI styling

## Safety

`*.rtf` is ignored in `.gitignore` so local planning docs are never pushed.

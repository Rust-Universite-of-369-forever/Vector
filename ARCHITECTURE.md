# Vector architecture

The application is organized by responsibility instead of keeping storage, business rules, Firebase, UI rendering and event handlers in one file.

## Structure

- `src/main.js` — application bootstrap only.
- `src/firebase.js` — Firebase initialization.
- `src/analytics.js` — Vercel Analytics initialization.
- `src/core/`
  - `state.js` — current authenticated user and current page.
  - `storage.js` — localStorage adapter and user-scoped keys.
  - `repository.js` — access to profile, habits, goals and journal data.
- `src/services/`
  - `auth.js` — Firebase Auth operations.
  - `event-log.js` — application event log.
  - `progress.js` — streaks, points, levels, statistics and achievements.
  - `csv-export.js` — CSV generation/export.
- `src/ui/`
  - `app-shell.js` — navigation, layout and page router.
  - `auth-view.js` — login/register screen.
  - `pages/` — one module per application page.
- `src/utils/`
  - `date.js` — date helpers.
  - `dom.js` — safe HTML escaping, toast and visual helpers.

## Data compatibility

The localStorage key format remains `vector_<entity>_<uid>`, so existing local data continues to work after the refactor.

## Dependency direction

Pages depend on repositories/services/utils. Services can depend on core and utils. Core does not depend on UI. `main.js` only wires the application together.

# Vector

Vector is a Vite + Firebase self-development app for goals, habits, journaling and progress tracking.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the module structure and dependency rules.

The refactor keeps the existing `localStorage` key format, so current user data remains compatible.

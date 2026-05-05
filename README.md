# Race Control

Next.js frontend plus the canonical FastAPI backend used by local development,
CI, and production deployment.

## Source Of Truth

- Frontend app: `C:\Users\Tech\Desktop\Alex Racing\apps\frontend`
- Backend app: `C:\Users\Tech\Desktop\Alex Racing\apps\frontend\backend`

If you still have a sibling folder at `C:\Users\Tech\Desktop\Alex Racing\apps\backend`,
treat it as a deprecated local leftover and do not edit or run it.

## Install

```bash
npm install
```

## Run Frontend Only

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## Run Backend Only

```bash
npm run dev:backend
```

The backend will be available at `http://127.0.0.1:8000`.

## Run Frontend And Backend Together

```bash
npm run dev:full
```

## Build

```bash
npm run build
npm run start
```

## Notes

- Local, CI, and deploy should all use the backend inside this repo.
- The local `/api/v1` rewrite proxies to `http://127.0.0.1:8000` by default.
- Vercel should point `NEXT_PUBLIC_API_URL` at the deployed Render API URL.

# SM Racing Backend Architecture

This backend now runs on **FastAPI** and **PostgreSQL**.
The earlier Node.js, Express, and MongoDB implementation has been removed so the
project has one clear backend stack for ongoing development and testing.

## Target Stack

- **API framework:** FastAPI
- **Database:** Neon-hosted PostgreSQL
- **Data access:** Relational models and SQL-based persistence
- **Validation:** Pydantic schemas
- **Security:** Token-based authentication, role-based access control, and input validation
- **Performance:** Query optimization and indexing for reporting and analysis workloads

## Runtime Status

The FastAPI application under `app/` is the only backend runtime in this
repository. Legacy Node.js / Express / MongoDB folders have been deleted from
the backend workspace.

## Core Modules

- Authentication
- Events
- Run groups
- Drivers
- Vehicles
- Submissions

## Architecture Goals

- Use a relational data model instead of document-based storage
- Keep business rules close to the API layer and service layer
- Support race data tracking, comparisons, and reporting
- Maintain clean separation between API routes, services, models, and schemas
- Prepare the backend for future analytics and performance-focused features

## Development Direction

All future backend work should follow the FastAPI and PostgreSQL architecture.
Any new endpoints, services, or database structures should be designed with
normalization, validation, security, and long-term maintainability in mind.

## Source Of Truth

In this workspace, the live local backend runtime currently sits in the sibling
folder `..\backend`, while the Git-tracked backend lives in this repository at
`backend\`.

Until the project is migrated to a single repository root, treat:

- `C:\Users\Tech\Desktop\Alex Racing\apps\backend` as the local runtime source
- `C:\Users\Tech\Desktop\Alex Racing\apps\frontend\backend` as the pushable mirror

Before committing backend changes from the live runtime folder, sync them into
this tracked copy with:

```powershell
powershell -ExecutionPolicy Bypass -File .\backend\scripts\sync_runtime_backend.ps1
```

The sync is intentionally non-destructive. It copies new and changed files from
the runtime backend without deleting repo-only files such as tests and
developer tooling.

## Project Structure

```text
app/
  core/          settings, database, enums, security
  models/        SQLAlchemy relational models
  schemas/       Pydantic request/response schemas
  api/
    deps.py      auth and database dependencies
    v1/
      api.py     versioned router assembly
      endpoints/ auth, events, run groups, drivers, vehicles, submissions
  services/      business logic helpers
  main.py        FastAPI application entrypoint
```

## Local Run

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL` to your Neon connection string and `JWT_SECRET_KEY`
3. Optionally set `MAKE_WEBHOOK_URL` to forward each saved submission to Make.com
4. Install dependencies with `pip install -r requirements.txt`
5. Apply the PostgreSQL schema with `alembic upgrade head`
6. Start the API with `uvicorn app.main:app --reload`

The API will be available at `http://127.0.0.1:8000`.

## Render Deployment

Use these values when creating the Render Web Service:

- **Root directory:** `backend`
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT"`
- **Python version:** `3.11.11`

Set these environment variables on Render:

- `DATABASE_URL` - your PostgreSQL connection string
- `JWT_SECRET_KEY` - a long random secret
- `ENVIRONMENT` - `production`
- `CORS_ORIGIN_REGEX` - `^https://.*\.vercel\.app$`
- `MAKE_WEBHOOK_URL` - optional Make.com custom webhook endpoint for structured submission forwarding

If you prefer to lock CORS to a single frontend URL, set `CORS_ORIGINS` instead of `CORS_ORIGIN_REGEX`.

## Migration Note

SM Racing no longer uses Mongoose models, Express routers, or MongoDB
connection code in this backend project. FastAPI, SQLAlchemy, Alembic, and
PostgreSQL are now the canonical application and data stack.

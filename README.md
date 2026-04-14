# Classroom Interaction App

A Next.js App Router project for classroom sessions, polls, questions, and role-based access control. Data is stored in SQLite.

## Requirements

- Node.js 20+
- pnpm
- Docker and Docker Compose if you want to deploy with containers

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the app:

```bash
pnpm run dev
```

Run the database migration locally:

```bash
pnpm run migrate
```

The migration command creates or updates the SQLite schema, seeds the default admin account, and writes credentials to the local [.auth](.auth) file.

## Default Admin Account

The migration step creates the default administrator account with username `lucky` and a random password.

- The password is written to [.auth](.auth)
- The same credentials are printed to the console during migration

## Docker Deployment

The Docker setup stores the SQLite database in `./data/app.db` and keeps the generated admin credentials in [.auth](.auth).

1. Install dependencies once on the host if needed:

```bash
pnpm install
```

2. Run the migration container first so the database schema and admin credentials are created:

```bash
docker compose --profile migrate run --rm migrate
```

3. Start the application container:

```bash
docker compose up -d --build nextjs-app
```

4. Open the app in your browser and sign in with the credentials from [.auth](.auth).

If you need to re-run the migration later, run the same migrate command again. The migration is idempotent and will keep the schema state in sync.

## Useful Scripts

- `pnpm run dev` - start the development server
- `pnpm run build` - build the application
- `pnpm run start` - start the production server
- `pnpm run lint` - run ESLint
- `pnpm run typecheck` - run TypeScript checks
- `pnpm run migrate` - run SQLite migration and admin bootstrap

## UI Components

To add a shadcn component, run:

```bash
npx shadcn@latest add button
```

Import it like this:

```tsx
import { Button } from "@/components/ui/button"
```

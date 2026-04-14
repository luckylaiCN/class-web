---
description: "Use when implementing data persistence, API data access, schema changes, or database setup in this project. Enforce SQLite as the only database engine."
name: "SQLite Database Rule"
applyTo:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "lib/**/*.ts"
  - "lib/**/*.tsx"
  - "**/*.sql"
---
# SQLite Database Guidelines

- Use SQLite as the only database engine for this project.
- Do not introduce PostgreSQL, MySQL, SQL Server, MongoDB, Redis, or cloud database dependencies unless the user explicitly asks for migration.
- Keep connection configuration local-first and file-based (for example, a local `.db` file path from environment variables).
- Keep schema and SQL syntax compatible with SQLite.
- Prefer simple migrations that can run in local development without extra infrastructure.
- When proposing Docker changes, do not add external database services for default development.
- If a requested feature appears to require non-SQLite capabilities, provide a SQLite-compatible alternative first and explain trade-offs.

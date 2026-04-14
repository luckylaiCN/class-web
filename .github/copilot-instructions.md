# Project Guidelines

## Architecture
- This is a Next.js App Router project using TypeScript and shadcn/ui.
- Core directories:
  - `app/`: routes, layout, and global styles.
  - `components/`: reusable components, with shadcn UI components in `components/ui/`.
  - `lib/`: shared utilities such as className helpers.
  - `hooks/`: custom React hooks.
- Keep UI primitives aligned with existing shadcn patterns instead of introducing a parallel component system.

## Build and Validate
- Install dependencies with `pnpm install`.
- Start dev server with `pnpm run dev`.
- Use `pnpm run lint` for lint checks.
- Use `pnpm run typecheck` for TypeScript validation.
- Use `pnpm run build` before finalizing significant changes.
- This repository currently has no automated test setup; do not invent test commands.

## Conventions
- Use the existing alias imports (`@/components`, `@/lib`, `@/hooks`) from `tsconfig.json` and `components.json`.
- Use `cn()` from `lib/utils.ts` for className composition.
- When creating interactive components, add `"use client"` explicitly; default to Server Components when interactivity is not needed.
- Follow existing shadcn style conventions in `components/ui/button.tsx` (CVA variants, Slot composition when needed).
- Keep Tailwind utility usage consistent with project style and let Prettier + `prettier-plugin-tailwindcss` handle ordering.

## Documentation Links
- Project starter context and shadcn usage: see `README.md`.

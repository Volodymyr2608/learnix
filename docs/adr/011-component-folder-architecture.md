# ADR-011: Component Folder Architecture

- **Status**: Accepted
- **Date**: 2026-05

## Context

As components grow they accumulate local types, hooks, sub-components, and utility functions. Keeping everything in a single `.tsx` file makes the file hard to navigate and blurs the boundary between rendering code and logic. At the same time, a flat directory of many `.tsx` files in one folder makes it unclear which pieces belong to which component.

`AIChatBuilderDialog` is the reference implementation of the pattern adopted here.

## Decision

Any component that owns more than one of the following — local types, a custom hook, a sub-component, a helper/utility function, a constant, or a type guard — must be promoted from a single file to a **component folder**.

### Folder structure

```
ComponentName/
├── index.tsx                   # default export: the component itself
├── types.ts                    # all TypeScript types local to this component
├── components/                 # sub-components used only here
│   └── SubComponent/
│       ├── index.tsx
│       └── types.ts            # (optional — only if the sub-component has its own types)
├── hooks/                      # custom React hooks
│   └── useXxx.ts
├── helpers/                    # pure functions (no React, no side effects)
│   └── xxxHelper.ts
├── utils/                      # stateful or async utilities (e.g., fetch wrappers)
│   └── xxxUtil.ts
├── constants/                  # static data / configuration objects
│   └── xxx.ts
└── guards/                     # TypeScript type guard functions
    └── isXxx.ts
```

Only the folders that are actually needed are created — no empty directories.

### Rules

1. **`index.tsx` is the only public surface.** Importers always reference `ComponentName` (resolves to `ComponentName/index.tsx`), never a deep path like `ComponentName/hooks/useXxx`.

2. **Types are co-located.** Component-local types live in `types.ts` next to `index.tsx`. Types shared across multiple top-level components live in `server/entities/` (server) or a shared `types/` directory (client).

3. **Hooks extract all stateful logic.** If a component needs `useMutation`, `useQuery`, or multi-step `useState`, the logic moves to a named hook in `hooks/`. The component body becomes a thin renderer.

4. **Helpers are pure.** Anything in `helpers/` must be a plain function with no React imports, no side effects, and no async operations. This makes them trivially testable.

5. **Sub-components live in `components/`.** Any JSX extracted for readability that is not reused elsewhere goes in `components/SubComponent/index.tsx`. If the sub-component is simple enough to have no types, a `types.ts` is not required.

6. **No nested ternaries in JSX.** Extract conditional rendering to a dedicated sub-component or use early returns. This is what motivated the split of `AttemptBadge` out of `QuestionCard`.

### Single-file exception

A component that is truly self-contained — one default export, no extracted hooks, no sub-components, no local helpers — stays as a single `.tsx` file. Do not create a folder just to hold `index.tsx`.

## Consequences

**Positive**
- Each file has a single responsibility; reviewers know where to look for logic vs. rendering vs. types.
- Hooks and helpers can be read and reasoned about in isolation without parsing JSX.
- Sub-components are discovered by directory structure, not by scrolling.
- The pattern scales: a growing component adds a new file to the right folder rather than growing a single file unboundedly.

**Negative / Trade-offs**
- More files per feature — the folder tree is deeper than a flat directory.
- Relative imports (`../../types`) can be verbose; the convention of referencing only `index.tsx` from outside mitigates cross-component coupling.

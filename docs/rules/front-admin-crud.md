# Rule: Front admin CRUD pages

> Scope: `front/src/app/admin/**` (list+create+edit+delete pages over a REST
> resource). Every new admin entity page must follow this.

A new admin page is **config, not copy-paste**. The list/create/save/delete
state machine lives once in [`front/src/lib/useCrud.ts`](../../front/src/lib/useCrud.ts);
pages own only their entity-specific form fields and JSX.

## 1. Use `useCrud`, never re-roll the state

`const c = useCrud<Entity>("/api/entities")` gives you `items`, `loading`,
`error`, `reload`, and the full mutation surface (`create`/`save`/`remove` with
`creating`/`saving`/`deletingId` flags, `createError`/`editError`/`deleteError`,
and `editId`/`startEdit`/`cancelEdit`). Do **not** hand-write `useState` +
`useEffect` + try/catch handlers per page — that is the duplication this hook
removed (residents/cameras/guardians, #202).

- `create(body)` / `save(id, body)` return `Promise<boolean>` (true on success),
  reload the list, and — for `save` — close the edit form. Reset your local
  create-form fields in `if (ok) { … }`.
- `remove(id)` removes the row optimistically (no reload).
- Korean error fallbacks (`생성/저장/삭제에 실패했습니다`) are built in.

## 2. Pages keep only form-field state

Entity-specific `create*`/`edit*` input values stay as local `useState` in the
page. `startEdit` sets those fields, then calls `c.startEdit(id)`.

## 3. Co-loaded reference data = a second `useCrud`

Need another list for a dropdown (e.g. residents in the camera/guardian pages)?
Add a second instance — `const res = useCrud<Resident>("/api/residents")` — and
combine flags: `const loading = c.loading || res.loading`. Don't reach back to
`Promise.all` + manual state.

## 4. Behavior-preserving by construction

`useCrud` is covered by a smoke test (`front/src/lib/useCrud.test.ts`). Changes
to the shared CRUD semantics must keep that green.

> Not yet abstracted: the page chrome (header + admin nav + loading/error
> blocks) is still duplicated per page. An `<AdminShell>` wrapper was
> deliberately deferred (#202) — extract it only when a 4th admin page makes the
> copy cost real.

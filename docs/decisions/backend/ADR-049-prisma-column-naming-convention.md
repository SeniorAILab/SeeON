# ADR-049: Prisma column naming convention

## Status

Accepted

## Date

2026-06-18

## Context

The backend Prisma schema bridges TypeScript application code and PostgreSQL storage. TypeScript code is idiomatic with camelCase fields, while PostgreSQL tables and columns are idiomatic with snake_case identifiers.

Without one convention, schema additions can mix database casing styles, leak database naming into service code, or force avoidable churn when SQL and Prisma code disagree about identifier names.

## Decision

Use camelCase Prisma model fields and snake_case database tables/columns across all backend tables.

Concretely:

- Prisma model field names are camelCase for TypeScript usage.
- Database column names are snake_case.
- Use `@map("snake_case_column")` whenever a Prisma field maps to a differently named database column.
- Use `@@map("snake_case_table")` whenever a Prisma model maps to a differently named database table.
- Relation field names stay idiomatic camelCase in Prisma; relation scalar columns still map to snake_case database columns.
- New migrations must preserve this convention rather than introducing mixed-case database identifiers.
- Existing tables should be brought into this convention when touched by schema refactors, without changing product semantics.

## Alternatives Considered

### Use snake_case in Prisma fields

- Pros: one visible name matches the database identifier.
- Cons: makes TypeScript application code less idiomatic and spreads database naming into services and DTO mappers.
- Rejected: Prisma is the TypeScript application boundary and should expose TypeScript-friendly field names.

### Use camelCase database columns

- Pros: avoids `@map` on fields.
- Cons: conflicts with common PostgreSQL conventions and makes raw SQL, RLS policies, and operational inspection less idiomatic.
- Rejected: database identifiers should remain snake_case.

### Allow each table to choose its own convention

- Pros: lowest short-term migration pressure.
- Cons: creates long-lived schema inconsistency and review ambiguity.
- Rejected: schema naming is cheap to standardize now and expensive to reverse later.

## Consequences

- Prisma code remains idiomatic TypeScript while PostgreSQL remains idiomatic SQL.
- Schema review can mechanically reject mixed-case database identifiers and unmapped camelCase columns.
- Raw SQL, RLS policy, and migration authors can rely on snake_case table and column names.
- Prisma schema additions may need explicit `@map` and `@@map` annotations even when the model field names are already clear.

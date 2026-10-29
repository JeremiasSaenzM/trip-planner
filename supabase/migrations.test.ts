import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// `supabase db reset` (what CI's db-tests job runs) always starts from an
// empty database and applies supabase/seed.sql only after every migration
// has run -- so a migration's own bulk UPDATE/DELETE against a table that
// already has real rows is never actually exercised in CI; it matches
// nothing there, and the change_log audit trigger (change_log_capture(),
// 20261012131400_change_log.sql) that requires app.change_reason/app.actor
// to be set never fires. The only way such a bug surfaces is against a
// database that already has rows -- in practice, production
// (20261029090100_locations_backfill.sql, 2026-10-29).
//
// This doesn't run the migrations or a real database -- it's a cheap,
// static policy check: a migration's own top-level (not inside a `create
// function` body, which only runs later when the app calls it) UPDATE or
// DELETE is required to have set app.change_reason or app.actor earlier in
// the same file, so the next such backfill fails this check locally and in
// CI's vitest job (seconds, no Docker) instead of against real data.
//
// Scope, recorded here because this is where the next person will look:
// this catches the missing-reason symptom only. A migration's actual match
// and dedup semantics against real, messy data (e.g. the trim-based name
// matching and merge-notice logic in the locations backfill) remain
// unexercised by any test -- db reset still migrates an empty database and
// seeds afterward, so a correct-looking backfill could still misjoin or
// silently merge rows it shouldn't, and nothing here or in CI would know.
// Counted across every migration ever written (2026-10-29): exactly one has
// ever performed a top-level UPDATE/DELETE against pre-existing rows --
// locations_backfill, and it failed the only time it ran against real data.
// One for one is not a reassuring rate. A harness that runs a migration
// against an already-populated database (not this file, and not attempted
// here) is required before the next migration that writes to existing
// rows -- the remaining locations migrations (dropping the old text
// columns, timezone NOT NULL) are DDL that touches no rows, so nothing is
// blocked yet, but the harness needs to exist before the next one that is.

const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

// Blanks out (not removes, so line numbers in a failure message stay
// right) a `--` line comment's own text -- prose like "update below" or
// "delete from this table first" would otherwise read as real SQL.
function stripLineComments(sql: string): string {
  return sql.replace(/--.*$/gm, (match) => " ".repeat(match.length));
}

// Removes `create [or replace] function ... as $$ ... $$` bodies -- that
// SQL only runs later, when the app calls the function, not when this
// migration is applied. Left in place (not removed): a bare `do $$ ... $$`
// block, which -- unlike a function body -- executes immediately when the
// migration runs. Non-greedy so a file defining several functions doesn't
// have everything between the first "create function" and the last "$$"
// collapsed into one body.
function stripFunctionBodies(sql: string): string {
  return sql.replace(/\bcreate\s+(?:or\s+replace\s+)?function\b[\s\S]*?\$\$[\s\S]*?\$\$/gi, (match) =>
    // Keep line numbers meaningful in a failure message: blank out
    // everything except the newlines the matched span already contained.
    match.replace(/[^\n]/g, " "),
  );
}

function lineOf(sql: string, index: number): number {
  return sql.slice(0, index).split("\n").length;
}

describe("migration policy: a reason before any backfill write", () => {
  for (const file of migrationFiles()) {
    it(`${file} sets app.change_reason/app.actor before its first top-level UPDATE or DELETE, if it has one`, () => {
      const raw = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      const topLevel = stripFunctionBodies(stripLineComments(raw));

      // "update"/"delete" as a bare DML statement always names a real
      // table next; "create trigger ... before/after insert or update [or
      // delete] on <table>" is the one other place those words appear,
      // always followed by "on" or chained with "or" rather than a table
      // name -- skipped explicitly so a real write later in the same file
      // still gets found, not just the first (non-)match given up on.
      const candidates = [...topLevel.matchAll(/\b(update|delete\s+from)\s+(\w+)/gi)];
      const writeMatch = candidates.find((m) => !["on", "or"].includes(m[2].toLowerCase()));
      if (!writeMatch) {
        return; // Nothing in this migration touches existing rows directly.
      }

      const reasonMatch = /set_config\(\s*'app\.(change_reason|actor)'/i.exec(topLevel);
      const reasonSetBeforeWrite = reasonMatch !== null && reasonMatch.index < writeMatch.index;

      expect(
        reasonSetBeforeWrite,
        `${file}:${lineOf(topLevel, writeMatch.index)} has a top-level "${writeMatch[0]}" with no ` +
          `set_config('app.change_reason', ...) (or 'app.actor') earlier in the file -- the change_log audit ` +
          `trigger will refuse it the moment it runs against a table that already has rows.`,
      ).toBe(true);
    });
  }
});

import "server-only";
import { GLOSSARY_LIMITS } from "@lct/protocol";
import { pool } from "@/lib/db";

/** Glossary storage. Every query is scoped by user_id, so users only ever touch their own terms. */

export interface GlossaryEntry {
  id: string;
  term: string;
}

export async function listGlossary(userId: string): Promise<GlossaryEntry[]> {
  const { rows } = await pool.query(
    `SELECT id, term FROM glossary_term WHERE user_id = $1 ORDER BY lower(term) LIMIT $2`,
    [userId, GLOSSARY_LIMITS.maxTerms],
  );
  return rows.map((row) => ({ id: row.id, term: row.term }));
}

export type AddResult = "added" | "duplicate" | "full";

export async function addGlossaryTerm(userId: string, term: string): Promise<AddResult> {
  // Count and insert in one statement so two quick requests can't push the list past the limit.
  const { rowCount } = await pool.query(
    `INSERT INTO glossary_term (user_id, term)
     SELECT $1, $2
     WHERE (SELECT count(*) FROM glossary_term WHERE user_id = $1) < $3
     ON CONFLICT (user_id, lower(term)) DO NOTHING`,
    [userId, term, GLOSSARY_LIMITS.maxTerms],
  );
  if (rowCount === 1) return "added";
  const { rows } = await pool.query(`SELECT 1 FROM glossary_term WHERE user_id = $1 AND lower(term) = lower($2)`, [userId, term]);
  return rows.length > 0 ? "duplicate" : "full";
}

/** Deletes only if the term belongs to this user. */
export async function removeGlossaryTerm(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM glossary_term WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rowCount === 1;
}

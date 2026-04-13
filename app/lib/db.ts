import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function sql() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL!);
  }
  return _sql;
}

export async function initSchema() {
  await sql()`
    CREATE TABLE IF NOT EXISTS kids (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      age INT,
      gender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql()`
    CREATE TABLE IF NOT EXISTS interactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id TEXT NOT NULL DEFAULT 'default',
      kid_id UUID REFERENCES kids(id),
      conversation_id UUID,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      search_context TEXT,
      response_latency_ms INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

export async function createKid(name: string, age?: number, gender?: string) {
  const rows = await sql()`
    INSERT INTO kids (name, age, gender)
    VALUES (${name}, ${age ?? null}, ${gender ?? null})
    RETURNING *
  `;
  return rows[0];
}

export async function listKids() {
  return sql()`SELECT * FROM kids ORDER BY created_at`;
}

export async function logInteraction(data: {
  kid_id?: string;
  conversation_id?: string;
  question: string;
  answer: string;
  search_context?: string;
  response_latency_ms?: number;
}) {
  const { kid_id, conversation_id, question, answer, search_context, response_latency_ms } = data;
  await sql()`
    INSERT INTO interactions (kid_id, conversation_id, question, answer, search_context, response_latency_ms)
    VALUES (
      ${kid_id ?? null},
      ${conversation_id ?? null},
      ${question},
      ${answer},
      ${search_context ?? null},
      ${response_latency_ms ?? null}
    )
  `;
}

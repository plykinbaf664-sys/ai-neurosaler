// Optional isolated PostgreSQL/WASM check; does not use credentials or a live database.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role;");
  for (const file of (await readdir("supabase/sql")).filter(name => name.endsWith(".sql")).sort()) {
    // gen_random_uuid is built into modern PostgreSQL. The production extension stays unchanged.
    const sql = (await readFile(`supabase/sql/${file}`, "utf8")).replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
  }
  await db.exec(await readFile("supabase/sql/014_journey_and_audit.sql", "utf8"));
  const { rows: [lead] } = await db.query("insert into leads (telegram_user_id, telegram_chat_id) values (1, 1) returning id");
  await db.query("select record_user_activity($1)", [lead.id]);
  await db.query("select record_user_activity($1)", [lead.id]);
  let profile = (await db.query("select * from user_library_profiles where user_id=$1", [lead.id])).rows[0];
  assert.equal(profile.active_days, 1);
  await db.query("update user_library_profiles set last_active_date = last_active_date - 1 where user_id=$1", [lead.id]);
  await db.query("select record_user_activity($1)", [lead.id]);
  assert.equal((await db.query("select active_days from user_library_profiles where user_id=$1", [lead.id])).rows[0].active_days, 2);
  const grants = await Promise.all(Array.from({ length: 5 }, () => db.query("select grant_user_reward($1, 'first_step', '{}') as granted", [lead.id])));
  assert.equal(grants.filter(result => result.rows[0].granted).length, 1);
  const material = (await db.query("select id from library_materials where is_active limit 1")).rows[0];
  await Promise.all(Array.from({ length: 3 }, () => db.query("select complete_library_material($1,$2)", [lead.id, material.id])));
  assert.equal(Number((await db.query("select count(*) as n from user_events where user_id=$1 and event_name='material_completed'", [lead.id])).rows[0].n), 1);
  await db.query("update library_progress set status='opened' where user_id=$1", [lead.id]);
  assert.equal((await db.query("select status from library_progress where user_id=$1", [lead.id])).rows[0].status, "completed");
  await db.query("update user_library_profiles set last_interaction_at=now()-interval '3 days', next_followup_due_at=now()-interval '2 days' where user_id=$1", [lead.id]);
  profile = (await db.query("select * from user_library_profiles where user_id=$1", [lead.id])).rows[0];
  const claims = await Promise.all(Array.from({ length: 3 }, () => db.query("select claim_library_followup($1,$2,$3,$4) as claimed", [lead.id, profile.next_followup_due_at, new Date(), profile.last_interaction_at])));
  assert.equal(claims.filter(result => result.rows[0].claimed).length, 1);
  await db.query("update leads set audit_request=$2,audit_requested_at=now() where id=$1", [lead.id, "Проверочный запрос на аудит"]);
  assert.equal((await db.query("select audit_request from leads where id=$1", [lead.id])).rows[0].audit_request, "Проверочный запрос на аудит");
  assert.equal((await db.query("select has_function_privilege('anon','public.record_user_activity(uuid)','execute') as allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select has_function_privilege('service_role','public.record_user_activity(uuid)','execute') as allowed")).rows[0].allowed, true);
  console.log("All migrations applied; 014 is repeatable. Activity, durable intake, single award, single reminder claim and RPC permissions passed.");
} finally { await db.close(); }

/**
 * The work exchange.
 *
 * Everywhere else in this app the database holds one operator's own record.
 * Here it holds a board they share, so two things are true that are not true
 * anywhere else: the rows belong to other people, and the rules about who may
 * read them are enforced by Postgres rather than by this file.
 *
 * That is deliberate. Nothing here decides who sees what - the policies in
 * supabase/schema.sql do, and a mistake in this file cannot widen them. What
 * this file does is ask the right questions and give the screen something it
 * can render.
 */

import { supabase } from "./supabaseClient";

export type PostKind = "give_away" | "want" | "swap";
export type PostStatus = "open" | "claimed" | "settled" | "withdrawn";
export type ClaimStatus = "offered" | "accepted" | "declined" | "withdrawn";

export interface ExchangePost {
  id: string;
  owner: string;
  kind: PostKind;
  workDate: string;
  paddle: string | null;
  onTime: string | null;
  offTime: string | null;
  garage: string | null;
  note: string | null;
  status: PostStatus;
  claimCount: number;
  createdAt: string;
  /** Filled from the operator directory, which carries no contact details. */
  ownerName: string | null;
  ownerNumber: string | null;
}

export interface ExchangeClaim {
  id: string;
  postId: string;
  claimant: string;
  note: string | null;
  status: ClaimStatus;
  createdAt: string;
  claimantName: string | null;
  claimantNumber: string | null;
}

/** The other party's details, once an offer has been accepted. */
export interface ExchangeContact {
  fullName: string | null;
  operatorNumber: string | null;
  contact: string | null;
  contactKind: "phone" | "text" | "email" | null;
}

export interface NewPost {
  kind: PostKind;
  workDate: string;
  paddle?: string | null;
  onTime?: string | null;
  offTime?: string | null;
  garage?: string | null;
  note?: string | null;
}

/**
 * Raised when the exchange tables are not there yet.
 *
 * The schema has to be run by hand in the Supabase SQL editor, so between
 * deploying this code and running it the tables genuinely do not exist. That
 * is worth saying in those words rather than showing a Postgres error about
 * a missing relation.
 */
export class ExchangeNotSetUpError extends Error {}

/** Raised when the operator has an account but has not been approved. */
export class NotApprovedError extends Error {}

interface Postgrestish {
  code?: string;
  message?: string;
}

/**
 * Codes meaning "that does not exist here yet".
 *
 * Postgres raises 42P01/42883 for a missing table or function, but PostgREST
 * answers most of these itself out of its schema cache and returns its own
 * codes instead - and it uses a different one for a function (PGRST202) than
 * for a table (PGRST205). Handling only the table code is why a database
 * without the exchange looked half-there: the table calls were recognised and
 * the is_approved() call was not, so the calendar believed the exchange was
 * fine and offered buttons that could not work.
 */
const NOT_SET_UP = new Set([
  "42P01", // undefined_table
  "42883", // undefined_function
  "PGRST202", // function not found in schema cache
  "PGRST205", // table not found in schema cache
  "PGRST200", // relationship not found in schema cache
]);

function rethrow(error: unknown): never {
  const e = (error ?? {}) as Postgrestish;
  if (e.code && NOT_SET_UP.has(e.code)) {
    throw new ExchangeNotSetUpError(
      "The work exchange tables have not been created yet. Run " +
        "supabase/schema.sql in the Supabase SQL editor.",
    );
  }
  throw error instanceof Error ? error : new Error(String(error));
}

/** Whether this operator has been let onto the board. */
export async function isApproved(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_approved");
  if (error) rethrow(error);
  return data === true;
}

interface DirectoryRow {
  id: string;
  full_name: string | null;
  operator_number: string | null;
}

/**
 * Names for a set of operator ids.
 *
 * Fetched separately rather than joined, because the directory is a view over
 * profiles and PostgREST cannot embed it without a declared relationship. Two
 * small queries are also easier to reason about than one clever one.
 */
async function directory(ids: string[]): Promise<Map<string, DirectoryRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("operator_directory")
    .select("id, full_name, operator_number")
    .in("id", unique);
  if (error) rethrow(error);
  return new Map((data ?? []).map((r) => [r.id, r as DirectoryRow]));
}

interface PostRow {
  id: string;
  owner: string;
  kind: PostKind;
  work_date: string;
  paddle: string | null;
  on_time: string | null;
  off_time: string | null;
  garage: string | null;
  note: string | null;
  status: PostStatus;
  claim_count: number;
  created_at: string;
}

function toPost(r: PostRow, who: Map<string, DirectoryRow>): ExchangePost {
  const d = who.get(r.owner);
  return {
    id: r.id,
    owner: r.owner,
    kind: r.kind,
    workDate: r.work_date,
    paddle: r.paddle,
    onTime: r.on_time,
    offTime: r.off_time,
    garage: r.garage,
    note: r.note,
    status: r.status,
    claimCount: r.claim_count,
    createdAt: r.created_at,
    ownerName: d?.full_name ?? null,
    ownerNumber: d?.operator_number ?? null,
  };
}

/**
 * The board.
 *
 * Withdrawn posts and days already past are left out - a board is a list of
 * work someone can still take, and yesterday's is neither.
 */
export async function listPosts(fromDate: string): Promise<ExchangePost[]> {
  const { data, error } = await supabase
    .from("exchange_posts")
    .select("*")
    .neq("status", "withdrawn")
    .gte("work_date", fromDate)
    .order("work_date", { ascending: true });
  if (error) rethrow(error);
  const rows = (data ?? []) as PostRow[];
  const who = await directory(rows.map((r) => r.owner));
  return rows.map((r) => toPost(r, who));
}

/**
 * This operator's own live post for a date, if there is one.
 *
 * Asked by the calendar before offering to post a day, so a day already on
 * the board says so rather than offering to put it there twice. Withdrawn
 * and settled posts are not live: a day given away and then taken back can
 * be offered again.
 */
export async function myPostFor(dateStr: string): Promise<ExchangePost | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from("exchange_posts")
    .select("*")
    .eq("owner", uid)
    .eq("work_date", dateStr)
    .in("status", ["open", "claimed"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) rethrow(error);
  const rows = (data ?? []) as PostRow[];
  if (rows.length === 0) return null;
  const who = await directory([rows[0].owner]);
  return toPost(rows[0], who);
}

export async function createPost(post: NewPost): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const { error } = await supabase.from("exchange_posts").insert({
    owner: uid,
    kind: post.kind,
    work_date: post.workDate,
    paddle: post.paddle || null,
    on_time: post.onTime || null,
    off_time: post.offTime || null,
    garage: post.garage || null,
    note: post.note || null,
  });
  if (error) rethrow(error);
}

export async function withdrawPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from("exchange_posts")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) rethrow(error);
}

export async function settlePost(postId: string): Promise<void> {
  const { error } = await supabase
    .from("exchange_posts")
    .update({ status: "settled", updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) rethrow(error);
}

export async function offerOn(postId: string, note: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("exchange_claims")
    .insert({ post_id: postId, claimant: uid, note: note || null });
  if (error) rethrow(error);
}

interface ClaimRow {
  id: string;
  post_id: string;
  claimant: string;
  note: string | null;
  status: ClaimStatus;
  created_at: string;
}

/**
 * Every offer this operator can see: the ones they made, and the ones made on
 * their own posts. The policy decides which those are, not this query.
 */
export async function listMyClaims(): Promise<ExchangeClaim[]> {
  const { data, error } = await supabase
    .from("exchange_claims")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) rethrow(error);
  const rows = (data ?? []) as ClaimRow[];
  const who = await directory(rows.map((r) => r.claimant));
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    claimant: r.claimant,
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
    claimantName: who.get(r.claimant)?.full_name ?? null,
    claimantNumber: who.get(r.claimant)?.operator_number ?? null,
  }));
}

/** Accepting one offer settles the post and declines the rest. */
export async function acceptClaim(
  claimId: string,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from("exchange_claims")
    .update({ status: "accepted" })
    .eq("id", claimId);
  if (error) rethrow(error);

  const { error: others } = await supabase
    .from("exchange_claims")
    .update({ status: "declined" })
    .eq("post_id", postId)
    .neq("id", claimId)
    .eq("status", "offered");
  if (others) rethrow(others);

  const { error: post } = await supabase
    .from("exchange_posts")
    .update({ status: "claimed", updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (post) rethrow(post);
}

export async function declineClaim(claimId: string): Promise<void> {
  const { error } = await supabase
    .from("exchange_claims")
    .update({ status: "declined" })
    .eq("id", claimId);
  if (error) rethrow(error);
}

export async function withdrawClaim(claimId: string): Promise<void> {
  const { error } = await supabase
    .from("exchange_claims")
    .update({ status: "withdrawn" })
    .eq("id", claimId);
  if (error) rethrow(error);
}

/**
 * The other party's contact details.
 *
 * Nothing else in this file can return these. The function checks in the
 * database that the caller is one of the two people on an accepted offer, so
 * asking for someone else's claim id answers with nothing.
 */
export async function contactFor(claimId: string): Promise<ExchangeContact | null> {
  const { data, error } = await supabase.rpc("exchange_contact", {
    claim: claimId,
  });
  if (error) rethrow(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    fullName: row.full_name ?? null,
    operatorNumber: row.operator_number ?? null,
    contact: row.contact ?? null,
    contactKind: row.contact_kind ?? null,
  };
}

export interface MyContact {
  contact: string;
  contactKind: "phone" | "text" | "email" | "";
}

export async function loadMyContact(): Promise<MyContact> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return { contact: "", contactKind: "" };
  const { data, error } = await supabase
    .from("profiles")
    .select("contact, contact_kind")
    .eq("id", uid)
    .maybeSingle();
  if (error) rethrow(error);
  return {
    contact: data?.contact ?? "",
    contactKind: (data?.contact_kind as MyContact["contactKind"]) ?? "",
  };
}

export async function saveMyContact(c: MyContact): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const { error } = await supabase
    .from("profiles")
    .update({ contact: c.contact || null, contact_kind: c.contactKind || null })
    .eq("id", uid);
  if (error) rethrow(error);
}

export function kindLabel(kind: PostKind): string {
  return kind === "give_away"
    ? "Giving away"
    : kind === "want"
      ? "Looking for work"
      : "Swap";
}

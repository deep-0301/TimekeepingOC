import { createClient } from "@supabase/supabase-js";

// The anon key is a public, client-safe credential (not a secret) - access
// control is enforced by row-level security policies on the tables, not by
// hiding this key. See supabase/schema.sql for the RLS setup this relies on.
const SUPABASE_URL = "https://nxjpabakfubquvnyyirs.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54anBhYmFrZnVicXV2bnl5aXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MzgwMjAsImV4cCI6MjEwMDMxNDAyMH0.xmKG_tkrxA4q--SK_UsW9j09jE2lNwmJ-SmxtGZEP6A";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

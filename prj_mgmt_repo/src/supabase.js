// ============================================================
// SUPABASE BACKEND FRAMEWORK (scaffolded for future use)
// ============================================================
// To activate:
//   1. npm install @supabase/supabase-js
//   2. Create a project at supabase.com (free tier)
//   3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
//   4. Run the SQL in /supabase/schema.sql to create tables
//   5. Set USE_SUPABASE = true
// ============================================================

export const USE_SUPABASE = false; // flip to true when ready

const SUPABASE_URL  = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON = "YOUR_ANON_KEY";

// Lazy init - only loads the library if USE_SUPABASE is true
let _sb = null;
const sb = async () => {
  if(!USE_SUPABASE) return null;
  if(_sb) return _sb;
  const { createClient } = await import("@supabase/supabase-js");
  _sb = createClient(SUPABASE_URL, SUPABASE_ANON);
  return _sb;
};

// ---- AUTH -------------------------------------------------------
export const signUp   = async (email, password) => {
  const client = await sb();
  if(!client) return { error: "Supabase not enabled" };
  return client.auth.signUp({ email, password });
};

export const signIn   = async (email, password) => {
  const client = await sb();
  if(!client) return { error: "Supabase not enabled" };
  return client.auth.signInWithPassword({ email, password });
};

export const signOut  = async () => {
  const client = await sb();
  if(!client) return;
  return client.auth.signOut();
};

export const getUser  = async () => {
  const client = await sb();
  if(!client) return null;
  const { data } = await client.auth.getUser();
  return data?.user ?? null;
};

// ---- DATA SYNC --------------------------------------------------
// Replaces the current GitHub Gist sync layer
// portfolios = the full JSON state array

export const pushData = async (userId, portfolios) => {
  const client = await sb();
  if(!client) return false;
  const { error } = await client
    .from("user_data")
    .upsert({ user_id: userId, data: portfolios, updated_at: new Date().toISOString() });
  return !error;
};

export const pullData = async (userId) => {
  const client = await sb();
  if(!client) return null;
  const { data, error } = await client
    .from("user_data")
    .select("data")
    .eq("user_id", userId)
    .single();
  return error ? null : data?.data;
};

// ---- FILE ATTACHMENTS -------------------------------------------
// Requires a "attachments" bucket in Supabase Storage

export const uploadFile = async (userId, taskId, file) => {
  const client = await sb();
  if(!client) return null;
  const path = `${userId}/${taskId}/${file.name}`;
  const { data, error } = await client.storage.from("attachments").upload(path, file, { upsert: true });
  if(error) return null;
  const { data: urlData } = client.storage.from("attachments").getPublicUrl(path);
  return { url: urlData.publicUrl, label: file.name, type: "file", path };
};

export const deleteFile = async (path) => {
  const client = await sb();
  if(!client) return;
  await client.storage.from("attachments").remove([path]);
};

// ---- CALENDAR SHARING -------------------------------------------
// Creates a shared calendar link anyone can view (read-only)

export const createSharedCalendar = async (userId, events, label) => {
  const client = await sb();
  if(!client) return null;
  const shareId = crypto.randomUUID();
  const { error } = await client.from("shared_calendars").insert({
    id: shareId,
    owner_id: userId,
    label,
    events: JSON.stringify(events),
    created_at: new Date().toISOString(),
    expires_at: null  // null = never expires; set a date to auto-expire
  });
  if(error) return null;
  return `${window.location.origin}/shared/${shareId}`;
};

export const getSharedCalendar = async (shareId) => {
  const client = await sb();
  if(!client) return null;
  const { data, error } = await client
    .from("shared_calendars")
    .select("*")
    .eq("id", shareId)
    .single();
  return error ? null : data;
};

// ---- INVITES / COLLABORATION ------------------------------------
// For future: invite others to view or edit a portfolio

export const inviteCollaborator = async (portfolioId, email, role = "viewer") => {
  // role: "viewer" | "editor"
  const client = await sb();
  if(!client) return null;
  const { data, error } = await client.from("invites").insert({
    portfolio_id: portfolioId,
    invited_email: email,
    role,
    accepted: false,
    created_at: new Date().toISOString()
  });
  return error ? null : data;
};

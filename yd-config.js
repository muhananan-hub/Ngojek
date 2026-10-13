/* Isi dengan Project URL dan anon/publishable key dari Supabase.
   Jangan pernah memasukkan service_role key ke file frontend. */
window.YD_SUPABASE_URL = "https://igxwfvlapkanllhuydwp.supabase.co";
window.YD_SUPABASE_ANON_KEY = "sb_publishable_X4KmRGsYfDRj5LmbCpD6LQ_ylK9nk1v";
window.ydSupabase = (window.supabase && window.supabase.createClient &&
  !window.YD_SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !window.YD_SUPABASE_ANON_KEY.includes("YOUR_SUPABASE"))
  ? window.supabase.createClient(window.YD_SUPABASE_URL, window.YD_SUPABASE_ANON_KEY)
  : null;

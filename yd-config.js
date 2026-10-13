
/* YourDriver — Supabase configuration */
window.YD_SUPABASE_URL =
  "https://igxwfvlapkanllhuydwp.supabase.co";

/* Ganti dengan Publishable key asli dari Supabase */
window.YD_SUPABASE_ANON_KEY =
  "sb_publishable_X4KmRGsYfDRj5LmbCpD6LQ_ylK9nk1v";

(() => {
  const path = window.location.pathname;

  const appType = path.includes("/admin/")
    ? "admin"
    : (
        path.includes("/driver/") ||
        path.endsWith("/recruitment.html")
      )
      ? "driver"
      : "customer";

  const configured =
    window.supabase &&
    window.supabase.createClient &&
    window.YD_SUPABASE_URL.startsWith("https://") &&
    !window.YD_SUPABASE_ANON_KEY.includes("TEMPEL_");

  if (!configured) {
    window.ydSupabase = null;
    return;
  }

  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  };

  // Pelanggan tetap menggunakan penyimpanan sesi default
  // agar sesi Pelanggan yang sudah ada tidak sengaja dipindahkan.
  if (appType === "driver") {
    options.auth.storageKey = "yd-driver-auth";
  } else if (appType === "admin") {
    options.auth.storageKey = "yd-admin-auth";
  }

  window.ydSupabase = window.supabase.createClient(
    window.YD_SUPABASE_URL,
    window.YD_SUPABASE_ANON_KEY,
    options
  );
})();

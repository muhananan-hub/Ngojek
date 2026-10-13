
/* Ngojek — Supabase configuration */
window.YD_SUPABASE_URL =
  "https://igxwfvlapkanllhuydwp.supabase.co";

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
    typeof window.supabase?.createClient === "function" &&
    /^https:\/\/.+\.supabase\.co$/.test(
      window.YD_SUPABASE_URL
    ) &&
    Boolean(window.YD_SUPABASE_ANON_KEY) &&
    !window.YD_SUPABASE_ANON_KEY.includes("MASUKKAN_") &&
    !window.YD_SUPABASE_ANON_KEY.includes("TEMPEL_");

  if (!configured) {
    window.ydSupabase = null;
    console.error(
      "Supabase belum siap. Periksa URL, publishable key, dan urutan script."
    );
    return;
  }

  const options = {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  };

  if (appType === "driver") {
    options.auth.storageKey = "yd-driver-auth";
  } else if (appType === "admin") {
    options.auth.storageKey = "yd-admin-auth";
  } else {
    options.auth.storageKey = "yd-customer-auth";
  }

  window.ydSupabase = window.supabase.createClient(
    window.YD_SUPABASE_URL,
    window.YD_SUPABASE_ANON_KEY,
    options
  );
})();

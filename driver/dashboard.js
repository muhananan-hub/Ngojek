document.addEventListener("DOMContentLoaded", () => {
  const db = window.ydSupabase;
  const $ = id => document.getElementById(id);

  const money = n =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(n) || 0);

  const commission = n => Math.round((Number(n) || 0) * 0.08);

  const escapeHtml = s =>
    String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  let user = null;
  let app = null;
  let loading = false;
  let signingOut = false;

  const say = (el, t) => {
    const node = $(el);
    if (node) node.textContent = t;
  };

  // Jika konfigurasi Supabase belum tersedia.
  if (!db) {
    say(
      "statusNotice",
      "Konfigurasi Supabase belum diisi. Hubungi administrator."
    );
    return;
  }

  // Semua pengalihan sesi Driver menuju login Driver.
  function goToDriverLogin() {
    if (signingOut) return;
    const currentPath = window.location.pathname;

    if (!currentPath.endsWith("/login.html")) {
      window.location.replace("login.html");
    }
  }

  // Pantau perubahan autentikasi, termasuk logout dan sesi yang berakhir.
  const {
    data: { subscription }
  } = db.auth.onAuthStateChange((event, session) => {
    if (
      event === "SIGNED_OUT" ||
      (event === "TOKEN_REFRESHED" && !session)
    ) {
      goToDriverLogin();
    }
  });

  async function load() {
    if (loading) return;
    loading = true;

    try {
      const {
        data: { session },
        error: sessionError
      } = await db.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session) {
        goToDriverLogin();
        return;
      }

      user = session.user;

      const {
        data: application,
        error
      } = await db
        .from("driver_applications")
        .select(
          "id,user_id,registration_no,full_name,email,whatsapp,address,status,created_at"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!application) {
        throw new Error(
          "Data pendaftaran tidak ditemukan untuk akun ini. Hubungi admin."
        );
      }

      app = application;

      // Informasi profil Driver.
      say(
        "welcomeText",
        `Halo, ${app.full_name}. Berikut ringkasan aktivitas Anda.`
      );
      say("profileName", app.full_name);
      say("profileEmail", app.email || user.email);
      say("profileWhatsapp", app.whatsapp);
      say("profileReg", app.registration_no);
      say("profileAddress", app.address);

      const statusNames = {
        pending: "Menunggu verifikasi",
        review: "Sedang ditinjau",
        accepted: "Disetujui",
        rejected: "Ditolak"
      };

      const statusElement = $("profileStatus");

      if (statusElement) {
        statusElement.textContent =
          statusNames[app.status] || app.status;

        statusElement.className = "pill " + app.status;
      }

      // Pemberitahuan berdasarkan status pendaftaran.
      const notice = $("statusNotice");

      if (notice) {
        if (app.status === "accepted") {
          notice.innerHTML =
            "<strong>Akun disetujui.</strong>" +
            "<p class='muted'>Anda dapat mengambil pesanan yang tersedia.</p>";
        } else if (app.status === "rejected") {
          notice.innerHTML =
            "<strong>Pendaftaran belum disetujui.</strong>" +
            "<p class='muted'>Hubungi admin untuk informasi lebih lanjut. " +
            "Anda tetap dapat melihat profil dan riwayat.</p>";
        } else {
          notice.innerHTML =
            "<strong>Akun menunggu persetujuan admin.</strong>" +
            "<p class='muted'>Dashboard Anda sudah aktif, tetapi mengambil " +
            "pesanan baru hanya tersedia setelah akun disetujui.</p>";
        }
      }

      await Promise.all([
        loadOrders(),
        loadStats()
      ]);
    } finally {
      loading = false;
    }
  }

  // Memuat pesanan yang tersedia.
  async function loadOrders() {
    const tbody = $("availableOrders");

    if (!tbody) return;

    if (app.status !== "accepted") {
      tbody.innerHTML =
        "<tr><td colspan='6'>Pesanan baru aktif setelah akun disetujui admin.</td></tr>";

      say("ordersMessage", "Akun belum disetujui.");
      return;
    }

    const {
      data,
      error
    } = await db
      .from("driver_orders")
      .select(
        "id,order_no,pickup_address,destination_address,fare,created_at"
      )
      .eq("status", "available")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    tbody.innerHTML = "";

    if (!data || data.length === 0) {
      tbody.innerHTML =
        "<tr><td colspan='6'>Belum ada pesanan tersedia.</td></tr>";

      say(
        "ordersMessage",
        "Periksa kembali nanti atau tekan Muat ulang."
      );
      return;
    }

    say("ordersMessage", `${data.length} pesanan tersedia.`);

    for (const o of data) {
      const tr = document.createElement("tr");

      tr.innerHTML =
        `<td>${escapeHtml(o.order_no)}</td>` +
        `<td>${escapeHtml(o.pickup_address)}</td>` +
        `<td>${escapeHtml(o.destination_address)}</td>` +
        `<td>${money(o.fare)}</td>` +
        `<td>${money(commission(o.fare))}</td>` +
        `<td><button class="btn btn-small" data-claim="${escapeHtml(o.id)}">Ambil pesanan</button></td>`;

      tbody.appendChild(tr);
    }

    // Tombol mengambil pesanan.
    tbody.querySelectorAll("[data-claim]").forEach(button => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Memproses…";

        try {
          const { error } = await db.rpc(
            "claim_driver_order",
            { p_order_id: button.dataset.claim }
          );

          if (error) throw error;

          await loadOrders();
          await loadStats();
        } catch (error) {
          say(
            "ordersMessage",
            error.message ||
              "Pesanan gagal diambil. Muat ulang dan coba lagi."
          );

          button.disabled = false;
          button.textContent = "Ambil pesanan";
        }
      });
    });
  }

  // Memuat statistik dan riwayat pesanan Driver.
  async function loadStats() {
    const {
      data,
      error
    } = await db
      .from("driver_orders")
      .select(
        "id,order_no,pickup_address,destination_address,fare,status,created_at,completed_at,commission_amount"
      )
      .eq("driver_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = data || [];

    const done = rows.filter(
      o => o.status === "completed" && o.completed_at
    );

    const now = new Date();

    const dayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const weekStart = new Date(dayStart);

    // Awal minggu adalah hari Senin.
    weekStart.setDate(
      dayStart.getDate() - ((dayStart.getDay() + 6) % 7)
    );

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const sum = arr =>
      arr.reduce(
        (total, o) =>
          total +
          Number(o.commission_amount ?? commission(o.fare)),
        0
      );

    const count = arr => arr.length;

    const inRange = (o, start) =>
      new Date(o.completed_at) >= start;

    const day = done.filter(o => inRange(o, dayStart));
    const week = done.filter(o => inRange(o, weekStart));
    const month = done.filter(o => inRange(o, monthStart));

    say("dailyCount", count(day));
    say("dailyCommission", "Komisi " + money(sum(day)));

    say("weeklyCount", count(week));
    say("weeklyCommission", "Komisi " + money(sum(week)));

    say("monthlyCount", count(month));
    say("monthlyCommission", "Komisi " + money(sum(month)));

    say("totalCommission", money(sum(done)));

    // Tabel riwayat pesanan.
    const tbody = $("myOrders");

    if (!tbody) return;

    tbody.innerHTML = "";

    if (rows.length === 0) {
      tbody.innerHTML =
        "<tr><td colspan='7'>Belum ada riwayat pesanan.</td></tr>";
      return;
    }

    const statusNames = {
      available: "Tersedia",
      assigned: "Diambil",
      completed: "Selesai",
      cancelled: "Dibatalkan"
    };

    for (const o of rows) {
      const tr = document.createElement("tr");
      const date = o.completed_at || o.created_at;

      tr.innerHTML =
        `<td>${escapeHtml(o.order_no)}</td>` +
        `<td>${escapeHtml(o.pickup_address)}</td>` +
        `<td>${escapeHtml(o.destination_address)}</td>` +
        `<td>${money(o.fare)}</td>` +
        `<td>${o.status === "completed"
          ? money(o.commission_amount ?? commission(o.fare))
          : "—"}</td>` +
        `<td>${escapeHtml(statusNames[o.status] || o.status)}</td>` +
        `<td>${date ? new Date(date).toLocaleString("id-ID") : "—"}</td>`;

      tbody.appendChild(tr);
    }
  }

  // Tombol muat ulang.
  const refreshBtn = $("refreshBtn");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;

      try {
        await loadOrders();
        await loadStats();
      } catch (error) {
        say(
          "ordersMessage",
          error.message || "Gagal memuat data."
        );
      } finally {
        refreshBtn.disabled = false;
      }
    });
  }

  // Logout Driver.
  const logoutBtn = $("logoutBtn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      signingOut = true;
      logoutBtn.disabled = true;

      try {
        await db.auth.signOut();
      } finally {
        window.location.replace("login.html");
      }
    });
  }

  // Jalankan dashboard.
  load().catch(error => {
    say(
      "statusNotice",
      error.message || "Gagal memuat dashboard. Muat ulang halaman."
    );
  });

  // Bersihkan listener saat halaman ditinggalkan.
  window.addEventListener("pagehide", () => {
    subscription.unsubscribe();
  });
});

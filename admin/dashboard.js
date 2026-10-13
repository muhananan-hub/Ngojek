
document.addEventListener("DOMContentLoaded", async () => {
  const db = window.ydSupabase;
  const $ = (selector) => document.querySelector(selector);

  const applicantsBody = $("#applicantsBody");
  const ordersBody = $("#ordersBody");
  const activityBody = $("#activityBody");

  const say = (text) => {
    $("#dashboardMessage").textContent = text || "";
  };

  const sayOrders = (text) => {
    $("#ordersMessage").textContent = text || "";
  };

  const sayActivity = (text) => {
    $("#activityMessage").textContent = text || "";
  };

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const labels = {
    pending: "Menunggu",
    review: "Sedang ditinjau",
    accepted: "Diterima",
    rejected: "Ditolak"
  };

  const orderLabels = {
    available: "Tersedia",
    assigned: "Diambil driver",
    completed: "Selesai",
    cancelled: "Dibatalkan"
  };

  const roleLabels = {
    admin: "Admin",
    driver: "Driver",
    customer: "Pelanggan",
    system: "Sistem"
  };

  const viewInfo = {
    dashboard: {
      title: "Dashboard Admin",
      subtitle: "Pantau kondisi sistem dan aktivitas terbaru."
    },
    drivers: {
      title: "Pengaturan Driver",
      subtitle: "Verifikasi pendaftaran dan periksa dokumen driver."
    },
    customers: {
      title: "Pengaturan Pelanggan",
      subtitle: "Pengelolaan akun pelanggan dan pemulihan akses."
    },
    orders: {
      title: "Pesanan",
      subtitle: "Pantau status dan penugasan pesanan."
    },
    security: {
      title: "Keamanan",
      subtitle: "Periksa kontrol akses dan log aktivitas."
    },
    reports: {
      title: "Laporan",
      subtitle: "Laporan operasional harian, mingguan, dan bulanan."
    }
  };

  let rows = [];
  let orderRows = [];
  let currentView = "dashboard";

  if (!db) {
    say("Konfigurasi Supabase belum diisi.");
    return;
  }

  // Verifikasi sesi pengguna.
  const { data: sessionData, error: authError } =
    await db.auth.getUser();

  const user = sessionData?.user;

  if (authError || !user) {
    location.href = "./login.html";
    return;
  }

  // Hanya akun yang terdaftar pada admin_users boleh masuk.
  const { data: admin, error: adminError } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !admin) {
    await db.auth.signOut();
    location.href = "./login.html";
    return;
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString("id-ID");
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  // =========================
  // NAVIGASI SIDEBAR
  // =========================
  function showView(viewName) {
    if (!viewInfo[viewName]) return;

    currentView = viewName;

    document.querySelectorAll(".admin-view").forEach((view) => {
      view.classList.toggle(
        "hidden",
        view.id !== `view-${viewName}`
      );
    });

    document.querySelectorAll(".admin-nav [data-view]").forEach((button) => {
      const active = button.dataset.view === viewName;
      button.classList.toggle("active", active);

      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    setText("#pageTitle", viewInfo[viewName].title);
    setText("#pageSubtitle", viewInfo[viewName].subtitle);

    // Tutup detail agar tidak tertinggal saat berpindah menu.
    if (viewName !== "drivers") {
      $("#detailPanel").classList.add("hidden");
    }

    // Pada layar kecil, kembali ke bagian atas konten.
    if (window.matchMedia("(max-width: 700px)").matches) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
    });
  });

  setText(
    "#adminDate",
    new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    })
  );

  // =========================
  // DASHBOARD / DRIVER
  // =========================
  async function refreshApplicants() {
    applicantsBody.innerHTML =
      '<tr><td colspan="6">Memuat data…</td></tr>';

    const { data, error } = await db
      .from("driver_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      applicantsBody.innerHTML =
        '<tr><td colspan="6">Data pendaftar gagal dimuat.</td></tr>';

      say("Gagal memuat pendaftar: " + error.message);
      setText("#dashDriverTotal", "—");
      setText("#dashDriverPending", "—");
      return;
    }

    rows = data || [];

    const pending = rows.filter((r) => r.status === "pending").length;
    const accepted = rows.filter((r) => r.status === "accepted").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;

    setText("#totalCount", rows.length);
    setText("#pendingCount", pending);
    setText("#acceptedCount", accepted);
    setText("#rejectedCount", rejected);

    setText("#dashDriverTotal", rows.length);
    setText("#dashDriverPending", pending);

    renderApplicants();
    say("");
  }

  function renderApplicants() {
    const filter = $("#statusFilter").value;
    const query = ($("#driverSearch").value || "").trim().toLowerCase();

    const list = rows.filter((r) => {
      const matchesStatus =
        filter === "all" || r.status === filter;

      const searchable = [
        r.full_name,
        r.email,
        r.registration_no,
        r.whatsapp,
        r.address
      ].join(" ").toLowerCase();

      return matchesStatus && searchable.includes(query);
    });

    if (!list.length) {
      applicantsBody.innerHTML =
        '<tr><td colspan="6">Tidak ada pendaftar yang cocok.</td></tr>';
      return;
    }

    applicantsBody.innerHTML = list.map((r) => `
      <tr>
        <td>
          <strong>${esc(r.full_name)}</strong>
          <small>${esc(r.registration_no)}</small>
          <small>${esc(formatDate(r.created_at))}</small>
        </td>
        <td>
          ${esc(r.whatsapp)}
          <small>${esc(r.email)}</small>
          <small>${esc(r.address)}</small>
        </td>
        <td>
          KTP: ${esc(r.ktp_number)}
          <small>SIM: ${esc(r.sim_number)}</small>
        </td>
        <td>
          <button class="text-btn" data-doc="photo_path"
                  data-id="${esc(r.id)}" type="button">Foto</button> ·
          <button class="text-btn" data-doc="ktp_path"
                  data-id="${esc(r.id)}" type="button">KTP</button> ·
          <button class="text-btn" data-doc="sim_path"
                  data-id="${esc(r.id)}" type="button">SIM</button>
        </td>
        <td>
          <span class="pill ${esc(r.status)}">
            ${esc(labels[r.status] || r.status)}
          </span>
        </td>
        <td>
          <button class="btn btn-small btn-light"
                  data-detail="${esc(r.id)}" type="button">Detail</button>
          <select data-status="${esc(r.id)}"
                  aria-label="Ubah status ${esc(r.full_name)}">
            ${Object.entries(labels).map(([value, label]) => `
              <option value="${value}"
                ${r.status === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
        </td>
      </tr>
    `).join("");
  }

  applicantsBody.addEventListener("click", async (event) => {
    const docButton = event.target.closest("[data-doc]");

    if (docButton) {
      const applicant = rows.find(
        (r) => r.id === docButton.dataset.id
      );

      if (!applicant) return;

      const path = applicant[docButton.dataset.doc];

      if (!path) {
        say("Lokasi dokumen belum tersedia.");
        return;
      }

      docButton.disabled = true;

      try {
        const { data, error } = await db.storage
          .from("driver-documents")
          .createSignedUrl(path, 60);

        if (error) throw error;

        window.open(
          data.signedUrl,
          "_blank",
          "noopener,noreferrer"
        );

        say("");
      } catch (error) {
        say("Dokumen gagal dibuka: " + error.message);
      } finally {
        docButton.disabled = false;
      }

      return;
    }

    const detailButton = event.target.closest("[data-detail]");
    if (!detailButton) return;

    const r = rows.find(
      (item) => item.id === detailButton.dataset.detail
    );

    if (!r) return;

    $("#detailContent").innerHTML = `
      <p><b>Nomor registrasi:</b> ${esc(r.registration_no)}</p>
      <p><b>Nama:</b> ${esc(r.full_name)}</p>
      <p><b>Email:</b> ${esc(r.email)}</p>
      <p><b>WhatsApp:</b> ${esc(r.whatsapp)}</p>
      <p><b>Alamat:</b> ${esc(r.address)}</p>
      <p><b>Nomor KTP:</b> ${esc(r.ktp_number)}</p>
      <p><b>Nomor SIM:</b> ${esc(r.sim_number)}</p>
      <p><b>Status:</b> ${esc(labels[r.status] || r.status)}</p>
      <p><b>Tanggal daftar:</b> ${esc(formatDate(r.created_at))}</p>
      <p><b>Tanggal ditinjau:</b> ${esc(formatDate(r.reviewed_at))}</p>
    `;

    $("#detailPanel").classList.remove("hidden");
    $("#detailPanel").scrollIntoView({ behavior: "smooth" });
  });

  applicantsBody.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-status]");
    if (!select) return;

    const applicant = rows.find(
      (r) => r.id === select.dataset.status
    );

    if (!applicant) return;

    const previousStatus = applicant.status;
    const nextStatus = select.value;

    if (previousStatus === nextStatus) return;

    select.disabled = true;
    say("Menyimpan status pendaftaran…");

    const { error } = await db
      .from("driver_applications")
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .eq("id", applicant.id);

    if (error) {
      say("Status gagal diperbarui: " + error.message);
      select.value = previousStatus;
      select.disabled = false;
      return;
    }

    say("Status pendaftaran berhasil diperbarui.");

    await refreshApplicants();
    await refreshActivity();
  });

  // =========================
  // PESANAN
  // =========================
  async function refreshOrders() {
    ordersBody.innerHTML =
      '<tr><td colspan="7">Memuat pesanan…</td></tr>';

    const { data, error } = await db
      .from("driver_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      ordersBody.innerHTML =
        '<tr><td colspan="7">Data pesanan gagal dimuat.</td></tr>';

      sayOrders("Gagal memuat pesanan: " + error.message);
      setText("#dashOrderTotal", "—");
      setText("#dashOrderCompleted", "—");
      return;
    }

    orderRows = data || [];

    const available = orderRows.filter(
      (r) => r.status === "available"
    ).length;

    const assigned = orderRows.filter(
      (r) => r.status === "assigned"
    ).length;

    const completed = orderRows.filter(
      (r) => r.status === "completed"
    ).length;

    setText("#ordersTotal", orderRows.length);
    setText("#ordersAvailable", available);
    setText("#ordersAssigned", assigned);
    setText("#ordersCompleted", completed);

    setText("#dashOrderTotal", orderRows.length);
    setText("#dashOrderCompleted", completed);

    renderOrders();
    sayOrders("");
  }

  function renderOrders() {
    const query = ($("#orderSearch").value || "").trim().toLowerCase();
    const filter = $("#orderStatusFilter").value;

    const list = orderRows.filter((r) => {
      const matchesStatus =
        filter === "all" || r.status === filter;

      const searchable = [
        r.order_no,
        r.pickup_address,
        r.destination_address,
        r.driver_user_id
      ].join(" ").toLowerCase();

      return matchesStatus && searchable.includes(query);
    });

    if (!list.length) {
      ordersBody.innerHTML =
        '<tr><td colspan="7">Tidak ada pesanan yang cocok.</td></tr>';
      return;
    }

    ordersBody.innerHTML = list.map((r) => `
      <tr>
        <td><strong>${esc(r.order_no)}</strong></td>
        <td>${esc(r.pickup_address)}</td>
        <td>${esc(r.destination_address)}</td>
        <td>${esc(formatMoney(r.fare))}</td>
        <td>
          <span class="pill ${esc(r.status)}">
            ${esc(orderLabels[r.status] || r.status)}
          </span>
        </td>
        <td>
          ${r.driver_user_id
            ? esc(r.driver_user_id)
            : "Belum diambil"}
        </td>
        <td>${esc(formatDate(r.assigned_at || r.created_at))}</td>
      </tr>
    `).join("");
  }

  // =========================
  // LOG AKTIVITAS
  // =========================
  async function refreshActivity() {
    activityBody.innerHTML =
      '<tr><td colspan="5">Memuat aktivitas…</td></tr>';

    const { data, error } = await db
      .from("activity_logs")
      .select(
        "id,actor_user_id,actor_role,action,entity_type,entity_id,description,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      activityBody.innerHTML =
        '<tr><td colspan="5">Log aktivitas belum dapat dimuat.</td></tr>';

      sayActivity(
        "Log belum tersedia. Periksa tabel activity_logs dan kebijakan akses. " +
        "Detail: " + error.message
      );
      return;
    }

    if (!data || data.length === 0) {
      activityBody.innerHTML =
        '<tr><td colspan="5">Belum ada aktivitas tercatat.</td></tr>';

      sayActivity("Belum ada aktivitas yang tercatat.");
      return;
    }

    activityBody.innerHTML = data.map((r) => `
      <tr>
        <td>${esc(formatDate(r.created_at))}</td>
        <td>${esc(roleLabels[r.actor_role] || r.actor_role)}</td>
        <td>
          <strong>${esc(r.action)}</strong>
          <small>${esc(r.description)}</small>
          <small>
            ${r.actor_user_id
              ? "Akun: " + esc(r.actor_user_id)
              : "Akun sistem"}
          </small>
        </td>
        <td>${esc(r.entity_type)}</td>
        <td>${esc(r.entity_id)}</td>
      </tr>
    `).join("");

    sayActivity(
      "Menampilkan " + data.length + " aktivitas terbaru."
    );
  }

  // =========================
  // TOMBOL, FILTER, DAN LOGOUT
  // =========================
  $("#statusFilter").addEventListener("change", renderApplicants);
  $("#driverSearch").addEventListener("input", renderApplicants);

  $("#refreshBtn").addEventListener("click", refreshApplicants);
  $("#refreshOrdersBtn").addEventListener("click", refreshOrders);
  $("#refreshActivityBtn").addEventListener("click", refreshActivity);

  $("#orderSearch").addEventListener("input", renderOrders);
  $("#orderStatusFilter").addEventListener("change", renderOrders);

  $("#closeDetail").addEventListener("click", () => {
    $("#detailPanel").classList.add("hidden");
  });

  $("#logoutBtn").addEventListener("click", async () => {
    $("#logoutBtn").disabled = true;

    try {
      await db.auth.signOut();
    } finally {
      location.href = "./login.html";
    }
  });

  // Tampilkan dashboard setelah verifikasi akses selesai.
  showView("dashboard");

  // Setiap bagian dimuat secara independen.
  // Kegagalan log tidak menghentikan pemuatan driver/pesanan.
  await Promise.allSettled([
    refreshApplicants(),
    refreshOrders(),
    refreshActivity()
  ]);
});


document.addEventListener("DOMContentLoaded", async () => {
  const db = window.ydSupabase;

  const $ = (selector) => document.querySelector(selector);
  const applicantsBody = $("#applicantsBody");
  const ordersBody = $("#ordersBody");
  const activityBody = $("#activityBody");
  const msg = $("#dashboardMessage");

  const say = (text) => { msg.textContent = text || ""; };
  const sayOrders = (text) => { $("#ordersMessage").textContent = text || ""; };
  const sayActivity = (text) => { $("#activityMessage").textContent = text || ""; };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
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

  let rows = [];
  let orderRows = [];

  if (!db) {
    say("Konfigurasi Supabase belum diisi.");
    return;
  }

  // Pastikan pengguna sudah login.
  const { data: sessionData, error: authError } = await db.auth.getUser();
  const user = sessionData?.user;

  if (authError || !user) {
    location.href = "./login.html";
    return;
  }

  // Hanya akun dalam admin_users yang boleh masuk.
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

  // =========================
  // PENDAFTARAN DRIVER
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
      return;
    }

    rows = data || [];

    $("#totalCount").textContent = rows.length;
    $("#pendingCount").textContent =
      rows.filter((r) => r.status === "pending").length;
    $("#acceptedCount").textContent =
      rows.filter((r) => r.status === "accepted").length;
    $("#rejectedCount").textContent =
      rows.filter((r) => r.status === "rejected").length;

    renderApplicants();
    say("");
  }

  function renderApplicants() {
    const filter = $("#statusFilter").value;
    const list = rows.filter((r) =>
      filter === "all" || r.status === filter
    );

    if (!list.length) {
      applicantsBody.innerHTML =
        '<tr><td colspan="6">Belum ada pendaftar untuk filter ini.</td></tr>';
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
          <button class="text-btn" data-doc="photo_path" data-id="${esc(r.id)}">Foto</button> ·
          <button class="text-btn" data-doc="ktp_path" data-id="${esc(r.id)}">KTP</button> ·
          <button class="text-btn" data-doc="sim_path" data-id="${esc(r.id)}">SIM</button>
        </td>
        <td>
          <span class="pill ${esc(r.status)}">
            ${esc(labels[r.status] || r.status)}
          </span>
        </td>
        <td>
          <button class="btn btn-small btn-light" data-detail="${esc(r.id)}">Detail</button>
          <select data-status="${esc(r.id)}"
                  aria-label="Ubah status ${esc(r.full_name)}">
            ${Object.entries(labels).map(([value, label]) => `
              <option value="${value}" ${r.status === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
        </td>
      </tr>
    `).join("");
  }

  // Buka dokumen privat menggunakan URL sementara.
  applicantsBody.addEventListener("click", async (event) => {
    const docButton = event.target.closest("[data-doc]");

    if (docButton) {
      const applicant = rows.find((r) => r.id === docButton.dataset.id);
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

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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

    const r = rows.find((item) => item.id === detailButton.dataset.detail);
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

    const applicant = rows.find((r) => r.id === select.dataset.status);
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
  // PEMANTAUAN PESANAN
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
      return;
    }

    orderRows = data || [];

    $("#ordersTotal").textContent = orderRows.length;
    $("#ordersAvailable").textContent =
      orderRows.filter((r) => r.status === "available").length;
    $("#ordersAssigned").textContent =
      orderRows.filter((r) => r.status === "assigned").length;
    $("#ordersCompleted").textContent =
      orderRows.filter((r) => r.status === "completed").length;

    if (!orderRows.length) {
      ordersBody.innerHTML =
        '<tr><td colspan="7">Belum ada pesanan di database.</td></tr>';
      sayOrders("");
      return;
    }

    ordersBody.innerHTML = orderRows.map((r) => `
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
        <td>${r.driver_user_id ? esc(r.driver_user_id) : "Belum diambil"}</td>
        <td>${esc(formatDate(r.assigned_at || r.created_at))}</td>
      </tr>
    `).join("");

    sayOrders("");
  }

  // =========================
  // LOG AKTIVITAS
  // =========================
  async function refreshActivity() {
    activityBody.innerHTML =
      '<tr><td colspan="5">Memuat aktivitas…</td></tr>';

    const { data, error } = await db
      .from("activity_logs")
      .select("id,actor_user_id,actor_role,action,entity_type,entity_id,description,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      activityBody.innerHTML =
        '<tr><td colspan="5">Log aktivitas belum dapat dimuat.</td></tr>';
      sayActivity(
        "Jalankan SQL tambahan log aktivitas terlebih dahulu. " +
        "Detail: " + error.message
      );
      return;
    }

    if (!data || data.length === 0) {
      activityBody.innerHTML =
        '<tr><td colspan="5">Belum ada aktivitas tercatat.</td></tr>';
      sayActivity("Aktivitas baru akan muncul setelah ada kejadian yang tercatat.");
      return;
    }

    activityBody.innerHTML = data.map((r) => `
      <tr>
        <td>${esc(formatDate(r.created_at))}</td>
        <td>${esc(roleLabels[r.actor_role] || r.actor_role)}</td>
        <td>
          <strong>${esc(r.action)}</strong>
          <small>${esc(r.description)}</small>
          <small>${r.actor_user_id ? "Akun: " + esc(r.actor_user_id) : "Akun sistem"}</small>
        </td>
        <td>${esc(r.entity_type)}</td>
        <td>${esc(r.entity_id)}</td>
      </tr>
    `).join("");

    sayActivity("Menampilkan " + data.length + " aktivitas terbaru.");
  }

  // =========================
  // TOMBOL DAN FILTER
  // =========================
  $("#statusFilter").addEventListener("change", renderApplicants);
  $("#refreshBtn").addEventListener("click", refreshApplicants);
  $("#refreshOrdersBtn").addEventListener("click", refreshOrders);
  $("#refreshActivityBtn").addEventListener("click", refreshActivity);

  $("#closeDetail").addEventListener("click", () => {
    $("#detailPanel").classList.add("hidden");
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await db.auth.signOut();
    location.href = "./login.html";
  });

  // Muat setiap bagian secara independen agar satu error
  // tidak menghentikan bagian dashboard lainnya.
  await Promise.allSettled([
    refreshApplicants(),
    refreshOrders(),
    refreshActivity()
  ]);
});

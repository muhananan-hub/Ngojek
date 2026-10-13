
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#recruitmentForm");
  const btn = document.querySelector("#submitBtn");
  const msg = document.querySelector("#formMessage");
  const db = window.ydSupabase;

  const MAX_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf"
  ];

  const say = (text, success = false) => {
    if (!msg) return;
    msg.textContent = text;
    msg.className = "message " + (success ? "success" : "error");
  };

  if (!form || !btn || !msg) {
    console.error("Elemen formulir pendaftaran Driver tidak ditemukan.");
    return;
  }

  if (!db) {
    say("Konfigurasi Supabase belum diisi. Hubungi administrator.");
    return;
  }

  const safeName = name =>
    String(name || "dokumen")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "_")
      .slice(-90);

  // Membuat akun atau menggunakan akun Driver yang sesuai.
  async function authenticate(email, password, fullName) {
    const {
      data: sessionData,
      error: sessionError
    } = await db.auth.getSession();

    if (sessionError) throw sessionError;

    let user = sessionData.session?.user || null;

    if (user && user.email?.toLowerCase() !== email) {
      throw new Error(
        "Browser sedang menggunakan akun Driver lain. " +
        "Silakan keluar dari akun tersebut terlebih dahulu."
      );
    }

    if (user) return user;

    // Coba login terlebih dahulu jika akun sudah pernah dibuat.
    const login = await db.auth.signInWithPassword({
      email,
      password
    });

    if (!login.error && login.data.user) {
      return login.data.user;
    }

    // Jika belum dapat login, buat akun baru.
    const signup = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          account_type: "driver"
        }
      }
    });

    if (signup.error) {
      throw new Error(
        "Akun gagal dibuat. Periksa email dan password. " +
        "Jika email sudah terdaftar, gunakan akun yang sama. " +
        signup.error.message
      );
    }

    if (!signup.data.user) {
      throw new Error("Akun Driver gagal dibuat. Silakan coba kembali.");
    }

    // Konfirmasi email harus nonaktif agar sesi langsung tersedia.
    if (!signup.data.session) {
      throw new Error(
        "Akun berhasil dibuat, tetapi sesi login belum tersedia. " +
        "Periksa pengaturan Confirm email di Supabase."
      );
    }

    return signup.data.user;
  }

  // Validasi dan unggah dokumen ke bucket privat.
  async function upload(file, userId) {
    if (!file || !file.size) {
      throw new Error("Foto, KTP, dan SIM wajib dilampirkan.");
    }

    if (file.size > MAX_SIZE) {
      throw new Error("Ukuran setiap dokumen maksimal 5 MB.");
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(
        "Format dokumen harus JPG, PNG, WEBP, atau PDF."
      );
    }

    const fileName =
      `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;

    const { error } = await db.storage
      .from("driver-documents")
      .upload(fileName, file, {
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    return fileName;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (btn.disabled) return;

    btn.disabled = true;
    btn.textContent = "Memproses pendaftaran...";
    say("");

    try {
      const data = new FormData(form);

      const fullName = String(
        data.get("full_name") || ""
      ).trim();

      const email = String(
        data.get("email") || ""
      ).trim().toLowerCase();

      const password = String(
        data.get("password") || ""
      );

      const whatsapp = String(
        data.get("whatsapp") || ""
      ).trim();

      const address = String(
        data.get("address") || ""
      ).trim();

      const ktpNumber = String(
        data.get("ktp_number") || ""
      ).trim();

      const simNumber = String(
        data.get("sim_number") || ""
      ).trim();

      if (
        !fullName ||
        !email ||
        !password ||
        !whatsapp ||
        !address ||
        !ktpNumber ||
        !simNumber
      ) {
        throw new Error("Mohon lengkapi semua data pendaftaran.");
      }

      if (password.length < 8) {
        throw new Error("Password minimal 8 karakter.");
      }

      if (data.get("consent") !== "on") {
        throw new Error(
          "Persetujuan pemrosesan data wajib dicentang."
        );
      }

      // 1. Buat akun atau login menggunakan akun yang sama.
      const user = await authenticate(
        email,
        password,
        fullName
      );

      btn.textContent = "Memeriksa data pendaftaran...";

      // 2. Cegah pendaftaran ganda untuk akun yang sama.
      const {
        data: existing,
        error: lookupError
      } = await db
        .from("driver_applications")
        .select("registration_no")
        .eq("user_id", user.id)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        say(
          "Pendaftaran Anda sudah tersimpan. Silakan login ke dashboard Driver.",
          true
        );

        // Pastikan halaman login tidak langsung melewati formulir login.
        await db.auth.signOut();

        window.location.replace(
          new URL("driver/login.html", window.location.href).href
        );
        return;
      }

      // 3. Unggah dokumen.
      btn.textContent = "Mengunggah dokumen...";

      const photoPath = await upload(
        data.get("photo"),
        user.id
      );

      const ktpPath = await upload(
        data.get("ktp_file"),
        user.id
      );

      const simPath = await upload(
        data.get("sim_file"),
        user.id
      );

      // 4. Simpan data pendaftaran dengan status menunggu.
      const registrationNo =
        "YD-" +
        new Date().toISOString().slice(0, 10).replace(/-/g, "") +
        "-" +
        crypto.randomUUID().slice(0, 8).toUpperCase();

      btn.textContent = "Menyimpan pendaftaran...";

      const { error: insertError } = await db
        .from("driver_applications")
        .insert({
          user_id: user.id,
          registration_no: registrationNo,
          full_name: fullName,
          email,
          whatsapp,
          address,
          ktp_number: ktpNumber,
          sim_number: simNumber,
          photo_path: photoPath,
          ktp_path: ktpPath,
          sim_path: simPath,
          status: "pending",
          consent_at: new Date().toISOString()
        });

      if (insertError) throw insertError;

      // 5. Pendaftaran sukses: logout dari sesi pendaftaran,
      // kemudian arahkan ke halaman Login Driver.
      say(
        "Pendaftaran berhasil dikirim. Silakan login ke akun Driver Anda.",
        true
      );

      await db.auth.signOut();

      window.location.replace(
        new URL("driver/login.html", window.location.href).href
      );

    } catch (error) {
      console.error("Pendaftaran Driver gagal:", error);

      say(
        error.message ||
        "Pendaftaran gagal. Silakan periksa data dan coba kembali."
      );
    } finally {
      btn.disabled = false;
      btn.textContent = "Kirim pendaftaran";
    }
  });
});

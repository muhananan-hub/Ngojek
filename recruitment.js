
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#recruitmentForm");
  const btn = document.querySelector("#submitBtn");
  const msg = document.querySelector("#formMessage");
  const db = window.ydSupabase;
  const maxSize = 5 * 1024 * 1024;

  const say = (text, success = false) => {
    msg.textContent = text;
    msg.className = "message " + (success ? "success" : "error");
  };

  if (!db) {
    say("Supabase belum dikonfigurasi. Hubungi administrator.");
    return;
  }

  const safeName = name =>
    String(name).toLowerCase()
      .replace(/[^a-z0-9._-]/g, "_")
      .slice(-90);

  async function authenticate(email, password, fullName) {
    const { data: sessionData, error: sessionError } =
      await db.auth.getSession();

    if (sessionError) throw sessionError;

    let user = sessionData.session?.user || null;

    if (user && user.email?.toLowerCase() !== email) {
      throw new Error(
        "Browser sedang login dengan akun Driver lain. " +
        "Keluar dari akun tersebut terlebih dahulu."
      );
    }

    if (user) return user;

    // Jika akun sudah ada dan email terverifikasi, login dahulu.
    const login = await db.auth.signInWithPassword({
      email,
      password
    });

    if (!login.error && login.data.user) {
      return login.data.user;
    }

    // Jika belum bisa login, coba membuat akun baru.
    const signup = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          new URL("recruitment.html", window.location.href).href,
        data: {
          full_name: fullName,
          account_type: "driver"
        }
      }
    });

    if (signup.error) {
      throw new Error(
        "Login atau pendaftaran akun gagal. Jika akun sudah pernah " +
        "dibuat, pastikan email sudah diverifikasi dan password benar. " +
        signup.error.message
      );
    }

    if (!signup.data.user) {
      throw new Error("Supabase belum mengembalikan data akun.");
    }

    if (!signup.data.session) {
      say(
        "Akun berhasil diproses, tetapi email perlu diverifikasi. " +
        "Buka email dan klik tautan verifikasi. Setelah itu, kembali " +
        "ke halaman ini, isi kembali formulir beserta dokumennya, " +
        "lalu tekan Kirim pendaftaran. Gunakan email dan password " +
        "yang sama. Jangan membuat akun kedua.",
        true
      );

      return null;
    }

    return signup.data.user;
  }

  async function upload(file, userId) {
    if (!file || !file.size) {
      throw new Error("Semua dokumen wajib dilampirkan.");
    }

    if (file.size > maxSize) {
      throw new Error("Ukuran setiap dokumen maksimal 5 MB.");
    }

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf"
    ];

    if (!allowed.includes(file.type)) {
      throw new Error(
        "Format dokumen harus JPG, PNG, WEBP, atau PDF."
      );
    }

    const path =
      `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;

    const { error } = await db.storage
      .from("driver-documents")
      .upload(path, file, {
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    return path;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (btn.disabled) return;

    btn.disabled = true;
    btn.textContent = "Memeriksa akun…";
    say("");

    try {
      const data = new FormData(form);
      const email = String(data.get("email") || "")
        .trim().toLowerCase();
      const password = String(data.get("password") || "");
      const fullName = String(data.get("full_name") || "").trim();

      if (data.get("consent") !== "on") {
        throw new Error(
          "Persetujuan pemrosesan data wajib dicentang."
        );
      }

      if (password.length < 8) {
        throw new Error("Password minimal 8 karakter.");
      }

      const user = await authenticate(email, password, fullName);

      // Belum ada sesi: tunggu verifikasi email terlebih dahulu.
      if (!user) return;

      btn.textContent = "Memeriksa pendaftaran…";

      // Cegah pendaftaran ganda untuk akun yang sama.
      const { data: existing, error: lookupError } = await db
        .from("driver_applications")
        .select("registration_no")
        .eq("user_id", user.id)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        say(
          `Pendaftaran sudah tersimpan. Nomor registrasi: ` +
          `${existing.registration_no}. Membuka dashboard Driver…`,
          true
        );

        window.location.replace("driver/index.html");
        return;
      }

      btn.textContent = "Mengunggah dokumen…";

      const photo = await upload(data.get("photo"), user.id);
      const ktp = await upload(data.get("ktp_file"), user.id);
      const sim = await upload(data.get("sim_file"), user.id);

      const registrationNo =
        "YD-" +
        new Date().toISOString().slice(0, 10).replaceAll("-", "") +
        "-" +
        crypto.randomUUID().slice(0, 8).toUpperCase();

      btn.textContent = "Menyimpan pendaftaran…";

      const { error: insertError } = await db
        .from("driver_applications")
        .insert({
          user_id: user.id,
          registration_no: registrationNo,
          full_name: fullName,
          email,
          whatsapp: String(data.get("whatsapp") || "").trim(),
          address: String(data.get("address") || "").trim(),
          ktp_number: String(data.get("ktp_number") || "").trim(),
          sim_number: String(data.get("sim_number") || "").trim(),
          photo_path: photo,
          ktp_path: ktp,
          sim_path: sim,
          status: "pending",
          consent_at: new Date().toISOString()
        });

      if (insertError) throw insertError;

      window.location.replace("driver/index.html?registered=1");

    } catch (error) {
      say(error.message || "Pendaftaran gagal. Silakan coba kembali.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Kirim pendaftaran";
    }
  });
});

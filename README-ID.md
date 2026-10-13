# YourDriver — rekrutmen, dashboard driver, dan back office

Paket ini menambahkan fitur ke repository tanpa mengganti `index.html`, `login.html`, `register.html`, atau `logo.png` yang sudah ada. Unggah file tambahan saja dan pertahankan file lama.

## Halaman tambahan
- `recruitment.html`: pendaftaran driver dengan email, password, identitas, KTP/SIM, foto, alamat, dan WhatsApp.
- `driver/login.html`: login ulang memakai email dan password.
- `driver/index.html`: dashboard profil, status verifikasi, pesanan tersedia, riwayat, hitungan harian/mingguan/bulanan, dan komisi 8%.
- `admin/login.html` dan `admin/index.html`: login serta pengelolaan aplikasi driver.
- `yd-config.js`: konfigurasi Supabase.
- `supabase-schema.sql`: tabel, kebijakan akses, penyimpanan privat, dan fungsi klaim pesanan.

## Penyiapan Supabase
1. Buat project Supabase.
2. Buka SQL Editor dan jalankan seluruh isi `supabase-schema.sql`. Jika schema awal sudah pernah dijalankan, skrip tambahan memakai `if not exists` untuk kolom/tabel baru; bila muncul error kebijakan duplikat dari versi sebelumnya, periksa lalu hapus kebijakan lama yang namanya sama sebelum mengulang bagian terkait.
3. Untuk admin, buat user di Authentication → Users, lalu tambahkan UUID-nya: `insert into public.admin_users (user_id) values ('UUID-ADMIN-DARI-SUPABASE');`. Tidak ada pendaftaran admin publik.
4. Salin Project URL dan anon/publishable key dari Project Settings → API ke `yd-config.js`. Jangan pernah memasukkan `service_role` key ke file frontend.
5. **Verifikasi email:** agar pendaftaran langsung masuk ke dashboard sesuai alur yang diminta, Supabase harus mengembalikan sesi setelah `signUp`. Jika Confirm email aktif, Supabase biasanya meminta pengguna membuka tautan email terlebih dahulu; halaman akan memberi instruksi dan pengguna dapat login setelah verifikasi. Untuk produksi, lebih aman mempertahankan verifikasi email dan menerapkan alur verifikasi yang jelas daripada mematikan verifikasi.
6. Unggah file tambahan ke root repository dan folder `driver/` serta `admin/` ke GitHub. Jangan menghapus file website lama.

## URL setelah file diunggah
- Pendaftaran: `https://muhananan-hub.github.io/YourDriver/recruitment.html`
- Login driver: `https://muhananan-hub.github.io/YourDriver/driver/login.html`
- Dashboard driver: `https://muhananan-hub.github.io/YourDriver/driver/index.html`
- Login admin: `https://muhananan-hub.github.io/YourDriver/admin/login.html`

## Pesanan dan komisi
Dashboard membaca pesanan dari tabel `driver_orders`. Pesanan harus dibuat oleh backend/administrator yang tepercaya ketika pesanan pelanggan dibuat pada sistem utama; paket ini tidak otomatis menghubungkan tabel pesanan yang sudah ada di website lama karena skema backend lama belum tersedia. Admin/backend juga perlu menandai pesanan sebagai `completed` dan mengisi `completed_at` setelah perjalanan selesai. Komisi dihitung di database sebesar 8% dari `fare`; dashboard hanya menghitung pesanan yang berstatus selesai. Klaim pesanan dilakukan melalui fungsi database atomik agar satu pesanan tidak dapat diambil dua driver sekaligus.

Contoh membuat pesanan uji (jalankan sebagai admin/backend tepercaya, bukan dari browser publik):
```sql
insert into public.driver_orders (order_no, pickup_address, destination_address, fare)
values ('YD-TEST-0001', 'Alamat penjemputan', 'Alamat tujuan', 50000);
```

## Catatan keamanan penting sebelum produksi
- Tabel memuat nomor KTP/SIM, alamat, dan dokumen sensitif. Batasi akses admin, tetapkan kebijakan privasi/retensi data, dan uji RLS memakai akun driver dan admin terpisah.
- Kebijakan frontend bukan pengganti validasi server. Sebelum digunakan publik, tambahkan validasi berkas di server/Edge Function, rate limiting, proteksi penyalahgunaan akun, dan proses penghapusan dokumen.
- Jangan tandai pesanan selesai berdasarkan tindakan browser driver saja. Status selesai harus datang dari sistem pesanan/admin/backend yang tepercaya.
- Periksa kebijakan Supabase Storage jika pernah menjalankan versi SQL sebelumnya. Bucket `driver-documents` harus tetap private.

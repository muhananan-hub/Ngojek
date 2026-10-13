document.addEventListener("DOMContentLoaded", () => {
 const form=document.querySelector("#recruitmentForm"), btn=document.querySelector("#submitBtn"), msg=document.querySelector("#formMessage");
 const say=(t,ok=false)=>{msg.textContent=t;msg.className="message "+(ok?"success":"error")};
 if(!window.ydSupabase){say("Konfigurasi Supabase belum diisi. Hubungi administrator.");return;}
 const db=window.ydSupabase, max=5*1024*1024;
 const safeName=n=>n.toLowerCase().replace(/[^a-z0-9._-]/g,"_").slice(-90);
 async function upload(file, folder){
   if(!file) throw new Error("Semua dokumen wajib dilampirkan.");
   if(file.size>max) throw new Error("Ukuran setiap file maksimal 5 MB.");
   const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
   if(!allowed.includes(file.type)) throw new Error("Format dokumen harus JPG, PNG, WEBP, atau PDF.");
   const path=`${folder}/${crypto.randomUUID()}-${safeName(file.name)}`;
   const {error}=await db.storage.from("driver-documents").upload(path,file,{upsert:false,contentType:file.type});
   if(error) throw error;
   return path;
 }
 form.addEventListener("submit",async e=>{
  e.preventDefault(); btn.disabled=true;btn.textContent="Membuat akun…";say("");
  try{
   const f=new FormData(form);
   if(f.get("consent")!=="on") throw new Error("Persetujuan pemrosesan data wajib dicentang.");
   const email=String(f.get("email")).trim().toLowerCase(), password=String(f.get("password"));
   if(password.length<8) throw new Error("Password minimal 8 karakter.");
   const {data:authData,error:authError}=await db.auth.signUp({email,password,options:{data:{full_name:String(f.get("full_name")).trim(),account_type:"driver"}}});
   if(authError) throw authError;
   if(!authData.user) throw new Error("Akun belum berhasil dibuat. Silakan coba kembali.");
   if(!authData.session){
     say("Akun dibuat, tetapi Supabase meminta verifikasi email. Buka tautan verifikasi yang dikirim ke email, lalu login melalui halaman Login Driver. Untuk langsung masuk setelah daftar, admin perlu mengatur alur verifikasi Supabase.");
     form.reset(); return;
   }
   btn.textContent="Mengunggah dokumen…";
   const reg="YD-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
   const folder=authData.user.id;
   const photo=await upload(f.get("photo"),folder), ktp=await upload(f.get("ktp_file"),folder), sim=await upload(f.get("sim_file"),folder);
   btn.textContent="Menyimpan pendaftaran…";
   const {error}=await db.from("driver_applications").insert({
    user_id:authData.user.id,registration_no:reg,full_name:String(f.get("full_name")).trim(),
    email,whatsapp:String(f.get("whatsapp")).trim(),address:String(f.get("address")).trim(),
    ktp_number:String(f.get("ktp_number")).trim(),sim_number:String(f.get("sim_number")).trim(),
    photo_path:photo,ktp_path:ktp,sim_path:sim,status:"pending",consent_at:new Date().toISOString()
   });
   if(error) throw error;
   window.location.href="driver/index.html?registered=1";
  }catch(err){say(err.message||"Pendaftaran gagal. Silakan coba kembali.");}
  finally{btn.disabled=false;btn.textContent="Kirim pendaftaran";}
 });
});

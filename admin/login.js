document.addEventListener("DOMContentLoaded",()=>{
 const form=document.querySelector("#loginForm"),msg=document.querySelector("#loginMessage"),btn=document.querySelector("#loginBtn");
 const say=t=>{msg.textContent=t;msg.className="message error"};
 if(!window.ydSupabase){say("Konfigurasi Supabase belum diisi.");return;}
 form.addEventListener("submit",async e=>{
  e.preventDefault();btn.disabled=true;btn.textContent="Memeriksa…";msg.textContent="";
  const data=new FormData(form);
  try{
   const {error}=await ydSupabase.auth.signInWithPassword({email:data.get("email"),password:data.get("password")});
   if(error) throw error;
   const {data:roleData,error:roleError}=await ydSupabase.from("admin_users").select("user_id").eq("user_id",(await ydSupabase.auth.getUser()).data.user.id).maybeSingle();
   if(roleError||!roleData){await ydSupabase.auth.signOut();throw new Error("Akun ini tidak memiliki akses admin.");}
   location.href="./index.html";
  }catch(err){say(err.message||"Login gagal.");}
  finally{btn.disabled=false;btn.textContent="Masuk ke dashboard";}
 });
});
document.addEventListener("DOMContentLoaded",async()=>{
 const db=window.ydSupabase,body=document.querySelector("#applicantsBody"),msg=document.querySelector("#dashboardMessage");
 const say=t=>msg.textContent=t;
 if(!db){say("Konfigurasi Supabase belum diisi.");return;}
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user){location.href="./login.html";return;}
 const {data:admin,error:adminError}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
 if(adminError||!admin){await db.auth.signOut();location.href="./login.html";return;}
 const labels={pending:"Menunggu",review:"Sedang ditinjau",accepted:"Diterima",rejected:"Ditolak"};
 let rows=[];
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function refresh(){
  body.innerHTML='<tr><td colspan="6">Memuat data…</td></tr>';
  const {data,error}=await db.from("driver_applications").select("*").order("created_at",{ascending:false});
  if(error){body.innerHTML="";say(error.message);return;}
  rows=data||[];
  document.querySelector("#totalCount").textContent=rows.length;
  document.querySelector("#pendingCount").textContent=rows.filter(x=>x.status==="pending").length;
  document.querySelector("#acceptedCount").textContent=rows.filter(x=>x.status==="accepted").length;
  document.querySelector("#rejectedCount").textContent=rows.filter(x=>x.status==="rejected").length;
  render();say("");
 }
 function render(){
  const filter=document.querySelector("#statusFilter").value, list=rows.filter(r=>filter==="all"||r.status===filter);
  if(!list.length){body.innerHTML='<tr><td colspan="6">Belum ada pendaftar untuk filter ini.</td></tr>';return;}
  body.innerHTML=list.map(r=>`<tr><td><strong>${esc(r.full_name)}</strong><small>${esc(r.registration_no)}</small><small>${new Date(r.created_at).toLocaleString("id-ID")}</small></td><td>${esc(r.whatsapp)}<small>${esc(r.address)}</small></td><td>KTP: ${esc(r.ktp_number)}<small>SIM: ${esc(r.sim_number)}</small></td><td><button class="text-btn" data-doc="photo_path" data-id="${r.id}">Foto</button> · <button class="text-btn" data-doc="ktp_path" data-id="${r.id}">KTP</button> · <button class="text-btn" data-doc="sim_path" data-id="${r.id}">SIM</button></td><td><span class="pill ${esc(r.status)}">${esc(labels[r.status]||r.status)}</span></td><td><button class="btn btn-small btn-light" data-detail="${r.id}">Detail</button><select data-status="${r.id}" aria-label="Ubah status ${esc(r.full_name)}"><option value="pending" ${r.status==="pending"?"selected":""}>Menunggu</option><option value="review" ${r.status==="review"?"selected":""}>Ditinjau</option><option value="accepted" ${r.status==="accepted"?"selected":""}>Diterima</option><option value="rejected" ${r.status==="rejected"?"selected":""}>Ditolak</option></select></td></tr>`).join("");
 }
 body.addEventListener("click",async e=>{
  const doc=e.target.closest("[data-doc]");
  if(doc){const r=rows.find(x=>x.id===doc.dataset.id);if(!r)return;const {data,error}=await db.storage.from("driver-documents").createSignedUrl(r[doc.dataset.doc],60);if(error){say(error.message);return;}window.open(data.signedUrl,"_blank","noopener");}
  const det=e.target.closest("[data-detail]");
  if(det){const r=rows.find(x=>x.id===det.dataset.detail);if(!r)return;const panel=document.querySelector("#detailPanel"),content=document.querySelector("#detailContent");content.innerHTML=`<p><b>Registrasi:</b> ${esc(r.registration_no)}</p><p><b>Nama:</b> ${esc(r.full_name)}</p><p><b>WhatsApp:</b> ${esc(r.whatsapp)}</p><p><b>Alamat:</b> ${esc(r.address)}</p><p><b>Nomor KTP:</b> ${esc(r.ktp_number)}</p><p><b>Nomor SIM:</b> ${esc(r.sim_number)}</p><p><b>Status:</b> ${esc(labels[r.status]||r.status)}</p>`;panel.classList.remove("hidden");panel.scrollIntoView({behavior:"smooth"});}
 });
 body.addEventListener("change",async e=>{
  const sel=e.target.closest("[data-status]");if(!sel)return;
  const {error}=await db.from("driver_applications").update({status:sel.value,reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq("id",sel.dataset.status);
  if(error){say(error.message);return;}say("Status pendaftaran diperbarui.");await refresh();
 });
 document.querySelector("#statusFilter").addEventListener("change",render);
 document.querySelector("#refreshBtn").addEventListener("click",refresh);
 document.querySelector("#closeDetail").addEventListener("click",()=>document.querySelector("#detailPanel").classList.add("hidden"));
 document.querySelector("#logoutBtn").addEventListener("click",async()=>{await db.auth.signOut();location.href="./login.html";});
 await refresh();
});
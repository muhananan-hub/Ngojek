document.addEventListener("DOMContentLoaded",()=>{
 const db=window.ydSupabase, $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0), commission=n=>Math.round((Number(n)||0)*0.08), escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let user=null, app=null;
 const say=(el,t)=>$(el).textContent=t;
 if(!db){say("statusNotice","Konfigurasi Supabase belum diisi. Hubungi administrator.");return;}
 async function load(){
  const {data:{session}}=await db.auth.getSession(); if(!session){location.replace("login.html");return;} user=session.user;
  const {data:application,error}=await db.from("driver_applications").select("id,user_id,registration_no,full_name,email,whatsapp,address,status,created_at").eq("user_id",user.id).maybeSingle();
  if(error)throw error;if(!application)throw new Error("Data pendaftaran tidak ditemukan untuk akun ini. Hubungi admin.");app=application;
  say("welcomeText",`Halo, ${app.full_name}. Berikut ringkasan aktivitas Anda.`);say("profileName",app.full_name);say("profileEmail",app.email||user.email);say("profileWhatsapp",app.whatsapp);say("profileReg",app.registration_no);say("profileAddress",app.address);
  const statusNames={pending:"Menunggu verifikasi",review:"Sedang ditinjau",accepted:"Disetujui",rejected:"Ditolak"};$('profileStatus').textContent=statusNames[app.status]||app.status;$('profileStatus').className="pill "+app.status;
  $('statusNotice').innerHTML=app.status==="accepted"?"<strong>Akun disetujui.</strong><p class='muted'>Anda dapat mengambil pesanan yang tersedia.</p>":app.status==="rejected"?"<strong>Pendaftaran belum disetujui.</strong><p class='muted'>Hubungi admin untuk informasi lebih lanjut. Anda tetap dapat melihat profil dan riwayat.</p>":"<strong>Akun menunggu persetujuan admin.</strong><p class='muted'>Dashboard Anda sudah aktif, tetapi mengambil pesanan baru hanya tersedia setelah akun disetujui.</p>";
  await Promise.all([loadOrders(),loadStats()]);
 }
 async function loadOrders(){
  const tbody=$('availableOrders');if(app.status!=="accepted"){tbody.innerHTML='<tr><td colspan="6">Pesanan baru aktif setelah akun disetujui admin.</td></tr>';say("ordersMessage","Akun belum disetujui.");return;}
  const {data,error}=await db.from("driver_orders").select("id,order_no,pickup_address,destination_address,fare,created_at").eq("status","available").order("created_at",{ascending:true}).limit(50);
  if(error)throw error;tbody.innerHTML="";
  if(!data?.length){tbody.innerHTML='<tr><td colspan="6">Belum ada pesanan tersedia.</td></tr>';say("ordersMessage","Periksa kembali nanti atau tekan Muat ulang.");return;}
  say("ordersMessage",`${data.length} pesanan tersedia.`);for(const o of data){const tr=document.createElement("tr");tr.innerHTML=`<td>${escapeHtml(o.order_no)}</td><td>${escapeHtml(o.pickup_address)}</td><td>${escapeHtml(o.destination_address)}</td><td>${money(o.fare)}</td><td>${money(commission(o.fare))}</td><td><button class="btn btn-small" data-claim="${escapeHtml(o.id)}">Ambil pesanan</button></td>`;tbody.appendChild(tr)}
  tbody.querySelectorAll("[data-claim]").forEach(b=>b.addEventListener("click",async()=>{b.disabled=true;b.textContent="Memproses…";try{const {error}=await db.rpc("claim_driver_order",{p_order_id:b.dataset.claim});if(error)throw error;await loadOrders();await loadStats();}catch(e){say("ordersMessage",e.message||"Pesanan gagal diambil. Muat ulang dan coba lagi.");b.disabled=false;b.textContent="Ambil pesanan";}}));
 }
 async function loadStats(){
  const {data,error}=await db.from("driver_orders").select("id,order_no,pickup_address,destination_address,fare,status,created_at,completed_at,commission_amount").eq("driver_user_id",user.id).order("created_at",{ascending:false}).limit(200);
  if(error)throw error;const rows=data||[], done=rows.filter(o=>o.status==="completed"&&o.completed_at);const now=new Date(),dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()),weekStart=new Date(dayStart);weekStart.setDate(dayStart.getDate()-((dayStart.getDay()+6)%7));const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const sum=arr=>arr.reduce((s,o)=>s+Number(o.commission_amount??commission(o.fare)),0), count=arr=>arr.length;
  const inRange=(o,start)=>new Date(o.completed_at)>=start;const day=done.filter(o=>inRange(o,dayStart)),week=done.filter(o=>inRange(o,weekStart)),month=done.filter(o=>inRange(o,monthStart));
  say("dailyCount",count(day));say("dailyCommission","Komisi "+money(sum(day)));say("weeklyCount",count(week));say("weeklyCommission","Komisi "+money(sum(week)));say("monthlyCount",count(month));say("monthlyCommission","Komisi "+money(sum(month)));say("totalCommission",money(sum(done)));
  const tbody=$('myOrders');tbody.innerHTML="";if(!rows.length){tbody.innerHTML='<tr><td colspan="7">Belum ada riwayat pesanan.</td></tr>';return;}
  for(const o of rows){const tr=document.createElement("tr"),date=o.completed_at||o.created_at;tr.innerHTML=`<td>${escapeHtml(o.order_no)}</td><td>${escapeHtml(o.pickup_address)}</td><td>${escapeHtml(o.destination_address)}</td><td>${money(o.fare)}</td><td>${o.status==="completed"?money(o.commission_amount??commission(o.fare)):"—"}</td><td>${escapeHtml(({assigned:"Diambil",completed:"Selesai",cancelled:"Dibatalkan"})[o.status]||o.status)}</td><td>${date?new Date(date).toLocaleString("id-ID"):"—"}</td>`;tbody.appendChild(tr)}
 }
 $('refreshBtn').addEventListener("click",async()=>{ $('refreshBtn').disabled=true;try{await loadOrders();await loadStats()}catch(e){say("ordersMessage",e.message||"Gagal memuat data.")}finally{$('refreshBtn').disabled=false}});
 $('logoutBtn').addEventListener("click",async()=>{await db.auth.signOut();location.href="login.html"});
 load().catch(e=>{say("statusNotice",e.message||"Gagal memuat dashboard. Muat ulang halaman.")});
});
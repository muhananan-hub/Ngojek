/* YourDriver customer live tracking add-on.
   Muat setelah skrip inline index.html; tidak mengubah markup/desain asli. */
(() => {
  'use strict';
  if (!window.ydSupabase || typeof L === 'undefined') return;
  const db = window.ydSupabase;
  let orderChannel = null, customerWatchId = null, lastCustomerSend = 0;
  let driverMarker = null, customerMarker = null, pickupMarker = null, destinationMarker = null;
  let routeLine = null, driverProfileLoadedFor = null;
  const stageText = {
    awaiting_driver: ['Menunggu driver menerima pesanan', 'Menunggu'],
    accepted: ['Driver menerima pesanan', 'Driver ditemukan'],
    heading_to_pickup: ['Dalam perjalanan menjemput Anda', 'Menuju penjemputan'],
    arrived_pickup: ['Driver telah tiba di lokasi penjemputan', 'Driver tiba'],
    in_trip: ['Dalam perjalanan menuju tujuan', 'Dalam perjalanan'],
    awaiting_payment: ['Anda telah tiba di lokasi tujuan — menunggu pembayaran', 'Menunggu pembayaran'],
    completed: ['Perjalanan selesai', 'Selesai'],
    cancelled: ['Pesanan dibatalkan', 'Dibatalkan']
  };
  const active = () => typeof currentOrder !== 'undefined' && currentOrder;
  const coord = (lat,lng) => lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? [Number(lat),Number(lng)] : null;
  function setStatus(stage) {
    const item = stageText[stage] || ['Memeriksa status pesanan…','Status'];
    const title = document.getElementById('active-status-title');
    const badge = document.getElementById('active-status-badge');
    const dot = document.getElementById('status-dot');
    if (title) title.textContent = item[0];
    if (badge) badge.textContent = item[1];
    if (dot) dot.className = stage === 'completed' ? 'w-2.5 h-2.5 bg-emerald-500 rounded-full' : stage === 'cancelled' ? 'w-2.5 h-2.5 bg-red-500 rounded-full' : 'w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping';
  }
  function upsertMarker(old, position, label, iconHtml) {
    if (!position || !liveMap) return old;
    if (!old) {
      const icon = iconHtml ? L.divIcon({className:'yd-live-marker',html:iconHtml,iconSize:[34,34],iconAnchor:[17,17]}) : undefined;
      old = L.marker(position, icon ? {icon} : {}).addTo(liveMap);
    } else old.setLatLng(position);
    old.bindTooltip(label, {direction:'top',offset:[0,-12]});
    return old;
  }
  function syncMap(order) {
    if (!order || !liveMap) return;
    const pickup = coord(order.pickup_lat,order.pickup_lng);
    const dest = coord(order.destination_lat,order.destination_lng);
    const driver = coord(order.driver_lat,order.driver_lng);
    const customer = coord(order.customer_lat,order.customer_lng);
    if (pickup) pickupMarker = upsertMarker(pickupMarker,pickup,'Lokasi penjemputan','<div style="background:#2563eb;color:white;border:3px solid white;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;box-shadow:0 2px 8px #0005">●</div>');
    if (dest) destinationMarker = upsertMarker(destinationMarker,dest,'Lokasi tujuan','<div style="background:#ef4444;color:white;border:3px solid white;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;box-shadow:0 2px 8px #0005">★</div>');
    if (driver) driverMarker = upsertMarker(driverMarker,driver,'Posisi driver','<div style="background:#0f172a;color:white;border:3px solid white;border-radius:50%;width:34px;height:34px;display:grid;place-items:center;box-shadow:0 2px 10px #0006"><i class="fa-solid fa-motorcycle"></i></div>');
    if (customer) customerMarker = upsertMarker(customerMarker,customer,'Lokasi GPS pelanggan','<div style="background:#16a34a;color:white;border:3px solid white;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;box-shadow:0 2px 8px #0005"><i class="fa-solid fa-user"></i></div>');
    if (routeLine) { liveMap.removeLayer(routeLine); routeLine = null; }
    const route = order.trip_stage === 'in_trip' || order.trip_stage === 'awaiting_payment' ? [driver || pickup, dest] : [driver || customer || pickup, pickup];
    if (route[0] && route[1]) routeLine = L.polyline(route,{color:'#2563eb',weight:4,opacity:.8,dashArray:'8 7'}).addTo(liveMap);
    const points = [pickup,dest,driver,customer].filter(Boolean);
    if (points.length) liveMap.fitBounds(L.latLngBounds(points),{padding:[45,45],maxZoom:16});
  }
  async function loadDriverProfile(order) {
    if (!order?.driver_user_id || driverProfileLoadedFor === order.id) return;
    driverProfileLoadedFor = order.id;
    try {
      const {data,error} = await db.rpc('yd_customer_driver_profile',{p_order_id:order.id});
      if (error) throw error;
      const p = Array.isArray(data) ? data[0] : data;
      if (!p) return;
      const name = document.getElementById('driver-name');
      const vehicle = document.getElementById('driver-vehicle');
      const rating = document.getElementById('driver-rating');
      if (name) name.textContent = p.full_name || 'Driver YourDriver';
      if (vehicle) vehicle.textContent = 'Driver telah menerima pesanan';
      if (rating) rating.textContent = 'Driver terverifikasi';
      if (p.photo_path) {
        try {
          const {data:photo,error:photoError} = await db.storage.from('driver-documents').createSignedUrl(p.photo_path,3600);
          if (!photoError && photo?.signedUrl) {
            const card = document.querySelector('#driver-name')?.closest('.flex.items-center.gap-3');
            const holder = card?.querySelector('.w-12.h-12');
            if (holder) holder.innerHTML = `<img alt="Foto driver" src="${photo.signedUrl}" class="w-12 h-12 rounded-full object-cover">`;
          }
        } catch(e) { console.warn('Foto driver tidak tersedia untuk pelanggan:',e); }
      }
      window.ydCurrentDriverWhatsapp = p.whatsapp || '';
    } catch(e) { console.warn('Profil driver belum dapat dimuat:',e.message); }
  }
  function stopCustomerGps() {
    if (customerWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(customerWatchId);
    customerWatchId = null;
  }
  function startCustomerGps(order) {
    if (!order || !navigator.geolocation || customerWatchId != null || !['available','assigned'].includes(order.status)) return;
    customerWatchId = navigator.geolocation.watchPosition(async pos => {
      const now = Date.now(); if (now-lastCustomerSend < 5000) return; lastCustomerSend=now;
      try { await db.rpc('yd_customer_update_location',{p_order_id:order.id,p_lat:pos.coords.latitude,p_lng:pos.coords.longitude}); }
      catch(e) { console.debug('GPS pelanggan belum tersimpan:',e.message); }
    }, err => console.info('GPS pelanggan tidak tersedia/diizinkan:',err.message), {enableHighAccuracy:true,maximumAge:3000,timeout:15000});
  }
  function stopChannel() { if (orderChannel) db.removeChannel(orderChannel); orderChannel=null; }
  function subscribe(order) {
    if (!order?.id) return;
    if (orderChannel && orderChannel.orderId === order.id) return;
    stopChannel();
    orderChannel = db.channel('yd-customer-order-'+order.id)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'driver_orders',filter:'id=eq.'+order.id},payload => {
        if (!active() || active().id !== order.id || !payload.new) return;
        currentOrder = {...currentOrder,...payload.new};
        setStatus(currentOrder.trip_stage || currentOrder.status);
        syncMap(currentOrder); loadDriverProfile(currentOrder);
        if (currentOrder.status === 'completed') { stopCustomerGps(); stopChannel(); const modal=document.getElementById('rating-modal'); if(modal) modal.classList.remove('hidden'); }
        if (currentOrder.status === 'cancelled') { stopCustomerGps(); stopChannel(); }
      }).subscribe();
    orderChannel.orderId=order.id;
    startCustomerGps(order);
  }
  const originalShow = window.showCustomerOrder;
  if (typeof originalShow === 'function') window.showCustomerOrder = function() {
    originalShow();
    const order=active(); if(!order) return;
    setStatus(order.trip_stage || (order.status==='assigned'?'accepted':order.status));
    setTimeout(()=>syncMap(order),350); subscribe(order); loadDriverProfile(order);
  };
  const originalStatus = window.updateCustomerOrderStatus;
  window.updateCustomerOrderStatus = function(status) {
    if (typeof originalStatus==='function') originalStatus(status);
    const order=active(); setStatus(order?.trip_stage || (status==='assigned'?'accepted':status));
    if(order) { syncMap(order); loadDriverProfile(order); }
  };
  const originalRefresh = window.refreshCustomerOrderStatus;
  window.refreshCustomerOrderStatus = async function() {
    if(typeof originalRefresh==='function') await originalRefresh();
    const order=active(); if(order){setStatus(order.trip_stage || (order.status==='assigned'?'accepted':order.status));syncMap(order);loadDriverProfile(order);}
  };
  const originalReset = window.resetApp;
  window.resetApp = function() { stopCustomerGps(); stopChannel(); driverMarker=customerMarker=pickupMarker=destinationMarker=routeLine=null;driverProfileLoadedFor=null;if(typeof originalReset==='function')originalReset(); };
  const originalContact = window.contactDriver;
  window.contactDriver = function() {
    const number=String(window.ydCurrentDriverWhatsapp||'').replace(/\D/g,'');
    if(!number){if(typeof originalContact==='function')originalContact();else alert('Nomor driver belum tersedia.');return;}
    let normalized=number.startsWith('0')?'62'+number.slice(1):number.startsWith('8')?'62'+number:number;
    window.open('https://wa.me/'+normalized,'_blank','noopener');
  };
  // Style marker tambahan tanpa mengubah layout halaman.
  const style=document.createElement('style');style.textContent='.yd-live-marker{background:transparent;border:0}.yd-live-marker i{font-size:15px}';document.head.appendChild(style);
  // Restore order: initializeCustomer() berjalan async, jadi periksa setelah login selesai.
  const restoreTimer=setInterval(()=>{const order=active();if(order){clearInterval(restoreTimer);subscribe(order);setTimeout(()=>syncMap(order),400);loadDriverProfile(order);}},500);
  setTimeout(()=>clearInterval(restoreTimer),30000);
  window.addEventListener('pagehide',()=>{stopCustomerGps();stopChannel();});
})();

// ─── HELPERS ──────────────────────────────────────────────────
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function initials(n){return n.split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')}
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active')}
function fmtDate(iso){return new Date(iso).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}

function setResult(id, msg, type='success'){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = `<div class="${type==='success'?'result-success':'result-error'}">${msg}</div>`;
  if(type==='success') setTimeout(()=>{if(el) el.innerHTML=''},4000);
}

function togglePwd(inputId, btn){
  const inp = document.getElementById(inputId);
  if(inp.type==='password'){
    inp.type='text';
    btn.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  } else {
    inp.type='password';
    btn.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
}

// ─── THEME ────────────────────────────────────────────────────
function syncThemeIcons(theme){
  const icon = theme === 'dark' ? '☾' : '☀';
  // Update semua elemen theme icon (ada di login, user topbar, admin topbar)
  document.querySelectorAll('#theme-icon, .theme-icon-sync').forEach(el => {
    el.textContent = icon;
  });
}

function toggleTheme(){
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('sn_theme', newTheme);
  syncThemeIcons(newTheme);
}

function initTheme(){
  const saved = localStorage.getItem('sn_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  syncThemeIcons(theme);
}

// ─── AUTH ──────────────────────────────────────────────────────
async function onNameChange(){
  const name = document.getElementById('login-name').value;
  document.getElementById('login-pass-section').style.display = 'none';
  document.getElementById('login-setup-section').style.display = 'none';
  document.getElementById('login-error').textContent = '';
  if(!name) return;
  try{
    const data = await API.checkName(name);
    if(data.is_setup){
      document.getElementById('login-pass-section').style.display = 'block';
      setTimeout(()=>document.getElementById('login-pass').focus(), 50);
    } else {
      document.getElementById('login-setup-section').style.display = 'block';
      setTimeout(()=>document.getElementById('setup-pass').focus(), 50);
    }
  } catch(err){ document.getElementById('login-error').textContent = err.message; }
}

async function doSetup(){
  const name  = document.getElementById('login-name').value;
  const pass  = document.getElementById('setup-pass').value;
  const pass2 = document.getElementById('setup-pass2').value;
  const errEl = document.getElementById('setup-error');
  errEl.textContent = '';
  if(pass.length < 4){ errEl.textContent = 'Kata sandi minimal 4 karakter.'; return; }
  if(pass !== pass2) { errEl.textContent = 'Kata sandi tidak sama.'; return; }
  try{
    const data = await API.setupPassword(name, pass);
    API.setToken(data.token);
    localStorage.setItem('sn_user', name);
    const keyHash = await sha256(pass);
    localStorage.setItem('sn_key', keyHash);

    // Jika ada pesan lama yang dienkripsi dengan temp_key,
    // re-enkripsi sekarang dengan key_hash baru
    if(data.temp_key && data.key_hash) {
      await reEncryptMessages(name, data.temp_key, data.key_hash);
    }

    await initUserScreen(name);
  } catch(e){ errEl.textContent = e.message; }
}

// Re-enkripsi pesan lama dari temp_key ke key_hash baru
async function reEncryptMessages(name, oldKey, newKey) {
  try {
    const msgs = await API.getInboxRaw(); // ambil ciphertext mentah
    if(!msgs.length) return;
    const reencrypted = [];
    for(const m of msgs) {
      const plain = await Crypto.decrypt(m.ciphertext, oldKey, name);
      if(plain !== null) {
        const newCipher = await Crypto.encrypt(plain, newKey, name);
        reencrypted.push({ id: m.id, ciphertext: newCipher });
      }
    }
    if(reencrypted.length) {
      await API.reEncryptMessages(reencrypted);
    }
  } catch(e) {
    console.warn('Re-enkripsi gagal (tidak kritis):', e.message);
  }
}

async function doLogin(){
  const name  = document.getElementById('login-name').value;
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if(!pass){ errEl.textContent = 'Masukkan kata sandi.'; return; }
  try{
    const data = await API.loginUser(name, pass);
    API.setToken(data.token);
    localStorage.setItem('sn_user', name);
    // Simpan SHA-256 dari password — tidak perlu simpan password asli
    const keyHash = await sha256(pass);
    localStorage.setItem('sn_key', keyHash);
    await initUserScreen(name);
  } catch(e){ errEl.textContent = e.message; }
}

document.addEventListener('keydown', e => {
  if(e.key !== 'Enter') return;
  const ps = document.getElementById('login-pass-section');
  const ss = document.getElementById('login-setup-section');
  if(ps && ps.style.display !== 'none') doLogin();
  if(ss && ss.style.display !== 'none') doSetup();
});

async function doAdminLogin(){
  const pass  = document.getElementById('admin-pass').value;
  const errEl = document.getElementById('admin-error');
  errEl.textContent = '';
  try{
    const data = await API.loginAdmin(pass);
    API.setToken(data.token);
    localStorage.setItem('sn_role', 'admin');
    await loadAdminPhases();
    showScreen('screen-admin');
  } catch(e){ errEl.textContent = e.message; }
}

function doLogout(){
  API.clearToken();
  localStorage.removeItem('sn_key');
  document.getElementById('login-pass').value = '';
  document.getElementById('login-pass-section').style.display = 'none';
  document.getElementById('login-setup-section').style.display = 'none';
  showScreen('screen-login');
}

function doAdminLogout(){ API.clearToken(); showScreen('screen-login'); }

// ─── USER SCREEN ───────────────────────────────────────────────
async function initUserScreen(name){
  document.getElementById('user-name-display').textContent = name;
  document.getElementById('user-avatar').textContent = initials(name);
  await checkPhaseBanners();
  await loadUsers();
  await renderInbox();
  showScreen('screen-user');
}

async function checkPhaseBanners(){
  try{
    const p = await API.getPhases();
    const bs  = document.getElementById('banner-send-closed');
    const br  = document.getElementById('banner-read-closed');
    const bcw = document.getElementById('banner-class-write-closed');
    const bcr = document.getElementById('banner-class-read-closed');
    if(bs)  bs.style.display  = p.phase_send        === 'open' ? 'none' : 'block';
    if(br)  br.style.display  = p.phase_read        === 'open' ? 'none' : 'block';
    if(bcw) bcw.style.display = p.phase_class_write === 'open' ? 'none' : 'block';
    if(bcr) bcr.style.display = p.phase_class_read  === 'open' ? 'none' : 'block';
    const btn = document.getElementById('btn-send');
    if(btn) btn.disabled = p.phase_send !== 'open';
    const btnC = document.getElementById('btn-class-send');
    if(btnC) btnC.disabled = p.phase_class_write !== 'open';
    const writeBox = document.getElementById('class-board-write');
    if(writeBox) writeBox.style.display = p.phase_class_write === 'open' ? 'flex' : 'none';
  } catch{}
}

async function loadUsers(){
  try{
    const [users, sent] = await Promise.all([API.getUsers(), API.getSent()]);
    const sentSet = new Set(sent);
    const sel = document.getElementById('send-to');
    sel.innerHTML = '<option value="">Pilih teman</option>';
    users.forEach(name => {
      const o = document.createElement('option');
      o.value = name;
      if(sentSet.has(name)){ o.textContent = name + ' — sudah dikirim'; o.disabled = true; }
      else o.textContent = name;
      sel.appendChild(o);
    });
  } catch{}
}

async function renderInbox(){
  const el = document.getElementById('inbox-list');
  el.innerHTML = '<div class="loading">Mendekripsi pesan...</div>';
  try{
    const msgs = await API.getInbox();
    if(!msgs.length){
      el.innerHTML = `<div class="empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span>Belum ada pesan untukmu.</span>
        <small style="color:var(--text-3)">Pesan akan muncul saat waktu pembacaan dibuka.</small>
      </div>`;
      return;
    }
    const key  = localStorage.getItem('sn_key');
    const name = localStorage.getItem('sn_user');
    const items = await Promise.all(msgs.map(async (m, i) => {
      const plain = await Crypto.decrypt(m.ciphertext, key, name);
      return {...m, plain, num: i+1};
    }));
    el.innerHTML = `<div class="msg-list">${items.map(m=>`
      <div class="msg-card">
        <div class="msg-head">
          <span class="msg-num">#${m.num}</span>
          <span class="msg-badge badge-anon">Anonim</span>
        </div>
        <p class="msg-text">${m.plain !== null ? esc(m.plain) : '<em style="color:var(--red)">Gagal mendekripsi</em>'}</p>
        <div class="msg-date">${fmtDate(m.created_at)}</div>
      </div>`).join('')}</div>`;
  } catch(err){
    if(err.message.includes('belum dibuka') || err.message.includes('ditutup')){
      el.innerHTML = `<div class="empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Waktu pembacaan belum dibuka.</span>
      </div>`;
    } else {
      el.innerHTML = `<div class="empty">Gagal memuat: ${esc(err.message)}</div>`;
    }
  }
}

async function sendMsg(){
  const to  = document.getElementById('send-to').value;
  const txt = document.getElementById('send-msg').value.trim();
  if(!to) { setResult('send-result','Pilih penerima.','error'); return; }
  if(!txt){ setResult('send-result','Pesan tidak boleh kosong.','error'); return; }
  const res = document.getElementById('send-result');
  res.innerHTML = '<div class="loading">Mengenkripsi...</div>';
  try{
    const keyData   = await API.getRecipientKey(to);
    const ciphertext = await Crypto.encrypt(txt, keyData.key, to);
    await API.sendMessage(to, ciphertext);
    document.getElementById('send-msg').value = '';
    document.getElementById('send-to').value = '';
    setResult('send-result','Pesan berhasil dikirim secara anonim.');
    await loadUsers();
    await renderSentTo();
  } catch(err){ setResult('send-result', err.message, 'error'); }
}

async function renderSentTo(){
  try{
    const sent = await API.getSent();
    const el   = document.getElementById('sent-to-list');
    if(!sent.length){ el.innerHTML = '<span style="font-size:13px;color:var(--text-3)">Belum ada.</span>'; return; }
    el.innerHTML = sent.map(n=>`<span class="chip">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      ${esc(n)}</span>`).join('');
  } catch{}
}

// ─── TABS ──────────────────────────────────────────────────────
function userTab(btn, tabId){
  document.querySelectorAll('#screen-user .tab-btn').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#screen-user .tab-pane').forEach(p=>p.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if(tabId==='tab-inbox'){ checkPhaseBanners(); renderInbox(); }
  if(tabId==='tab-send') { checkPhaseBanners(); loadUsers(); renderSentTo(); }
  if(tabId==='tab-sent') { checkPhaseBanners(); renderSentDetail(); }
  if(tabId==='tab-class'){ checkPhaseBanners(); renderClassBoard(); }
}

function adminTab(btn, tabId){
  document.querySelectorAll('#screen-admin .tab-btn').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#screen-admin .tab-pane').forEach(p=>p.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if(tabId==='atab-fase')  loadAdminPhases();
  if(tabId==='atab-users') loadAdminUsers();
  if(tabId==='atab-msgs')  loadAdminMsgs();
  if(tabId==='atab-class') loadAdminClassBoard();
  if(tabId==='atab-backup')loadBackupLogs();
}

// ─── ADMIN: FASE ───────────────────────────────────────────────
async function loadAdminPhases(){
  try{
    const s   = await API.adminGetSettings();
    const cs  = document.getElementById('toggle-send');
    const cr  = document.getElementById('toggle-read');
    const ccw = document.getElementById('toggle-class-write');
    const ccr = document.getElementById('toggle-class-read');
    if(cs)  cs.checked  = s.phase_send        === 'open';
    if(cr)  cr.checked  = s.phase_read        === 'open';
    if(ccw) ccw.checked = s.phase_class_write === 'open';
    if(ccr) ccr.checked = s.phase_class_read  === 'open';
    updatePhaseUI('send',        s.phase_send);
    updatePhaseUI('read',        s.phase_read);
    updatePhaseUI('class_write', s.phase_class_write);
    updatePhaseUI('class_read',  s.phase_class_read);
  } catch{}
}

function updatePhaseUI(phase, val){
  // Ganti underscore ke dash untuk cocok dengan id HTML
  const id = `phase-${phase.replace(/_/g,'-')}-status`;
  const el = document.getElementById(id);
  if(!el) return;
  if(val === 'open'){
    el.textContent = 'Terbuka';
    el.className   = 'phase-pill phase-open';
  } else {
    el.textContent = 'Tertutup';
    el.className   = 'phase-pill phase-closed';
  }
}

async function togglePhase(phase){
  // phase pakai underscore (class_write) tapi id HTML pakai dash (toggle-class-write)
  const toggleId = `toggle-${phase.replace(/_/g,'-')}`;
  const chk = document.getElementById(toggleId);
  if(!chk) return;
  const val = chk.checked ? 'open' : 'closed';
  try{
    await API.adminSetSettings({[`phase_${phase}`]: val});
    updatePhaseUI(phase, val);
  } catch(err){
    alert('Gagal: ' + err.message);
    chk.checked = !chk.checked;
  }
}

// ─── ADMIN: USERS ──────────────────────────────────────────────
async function loadAdminUsers(){
  const el = document.getElementById('admin-user-list');
  if(!el) return;
  el.innerHTML = '<div class="loading">Memuat...</div>';
  try{
    const users = await API.adminGetUsers();
    if(!users.length){
      el.innerHTML = `<div class="empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Belum ada peserta terdaftar.</span>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="user-table">${users.map(u=>`
      <div class="user-row">
        <div class="user-left">
          <div class="avatar">${initials(u.name)}</div>
          <div>
            <div class="user-name">${esc(u.name)}</div>
            <span class="status-pill ${u.is_setup?'pill-ok':'pill-pending'}">
              ${u.is_setup?'Password sudah dibuat':'Menunggu setup password'}
            </span>
            <div class="user-meta">${u.received??0} diterima &middot; ${u.sent??0} dikirim</div>
          </div>
        </div>
        <div class="user-actions">
          ${u.is_setup
            ? `<button class="btn btn-sm btn-secondary" onclick="showPasswordModal('${esc(u.name)}')">Reset Sandi</button>`
            : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${esc(u.name)}')">Hapus</button>
        </div>
      </div>`).join('')}</div>`;
  } catch(err){ el.innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`; }
}

async function addUser(){
  const name = document.getElementById('new-name').value.trim();
  if(!name){ setResult('add-result','Isi nama peserta.','error'); return; }
  try{
    await API.adminAddUser(name);
    document.getElementById('new-name').value = '';
    setResult('add-result', `${esc(name)} berhasil ditambahkan.`);
    await loadAdminUsers();
    await refreshLoginSelect();
  } catch(err){ setResult('add-result', err.message, 'error'); }
}

async function bulkImport(){
  const raw = document.getElementById('bulk-csv').value.trim();
  if(!raw){ setResult('bulk-result','Isi nama dulu.','error'); return; }
  const names = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  let ok=0, skip=0, fail=0;
  for(const name of names){
    try{ await API.adminAddUser(name); ok++; }
    catch(e){ e.message.includes('sudah') ? skip++ : fail++; }
  }
  setResult('bulk-result', `${ok} ditambahkan · ${skip} sudah ada · ${fail} gagal`, ok>0?'success':'error');
  document.getElementById('bulk-csv').value = '';
  await loadAdminUsers();
  await refreshLoginSelect();
}

async function deleteUser(name){
  if(!confirm(`Hapus ${name}? Semua pesan terkait ikut terhapus.`)) return;
  try{
    await API.adminDeleteUser(name);
    await loadAdminUsers();
    await refreshLoginSelect();
  } catch(err){ alert('Gagal: ' + err.message); }
}

// ─── MODAL ─────────────────────────────────────────────────────
async function showPasswordModal(name){
  document.getElementById('modal-title').textContent = 'Reset Kata Sandi — ' + name;
  document.getElementById('modal-confirm-btn').style.display = 'none';
  document.getElementById('modal-body').innerHTML = `
    <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:12px">
      Setelah direset, <strong>${esc(name)}</strong> harus membuat kata sandi baru saat login berikutnya.
    </p>
    <button class="btn btn-danger" onclick="doResetPassword('${esc(name)}')">Reset Kata Sandi</button>
    <div id="modal-result"></div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function doResetPassword(name){
  if(!confirm(`Reset kata sandi ${name}?`)) return;
  try{
    await API.adminResetPass(name);
    document.getElementById('modal-result').innerHTML = '<div class="result-success" style="margin-top:8px">Kata sandi berhasil direset.</div>';
    setTimeout(()=>{ closeModal(); loadAdminUsers(); }, 1500);
  } catch(err){
    document.getElementById('modal-result').innerHTML = `<div class="result-error" style="margin-top:8px">${esc(err.message)}</div>`;
  }
}

function closeModal(){ document.getElementById('modal-overlay').classList.remove('open'); }

// ─── ADMIN: MESSAGES ───────────────────────────────────────────
async function loadAdminMsgs(){
  const el = document.getElementById('admin-msg-list');
  el.innerHTML = '<div class="loading">Memuat...</div>';
  try{
    const msgs = await API.adminGetMessages();
    if(!msgs.length){
      el.innerHTML = `<div class="empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Belum ada pesan.</span>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="msg-list">${msgs.map(m=>`
      <div class="msg-card">
        <div class="msg-head"><span class="msg-badge badge-enc">Terenkripsi</span></div>
        <div class="msg-meta-row"><strong>${esc(m.sender_name)}</strong> &rarr; <strong>${esc(m.recipient_name)}</strong></div>
        <div class="enc-preview">${esc(m.preview)}...</div>
        <div class="msg-date">${fmtDate(m.created_at)}</div>
      </div>`).join('')}</div>`;
  } catch(err){ el.innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`; }
}

// ─── BACKUP ────────────────────────────────────────────────────
async function loadBackupLogs(){
  const el = document.getElementById('backup-log-list');
  el.innerHTML = '<div class="loading">Memuat...</div>';
  try{
    const logs = await API.adminGetBackupLogs();
    if(!logs.length){ el.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:8px 0">Belum ada riwayat backup.</div>'; return; }
    el.innerHTML = logs.map(l=>`
      <div class="bk-row">
        <div class="bk-dot ${l.status==='success'?'bk-ok':'bk-fail'}"></div>
        <div>
          <div style="font-weight:500;font-size:13px">${esc(l.file_name||'—')}</div>
          <div style="font-size:12px;color:var(--text-3)">${fmtDate(l.created_at)}
            ${l.drive_url?` &middot; <a href="${esc(l.drive_url)}" target="_blank" style="color:var(--accent)">Lihat di Drive</a>`:''}
          </div>
          ${l.error_msg?`<div style="color:var(--red);font-size:12px;margin-top:2px">${esc(l.error_msg)}</div>`:''}
        </div>
      </div>`).join('');
  } catch{ el.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:8px 0">Gagal memuat.</div>'; }
}

async function triggerBackup(){
  setResult('backup-result','Menjalankan backup...');
  try{
    await API.adminTriggerBackup();
    setResult('backup-result','Backup dimulai. Cek riwayat dalam beberapa detik.');
    setTimeout(loadBackupLogs, 3000);
  } catch(err){ setResult('backup-result', err.message, 'error'); }
}

// ─── LOGIN DROPDOWN ────────────────────────────────────────────
async function refreshLoginSelect(){
  try{
    const names = await API.getAllNames();
    const sel   = document.getElementById('login-name');
    const cur   = sel.value;
    sel.innerHTML = '<option value="">Pilih namamu</option>';
    names.forEach(({name})=>{
      const o = document.createElement('option');
      o.value = name; o.textContent = name;
      sel.appendChild(o);
    });
    if(cur) sel.value = cur;
  } catch{}
}

// ─── SENT DETAIL ──────────────────────────────────────────────

let _phaseOpen = true; // cache fase pengisian

async function renderSentDetail(){
  const el = document.getElementById('sent-detail-list');
  if(!el) return;
  el.innerHTML = '<div class="loading">Memuat pesan terkirim...</div>';

  // Cek fase dulu
  try{
    const p = await API.getPhases();
    _phaseOpen = p.phase_send === 'open';
  } catch{}

  try{
    const msgs = await API.getSentDetail();
    if(!msgs.length){
      el.innerHTML = `<div class="empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        <span>Belum ada pesan terkirim.</span>
      </div>`;
      return;
    }

    // Dekripsi semua pesan terkirim — pakai key_hash pengirim (diri sendiri) sebagai kunci
    // Pesan dienkripsi dengan key penerima, jadi kita perlu re-fetch key tiap penerima
    // Tampilkan saja ciphertext preview + info penerima, dekripsi saat edit
    el.innerHTML = `
      ${!_phaseOpen ? `<div class="notice notice-amber" style="margin-bottom:12px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Fase pengisian sudah ditutup — pesan tidak bisa diedit.
      </div>` : ''}
      <div class="msg-list">
        ${msgs.map(m=>`
          <div class="msg-card" id="sent-card-${m.id}">
            <div class="class-msg-head">
              <div class="class-msg-sender">
                <div class="avatar" style="width:26px;height:26px;font-size:11px">${initials(m.recipient_name)}</div>
                <span class="class-sender-name">Ke: ${esc(m.recipient_name)}</span>
              </div>
              ${_phaseOpen
                ? `<button class="btn btn-sm btn-secondary" onclick="startEditMsg(${m.id},'${esc(m.recipient_name)}')">Edit</button>`
                : `<span class="status-pill pill-pending" style="font-size:11px">Terkunci</span>`}
            </div>
            <div id="sent-content-${m.id}">
              <p class="msg-text" style="margin-top:8px;color:var(--text-3);font-style:italic;font-size:13px">
                Klik Edit untuk melihat & mengubah isi pesan
              </p>
            </div>
            <div class="msg-date">${fmtDate(m.created_at)}</div>
          </div>`).join('')}
      </div>`;

    // Simpan data pesan untuk keperluan edit
    window._sentMsgs = Object.fromEntries(msgs.map(m=>[m.id, m]));

  } catch(err){
    el.innerHTML = `<div class="empty">Gagal memuat: ${esc(err.message)}</div>`;
  }
}

async function startEditMsg(id, recipientName){
  const contentEl = document.getElementById(`sent-content-${id}`);
  const cardEl    = document.getElementById(`sent-card-${id}`);
  if(!contentEl) return;

  // Tampilkan loading saat fetch key & dekripsi
  contentEl.innerHTML = '<div class="loading" style="padding:8px 0">Mendekripsi...</div>';

  try{
    // Ambil key penerima untuk dekripsi
    const keyData   = await API.getRecipientKey(recipientName);
    const msg       = window._sentMsgs?.[id];
    if(!msg){ contentEl.innerHTML = '<p style="color:var(--red);font-size:13px">Data tidak ditemukan</p>'; return; }

    const plain = await Crypto.decrypt(msg.ciphertext, keyData.key, recipientName);
    const text  = plain !== null ? plain : '';

    contentEl.innerHTML = `
      <textarea id="edit-textarea-${id}" style="margin-top:8px;width:100%;min-height:80px;resize:vertical">${esc(text)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="saveEditMsg(${id},'${esc(recipientName)}')">Simpan</button>
        <button class="btn btn-ghost btn-sm" onclick="cancelEditMsg(${id})">Batal</button>
      </div>
      <div id="edit-result-${id}"></div>`;

    document.getElementById(`edit-textarea-${id}`)?.focus();
  } catch(err){
    contentEl.innerHTML = `<p style="color:var(--red);font-size:13px;margin-top:8px">${esc(err.message)}</p>`;
  }
}

async function saveEditMsg(id, recipientName){
  const ta = document.getElementById(`edit-textarea-${id}`);
  if(!ta) return;
  const newText = ta.value.trim();
  if(!newText){ 
    document.getElementById(`edit-result-${id}`).innerHTML = '<span style="color:var(--red);font-size:12px">Pesan tidak boleh kosong.</span>';
    return;
  }
  try{
    // Re-enkripsi dengan key penerima
    const keyData    = await API.getRecipientKey(recipientName);
    const ciphertext = await Crypto.encrypt(newText, keyData.key, recipientName);
    await API.editMessage(id, ciphertext);

    // Update cache
    if(window._sentMsgs?.[id]) window._sentMsgs[id].ciphertext = ciphertext;

    // Tampilkan sukses lalu kembali ke tampilan normal
    const resultEl = document.getElementById(`edit-result-${id}`);
    if(resultEl) resultEl.innerHTML = '<span style="color:var(--green);font-size:12px">Tersimpan!</span>';
    setTimeout(()=>cancelEditMsg(id), 1000);
  } catch(err){
    const resultEl = document.getElementById(`edit-result-${id}`);
    if(resultEl) resultEl.innerHTML = `<span style="color:var(--red);font-size:12px">${esc(err.message)}</span>`;
  }
}

function cancelEditMsg(id){
  const contentEl = document.getElementById(`sent-content-${id}`);
  if(!contentEl) return;
  contentEl.innerHTML = `
    <p class="msg-text" style="margin-top:8px;color:var(--text-3);font-style:italic;font-size:13px">
      Klik Edit untuk melihat & mengubah isi pesan
    </p>`;
}

// ─── CLASS BOARD ──────────────────────────────────────────────

// Tidak ada batas karakter untuk pesan kelas

async function renderClassBoard(){
  const el = document.getElementById('class-board-list');
  if(!el) return;
  el.innerHTML = '<div class="loading">Memuat pesan kelas...</div>';
  try{
    const msgs = await API.getClassBoard();
    const me   = localStorage.getItem('sn_user');
    if(!msgs.length){
      el.innerHTML = `<div class="empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Belum ada pesan untuk kelas.</span>
        <small style="color:var(--text-3)">Jadilah yang pertama menulis!</small>
      </div>`;
      return;
    }
    el.innerHTML = `<div class="msg-list">${msgs.map(m=>`
      <div class="msg-card class-msg-card">
        <div class="class-msg-head">
          <div class="class-msg-sender">
            <div class="avatar" style="width:26px;height:26px;font-size:11px">${initials(m.sender_name)}</div>
            <span class="class-sender-name">${esc(m.sender_name)}</span>
            ${m.sender_name === me ? '<span class="badge-mine">Kamu</span>' : ''}
          </div>
          ${m.sender_name === me
            ? `<button class="btn-delete-class" onclick="deleteClassMsg(${m.id})" title="Hapus pesan">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>`
            : ''}
        </div>
        <p class="msg-text" style="margin-top:8px">${esc(m.content)}</p>
        <div class="msg-date">${fmtDate(m.created_at)}</div>
      </div>`).join('')}</div>`;
  } catch(err){
    if(err.message.includes('belum dibuka') || err.message.includes('ditutup')){
      el.innerHTML = `<div class="empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Waktu pembacaan pesan kelas belum dibuka.</span>
      </div>`;
    } else {
      el.innerHTML = `<div class="empty">Gagal memuat: ${esc(err.message)}</div>`;
    }
  }
}

async function sendClassMsg(){
  const txt = document.getElementById('class-msg-input').value.trim();
  if(!txt){ setResult('class-send-result','Pesan tidak boleh kosong.','error'); return; }
  try{
    await API.sendClassMsg(txt);
    document.getElementById('class-msg-input').value = '';

    setResult('class-send-result','Pesan berhasil dikirim.');
    await renderClassBoard();
  } catch(err){ setResult('class-send-result', err.message, 'error'); }
}

async function deleteClassMsg(id){
  if(!confirm('Hapus pesanmu ini?')) return;
  try{
    await API.deleteClassMsg(id);
    await renderClassBoard();
  } catch(err){ alert('Gagal: ' + err.message); }
}

async function loadAdminClassBoard(){
  const el = document.getElementById('admin-class-list');
  if(!el) return;
  el.innerHTML = '<div class="loading">Memuat...</div>';
  try{
    const msgs = await API.adminGetClassBoard();
    if(!msgs.length){
      el.innerHTML = '<div class="empty"><span>Belum ada pesan kelas.</span></div>';
      return;
    }
    el.innerHTML = `<div class="msg-list">${msgs.map(m=>`
      <div class="msg-card">
        <div class="class-msg-head">
          <div class="class-msg-sender">
            <div class="avatar" style="width:26px;height:26px;font-size:11px">${initials(m.sender_name)}</div>
            <span class="class-sender-name">${esc(m.sender_name)}</span>
          </div>
          <button class="btn-delete-class" onclick="adminDeleteClassMsg(${m.id})" title="Hapus">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
        <p class="msg-text" style="margin-top:8px">${esc(m.content)}</p>
        <div class="msg-date">${fmtDate(m.created_at)}</div>
      </div>`).join('')}</div>`;
  } catch(err){ el.innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`; }
}

async function adminDeleteClassMsg(id){
  if(!confirm('Hapus pesan ini?')) return;
  try{
    await API.adminDeleteClassMsg(id);
    await loadAdminClassBoard();
  } catch(err){ alert('Gagal: ' + err.message); }
}

// ─── INIT ──────────────────────────────────────────────────────
async function init(){
  initTheme();
  await refreshLoginSelect();
  const token     = API.getToken();
  const role      = localStorage.getItem('sn_role');
  const savedName = localStorage.getItem('sn_user');
  if(token && role==='admin'){
    try{ await loadAdminPhases(); showScreen('screen-admin'); }
    catch{ API.clearToken(); }
  } else if(token && savedName){
    try{ await initUserScreen(savedName); }
    catch{ API.clearToken(); }
  }
}

document.addEventListener('DOMContentLoaded', init);

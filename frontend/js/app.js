// ─── HELPERS ──────────────────────────────────────────────────
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function initials(n){return n.split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('')}
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active')}
function setResult(id,msg,type='success'){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=`<div class="${type==='success'?'success-msg':'error-msg'}">${msg}</div>`;
  if(type==='success') setTimeout(()=>{if(el)el.innerHTML=''},4000);
}
function fmtDate(iso){return new Date(iso).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}

// ─── LOGIN / SETUP FLOW ────────────────────────────────────────
async function onNameChange(){
  const name=document.getElementById('login-name').value;
  const passSection=document.getElementById('login-pass-section');
  const setupSection=document.getElementById('login-setup-section');
  passSection.style.display='none';
  setupSection.style.display='none';
  document.getElementById('login-error').textContent='';
  if(!name) return;
  try{
    const data=await API.checkName(name);
    if(data.is_setup){
      passSection.style.display='block';
      setTimeout(()=>document.getElementById('login-pass').focus(),50);
    } else {
      setupSection.style.display='block';
      setTimeout(()=>document.getElementById('setup-pass').focus(),50);
    }
  } catch(err){
    document.getElementById('login-error').textContent=err.message;
  }
}

async function doSetup(){
  const name=document.getElementById('login-name').value;
  const pass=document.getElementById('setup-pass').value;
  const pass2=document.getElementById('setup-pass2').value;
  const err=document.getElementById('setup-error');
  err.textContent='';
  if(pass.length<4){err.textContent='Password minimal 4 karakter.';return}
  if(pass!==pass2){err.textContent='Password tidak sama.';return}
  try{
    const data=await API.setupPassword(name,pass);
    API.setToken(data.token);
    localStorage.setItem('sn_user',name);
    localStorage.setItem('sn_pass',pass);
    await initUserScreen(name);
  } catch(e){err.textContent=e.message}
}

async function doLogin(){
  const name=document.getElementById('login-name').value;
  const pass=document.getElementById('login-pass').value;
  const err=document.getElementById('login-error');
  err.textContent='';
  if(!pass){err.textContent='Masukkan password.';return}
  try{
    const data=await API.loginUser(name,pass);
    API.setToken(data.token);
    localStorage.setItem('sn_user',name);
    localStorage.setItem('sn_pass',pass);
    await initUserScreen(name);
  } catch(e){err.textContent=e.message}
}

document.addEventListener('keydown',e=>{
  if(e.key!=='Enter') return;
  if(document.getElementById('login-pass-section').style.display!=='none') doLogin();
  if(document.getElementById('login-setup-section').style.display!=='none') doSetup();
});

async function doAdminLogin(){
  const pass=document.getElementById('admin-pass').value;
  const err=document.getElementById('admin-error');
  err.textContent='';
  try{
    const data=await API.loginAdmin(pass);
    API.setToken(data.token);
    localStorage.setItem('sn_role','admin');
    await loadAdminPhases();
    showScreen('screen-admin');
  } catch(e){err.textContent=e.message}
}

function doLogout(){
  API.clearToken();
  document.getElementById('login-pass').value='';
  document.getElementById('login-pass-section').style.display='none';
  document.getElementById('login-setup-section').style.display='none';
  showScreen('screen-login');
}
function doAdminLogout(){API.clearToken();showScreen('screen-login')}

// ─── USER SCREEN ───────────────────────────────────────────────
async function initUserScreen(name){
  document.getElementById('user-name-display').textContent=name;
  document.getElementById('user-avatar').textContent=initials(name);
  await checkPhaseBanners();
  await loadUsers();
  await renderInbox();
  showScreen('screen-user');
}

async function checkPhaseBanners(){
  try{
    const phases=await API.getPhases();
    const bannerSend=document.getElementById('banner-send-closed');
    const bannerRead=document.getElementById('banner-read-closed');
    bannerSend.style.display=phases.phase_send==='open'?'none':'block';
    bannerRead.style.display=phases.phase_read==='open'?'none':'block';
    // disable send button if phase closed
    const btnSend=document.getElementById('btn-send');
    if(btnSend) btnSend.disabled=phases.phase_send!=='open';
  } catch{}
}

async function loadUsers(){
  try{
    const [users,sent]=await Promise.all([API.getUsers(),API.getSent()]);
    const sentSet=new Set(sent);
    const sel=document.getElementById('send-to');
    sel.innerHTML='<option value="">— Pilih teman —</option>';
    users.forEach(name=>{
      const o=document.createElement('option');
      o.value=name;
      if(sentSet.has(name)){o.textContent=name+' ✓';o.disabled=true;}
      else o.textContent=name;
      sel.appendChild(o);
    });
  } catch{}
}

async function renderInbox(){
  const el=document.getElementById('inbox-list');
  el.innerHTML='<div class="loading">🔓 Mendekripsi pesan...</div>';
  try{
    const msgs=await API.getInbox();
    if(!msgs.length){
      el.innerHTML='<div class="empty-state"><span class="icon">📭</span>Belum ada pesan.<br><small>Pesan akan muncul di sini setelah fase pembacaan dibuka.</small></div>';
      return;
    }
    const pass=localStorage.getItem('sn_pass');
    const name=localStorage.getItem('sn_user');
    const decrypted=await Promise.all(msgs.map(async m=>{
      const plain=await Crypto.decrypt(m.ciphertext,pass,name);
      return{...m,plain};
    }));
    el.innerHTML=decrypted.map(m=>`
      <div class="msg-card">
        <span class="badge badge-anon">🕵️ Anonim</span>
        <p class="msg-text">${m.plain!==null?esc(m.plain):'<em style="color:var(--red)">Gagal mendekripsi</em>'}</p>
        <div class="msg-meta">${fmtDate(m.created_at)}</div>
      </div>`).join('');
  } catch(err){
    if(err.message.includes('belum dibuka')||err.message.includes('ditutup')){
      el.innerHTML='<div class="empty-state"><span class="icon">🔒</span>Fase pembacaan belum dibuka oleh admin.</div>';
    } else {
      el.innerHTML=`<div class="empty-state">Gagal memuat: ${esc(err.message)}</div>`;
    }
  }
}

async function sendMsg(){
  const to=document.getElementById('send-to').value;
  const txt=document.getElementById('send-msg').value.trim();
  const res=document.getElementById('send-result');
  if(!to){setResult('send-result','Pilih penerima.','error');return}
  if(!txt){setResult('send-result','Pesan tidak boleh kosong.','error');return}
  res.innerHTML='<div class="loading">🔐 Mengenkripsi...</div>';
  try{
    const keyData=await API.getRecipientKey(to);
    const ciphertext=await Crypto.encrypt(txt,keyData.key,to);
    await API.sendMessage(to,ciphertext);
    document.getElementById('send-msg').value='';
    document.getElementById('send-to').value='';
    setResult('send-result','🔐 Terenkripsi &amp; terkirim secara anonim!');
    await loadUsers();
  } catch(err){
    setResult('send-result',err.message,'error');
  }
}

async function renderSentTo(){
  try{
    const sent=await API.getSent();
    const el=document.getElementById('sent-to-list');
    if(!sent.length){el.innerHTML='<span style="font-size:13px;color:var(--text-hint)">Belum ada.</span>';return}
    el.innerHTML=sent.map(n=>`<span class="chip">✓ ${esc(n)}</span>`).join('');
  } catch{}
}

// ─── TABS ──────────────────────────────────────────────────────
function userTab(btn,tabId){
  document.querySelectorAll('#screen-user .tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#screen-user .tab-pane').forEach(p=>p.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if(tabId==='tab-inbox'){checkPhaseBanners();renderInbox();}
  if(tabId==='tab-send'){checkPhaseBanners();loadUsers();renderSentTo();}
}
function adminTab(btn,tabId){
  document.querySelectorAll('#screen-admin .tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#screen-admin .tab-pane').forEach(p=>p.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if(tabId==='atab-fase') loadAdminPhases();
  if(tabId==='atab-users') loadAdminUsers();
  if(tabId==='atab-msgs') loadAdminMsgs();
  if(tabId==='atab-backup') loadBackupLogs();
}

// ─── ADMIN: FASE ───────────────────────────────────────────────
async function loadAdminPhases(){
  try{
    const s=await API.adminGetSettings();
    const chkSend=document.getElementById('toggle-send');
    const chkRead=document.getElementById('toggle-read');
    if(chkSend) chkSend.checked=s.phase_send==='open';
    if(chkRead) chkRead.checked=s.phase_read==='open';
    updatePhaseStatus('send',s.phase_send);
    updatePhaseStatus('read',s.phase_read);
  } catch{}
}

function updatePhaseStatus(phase,value){
  const el=document.getElementById(`phase-${phase}-status`);
  if(!el) return;
  if(value==='open'){
    el.textContent='● Sedang terbuka';
    el.className='phase-status status-open';
  } else {
    el.textContent='● Tertutup';
    el.className='phase-status status-closed';
  }
}

async function togglePhase(phase){
  const chk=document.getElementById(`toggle-${phase}`);
  const newVal=chk.checked?'open':'closed';
  try{
    await API.adminSetSettings({[`phase_${phase}`]:newVal});
    updatePhaseStatus(phase,newVal);
  } catch(err){
    alert('Gagal mengubah fase: '+err.message);
    chk.checked=!chk.checked; // revert
  }
}

// ─── ADMIN: USERS ──────────────────────────────────────────────
async function loadAdminUsers(){
  const el=document.getElementById('admin-user-list');
  if(!el) return;
  el.innerHTML='<div class="loading">Memuat...</div>';
  try{
    const users=await API.adminGetUsers();
    if(!users.length){el.innerHTML='<div class="empty-state"><span class="icon">👥</span>Belum ada siswa.</div>';return}
    el.innerHTML=users.map(u=>`
      <div class="user-row">
        <div class="user-info">
          <div class="avatar">${initials(u.name)}</div>
          <div>
            <div class="user-name">${esc(u.name)}</div>
            <span class="setup-badge ${u.is_setup?'setup-done':'setup-pending'}">
              ${u.is_setup?'✓ Sudah setup password':'⏳ Belum setup password'}
            </span>
            <div class="user-stats">📨 ${u.received??0} diterima · 📤 ${u.sent??0} terkirim</div>
          </div>
        </div>
        <div class="user-actions">
          ${u.is_setup
            ?`<button class="btn btn-sm btn-secondary" onclick="showPasswordModal('${esc(u.name)}')">🔑</button>`
            :`<span style="font-size:12px;color:var(--text-hint)">Belum ada password</span>`}
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${esc(u.name)}')">🗑️</button>
        </div>
      </div>`).join('');
  } catch(err){el.innerHTML=`<div class="empty-state">Error: ${esc(err.message)}</div>`}
}

async function addUser(){
  const name=document.getElementById('new-name').value.trim();
  if(!name){setResult('add-result','Isi nama siswa.','error');return}
  try{
    await API.adminAddUser(name);
    document.getElementById('new-name').value='';
    setResult('add-result',`✓ ${esc(name)} ditambahkan! Mereka bisa login dan buat password sendiri.`);
    await loadAdminUsers();
    await refreshLoginSelect();
  } catch(err){setResult('add-result',err.message,'error')}
}

async function bulkImport(){
  const raw=document.getElementById('bulk-csv').value.trim();
  if(!raw){setResult('bulk-result','Isi nama dulu.','error');return}
  const names=raw.split('\n').map(l=>l.trim()).filter(Boolean);
  let ok=0,fail=0,skipped=0;
  for(const name of names){
    if(!name){skipped++;continue}
    try{await API.adminAddUser(name);ok++;}
    catch(e){e.message.includes('sudah')?skipped++:fail++;}
  }
  setResult('bulk-result',`✓ ${ok} ditambahkan · ${skipped} sudah ada · ${fail} gagal`,ok>0?'success':'error');
  document.getElementById('bulk-csv').value='';
  await loadAdminUsers();
  await refreshLoginSelect();
}

async function deleteUser(name){
  if(!confirm(`Hapus ${name}? Semua pesan terkait juga dihapus.`)) return;
  try{
    await API.adminDeleteUser(name);
    await loadAdminUsers();
    await refreshLoginSelect();
  } catch(err){alert('Gagal: '+err.message)}
}

// ─── ADMIN: PASSWORD MODAL ─────────────────────────────────────
async function showPasswordModal(name){
  document.getElementById('modal-title').textContent='🔑 Password — '+name;
  document.getElementById('modal-body').innerHTML='<div class="loading">Memuat...</div>';
  document.getElementById('modal-confirm-btn').style.display='none';
  document.getElementById('modal-overlay').classList.add('open');
  try{
    const data=await API.adminGetPassword(name);
    document.getElementById('modal-body').innerHTML=`
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Password saat ini:</p>
      <div class="password-display">${esc(data.password||'—')}</div>
      <hr style="border:none;border-top:.5px solid var(--border);margin:14px 0"/>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Reset password (user harus setup ulang):</p>
      <button class="btn btn-danger" onclick="doResetPassword('${esc(name)}')">🔄 Reset Password</button>
      <div id="modal-result"></div>`;
  } catch(err){
    document.getElementById('modal-body').innerHTML=`<div class="error-msg">${esc(err.message)}</div>`;
  }
}

async function doResetPassword(name){
  if(!confirm(`Reset password ${name}? Mereka harus setup ulang saat login.`)) return;
  try{
    await API.adminResetPass(name);
    document.getElementById('modal-result').innerHTML='<div class="success-msg" style="margin-top:8px">✓ Password direset. User harus setup ulang.</div>';
    setTimeout(()=>{closeModal();loadAdminUsers();},1500);
  } catch(err){
    document.getElementById('modal-result').innerHTML=`<div class="error-msg" style="margin-top:8px">${esc(err.message)}</div>`;
  }
}

function closeModal(){document.getElementById('modal-overlay').classList.remove('open')}

// ─── ADMIN: MESSAGES ───────────────────────────────────────────
async function loadAdminMsgs(){
  const el=document.getElementById('admin-msg-list');
  el.innerHTML='<div class="loading">Memuat...</div>';
  try{
    const msgs=await API.adminGetMessages();
    if(!msgs.length){el.innerHTML='<div class="empty-state"><span class="icon">🗃️</span>Belum ada pesan.</div>';return}
    el.innerHTML=msgs.map(m=>`
      <div class="msg-card">
        <span class="badge badge-enc">🔐 Terenkripsi</span>
        <div class="msg-meta" style="margin-bottom:6px">
          <strong>${esc(m.sender_name)}</strong> → <strong>${esc(m.recipient_name)}</strong> · ${fmtDate(m.created_at)}
        </div>
        <div class="enc-text">${esc(m.preview)}…</div>
      </div>`).join('');
  } catch(err){el.innerHTML=`<div class="empty-state">Error: ${esc(err.message)}</div>`}
}

// ─── ADMIN: BACKUP ─────────────────────────────────────────────
async function loadBackupLogs(){
  const el=document.getElementById('backup-log-list');
  el.innerHTML='<div class="loading">Memuat...</div>';
  try{
    const logs=await API.adminGetBackupLogs();
    if(!logs.length){el.innerHTML='<div class="empty-state">Belum ada riwayat backup.</div>';return}
    el.innerHTML=logs.map(l=>`
      <div class="backup-row">
        <span>${l.status==='success'?'✅':'❌'}</span>
        <div>
          <div style="font-weight:500">${esc(l.file_name||'-')}</div>
          <div style="color:var(--text-muted)">${fmtDate(l.created_at)}
            ${l.drive_url?` · <a href="${esc(l.drive_url)}" target="_blank" style="color:var(--accent)">Lihat di Drive</a>`:''}
          </div>
          ${l.error_msg?`<div style="color:var(--red);font-size:12px">${esc(l.error_msg)}</div>`:''}
        </div>
      </div>`).join('');
  } catch{el.innerHTML='<div class="empty-state">Gagal memuat riwayat.</div>'}
}

async function triggerBackup(){
  setResult('backup-result','⏳ Menjalankan backup...');
  try{
    await API.adminTriggerBackup();
    setResult('backup-result','✅ Backup dimulai di background. Cek riwayat dalam beberapa detik.');
    setTimeout(loadBackupLogs,3000);
  } catch(err){setResult('backup-result',err.message,'error')}
}

// ─── LOGIN SELECT ──────────────────────────────────────────────
async function refreshLoginSelect(){
  try{
    const names=await API.getAllNames();
    const sel=document.getElementById('login-name');
    const cur=sel.value;
    sel.innerHTML='<option value="">— Pilih namamu —</option>';
    names.forEach(({name})=>{
      const o=document.createElement('option');
      o.value=name;o.textContent=name;
      sel.appendChild(o);
    });
    if(cur) sel.value=cur;
  } catch{}
}

// ─── INIT ──────────────────────────────────────────────────────
async function init(){
  await refreshLoginSelect();

  // Auto restore session
  const token=API.getToken();
  const role=localStorage.getItem('sn_role');
  const savedName=localStorage.getItem('sn_user');
  if(token && role==='admin'){
    try{await loadAdminPhases();showScreen('screen-admin');}
    catch{API.clearToken();}
  } else if(token && savedName){
    try{await initUserScreen(savedName);}
    catch{API.clearToken();}
  }
}

document.addEventListener('DOMContentLoaded',init);

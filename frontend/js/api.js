const API = (() => {
  const BASE = '/api';
  function setToken(t){localStorage.setItem('sn_token',t)}
  function getToken(){return localStorage.getItem('sn_token')}
  function clearToken(){['sn_token','sn_user','sn_pass','sn_role'].forEach(k=>localStorage.removeItem(k))}

  async function req(method,path,body){
    const headers={'Content-Type':'application/json'};
    const t=getToken(); if(t) headers['Authorization']='Bearer '+t;
    const res=await fetch(BASE+path,{method,headers,body:body?JSON.stringify(body):undefined});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||'Server error');
    return data;
  }
  return {
    setToken,getToken,clearToken,
    checkName:        (name)         => req('GET',`/auth/check/${encodeURIComponent(name)}`),
    setupPassword:    (name,password) => req('POST','/auth/setup',{name,password}),
    loginUser:        (name,password) => req('POST','/auth/login',{name,password}),
    loginAdmin:       (password)      => req('POST','/auth/admin',{password}),
    getAllNames:       ()              => req('GET','/users/all-names'),
    getPhases:        ()              => req('GET','/settings/phases'),
    getUsers:         ()              => req('GET','/users'),
    getInbox:         ()              => req('GET','/messages/inbox'),
    getSent:          ()              => req('GET','/messages/sent'),
    getRecipientKey:  (name)          => req('GET',`/messages/recipient-key/${encodeURIComponent(name)}`),
    sendMessage:      (r,c)           => req('POST','/messages/send',{recipient_name:r,ciphertext:c}),
    adminGetUsers:    ()              => req('GET','/admin/users'),
    adminAddUser:     (name)          => req('POST','/admin/users',{name}),
    adminGetPassword: (name)          => req('GET',`/admin/users/${encodeURIComponent(name)}/password`),
    adminResetPass:   (name)          => req('PUT',`/admin/users/${encodeURIComponent(name)}/reset-password`,{}),
    adminDeleteUser:  (name)          => req('DELETE',`/admin/users/${encodeURIComponent(name)}`),
    adminGetMessages: ()              => req('GET','/admin/messages'),
    adminGetSettings: ()              => req('GET','/admin/settings'),
    adminGetBackupLogs:()             => req('GET','/admin/backup-logs'),
    adminTriggerBackup:()             => req('POST','/admin/backup'),
    // Inbox raw untuk re-enkripsi
    getInboxRaw:      ()              => req('GET','/messages/inbox-raw'),
    reEncryptMessages:(messages)      => req('POST','/messages/reencrypt',{messages}),
    getSentDetail:    ()              => req('GET','/messages/sent-detail'),
    editMessage:      (id,ciphertext) => req('PUT',`/messages/${id}`,{ciphertext}),
    // Class board
    getClassBoard:    ()              => req('GET','/class-board'),
    sendClassMsg:     (content)       => req('POST','/class-board',{content}),
    deleteClassMsg:   (id)            => req('DELETE',`/class-board/${id}`),
    adminGetClassBoard:()             => req('GET','/admin/class-board'),
    adminDeleteClassMsg:(id)          => req('DELETE',`/admin/class-board/${id}`),
    adminSetSettings: (body)          => req('PUT','/admin/settings',body),
  };
})();

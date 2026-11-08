/* Accounts and friends. Needs config.js (Supabase URL + anon key) and supabase-js. */
(function(){
const cfg=window.BLOK_CONFIG||{};
const ok=!!(cfg.url&&cfg.key&&window.supabase);
const sb=ok?window.supabase.createClient(cfg.url,cfg.key):null;
const root=document.querySelector('#pg-friends');
if(!root)return;
let me=null,mode='in',msg='',rows=[],busy=false,syncT=null;
const H=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mail=u=>u+'@blokdunyo.app';
const UN=/^[a-z0-9_]{3,16}$/;
const tr=m=>{m=String(m||'');if(/Invalid login/i.test(m))return 'Nom yoki parol no\u02bbto\u02bbg\u02bbri';if(/already registered/i.test(m))return 'Bu nom band';if(/at least 6/i.test(m))return 'Parol kamida 6 belgi bo\u02bblsin';if(/rate limit|too many/i.test(m))return 'Juda ko\u02bbp urinish. Birozdan keyin qayta urinib ko\u02bbring';if(/fetch|network/i.test(m))return 'Internet yo\u02bbq yoki server javob bermadi';return m};
function face(a){a=a||{};const v=id=>(typeof byId!=='undefined'&&byId[id])?byId[id].v:null;
  return `<span class="avc" style="background:${v(a.bg)&&!/gradient/.test(v(a.bg))?v(a.bg):'#eef0f3'}"><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="12" y="23" width="16" height="15" rx="2" fill="${v(a.sh)||'#3db8a5'}"/><rect x="13" y="7" width="14" height="14" rx="3" fill="${v(a.skin)||'#e8c9a0'}"/></svg></span>`}
const myName=()=>me&&me.user_metadata&&me.user_metadata.username||'';
function authView(){const up=mode==='up';
  return `<div class="fa"><h2 class="sh">${up?'Ro\u02bbyxatdan o\u02bbtish':'Kirish'}</h2>
  <p class="fh">Do\u02bbstlar bilan o\u02bbynash uchun hisob kerak. Faqat nom va parol so\u02bbraladi.</p>
  <label class="fl" for="fu">Foydalanuvchi nomi</label><input id="fu" class="fi" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="16" placeholder="masalan: blok_ustasi">
  <label class="fl" for="fp">Parol</label><input id="fp" class="fi" type="password" autocomplete="${up?'new-password':'current-password'}" placeholder="kamida 6 belgi">
  <div class="fm" role="status">${H(msg)}</div>
  <button class="btn" data-a="${up?'signup':'signin'}"${busy?' disabled':''}>${up?'Hisob yaratish':'Kirish'}</button>
  <button class="fx" data-a="mode">${up?'Hisobim bor, kirish':'Hisobim yo\u02bbq, ro\u02bbyxatdan o\u02bbtish'}</button>
  ${up?'<p class="fh">Parolni unutsangiz tiklab bo\u02bblmaydi, uni eslab qoling.</p>':''}</div>`}
function item(r,btns){const o=r.requester===me.id?r.ap:r.rp;
  return `<div class="fr">${face(o&&o.avatar)}<b>@${H(o?o.username:'?')}</b><span class="fb">${btns}</span></div>`}
function friendsView(){
  const inc=rows.filter(r=>r.status==='pending'&&r.addressee===me.id),out=rows.filter(r=>r.status==='pending'&&r.requester===me.id),fr=rows.filter(r=>r.status==='accepted');
  const sec=(t,a,f)=>a.length?`<h3 class="fs">${t}</h3>${a.map(f).join('')}`:'';
  return `<div class="fa"><div class="me">${face(typeof worn!=='undefined'?worn:{})}<div><b>@${H(myName())}</b><small>Hisobingiz</small></div><button class="fx" data-a="out">Chiqish</button></div>
  <h3 class="fs">Do\u02bbst qo\u02bbshish</h3><div class="fadd"><input id="fq" class="fi" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="16" placeholder="foydalanuvchi nomi"><button class="btn" data-a="add"${busy?' disabled':''}>Yuborish</button></div>
  <div class="fm" role="status">${H(msg)}</div>
  ${sec('So\u02bborovlar',inc,r=>item(r,`<button class="btn" data-a="acc" data-id="${r.id}">Qabul</button><button class="fx" data-a="del" data-id="${r.id}">Rad</button>`))}
  ${sec('Do\u02bbstlar',fr,r=>item(r,`<button class="fx" data-a="del" data-id="${r.id}">Olib tashlash</button>`))}
  ${sec('Yuborilgan',out,r=>item(r,`<button class="fx" data-a="del" data-id="${r.id}">Bekor</button>`))}
  ${rows.length?'':'<p class="fh">Hali do\u02bbstlar yo\u02bbq. Do\u02bbstingizning nomini yozib so\u02bborov yuboring.</p>'}
  <button class="fx" data-a="refresh">Yangilash</button></div>`}
function render(){
  if(!ok){root.innerHTML='<div class="fa"><h2 class="sh">Do\u02bbstlar</h2><p class="fh">Server hali sozlanmagan. <b>config.js</b> fayliga Supabase URL va kalitni yozing.</p></div>';return}
  root.innerHTML=me?friendsView():authView()}
async function load(){if(!me)return;
  const r=await sb.from('friendships').select('id,status,requester,addressee,rp:profiles!friendships_requester_fkey(username,avatar),ap:profiles!friendships_addressee_fkey(username,avatar)').order('created_at',{ascending:false});
  if(r.error){msg=tr(r.error.message);rows=[]}else rows=r.data||[];render()}
function syncAvatar(){if(!sb||!me||typeof worn==='undefined')return;clearTimeout(syncT);
  syncT=setTimeout(()=>{sb.from('profiles').update({avatar:{skin:worn.skin,sh:worn.sh,pa:worn.pa,bg:worn.bg,ht:worn.ht}}).eq('id',me.id).then(()=>{},()=>{})},1500)}
function setUser(u){me=u||null;if(me){load();syncAvatar()}else{rows=[];render()}}
root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!b.dataset.a||busy)return;const a=b.dataset.a;
  if(a==='mode'){mode=mode==='in'?'up':'in';msg='';render();return}
  const run=async fn=>{busy=true;render();try{await fn()}catch(x){msg=tr(x.message)}busy=false;render()};
  if(a==='signin'||a==='signup'){const u=(root.querySelector('#fu').value||'').trim().toLowerCase(),p=root.querySelector('#fp').value||'';
    if(!UN.test(u)){msg='Nom 3\u201316 belgi: a\u2013z, 0\u20139, _';render();return}
    if(p.length<6){msg='Parol kamida 6 belgi bo\u02bclsin';render();return}
    msg='';await run(async()=>{
      const r=a==='signup'?await sb.auth.signUp({email:mail(u),password:p,options:{data:{username:u}}}):await sb.auth.signInWithPassword({email:mail(u),password:p});
      if(r.error){msg=tr(r.error.message);return}
      if(!r.data.session){msg='Hisob yaratildi, lekin Supabase\u2019da \u201cConfirm email\u201d o\u2018chirilmagan.';return}
      setUser(r.data.session.user)});return}
  if(a==='out'){await sb.auth.signOut();setUser(null);return}
  if(a==='refresh'){msg='';await run(load);return}
  if(a==='add'){const u=(root.querySelector('#fq').value||'').trim().toLowerCase();
    if(!UN.test(u)){msg='Nom 3\u201316 belgi: a\u2013z, 0\u20139, _';render();return}
    if(u===myName()){msg='O\u02bbzingizga so\u02bborov yuborib bo\u02bblmaydi';render();return}
    await run(async()=>{const p=await sb.from('profiles').select('id').eq('username',u).maybeSingle();
      if(p.error){msg=tr(p.error.message);return}
      if(!p.data){msg='Bunday foydalanuvchi yo\u02bbq';return}
      const r=await sb.from('friendships').insert({requester:me.id,addressee:p.data.id});
      msg=r.error?(r.error.code==='23505'?'So\u02bborov allaqachon bor yoki siz do\u02bbstsiz':tr(r.error.message)):'So\u02bborov yuborildi';
      await load()});return}
  if(a==='acc'){await run(async()=>{const r=await sb.from('friendships').update({status:'accepted'}).eq('id',+b.dataset.id);if(r.error)msg=tr(r.error.message);await load()});return}
  if(a==='del'){await run(async()=>{const r=await sb.from('friendships').delete().eq('id',+b.dataset.id);if(r.error)msg=tr(r.error.message);await load()});return}
});
if(typeof window.save==='function'){const _s=window.save;window.save=function(){_s.apply(this,arguments);syncAvatar()}}
window.renderFriends=()=>{msg='';if(me)load();else render()};
if(sb){sb.auth.getSession().then(r=>setUser(r.data&&r.data.session?r.data.session.user:null),()=>render());
  sb.auth.onAuthStateChange((ev,s)=>{if(ev==='SIGNED_OUT')setUser(null)})}
render();
})();

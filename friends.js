/* Accounts and friends (Supabase). Needs config.js and supabase-js. */
(function(){
const cfg=window.BLOK_CONFIG||{};
const ok=!!(cfg.url&&cfg.key&&window.supabase);
const sb=ok?window.supabase.createClient(cfg.url,cfg.key):null;
const root=document.querySelector('#pg-friends');
if(!root)return;
let me=null,mode='in',msg='',rows=[],busy=false,tab='add',q='',found=[],syncT=null,searchT=null;
const H=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mail=u=>u+'@blokdunyo.app';
const UN=/^[a-z0-9_]{3,16}$/;
const tr=m=>{m=String(m||'');if(/Invalid login/i.test(m))return 'Nom yoki parol no\u02bbto\u02bbg\u02bbri';if(/already registered/i.test(m))return 'Bu nom band';if(/at least 6/i.test(m))return 'Parol kamida 6 belgi bo\u02bblsin';if(/rate limit|too many/i.test(m))return 'Juda ko\u02bbp urinish. Birozdan keyin qayta urinib ko\u02bbring';if(/fetch|network/i.test(m))return 'Internet yo\u02bbq yoki server javob bermadi';return m};
const val=id=>(typeof byId!=='undefined'&&byId[id])?byId[id].v:null;
function face(a,cls){a=a||{};
  return `<span class="${cls||'avc'}" style="background:${val(a.bg)||'#eef0f3'}"><svg viewBox="0 0 40 40" aria-hidden="true"><rect x="12" y="23" width="16" height="15" rx="2" fill="${val(a.sh)||'#3db8a5'}"/><rect x="13" y="7" width="14" height="14" rx="3" fill="${val(a.skin)||'#e8c9a0'}"/></svg></span>`}
const myName=()=>me&&me.user_metadata&&me.user_metadata.username||'';
const inc=()=>rows.filter(r=>r.status==='pending'&&r.addressee===me.id);
const outg=()=>rows.filter(r=>r.status==='pending'&&r.requester===me.id);
const accepted=()=>rows.filter(r=>r.status==='accepted');
const other=r=>r.requester===me.id?Object.assign({id:r.addressee},r.ap):Object.assign({id:r.requester},r.rp);
const rel=id=>rows.find(r=>r.requester===id||r.addressee===id);
/* ---- home row (circles, like a stories bar) ---- */
window.fillFriendsRow=function(){const el=document.querySelector('#frow');if(!el)return;
  const list=me?accepted().map(other).map(o=>`<div class="fc">${face(o.avatar,'avb')}<span>@${H(o.username||'?')}</span></div>`).join(''):'';
  el.innerHTML=`<button class="fc add" data-go="friends"><span class="avb plus" aria-hidden="true">+</span><span>Do\u02bbst qo\u02bbshish</span></button>`+list};
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b&&typeof go==='function')go(b.dataset.go)});
/* ---- views ---- */
function authView(){const up=mode==='up';
  return `<div class="fa"><h2 class="sh">${up?'Ro\u02bbyxatdan o\u02bbtish':'Kirish'}</h2>
  <p class="fh">Do\u02bbstlar bilan o\u02bbynash uchun hisob kerak. Faqat nom va parol so\u02bbraladi.</p>
  <label class="fl" for="fu">Foydalanuvchi nomi</label><input id="fu" class="fi" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="16" placeholder="masalan: blok_ustasi">
  <label class="fl" for="fp">Parol</label><input id="fp" class="fi" type="password" autocomplete="${up?'new-password':'current-password'}" placeholder="kamida 6 belgi">
  <div class="fm" role="status">${H(msg)}</div>
  <button class="btn" data-a="${up?'signup':'signin'}"${busy?' disabled':''}>${up?'Hisob yaratish':'Kirish'}</button>
  <button class="fx" data-a="mode">${up?'Hisobim bor, kirish':'Hisobim yo\u02bbq, ro\u02bbyxatdan o\u02bbtish'}</button>
  ${up?'<p class="fh">Parolni unutsangiz tiklab bo\u02bblmaydi, uni eslab qoling.</p>':''}</div>`}
function row(o,btns){return `<div class="fr">${face(o.avatar)}<b>@${H(o.username||'?')}</b><span class="fb">${btns}</span></div>`}
function bodyHtml(){
  if(tab==='list'){const f=accepted();
    return f.length?f.map(r=>row(other(r),`<button class="fx" data-a="del" data-id="${r.id}">Olib tashlash</button>`)).join(''):'<p class="fh">Hali do\u02bbstlar yo\u02bbq. \u201cDo\u02bbst qo\u02bbshish\u201d bo\u02bblimida nom bo\u02bbyicha qidiring.</p>'}
  const t=q.trim().toLowerCase();
  if(t.length>=3){
    if(!found.length)return '<p class="fh">Hech kim topilmadi.</p>';
    return found.map(p=>{const r=rel(p.id);let b;
      if(!r)b=`<button class="btn" data-a="add" data-id="${p.id}"${busy?' disabled':''}>Qo\u02bbshish</button>`;
      else if(r.status==='accepted')b='<span class="fh">Do\u02bbst</span>';
      else if(r.requester===me.id)b='<span class="fh">Yuborilgan</span>';
      else b=`<button class="btn" data-a="acc" data-id="${r.id}">Qabul</button>`;
      return row(p,b)}).join('')}
  const i=inc(),o=outg();
  let h='';
  if(i.length)h+='<h3 class="fs">So\u02bborovlar</h3>'+i.map(r=>row(other(r),`<button class="btn" data-a="acc" data-id="${r.id}">Qabul</button><button class="fx" data-a="del" data-id="${r.id}">Rad</button>`)).join('');
  if(o.length)h+='<h3 class="fs">Yuborilgan</h3>'+o.map(r=>row(other(r),`<button class="fx" data-a="del" data-id="${r.id}">Bekor</button>`)).join('');
  return h+'<p class="fh">Do\u02bbstingizning nomini yozing (kamida 3 harf).</p>'}
function paintBody(){const b=root.querySelector('#fbody');if(b)b.innerHTML=bodyHtml();const m=root.querySelector('#fmsg');if(m)m.textContent=msg}
function render(){
  if(!ok){root.innerHTML='<div class="fa"><h2 class="sh">Do\u02bbstlar</h2><p class="fh">Server hali sozlanmagan. <b>config.js</b> fayliga Supabase URL va kalitni yozing.</p></div>';return}
  if(!me){root.innerHTML=authView();return}
  const n1=inc().length,n2=accepted().length;
  root.innerHTML=`<div class="fa"><div class="fsearch"><span aria-hidden="true">\u2315</span><input id="fq" type="search" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="16" placeholder="Odamlarni qidirish" aria-label="Odamlarni qidirish" value="${H(q)}"></div>
  <div class="ftabs" role="tablist"><button role="tab" data-a="tab" data-t="add" aria-selected="${tab==='add'}">Do\u02bbst qo\u02bbshish${n1?' ('+n1+')':''}</button><button role="tab" data-a="tab" data-t="list" aria-selected="${tab==='list'}">Do\u02bbstlar${n2?' ('+n2+')':''}</button></div>
  <div class="fm" id="fmsg" role="status"></div><div id="fbody"></div>
  <div class="me">${face(typeof worn!=='undefined'?worn:{})}<div><b>@${H(myName())}</b><small>Hisobingiz</small></div><button class="fx" data-a="out">Chiqish</button></div></div>`;
  paintBody()}
async function load(){if(!me)return;
  const r=await sb.from('friendships').select('id,status,requester,addressee,rp:profiles!friendships_requester_fkey(username,avatar),ap:profiles!friendships_addressee_fkey(username,avatar)').order('created_at',{ascending:false});
  if(r.error){msg=tr(r.error.message);rows=[]}else rows=r.data||[];
  render();window.fillFriendsRow()}
async function search(){const t=q.trim().toLowerCase();
  if(t.length<3||/[^a-z0-9_]/.test(t)){found=[];paintBody();return}
  const r=await sb.from('profiles').select('id,username,avatar').ilike('username',t.replace(/_/g,'\\_')+'%').neq('id',me.id).limit(10);
  if(t!==q.trim().toLowerCase())return; // a newer search is running
  found=r.error?[]:(r.data||[]);if(r.error)msg=tr(r.error.message);paintBody()}
function syncAvatar(){if(!sb||!me||typeof worn==='undefined')return;clearTimeout(syncT);
  syncT=setTimeout(()=>{sb.from('profiles').update({avatar:{skin:worn.skin,sh:worn.sh,pa:worn.pa,bg:worn.bg,ht:worn.ht}}).eq('id',me.id).then(()=>{},()=>{})},1500)}
function setUser(u){me=u||null;msg='';if(me){load();syncAvatar()}else{rows=[];found=[];q='';render();window.fillFriendsRow()}}
root.addEventListener('input',e=>{if(e.target.id!=='fq')return;q=e.target.value;if(tab!=='add'){tab='add';render();root.querySelector('#fq').focus()}clearTimeout(searchT);searchT=setTimeout(search,350)});
root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!b.dataset.a||busy)return;const a=b.dataset.a;
  if(a==='mode'){mode=mode==='in'?'up':'in';msg='';render();return}
  if(a==='tab'){tab=b.dataset.t;msg='';render();return}
  const run=async fn=>{busy=true;try{await fn()}catch(x){msg=tr(x.message)}busy=false;if(me)paintBody();else render()};
  if(a==='signin'||a==='signup'){const u=(root.querySelector('#fu').value||'').trim().toLowerCase(),p=root.querySelector('#fp').value||'';
    if(!UN.test(u)){msg='Nom 3\u201316 belgi: a\u2013z, 0\u20139, _';render();return}
    if(p.length<6){msg='Parol kamida 6 belgi bo\u02bclsin';render();return}
    msg='';busy=true;render();
    try{
      const r=a==='signup'?await sb.auth.signUp({email:mail(u),password:p,options:{data:{username:u}}}):await sb.auth.signInWithPassword({email:mail(u),password:p});
      if(r.error)msg=tr(r.error.message);
      else if(!r.data.session)msg='Hisob yaratildi, lekin Supabase\u2019da \u201cConfirm email\u201d o\u2018chirilmagan.';
      else{busy=false;setUser(r.data.session.user);return}
    }catch(x){msg=tr(x.message)}
    busy=false;render();return}
  if(a==='out'){await sb.auth.signOut();setUser(null);return}
  if(a==='add'){await run(async()=>{const r=await sb.from('friendships').insert({requester:me.id,addressee:b.dataset.id});
      msg=r.error?(r.error.code==='23505'?'So\u02bborov allaqachon bor yoki siz do\u02bbstsiz':tr(r.error.message)):'So\u02bborov yuborildi';await load()});return}
  if(a==='acc'){await run(async()=>{const r=await sb.from('friendships').update({status:'accepted'}).eq('id',+b.dataset.id);if(r.error)msg=tr(r.error.message);await load()});return}
  if(a==='del'){await run(async()=>{const r=await sb.from('friendships').delete().eq('id',+b.dataset.id);if(r.error)msg=tr(r.error.message);await load()});return}
});
if(typeof window.save==='function'){const _s=window.save;window.save=function(){_s.apply(this,arguments);syncAvatar()}}
window.renderFriends=()=>{msg='';if(me)load();else render()};
if(sb){sb.auth.getSession().then(r=>setUser(r.data&&r.data.session?r.data.session.user:null),()=>render());
  sb.auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_OUT')setUser(null)})}
render();window.fillFriendsRow();
})();

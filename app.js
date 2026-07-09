/* ============================================================
   CatCare AI — Application logic (vanilla JS, offline-first)
   ============================================================ */
'use strict';

/* ---------- ค่าคงที่ ---------- */
const DB_KEY = 'catcare_db_v1';
const BACKUP_KEY = 'catcare_autobackup_v1';
const APP_VERSION = '1.1.0';

const SPECIES = { cat:{label:'แมว', emoji:'🐱'}, dog:{label:'สุนัข', emoji:'🐶'},
  rabbit:{label:'กระต่าย', emoji:'🐰'}, bird:{label:'นก', emoji:'🐦'}, other:{label:'อื่น ๆ', emoji:'🐾'} };

const REC_CATS = {
  vaccine:  {label:'วัคซีน', emoji:'💉'},
  deworm:   {label:'ถ่ายพยาธิ', emoji:'🪱'},
  fleatick: {label:'เห็บหมัด', emoji:'🐜'},
  med:      {label:'ยา', emoji:'💊'},
  test:     {label:'ผลตรวจ', emoji:'🔬'},
  doc:      {label:'เอกสาร', emoji:'📄'},
};

/* ---------- Store ---------- */
function freshDB(){
  return { v:1, activePetId:null, pets:[], records:[], logs:[], assessments:[],
    reminders:[], chats:[], settings:{aiProvider:'claude', apiKey:'', model:''} };
}
let DB = loadDB();

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return freshDB();
    const d = JSON.parse(raw);
    return Object.assign(freshDB(), d);
  }catch(e){ console.warn('loadDB fail', e); return freshDB(); }
}
function saveDB(){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch(e){ toast('พื้นที่จัดเก็บเต็ม (รูปอาจใหญ่เกินไป)'); }
}
/* สำรองอัตโนมัติก่อนการเปลี่ยนแปลงสำคัญ (backup ก่อนอัปเดต) */
function autoBackup(){
  try{ localStorage.setItem(BACKUP_KEY, JSON.stringify({ at:Date.now(), data:DB })); }catch(e){}
}

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),2200); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function fmtDate(s){ if(!s) return '-'; const d=new Date(s); if(isNaN(d)) return s;
  return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

function calcAge(birth){
  if(!birth) return '-';
  const b=new Date(birth), n=new Date();
  let m=(n.getFullYear()-b.getFullYear())*12 + (n.getMonth()-b.getMonth());
  if(n.getDate()<b.getDate()) m--;
  if(m<0) return '-';
  const y=Math.floor(m/12), mm=m%12;
  if(y===0) return mm+' เดือน';
  return y+' ปี'+(mm?' '+mm+' เดือน':'');
}

function activePet(){ return DB.pets.find(p=>p.id===DB.activePetId) || DB.pets[0] || null; }
function petAvatar(p, lg){
  const cls='avatar'+(lg?' lg':'');
  if(p && p.photo) return `<img class="${cls}" src="${p.photo}" alt="">`;
  const emoji = p ? (SPECIES[p.species]||SPECIES.other).emoji : '🐾';
  return `<div class="${cls}">${emoji}</div>`;
}

/* ---------- รูปภาพ: ย่อขนาดแล้วเก็บเป็น base64 ---------- */
function readImage(file, cb, maxSize){
  maxSize = maxSize || 700;
  if(!file){ toast('ไม่พบไฟล์รูป'); return; }
  const isHeic = /heic|heif/i.test(file.type||'') || /\.(heic|heif)$/i.test(file.name||'');
  if(isHeic){
    if(!navigator.onLine){ toast('รูป HEIC ต้องต่ออินเทอร์เน็ตเพื่อแปลง หรือใช้ไฟล์ JPG/PNG'); return; }
    toast('กำลังแปลงรูป HEIC…');
    loadHeicLib()
      .then(()=>window.heic2any({ blob:file, toType:'image/jpeg', quality:0.85 }))
      .then(jpg=>processImageFile(Array.isArray(jpg)?jpg[0]:jpg, cb, maxSize))
      .catch(()=>{ toast('แปลงรูป HEIC ไม่สำเร็จ ลองใช้ไฟล์ JPG หรือ PNG'); });
    return;
  }
  processImageFile(file, cb, maxSize);
}
function loadHeicLib(){
  return new Promise((resolve,reject)=>{
    if(window.heic2any) return resolve();
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload=()=>resolve(); s.onerror=()=>reject(new Error('load fail'));
    document.head.appendChild(s);
  });
}
function processImageFile(file, cb, maxSize){
  const reader = new FileReader();
  reader.onerror = ()=>{ toast('อ่านไฟล์รูปไม่สำเร็จ'); };
  reader.onload = e=>{
    const raw = e.target.result;
    const img = new Image();
    img.onload = ()=>{
      try{
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if(!w || !h){ cb(raw); return; }
        if(w>h && w>maxSize){ h=Math.round(h*maxSize/w); w=maxSize; }
        else if(h>maxSize){ w=Math.round(w*maxSize/h); h=maxSize; }
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const ctx=c.getContext('2d');
        if(!ctx){ cb(raw); return; }
        ctx.drawImage(img,0,0,w,h);
        let out;
        try{ out=c.toDataURL('image/jpeg',0.72); }catch(err){ out=null; }
        cb(out && out.length>50 ? out : raw);
      }catch(err){ cb(raw); }
    };
    // ถอดรหัสรูปไม่ได้ (เช่น HEIC ที่แปลงไม่สำเร็จ) → ไม่โชว์ไอคอนรูปแตก แต่แจ้งเตือน
    img.onerror = ()=>{ toast('ไฟล์รูปนี้แสดงไม่ได้ กรุณาใช้ไฟล์ JPG หรือ PNG'); };
    img.src = raw;
  };
  reader.readAsDataURL(file);
}

/* ---------- Navigation ---------- */
let currentTab='home';
function go(tab){
  currentTab=tab;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  $('page-'+tab).classList.add('active');
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on', t.dataset.tab===tab));
  window.scrollTo(0,0);
  render();
}
function fabAction(){
  if(!activePet() && currentTab!=='home'){ toast('เพิ่มโปรไฟล์แมวก่อน'); return; }
  if(currentTab==='home') openPetForm();
  else if(currentTab==='book') openRecordForm();
  else if(currentTab==='dash') openLogForm();
  else if(currentTab==='assess') go('assess');
}

/* ---------- Render dispatcher ---------- */
function render(){
  const p = activePet();
  $('petSwitch').textContent = p ? (SPECIES[p.species]||SPECIES.other).emoji+' '+p.name+' ▾' : 'เพิ่มแมว ＋';
  const fab=$('fab');
  fab.classList.toggle('hidden', currentTab==='assess'||currentTab==='more');
  if(currentTab==='home') renderHome();
  else if(currentTab==='book') renderBook();
  else if(currentTab==='assess') renderAssess();
  else if(currentTab==='dash') renderDash();
  else if(currentTab==='more') renderMore();
}

/* =========================================================
   HOME
   ========================================================= */
function renderHome(){
  const p = activePet();
  const el = $('page-home');
  if(!p){
    el.innerHTML = `<div class="card"><div class="empty">
      <span class="em">🐱</span>
      <h2>ยินดีต้อนรับสู่ CatCare AI</h2>
      <p class="muted">เริ่มต้นด้วยการเพิ่มโปรไฟล์แมวของคุณ</p>
      <button class="btn primary block" onclick="openPetForm()">＋ เพิ่มโปรไฟล์แมว</button>
      <button class="btn ghost block" style="margin-top:8px" onclick="go('more');setTimeout(()=>moreTab('guide'),50)">📖 ดูวิธีใช้งานแอป</button>
      <button class="btn ghost block" style="margin-top:8px" onclick="go('assess')">🩺 ลองประเมินอาการ (ไม่ต้องเพิ่มแมว)</button>
    </div></div>
    <div class="notice">แอปนี้เป็นผู้ช่วยดูแลสุขภาพเบื้องต้น ไม่ใช่ระบบคลินิก และไม่ทดแทนการวินิจฉัยของสัตวแพทย์</div>`;
    return;
  }
  const ups = upcomingReminders(p.id).slice(0,4);
  const lastLog = DB.logs.filter(l=>l.petId===p.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const recCount = DB.records.filter(r=>r.petId===p.id).length;

  el.innerHTML = `
  <div class="card" style="display:flex;gap:14px;align-items:center">
    ${petAvatar(p,true)}
    <div style="flex:1;min-width:0">
      <h2 style="margin:0">${esc(p.name)}</h2>
      <div class="muted">${(SPECIES[p.species]||SPECIES.other).label} · ${esc(p.breed||'ไม่ระบุสายพันธุ์')}</div>
      <div class="muted">${calcAge(p.birthdate)} · ${p.sex==='m'?'เพศผู้':p.sex==='f'?'เพศเมีย':'-'} · ${p.weight?p.weight+' กก.':'-'}</div>
    </div>
    <button class="btn ghost sm" onclick="openPetForm('${p.id}')">แก้ไข</button>
  </div>

  ${ (p.chronic||p.allergies) ? `<div class="card">
     ${p.chronic?`<div><span class="badge warn">โรคประจำตัว</span> ${esc(p.chronic)}</div>`:''}
     ${p.allergies?`<div style="margin-top:8px"><span class="badge danger">ประวัติแพ้ยา</span> ${esc(p.allergies)}</div>`:''}
   </div>`:''}

  <div class="card">
    <h2>🔔 การเตือนที่ใกล้ถึง</h2>
    ${ups.length? ups.map(r=>{
      const d=daysBetween(todayStr(), r.dueDate);
      const cls=d<0?'danger':d<=7?'warn':'info';
      const txt=d<0?`เลยกำหนด ${Math.abs(d)} วัน`:d===0?'วันนี้':`อีก ${d} วัน`;
      return `<div class="list-item"><div class="avatar" style="width:42px;height:42px;font-size:20px">${r.emoji}</div>
        <div class="meta"><div class="t">${esc(r.title)}</div><div class="s">${fmtDate(r.dueDate)}</div></div>
        <span class="badge ${cls}">${txt}</span></div>`;
    }).join(''):'<div class="empty">ยังไม่มีการเตือน — เพิ่มได้จากสมุดสุขภาพ (กรอกวันครั้งถัดไป)</div>'}
  </div>

  <div class="grid">
    <div class="stat"><div class="v">${recCount}</div><div class="l">บันทึกสุขภาพ</div></div>
    <div class="stat"><div class="v">${lastLog?lastLog.weight||'-':'-'}</div><div class="l">น้ำหนักล่าสุด (กก.)</div></div>
  </div>

  <div class="card">
    <h2>⚡ ทางลัด</h2>
    <div class="row">
      <button class="btn ghost" onclick="go('assess')">🩺 ประเมินอาการ</button>
      <button class="btn ghost" onclick="openLogForm()">📊 บันทึกวันนี้</button>
      <button class="btn ghost" onclick="openRecordForm()">💉 เพิ่มบันทึก</button>
      <button class="btn ghost" onclick="go('more');setTimeout(()=>moreTab('report'),50)">📋 ทำรายงาน</button>
      <button class="btn ghost" onclick="go('more');setTimeout(()=>moreTab('guide'),50)">📖 วิธีใช้งาน</button>
    </div>
  </div>`;
}

function upcomingReminders(petId){
  const out=[];
  DB.records.filter(r=>r.petId===petId && r.nextDate).forEach(r=>{
    out.push({ title:(REC_CATS[r.category]||{}).label+': '+(r.title||''), dueDate:r.nextDate, emoji:(REC_CATS[r.category]||{}).emoji||'🔔' });
  });
  DB.reminders.filter(r=>r.petId===petId && !r.done).forEach(r=>{
    out.push({ title:r.title, dueDate:r.dueDate, emoji:'🔔' });
  });
  return out.sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
}

/* ---------- Pet form ---------- */
let _petPhoto=null;
function openPetForm(id){
  const p = id ? DB.pets.find(x=>x.id===id) : null;
  _petPhoto = p ? p.photo : null;
  const spOpts = Object.entries(SPECIES).map(([k,v])=>`<option value="${k}" ${p&&p.species===k?'selected':(!p&&k==='cat'?'selected':'')}>${v.emoji} ${v.label}</option>`).join('');
  openModal(`${p?'แก้ไขโปรไฟล์':'เพิ่มโปรไฟล์'}`, `
    <div style="text-align:center;margin-bottom:8px">
      <div id="petPhotoWrap">${petAvatar(p||{},true)}</div>
      <label style="display:inline-block;margin-top:8px;color:var(--brand);cursor:pointer">
        📷 เลือกรูป<input type="file" accept="image/*" style="display:none" onchange="onPetPhoto(this)">
      </label>
    </div>
    <label>ชนิดสัตว์</label><select id="f_species">${spOpts}</select>
    <label>ชื่อ *</label><input id="f_name" value="${p?esc(p.name):''}" placeholder="เช่น เหมียว">
    <div class="grid">
      <div><label>วันเกิด</label><input id="f_birth" type="date" value="${p?p.birthdate||'':''}"></div>
      <div><label>เพศ</label><select id="f_sex">
        <option value="">-</option>
        <option value="m" ${p&&p.sex==='m'?'selected':''}>เพศผู้</option>
        <option value="f" ${p&&p.sex==='f'?'selected':''}>เพศเมีย</option>
      </select></div>
    </div>
    <div class="grid">
      <div><label>สายพันธุ์</label><input id="f_breed" value="${p?esc(p.breed||''):''}" placeholder="เช่น ไทย, เปอร์เซีย"></div>
      <div><label>น้ำหนัก (กก.)</label><input id="f_weight" type="number" step="0.1" value="${p?p.weight||'':''}"></div>
    </div>
    <label>โรคประจำตัว</label><textarea id="f_chronic" placeholder="เช่น โรคไตเรื้อรัง">${p?esc(p.chronic||''):''}</textarea>
    <label>ประวัติแพ้ยา</label><textarea id="f_allergy" placeholder="เช่น แพ้ยาปฏิชีวนะกลุ่ม...">${p?esc(p.allergies||''):''}</textarea>
    <button class="btn primary block" style="margin-top:14px" onclick="savePet('${id||''}')">บันทึก</button>
    ${p?`<button class="btn danger block" style="margin-top:8px" onclick="deletePet('${id}')">ลบโปรไฟล์นี้</button>`:''}
  `);
}
function onPetPhoto(input){
  if(!input.files[0]) return;
  readImage(input.files[0], data=>{ _petPhoto=data; $('petPhotoWrap').innerHTML=`<img class="avatar lg" src="${data}">`; });
}
function savePet(id){
  const name=$('f_name').value.trim();
  if(!name){ toast('กรุณากรอกชื่อ'); return; }
  autoBackup();
  const data={ species:$('f_species').value, name, birthdate:$('f_birth').value,
    sex:$('f_sex').value, breed:$('f_breed').value.trim(), weight:parseFloat($('f_weight').value)||'',
    chronic:$('f_chronic').value.trim(), allergies:$('f_allergy').value.trim(), photo:_petPhoto };
  if(id){ const p=DB.pets.find(x=>x.id===id); Object.assign(p,data); }
  else{ const np=Object.assign({id:uid(),createdAt:Date.now()},data); DB.pets.push(np); DB.activePetId=np.id;
        if(data.weight) DB.logs.push({id:uid(),petId:np.id,date:todayStr(),weight:data.weight}); }
  saveDB(); closeModal(); toast('บันทึกแล้ว'); render();
}
function deletePet(id){
  if(!confirm('ลบโปรไฟล์และข้อมูลสุขภาพทั้งหมดของสัตว์ตัวนี้?')) return;
  autoBackup();
  DB.pets=DB.pets.filter(p=>p.id!==id);
  DB.records=DB.records.filter(r=>r.petId!==id);
  DB.logs=DB.logs.filter(l=>l.petId!==id);
  DB.assessments=DB.assessments.filter(a=>a.petId!==id);
  DB.reminders=DB.reminders.filter(r=>r.petId!==id);
  if(DB.activePetId===id) DB.activePetId=DB.pets[0]?DB.pets[0].id:null;
  saveDB(); closeModal(); toast('ลบแล้ว'); render();
}
function openPetSwitch(){
  openModal('เลือกสัตว์เลี้ยง', `
    ${DB.pets.map(p=>`<div class="list-item" onclick="switchPet('${p.id}')" style="cursor:pointer">
      ${petAvatar(p)}<div class="meta"><div class="t">${esc(p.name)}</div>
      <div class="s">${(SPECIES[p.species]||SPECIES.other).label} · ${calcAge(p.birthdate)}</div></div>
      ${p.id===DB.activePetId?'<span class="badge ok">กำลังใช้</span>':''}</div>`).join('') || '<div class="empty">ยังไม่มีสัตว์เลี้ยง</div>'}
    <button class="btn primary block" style="margin-top:12px" onclick="closeModal();openPetForm()">＋ เพิ่มสัตว์เลี้ยงใหม่</button>
  `);
}
function switchPet(id){ DB.activePetId=id; saveDB(); closeModal(); render(); }

/* =========================================================
   HEALTH BOOK
   ========================================================= */
let bookFilter='all';
function pendingRecords(petId){ return DB.records.filter(r=>r.petId===petId && r.status==='pending'); }
function renderBook(){
  const p=activePet(); const el=$('page-book');
  if(!p){ el.innerHTML=noPet(); return; }
  const cats=['all','pending',...Object.keys(REC_CATS)];
  const label=c=> c==='all'?'ทั้งหมด' : c==='pending'?'⏳ รอผล' : REC_CATS[c].emoji+' '+REC_CATS[c].label;
  let recs=DB.records.filter(r=>r.petId===p.id);
  if(bookFilter==='pending') recs=recs.filter(r=>r.status==='pending');
  else if(bookFilter!=='all') recs=recs.filter(r=>r.category===bookFilter);
  recs.sort((a,b)=>{
    const pa=a.status==='pending'?0:1, pb=b.status==='pending'?0:1;
    if(pa!==pb) return pa-pb;
    return (b.date||'').localeCompare(a.date||'');
  });
  const npend=pendingRecords(p.id).length;
  el.innerHTML=`
  <div class="seg">${cats.map(c=>`<button class="${bookFilter===c?'on':''}" onclick="bookFilter='${c}';renderBook()">${label(c)}${c==='pending'&&npend?' ('+npend+')':''}</button>`).join('')}</div>
  <div class="card">
    ${recs.length? recs.map(r=>{
      const c=REC_CATS[r.category]||{};
      const ups=(r.updates||[]); const last=ups[ups.length-1];
      return `<div class="list-item" onclick="openRecordForm('${r.id}')" style="cursor:pointer">
        <div class="avatar" style="width:44px;height:44px;font-size:20px">${c.emoji||'📄'}</div>
        <div class="meta"><div class="t">${esc(r.title||c.label)} ${r.status==='pending'?'<span class="badge warn">⏳ รอผล</span>':''}</div>
        <div class="s">${c.label} · ${fmtDate(r.date)}${r.nextDate?' · ครั้งถัดไป '+fmtDate(r.nextDate):''}</div>
        ${r.note?`<div class="s">${esc(r.note)}</div>`:''}
        ${last?`<div class="s">📝 ${fmtDate(last.date)}: ${esc(last.text)}${ups.length>1?' ('+ups.length+' อัพเดท)':''}</div>`:''}</div>
        ${r.photo?`<img src="${r.photo}" style="width:46px;height:46px;border-radius:8px;object-fit:cover;flex-shrink:0">`:''}</div>`;
    }).join(''):'<div class="empty"><span class="em">📔</span>ยังไม่มีบันทึก<br><small>กดปุ่ม ＋ เพื่อเพิ่ม</small></div>'}
  </div>`;
}
let _recPhoto=null, _recStatus='done', _recUpdates=[];
function openRecordForm(id){
  const r=id?DB.records.find(x=>x.id===id):null;
  _recPhoto=r?r.photo:null;
  _recStatus=r?(r.status||'done'):'done';
  _recUpdates=r&&r.updates?JSON.parse(JSON.stringify(r.updates)):[];
  const catOpts=Object.entries(REC_CATS).map(([k,v])=>`<option value="${k}" ${r&&r.category===k?'selected':''}>${v.emoji} ${v.label}</option>`).join('');
  openModal(r?'แก้ไขบันทึก':'เพิ่มบันทึกสุขภาพ',`
    <label>ประเภท</label><select id="r_cat">${catOpts}</select>
    <label>หัวข้อ / ชื่อรายการ</label><input id="r_title" value="${r?esc(r.title||''):''}" placeholder="เช่น วัคซีนรวม 4 โรค">
    <div class="grid">
      <div><label>วันที่</label><input id="r_date" type="date" value="${r?r.date:todayStr()}"></div>
      <div><label>เตือนครั้งถัดไป</label><input id="r_next" type="date" value="${r?r.nextDate||'':''}"></div>
    </div>
    <label>สถานะ</label>
    <div class="seg" id="r_statusSeg">
      <button type="button" class="${_recStatus==='pending'?'on':''}" onclick="setRecStatus('pending',this)">⏳ รอผล</button>
      <button type="button" class="${_recStatus==='done'?'on':''}" onclick="setRecStatus('done',this)">✅ มีผล/เสร็จแล้ว</button>
    </div>
    <label>รายละเอียด / บันทึก</label><textarea id="r_note" placeholder="เช่น ยี่ห้อ, ขนาด, อาการ, ผลตรวจ">${r?esc(r.note||''):''}</textarea>
    <div style="text-align:center;margin-top:8px" id="r_photoWrap">${_recPhoto?`<img src="${_recPhoto}" style="max-width:100%;border-radius:12px">`:''}</div>
    <label style="display:inline-block;color:var(--brand);cursor:pointer">📎 แนบรูป/เอกสาร<input type="file" accept="image/*" style="display:none" onchange="onRecPhoto(this)"></label>
    <label style="margin-top:14px">อัพเดท / ผลตรวจ (เพิ่มได้เรื่อย ๆ)</label>
    <div id="r_updates">${renderRecUpdates()}</div>
    <div class="row" style="margin-top:6px">
      <input id="r_upd_text" placeholder="เช่น ผลออกแล้ว: ค่าไตปกติ" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();addRecUpdate();}">
      <button class="btn ghost sm" type="button" onclick="addRecUpdate()">＋ เพิ่ม</button>
    </div>
    <button class="btn primary block" style="margin-top:14px" onclick="saveRecord('${id||''}')">บันทึก</button>
    ${r?`<button class="btn danger block" style="margin-top:8px" onclick="delRecord('${id}')">ลบ</button>`:''}
  `);
}
function setRecStatus(sv,btn){ _recStatus=sv; btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); }
function renderRecUpdates(){
  if(!_recUpdates.length) return '<div class="muted" style="font-size:12.5px">ยังไม่มีอัพเดท — พิมพ์ผล/ความคืบหน้าด้านล่างแล้วกดเพิ่ม</div>';
  return '<div class="tl" style="margin-top:6px">'+_recUpdates.map((u,i)=>`<div class="tl-item"><div class="d">${fmtDate(u.date)}</div>${esc(u.text)} <span onclick="delRecUpdate(${i})" style="color:var(--danger);cursor:pointer;font-size:12px">✕</span></div>`).join('')+'</div>';
}
function addRecUpdate(){
  const t=$('r_upd_text'); const txt=t.value.trim(); if(!txt){ toast('พิมพ์รายละเอียดอัพเดทก่อน'); return; }
  _recUpdates.push({id:uid(),date:todayStr(),text:txt});
  t.value=''; $('r_updates').innerHTML=renderRecUpdates();
  toast('เพิ่มอัพเดทแล้ว (อย่าลืมกดบันทึก)');
}
function delRecUpdate(i){ _recUpdates.splice(i,1); $('r_updates').innerHTML=renderRecUpdates(); }
function onRecPhoto(input){ if(!input.files[0])return; readImage(input.files[0],d=>{_recPhoto=d;$('r_photoWrap').innerHTML=`<img src="${d}" style="max-width:100%;border-radius:12px">`;}); }
function saveRecord(id){
  const p=activePet();
  autoBackup();
  const data={petId:p.id,category:$('r_cat').value,title:$('r_title').value.trim(),
    date:$('r_date').value||todayStr(),nextDate:$('r_next').value,note:$('r_note').value.trim(),
    photo:_recPhoto,status:_recStatus,updates:_recUpdates};
  if(id){ Object.assign(DB.records.find(x=>x.id===id),data); }
  else DB.records.push(Object.assign({id:uid()},data));
  saveDB(); closeModal(); toast('บันทึกแล้ว'); render();
}
function delRecord(id){ if(!confirm('ลบบันทึกนี้?'))return; autoBackup(); DB.records=DB.records.filter(r=>r.id!==id); saveDB(); closeModal(); toast('ลบแล้ว'); render(); }

/* =========================================================
   ASSESS (ประเมินอาการ)
   ========================================================= */
let selectedSymptoms=[];
let assessTarget=null;
function setAssessTarget(t){ assessTarget=t; renderAssess(); }
function renderAssess(){
  const el=$('page-assess');
  if(assessTarget===null) assessTarget = activePet()? activePet().id : 'general';
  if(assessTarget!=='general' && !DB.pets.find(p=>p.id===assessTarget)) assessTarget='general';
  const targetPet = assessTarget==='general'? null : DB.pets.find(p=>p.id===assessTarget);
  const targetChips = `<div class="seg" style="margin-bottom:12px">
    <button class="${assessTarget==='general'?'on':''}" onclick="setAssessTarget('general')">🩺 ทั่วไป</button>
    ${DB.pets.map(p=>`<button class="${assessTarget===p.id?'on':''}" onclick="setAssessTarget('${p.id}')">${(SPECIES[p.species]||SPECIES.other).emoji} ${esc(p.name)}</button>`).join('')}
  </div>`;
  el.innerHTML=`
  <div class="notice">⚠️ การประเมินนี้เป็นข้อมูลเบื้องต้นเพื่อช่วยตัดสินใจและสื่อสารกับสัตวแพทย์เท่านั้น ไม่ใช่การวินิจฉัยและไม่ทดแทนการพบสัตวแพทย์</div>
  ${targetChips}
  <div class="card">
    <h2>🩺 เลือกอาการที่พบ${targetPet?' ใน '+esc(targetPet.name):' (ประเมินทั่วไป)'}</h2>
    <p class="muted">กดเลือกได้หลายอาการ ไม่ต้องพิมพ์${assessTarget==='general'?' · เลือกแมวด้านบนถ้าต้องการบันทึกผลลง Timeline':''}</p>
    ${SYMPTOM_GROUPS.map(g=>`
      <div style="margin-top:14px"><strong>${g.icon} ${g.group}</strong><div style="margin-top:8px">
      ${g.symptoms.map(s=>`<span class="chip ${selectedSymptoms.includes(s.id)?'on':''}" onclick="toggleSymptom('${s.id}')">${esc(s.label)}</span>`).join('')}
      </div></div>`).join('')}
  </div>
  <div style="position:sticky;bottom:calc(78px + env(safe-area-inset-bottom));">
    <button class="btn primary block" onclick="runAssess()">ประเมินอาการ (${selectedSymptoms.length})</button>
    ${selectedSymptoms.length?`<button class="btn ghost block" style="margin-top:8px" onclick="selectedSymptoms=[];renderAssess()">ล้างการเลือก</button>`:''}
  </div>
  <div id="assessResult"></div>`;
}
function toggleSymptom(id){
  const i=selectedSymptoms.indexOf(id);
  if(i<0) selectedSymptoms.push(id); else selectedSymptoms.splice(i,1);
  renderAssess();
}
function runAssess(){
  if(!selectedSymptoms.length){ toast('เลือกอาการอย่างน้อย 1 อย่าง'); return; }
  const r=evaluateSymptoms(selectedSymptoms);
  const u=URGENCY_INFO[r.level];
  const box=$('assessResult');
  box.innerHTML=`
  <div class="result-box ${u.cls}">
    <h3>${u.emoji} ${u.title}</h3>
    <p style="margin:4px 0">${u.text}</p>
  </div>
  <div class="card">
    <h2>อาการที่เลือก</h2>
    <div>${r.labels.map(l=>`<span class="chip on" style="cursor:default">${esc(l)}</span>`).join('')}</div>
  </div>
  <div class="card">
    <h2>ภาวะที่อาจเกี่ยวข้อง</h2>
    <p class="muted">เรียงตามความเกี่ยวข้องกับอาการที่เลือก (ไม่ใช่การวินิจฉัย)</p>
    <ul>${r.conditions.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>
  </div>
  <div class="card">
    <h2>คำแนะนำเบื้องต้น</h2>
    <div style="white-space:pre-line">${r.advice.map(a=>esc(a)).join('\n')}</div>
  </div>
  ${r.activeRedFlags.length?`<div class="card" style="border:2px solid var(--danger)">
    <h2 style="color:var(--danger)">🚨 สัญญาณอันตราย — ควรพบสัตวแพทย์ทันที</h2>
    <ul>${r.activeRedFlags.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
  </div>`:''}
  <div class="card">
    <h2>สัญญาณอันตรายทั่วไปที่ควรพบสัตวแพทย์ทันที</h2>
    <ul class="muted">${RED_FLAGS.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
  </div>
  <div class="row">
    ${assessTarget!=='general'?`<button class="btn primary" onclick="saveAssessment(${r.level})">💾 บันทึกผลนี้</button>`:''}
    <button class="btn ghost" onclick="go('more');setTimeout(()=>moreTab('report'),50)">📋 สร้างรายงานสัตวแพทย์</button>
  </div>
  ${assessTarget==='general'?'<p class="muted" style="margin-top:8px">อยากเก็บผลนี้ไว้ดูย้อนหลัง? เลือกแมวจากแถบด้านบนแล้วกด "บันทึกผลนี้"</p>':''}`;
  if(box.scrollIntoView) box.scrollIntoView({behavior:"smooth"});
}
function saveAssessment(level){
  if(assessTarget==='general' || !DB.pets.find(p=>p.id===assessTarget)){ toast('เลือกแมวจากแถบด้านบนก่อนเพื่อบันทึกผล'); return; }
  autoBackup();
  DB.assessments.push({id:uid(),petId:assessTarget,date:new Date().toISOString(),symptomIds:[...selectedSymptoms],level});
  saveDB(); toast('บันทึกผลการประเมินแล้ว (ดูใน Timeline)');
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDash(){
  const p=activePet(); const el=$('page-dash');
  if(!p){ el.innerHTML=noPet(); return; }
  const logs=DB.logs.filter(l=>l.petId===p.id).sort((a,b)=>a.date.localeCompare(b.date));
  const last=logs[logs.length-1]||{};
  const weights=logs.filter(l=>l.weight);
  el.innerHTML=`
  <div class="card">
    <h2>📊 สรุปสุขภาพ ${esc(p.name)}</h2>
    <div class="grid3">
      <div class="stat"><div class="v">${last.weight||'-'}</div><div class="l">น้ำหนัก (กก.)</div></div>
      <div class="stat"><div class="v">${scoreEmoji(last.eat)}</div><div class="l">การกิน</div></div>
      <div class="stat"><div class="v">${scoreEmoji(last.drink)}</div><div class="l">การดื่ม</div></div>
    </div>
    <div class="grid" style="margin-top:10px">
      <div class="stat"><div class="v">${last.urine||'-'}</div><div class="l">ปัสสาวะ (ครั้ง)</div></div>
      <div class="stat"><div class="v">${last.feces||'-'}</div><div class="l">อุจจาระ (ครั้ง)</div></div>
    </div>
    <button class="btn primary block" style="margin-top:12px" onclick="openLogForm()">＋ บันทึกวันนี้</button>
  </div>
  <div class="card">
    <h2>⚖️ แนวโน้มน้ำหนัก</h2>
    ${weights.length>=1?'<canvas id="wchart" height="180"></canvas>':'<div class="empty">ยังไม่มีข้อมูลน้ำหนัก</div>'}
  </div>
  <div class="card">
    <h2>🕒 Timeline สุขภาพ</h2>
    ${renderTimeline(p.id)}
  </div>`;
  if(weights.length>=1) drawWeightChart(weights);
}
function scoreEmoji(v){ return v==='good'?'😺':v==='low'?'😾':v==='none'?'🚫':'-'; }

function openLogForm(){
  const p=activePet();
  const today=todayStr();
  const ex=DB.logs.find(l=>l.petId===p.id && l.date===today)||{};
  openModal('บันทึกประจำวัน',`
    <label>วันที่</label><input id="l_date" type="date" value="${ex.date||today}">
    <label>น้ำหนัก (กก.)</label><input id="l_weight" type="number" step="0.1" value="${ex.weight||''}" placeholder="เช่น 4.2">
    <label>การกินอาหาร</label>
    <div class="seg">${scoreSeg('l_eat',ex.eat)}</div>
    <label>การดื่มน้ำ</label>
    <div class="seg">${scoreSeg('l_drink',ex.drink)}</div>
    <div class="grid">
      <div><label>ปัสสาวะ (ครั้ง)</label><input id="l_urine" type="number" value="${ex.urine||''}"></div>
      <div><label>อุจจาระ (ครั้ง)</label><input id="l_feces" type="number" value="${ex.feces||''}"></div>
    </div>
    <label>บันทึกเพิ่มเติม</label><textarea id="l_note" placeholder="พฤติกรรม อารมณ์ ฯลฯ">${esc(ex.note||'')}</textarea>
    <button class="btn primary block" style="margin-top:12px" onclick="saveLog('${ex.id||''}')">บันทึก</button>
  `);
  _logScore={eat:ex.eat||'',drink:ex.drink||''};
}
let _logScore={eat:'',drink:''};
function scoreSeg(field,val){
  const opts=[['good','ปกติ 😺'],['low','น้อยลง 😾'],['none','ไม่กิน/ไม่ดื่ม 🚫']];
  const key=field==='l_eat'?'eat':'drink';
  return opts.map(([v,l])=>`<button type="button" class="${val===v?'on':''}" onclick="setScore('${key}','${v}',this)">${l}</button>`).join('');
}
function setScore(key,v,btn){ _logScore[key]=v; btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); }
function saveLog(id){
  const p=activePet(); autoBackup();
  const data={petId:p.id,date:$('l_date').value||todayStr(),weight:parseFloat($('l_weight').value)||'',
    eat:_logScore.eat,drink:_logScore.drink,urine:parseInt($('l_urine').value)||'',feces:parseInt($('l_feces').value)||'',note:$('l_note').value.trim()};
  if(id){ Object.assign(DB.logs.find(l=>l.id===id),data); }
  else{
    const same=DB.logs.find(l=>l.petId===p.id&&l.date===data.date);
    if(same) Object.assign(same,data); else DB.logs.push(Object.assign({id:uid()},data));
  }
  if(data.weight){ const pet=DB.pets.find(x=>x.id===p.id); pet.weight=data.weight; }
  saveDB(); closeModal(); toast('บันทึกแล้ว'); render();
}

function drawWeightChart(weights){
  const c=$('wchart'); if(!c)return;
  const ctx=c.getContext&&c.getContext('2d'); if(!ctx)return;
  const W=c.width=c.clientWidth*2, H=c.height=360; ctx.scale(1,1);
  const pad=40*2;
  const vals=weights.map(w=>w.weight);
  let mn=Math.min(...vals), mx=Math.max(...vals);
  if(mn===mx){ mn-=0.5; mx+=0.5; } const range=mx-mn;
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='#eceef6'; ctx.lineWidth=2;
  for(let i=0;i<=4;i++){ const y=pad+(H-2*pad)*i/4; ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-10,y); ctx.stroke();
    ctx.fillStyle='#9aa0bd'; ctx.font='20px sans-serif'; ctx.fillText((mx-range*i/4).toFixed(1),4,y+6); }
  const pts=weights.map((w,i)=>({x:pad+(W-pad-20)*(weights.length===1?0.5:i/(weights.length-1)),y:pad+(H-2*pad)*(1-(w.weight-mn)/range)}));
  ctx.strokeStyle='#6c5ce7'; ctx.lineWidth=5; ctx.beginPath();
  pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
  ctx.fillStyle='#6c5ce7'; pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,7,0,7);ctx.fill();});
}

function renderTimeline(petId){
  const items=[];
  DB.records.filter(r=>r.petId===petId).forEach(r=>items.push({date:r.date,html:`<strong>${(REC_CATS[r.category]||{}).emoji||''} ${esc(r.title||(REC_CATS[r.category]||{}).label)}</strong>${r.note?'<br><span class="muted">'+esc(r.note)+'</span>':''}`}));
  DB.assessments.filter(a=>a.petId===petId).forEach(a=>{const u=URGENCY_INFO[a.level];items.push({date:a.date.slice(0,10),html:`<strong>${u.emoji} ประเมินอาการ — ${u.title}</strong>`});});
  DB.logs.filter(l=>l.petId===petId&&l.note).forEach(l=>items.push({date:l.date,html:`<strong>📝 บันทึกประจำวัน</strong><br><span class="muted">${esc(l.note)}</span>`}));
  items.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(!items.length) return '<div class="empty">ยังไม่มีเหตุการณ์</div>';
  return '<div class="tl">'+items.slice(0,30).map(i=>`<div class="tl-item"><div class="d">${fmtDate(i.date)}</div>${i.html}</div>`).join('')+'</div>';
}

/* =========================================================
   MORE (report / AI / notifications / backup / settings)
   ========================================================= */
let moreSub='report';
function renderMore(){
  const el=$('page-more');
  el.innerHTML=`
  <div class="seg">
    <button class="${moreSub==='guide'?'on':''}" onclick="moreTab('guide')">📖 วิธีใช้</button>
    <button class="${moreSub==='report'?'on':''}" onclick="moreTab('report')">📋 รายงาน</button>
    <button class="${moreSub==='ai'?'on':''}" onclick="moreTab('ai')">🤖 AI</button>
    <button class="${moreSub==='image'?'on':''}" onclick="moreTab('image')">📷 วิเคราะห์รูป</button>
    <button class="${moreSub==='notif'?'on':''}" onclick="moreTab('notif')">🔔 เตือน</button>
    <button class="${moreSub==='backup'?'on':''}" onclick="moreTab('backup')">💾 ข้อมูล</button>
  </div>
  <div id="moreBody"></div>`;
  moreBody();
}
function moreTab(t){ moreSub=t; if(currentTab!=='more'){go('more');return;} $('moreBody')?renderMore():go('more'); }
function moreBody(){
  const b=$('moreBody'); if(!b)return;
  if(moreSub==='guide') b.innerHTML=guideView();
  else if(moreSub==='report') b.innerHTML=reportView();
  else if(moreSub==='ai') b.innerHTML=aiView();
  else if(moreSub==='image') b.innerHTML=imageView();
  else if(moreSub==='notif') b.innerHTML=notifView();
  else if(moreSub==='backup') b.innerHTML=backupView();
}

/* ---------- Guide / คู่มือ (บอร์ดฟีเจอร์) ---------- */
function guideView(){
  const feats=[
    {ic:'🐱',t:'โปรไฟล์แมว',st:'ok',how:['ไปแท็บ "หน้าหลัก" กดปุ่ม ＋ หรือ "เพิ่มโปรไฟล์แมว"','ใส่รูป ชื่อ อายุ เพศ สายพันธุ์ น้ำหนัก โรคประจำตัว ประวัติแพ้ยา แล้วกดบันทึก','มีหลายตัวได้ สลับตัวที่ปุ่มมุมขวาบนของแอป']},
    {ic:'🩺',t:'ประเมินอาการเบื้องต้น',st:'ok',how:['แท็บ "ประเมินอาการ" แตะเลือกอาการที่พบ (เลือกได้หลายอาการ ไม่ต้องพิมพ์)','กดปุ่ม "ประเมินอาการ"','ดูระดับความเร่งด่วน ภาวะที่อาจเกี่ยวข้อง คำแนะนำ และสัญญาณอันตราย','กด "บันทึกผลนี้" เพื่อเก็บไว้ใน Timeline']},
    {ic:'📔',t:'สมุดสุขภาพ',st:'ok',how:['แท็บ "สมุดสุขภาพ" กดปุ่ม ＋','เลือกประเภท: วัคซีน / ถ่ายพยาธิ / เห็บหมัด / ยา / ผลตรวจ / เอกสาร','กรอกรายละเอียด แนบรูปได้ และใส่ "เตือนครั้งถัดไป" เพื่อให้เด้งเตือนอัตโนมัติ']},
    {ic:'📊',t:'Dashboard สุขภาพ',st:'ok',how:['แท็บ "Dashboard" กด "บันทึกวันนี้"','ใส่น้ำหนัก การกิน การดื่ม ปัสสาวะ อุจจาระ','ดูกราฟแนวโน้มน้ำหนัก และ Timeline เหตุการณ์สุขภาพ']},
    {ic:'📋',t:'รายงานสำหรับสัตวแพทย์',st:'ok',how:['เพิ่มเติม → "รายงาน"','ระบบสรุปข้อมูลให้อัตโนมัติ','กด "คัดลอกข้อความ" หรือ "บันทึกเป็น PDF" เพื่อส่งให้คุณหมอ']},
    {ic:'🔔',t:'การเตือน (วัคซีน/ยา/ตรวจสุขภาพ)',st:'ok',how:['เพิ่มเติม → "เตือน" กด "เปิดการแจ้งเตือนบนอุปกรณ์"','เพิ่มการเตือนเองได้ หรือมาจากช่อง "เตือนครั้งถัดไป" ในสมุดสุขภาพ']},
    {ic:'💾',t:'สำรอง & กู้คืนข้อมูล',st:'ok',how:['เพิ่มเติม → "ข้อมูล"','กด "ส่งออกไฟล์สำรอง" เก็บไฟล์ไว้เป็นระยะ','เปลี่ยนเครื่องแล้วใช้ "กู้คืนจากไฟล์" (ระบบสำรองอัตโนมัติก่อนเปลี่ยนแปลงทุกครั้ง)']},
    {ic:'🐾',t:'รองรับสัตว์ชนิดอื่น',st:'ok',how:['ตอนเพิ่มโปรไฟล์ เลือก "ชนิดสัตว์" ได้ (แมว/สุนัข/กระต่าย/นก/อื่น ๆ)']},
    {ic:'🤖',t:'ผู้ช่วย AI ตอบคำถาม',st:'warn',how:['ใช้ได้แบบพื้นฐานออฟไลน์ทันที','ปลดล็อกเต็มรูปแบบ: เพิ่มเติม → ข้อมูล → "ตั้งค่า AI" ใส่ API key (Claude หรือ OpenAI)','จากนั้นถามคำถามสุขภาพแมวได้ที่ เพิ่มเติม → "AI"']},
    {ic:'📷',t:'วิเคราะห์รูป (ตา/หู/ผิวหนัง/แผล)',st:'warn',how:['ต้องใส่ API key ที่รองรับรูปภาพก่อน (ตั้งค่า AI)','เพิ่มเติม → "วิเคราะห์รูป" เลือกบริเวณ → อัปโหลดรูป → กดวิเคราะห์']},
  ];
  const badge=s=>s==='ok'?'<span class="badge ok">พร้อมใช้</span>':'<span class="badge warn">ต้องตั้งค่า</span>';
  return `
  <div class="card" style="background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;border:none">
    <h2 style="color:#fff">📖 คู่มือการใช้งาน CatCare AI</h2>
    <p style="margin:0;opacity:.92;font-size:13px">แตะแต่ละฟีเจอร์เพื่อดูวิธีใช้ทีละขั้น &nbsp;•&nbsp; <span class="badge ok">พร้อมใช้</span> ใช้ได้ทันที &nbsp;•&nbsp; <span class="badge warn">ต้องตั้งค่า</span> ตั้งค่าก่อน</p>
  </div>
  ${feats.map((f,i)=>`
    <div class="card" style="padding:0;overflow:hidden">
      <div onclick="toggleGuide(${i})" style="display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer">
        <div class="avatar" style="width:44px;height:44px;font-size:22px">${f.ic}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(f.t)}</div>${badge(f.st)}</div>
        <div id="gc${i}" style="color:var(--sub);font-size:18px">▾</div>
      </div>
      <div id="gd${i}" style="display:none;padding:0 14px 16px">
        <ol style="margin:0;padding-left:18px">${f.how.map(h=>`<li style="margin-bottom:6px">${esc(h)}</li>`).join('')}</ol>
      </div>
    </div>`).join('')}
  <div class="notice">💡 เคล็ดลับ: แอปทำงานออฟไลน์ได้ • ข้อมูลเก็บในเครื่องคุณเอง • ติดตั้งเป็นแอปได้จากเมนูเบราว์เซอร์ "เพิ่มลงในหน้าจอหลัก"</div>
  <div class="notice">⚠️ CatCare AI เป็นผู้ช่วยดูแลสุขภาพเบื้องต้น ไม่ใช่ระบบคลินิก และไม่ทดแทนการวินิจฉัยของสัตวแพทย์</div>`;
}
function toggleGuide(i){
  const el=document.getElementById('gd'+i), car=document.getElementById('gc'+i);
  if(!el) return;
  const open = el.style.display==='none';
  el.style.display = open?'block':'none';
  if(car) car.textContent = open?'▴':'▾';
}

/* ---------- Report ---------- */
function buildReport(){
  const p=activePet(); if(!p) return '';
  const L=[];
  L.push('รายงานสุขภาพสัตว์เลี้ยง (CatCare AI)');
  L.push('สร้างเมื่อ: '+new Date().toLocaleString('th-TH'));
  L.push('────────────────────');
  L.push('ข้อมูลสัตว์เลี้ยง');
  L.push(`ชื่อ: ${p.name}  |  ชนิด: ${(SPECIES[p.species]||SPECIES.other).label}  |  สายพันธุ์: ${p.breed||'-'}`);
  L.push(`อายุ: ${calcAge(p.birthdate)}  |  เพศ: ${p.sex==='m'?'ผู้':p.sex==='f'?'เมีย':'-'}  |  น้ำหนัก: ${p.weight||'-'} กก.`);
  if(p.chronic) L.push(`โรคประจำตัว: ${p.chronic}`);
  if(p.allergies) L.push(`ประวัติแพ้ยา: ${p.allergies}`);
  L.push('');
  const recentA=DB.assessments.filter(a=>a.petId===p.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(recentA){
    const r=evaluateSymptoms(recentA.symptomIds); const u=URGENCY_INFO[recentA.level];
    L.push('ผลประเมินอาการล่าสุด ('+fmtDate(recentA.date.slice(0,10))+')');
    L.push('ระดับความเร่งด่วน: '+u.title);
    L.push('อาการที่พบ: '+r.labels.join(', '));
    L.push('ภาวะที่อาจเกี่ยวข้อง: '+r.conditions.join(', '));
    L.push('');
  }
  const logs=DB.logs.filter(l=>l.petId===p.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  if(logs.length){
    L.push('บันทึกสุขภาพประจำวัน (ล่าสุด)');
    logs.forEach(l=>L.push(`${fmtDate(l.date)}: น้ำหนัก ${l.weight||'-'} กก. | กิน ${scoreTh(l.eat)} | ดื่ม ${scoreTh(l.drink)} | ฉี่ ${l.urine||'-'} | อึ ${l.feces||'-'}${l.note?' | '+l.note:''}`));
    L.push('');
  }
  const recs=DB.records.filter(r=>r.petId===p.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(recs.length){
    L.push('ประวัติสุขภาพ (วัคซีน/ยา/การรักษา)');
    recs.slice(0,15).forEach(r=>L.push(`${fmtDate(r.date)} [${(REC_CATS[r.category]||{}).label}] ${r.title||''}${r.note?' — '+r.note:''}`));
    L.push('');
  }
  L.push('────────────────────');
  L.push('หมายเหตุ: รายงานนี้สร้างจากข้อมูลที่เจ้าของบันทึก เพื่อใช้ประกอบการปรึกษาสัตวแพทย์ ไม่ใช่การวินิจฉัยทางการแพทย์');
  return L.join('\n');
}
function scoreTh(v){ return v==='good'?'ปกติ':v==='low'?'น้อยลง':v==='none'?'ไม่กิน/ไม่ดื่ม':'-'; }
function reportView(){
  const p=activePet(); if(!p) return noPet();
  const txt=buildReport();
  return `<div class="card">
    <h2>📋 รายงานสำหรับสัตวแพทย์</h2>
    <p class="muted">สรุปอัตโนมัติจากข้อมูลทั้งหมด — คัดลอกหรือบันทึกเป็น PDF เพื่อส่งให้คุณหมอ</p>
    <textarea id="reportText" style="min-height:280px;font-size:13px">${esc(txt)}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" onclick="copyReport()">📄 คัดลอกข้อความ</button>
      <button class="btn ghost" onclick="printReport()">🖨️ บันทึกเป็น PDF</button>
    </div>
  </div>`;
}
function copyReport(){
  const t=$('reportText'); t.select();
  navigator.clipboard?.writeText(t.value).then(()=>toast('คัดลอกแล้ว')).catch(()=>{document.execCommand('copy');toast('คัดลอกแล้ว');});
}
function printReport(){
  const p=activePet(); const txt=$('reportText').value;
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>รายงานสุขภาพ ${esc(p.name)}</title><meta charset="utf-8">
    <style>body{font-family:"Sarabun",sans-serif;padding:30px;line-height:1.6;white-space:pre-wrap;font-size:14px}h1{color:#6c5ce7}</style></head>
    <body><h1>🐾 รายงานสุขภาพ — ${esc(p.name)}</h1><div>${esc(txt)}</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

/* ---------- AI Assistant (scaffold) ---------- */
function aiView(){
  const p=activePet();
  const chats=DB.chats.filter(c=>!p||c.petId===p.id);
  const hasKey=!!DB.settings.apiKey;
  return `<div class="card">
    <h2>🤖 ผู้ช่วย AI สุขภาพแมว</h2>
    <p class="muted">ถามคำถามสุขภาพแมวด้วยภาษาทั่วไป หรือให้ช่วยอธิบายศัพท์สัตวแพทย์ให้เข้าใจง่าย</p>
    ${hasKey?'':`<div class="notice">ยังไม่ได้ตั้งค่า AI — ไปที่แท็บ 💾 ข้อมูล › ตั้งค่า AI เพื่อใส่ API key<br>ระหว่างนี้ผู้ช่วยจะตอบด้วยคำแนะนำพื้นฐานแบบออฟไลน์</div>`}
    <div id="chatBox" style="min-height:120px;max-height:300px;overflow:auto;padding:6px 0">
      ${chats.length?chats.map(c=>`<div class="msg ${c.role==='user'?'u':'a'}">${esc(c.text)}</div>`).join(''):'<div class="empty">เริ่มถามคำถามได้เลย</div>'}
    </div>
    <div class="row" style="margin-top:8px">
      <input id="aiInput" placeholder="เช่น แมวอาเจียนบ่อยควรทำอย่างไร?" style="flex:1" onkeydown="if(event.key==='Enter')sendAI()">
      <button class="btn primary" onclick="sendAI()">ส่ง</button>
    </div>
    <div style="margin-top:8px">
      ${['แมวไม่กินข้าวควรทำยังไง?','อธิบายคำว่า BUN/Creatinine','แมวควรฉีดวัคซีนอะไรบ้าง?'].map(q=>`<span class="pill-btn" onclick="document.getElementById('aiInput').value='${q}';sendAI()">${q}</span> `).join('')}
    </div>
    <p class="muted" style="margin-top:10px">⚠️ คำตอบเป็นข้อมูลทั่วไป ไม่ทดแทนการวินิจฉัยของสัตวแพทย์</p>
  </div>`;
}
async function sendAI(){
  const inp=$('aiInput'); const q=inp.value.trim(); if(!q)return;
  const p=activePet();
  DB.chats.push({petId:p?p.id:null,role:'user',text:q}); inp.value=''; saveDB(); moreBody();
  const box=$('chatBox'); if(box)box.scrollTop=box.scrollHeight;
  let answer;
  if(DB.settings.apiKey){
    try{ answer=await callAI(q); }
    catch(e){ answer='เชื่อมต่อ AI ไม่สำเร็จ: '+e.message+'\n\n'+offlineAnswer(q); }
  }else{
    answer=offlineAnswer(q);
  }
  DB.chats.push({petId:p?p.id:null,role:'ai',text:answer}); saveDB(); moreBody();
  const box2=$('chatBox'); if(box2)box2.scrollTop=box2.scrollHeight;
}
/* คลังคำตอบพื้นฐานแบบออฟไลน์ */
function offlineAnswer(q){
  const s=q.toLowerCase();
  const kb=[
    {k:['ไม่กิน','เบื่ออาหาร','ไม่ยอมกิน'],a:'แมวที่ไม่กินอาหารเกิน 24 ชม. ควรระวัง และถ้าเกิน 2 วันถือว่าเร่งด่วน (เสี่ยงตับวายเฉียบพลัน) ลองอุ่นอาหารให้มีกลิ่นแรงขึ้น เปลี่ยนเป็นอาหารเปียก และสังเกตอาการอื่นร่วม เช่น อาเจียน ซึม หากไม่ดีขึ้นควรพบสัตวแพทย์'},
    {k:['อาเจียน','อ้วก'],a:'อาเจียนเป็นครั้งคราว (เช่น ก้อนขน) อาจไม่รุนแรง แต่ถ้าอาเจียนบ่อย มีเลือด หรือร่วมกับซึม/ไม่กิน ควรพบสัตวแพทย์ ควรงดอาหาร 2-4 ชม. แล้วให้น้ำทีละน้อย'},
    {k:['ฉี่','ปัสสาวะ','เบ่งฉี่'],a:'ถ้าแมว (โดยเฉพาะเพศผู้) เบ่งฉี่บ่อยแต่ออกน้อยหรือไม่ออก เป็นภาวะฉุกเฉินจากทางเดินปัสสาวะอุดตัน ต้องพบสัตวแพทย์ทันที ปัสสาวะมีเลือดก็ควรตรวจโดยเร็ว'},
    {k:['วัคซีน'],a:'วัคซีนหลักของแมวคือวัคซีนรวม (ไข้หัดแมว/หวัดแมว) และวัคซีนพิษสุนัขบ้า ลูกแมวเริ่มฉีดช่วง 8-9 สัปดาห์ กระตุ้นตามโปรแกรม แล้วฉีดกระตุ้นประจำปี ควรปรึกษาสัตวแพทย์เรื่องโปรแกรมที่เหมาะกับแมวแต่ละตัว'},
    {k:['bun','creatinine','ครีเอ','ค่าไต'],a:'BUN และ Creatinine เป็นค่าเลือดที่บอกการทำงานของไต ถ้าสูงกว่าปกติอาจบ่งชี้ภาวะไตทำงานลดลง มักตรวจร่วมกับ SDMA และค่าปัสสาวะ ควรให้สัตวแพทย์แปลผลร่วมกับอาการ'},
    {k:['ถ่ายพยาธิ'],a:'ลูกแมวควรถ่ายพยาธิตั้งแต่อายุ 2-3 สัปดาห์ ซ้ำทุก 2 สัปดาห์จนถึง 3 เดือน จากนั้นตามคำแนะนำสัตวแพทย์ (มักทุก 3 เดือน) แมวที่ออกนอกบ้านเสี่ยงมากกว่า'},
    {k:['เห็บ','หมัด'],a:'ใช้ยาหยดหลังคอหรือยากินป้องกันเห็บหมัดที่ออกแบบสำหรับแมวโดยเฉพาะ ห้ามใช้ผลิตภัณฑ์ของสุนัขบางชนิด (เช่นที่มี permethrin) เพราะเป็นพิษต่อแมว'},
    {k:['ทำหมัน'],a:'การทำหมันช่วยลดความเสี่ยงมะเร็งเต้านม/มดลูกอักเสบในเพศเมีย และลดพฤติกรรมก้าวร้าว/ฉี่มาร์คในเพศผู้ มักทำได้ตั้งแต่อายุประมาณ 5-6 เดือน ปรึกษาสัตวแพทย์เรื่องเวลาที่เหมาะสม'},
  ];
  for(const item of kb){ if(item.k.some(k=>s.includes(k))) return item.a+'\n\n(คำตอบพื้นฐานแบบออฟไลน์ — ใส่ API key เพื่อรับคำตอบที่ละเอียดขึ้น)'; }
  return 'ขออภัย ผู้ช่วยแบบออฟไลน์ยังตอบคำถามนี้ได้ไม่ละเอียด ลองใส่ API key ในแท็บตั้งค่า AI เพื่อเปิดใช้ผู้ช่วยเต็มรูปแบบ หรือหากเป็นเรื่องเร่งด่วนควรปรึกษาสัตวแพทย์โดยตรง';
}
/* เรียก AI จริง — Claude หรือ OpenAI (เมื่อใส่ API key) */
async function callAI(q){
  const st=DB.settings;
  const sys='คุณเป็นผู้ช่วยให้ข้อมูลสุขภาพแมวสำหรับเจ้าของทั่วไป ตอบเป็นภาษาไทยที่เข้าใจง่าย กระชับ อธิบายศัพท์สัตวแพทย์ให้เข้าใจง่าย และเตือนเสมอว่าไม่ทดแทนการพบสัตวแพทย์เมื่ออาการรุนแรง';
  if(st.aiProvider==='openai'){
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+st.apiKey},
      body:JSON.stringify({model:st.model||'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:q}]})});
    const d=await r.json(); if(d.error)throw new Error(d.error.message); return d.choices[0].message.content;
  }else{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':st.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:st.model||'claude-3-5-haiku-20241022',max_tokens:800,system:sys,messages:[{role:'user',content:q}]})});
    const d=await r.json(); if(d.error)throw new Error(d.error.message); return d.content[0].text;
  }
}

/* ---------- Image analysis (scaffold) ---------- */
let _imgData=null;
function imageView(){
  return `<div class="card">
    <h2>📷 วิเคราะห์รูปภาพเบื้องต้น</h2>
    <p class="muted">ถ่าย/อัปโหลดรูป ตา · หู · ผิวหนัง · แผล เพื่อให้ AI ช่วยประเมินเบื้องต้น</p>
    <div class="seg" id="imgTypeSeg">
      ${[['ตา','👁️'],['หู','👂'],['ผิวหนัง','🐾'],['แผล','🩹']].map((x,i)=>`<button class="${i===0?'on':''}" onclick="setImgType('${x[0]}',this)">${x[1]} ${x[0]}</button>`).join('')}
    </div>
    <div id="imgPreview" style="text-align:center;margin:10px 0">${_imgData?`<img src="${_imgData}" style="max-width:100%;border-radius:14px">`:''}</div>
    <label class="btn ghost block" style="cursor:pointer">📷 เลือก/ถ่ายรูป<input type="file" accept="image/*" capture="environment" style="display:none" onchange="onAnalyzeImg(this)"></label>
    <button class="btn primary block" style="margin-top:8px" onclick="analyzeImg()">วิเคราะห์รูปภาพ</button>
    <div id="imgResult"></div>
    <div class="notice" style="margin-top:12px">🔬 ฟีเจอร์นี้เป็นโครงพร้อมเชื่อม AI vision (ใส่ API key ที่รองรับรูปภาพ) — การวิเคราะห์เป็นเพียงข้อมูลเบื้องต้น ไม่ทดแทนการตรวจโดยสัตวแพทย์</div>
  </div>`;
}
let _imgType='ตา';
function setImgType(t,btn){ _imgType=t; btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); }
function onAnalyzeImg(input){ if(!input.files[0])return; readImage(input.files[0],d=>{_imgData=d;$('imgPreview').innerHTML=`<img src="${d}" style="max-width:100%;border-radius:14px">`;},900); }
async function analyzeImg(){
  if(!_imgData){ toast('เลือกรูปก่อน'); return; }
  const res=$('imgResult'); res.innerHTML='<p class="muted">กำลังวิเคราะห์...</p>';
  if(!DB.settings.apiKey){
    res.innerHTML=`<div class="result-box warn"><h3>ต้องตั้งค่า AI ก่อน</h3>
      <p>ฟีเจอร์วิเคราะห์รูปต้องใช้ AI ที่รองรับรูปภาพ ไปที่แท็บ 💾 ข้อมูล › ตั้งค่า AI แล้วใส่ API key (เช่น Claude ที่รองรับ vision)</p>
      <p class="muted">คำแนะนำทั่วไปสำหรับบริเวณ "${_imgType}": หากพบรอยแดง บวม มีหนอง มีของเหลวผิดปกติ หรือสัตว์แสดงความเจ็บ ควรพบสัตวแพทย์</p></div>`;
    return;
  }
  try{
    const b64=_imgData.split(',')[1];
    const prompt=`นี่คือรูป${_imgType}ของแมว ช่วยอธิบายสิ่งที่สังเกตเห็นเบื้องต้นเป็นภาษาไทยง่าย ๆ ระบุว่ามีสัญญาณที่ควรพบสัตวแพทย์หรือไม่ และเตือนว่าไม่ใช่การวินิจฉัย`;
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':DB.settings.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:DB.settings.model||'claude-3-5-sonnet-20241022',max_tokens:700,
        messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},{type:'text',text:prompt}]}]})});
    const d=await r.json(); if(d.error)throw new Error(d.error.message);
    res.innerHTML=`<div class="result-box warn"><h3>ผลวิเคราะห์เบื้องต้น (${_imgType})</h3><p style="white-space:pre-wrap">${esc(d.content[0].text)}</p></div>`;
  }catch(e){ res.innerHTML=`<div class="result-box danger"><h3>วิเคราะห์ไม่สำเร็จ</h3><p>${esc(e.message)}</p></div>`; }
}

/* ---------- Notifications ---------- */
function notifView(){
  const p=activePet(); if(!p) return noPet();
  const ups=upcomingReminders(p.id);
  return `<div class="card">
    <h2>🔔 การเตือน</h2>
    <p class="muted">เตือนวัคซีน ถ่ายพยาธิ ยา และตรวจสุขภาพ (สร้างจากช่อง "เตือนครั้งถัดไป" ในสมุดสุขภาพ หรือเพิ่มเอง)</p>
    <button class="btn ghost block" onclick="enableNotif()">📲 เปิดการแจ้งเตือนบนอุปกรณ์</button>
    <div style="margin-top:12px">
    ${ups.length?ups.map(r=>{const d=daysBetween(todayStr(),r.dueDate);const cls=d<0?'danger':d<=7?'warn':'info';
      return `<div class="list-item"><div class="avatar" style="width:40px;height:40px;font-size:18px">${r.emoji}</div>
      <div class="meta"><div class="t">${esc(r.title)}</div><div class="s">${fmtDate(r.dueDate)}</div></div>
      <span class="badge ${cls}">${d<0?'เลย '+Math.abs(d)+'ว':d===0?'วันนี้':'อีก '+d+'ว'}</span></div>`;}).join(''):'<div class="empty">ยังไม่มีการเตือน</div>'}
    </div>
    <button class="btn primary block" style="margin-top:12px" onclick="openReminderForm()">＋ เพิ่มการเตือนเอง</button>
  </div>`;
}
function openReminderForm(){
  openModal('เพิ่มการเตือน',`
    <label>หัวข้อ</label><input id="rm_title" placeholder="เช่น ตรวจสุขภาพประจำปี">
    <label>วันที่เตือน</label><input id="rm_date" type="date" value="${todayStr()}">
    <button class="btn primary block" style="margin-top:12px" onclick="saveReminder()">บันทึก</button>
  `);
}
function saveReminder(){
  const p=activePet(); const t=$('rm_title').value.trim(); if(!t){toast('กรอกหัวข้อ');return;}
  autoBackup(); DB.reminders.push({id:uid(),petId:p.id,title:t,dueDate:$('rm_date').value,done:false});
  saveDB(); closeModal(); toast('เพิ่มแล้ว'); moreBody();
}
function enableNotif(){
  if(!('Notification' in window)){ toast('อุปกรณ์นี้ไม่รองรับการแจ้งเตือน'); return; }
  Notification.requestPermission().then(perm=>{
    if(perm==='granted'){ toast('เปิดการแจ้งเตือนแล้ว'); checkDueNotifs(); }
    else toast('ไม่ได้รับอนุญาต');
  });
}
function checkDueNotifs(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  DB.pets.forEach(p=>upcomingReminders(p.id).forEach(r=>{
    const d=daysBetween(todayStr(),r.dueDate);
    if(d===0||d===1) new Notification('CatCare AI 🐾',{body:p.name+': '+r.title+(d===0?' (วันนี้)':' (พรุ่งนี้)')});
  }));
}

/* ---------- Backup & Restore ---------- */
function backupView(){
  const bk=(()=>{try{return JSON.parse(localStorage.getItem(BACKUP_KEY))}catch(e){return null}})();
  const st=DB.settings;
  return `<div class="card">
    <h2>💾 สำรอง & กู้คืนข้อมูล</h2>
    <p class="muted">ข้อมูลทั้งหมดเก็บในเครื่องของคุณ (ออฟไลน์) แนะนำให้ส่งออกไฟล์สำรองเป็นระยะ</p>
    <button class="btn primary block" onclick="exportData()">⬇️ ส่งออกไฟล์สำรอง (.json)</button>
    <label class="btn ghost block" style="margin-top:8px;cursor:pointer">⬆️ กู้คืนจากไฟล์<input type="file" accept=".json,application/json" style="display:none" onchange="importData(this)"></label>
    ${bk?`<div class="notice" style="margin-top:10px">มีข้อมูลสำรองอัตโนมัติล่าสุดเมื่อ ${new Date(bk.at).toLocaleString('th-TH')}
      <button class="btn danger sm" style="margin-top:6px" onclick="restoreAuto()">↩️ กู้คืนอัตโนมัติด้วยคลิกเดียว</button></div>`:''}
    <p class="muted" style="margin-top:6px">ระบบสำรองอัตโนมัติก่อนการเปลี่ยนแปลงสำคัญทุกครั้ง</p>
  </div>
  <div class="card">
    <h2>⚙️ ตั้งค่า AI</h2>
    <p class="muted">ใส่ API key เพื่อเปิดใช้ผู้ช่วย AI และการวิเคราะห์รูปเต็มรูปแบบ (key เก็บในเครื่องเท่านั้น)</p>
    <label>ผู้ให้บริการ</label>
    <select id="s_provider">
      <option value="claude" ${st.aiProvider==='claude'?'selected':''}>Claude (Anthropic)</option>
      <option value="openai" ${st.aiProvider==='openai'?'selected':''}>OpenAI</option>
    </select>
    <label>API Key</label><input id="s_key" type="password" value="${esc(st.apiKey||'')}" placeholder="วาง API key ที่นี่">
    <label>ชื่อโมเดล (ไม่บังคับ)</label><input id="s_model" value="${esc(st.model||'')}" placeholder="เช่น claude-3-5-haiku-20241022">
    <button class="btn primary block" style="margin-top:10px" onclick="saveSettings()">บันทึกการตั้งค่า</button>
  </div>
  <div class="card">
    <h2>ℹ️ เกี่ยวกับ</h2>
    <p class="muted">CatCare AI v${APP_VERSION} · ผู้ช่วยดูแลสุขภาพแมวส่วนตัว<br>
    ออกแบบให้รองรับสัตว์ชนิดอื่นในอนาคต · ทำงานออฟไลน์ (PWA)<br>
    ⚠️ ไม่ใช่ระบบคลินิก ไม่ทดแทนการวินิจฉัยของสัตวแพทย์</p>
  </div>`;
}
function exportData(){
  const blob=new Blob([JSON.stringify({app:'CatCareAI',version:APP_VERSION,exportedAt:new Date().toISOString(),data:DB},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='catcare-backup-'+todayStr()+'.json'; a.click(); toast('ส่งออกไฟล์แล้ว');
}
function importData(input){
  const f=input.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const obj=JSON.parse(e.target.result);
      const data=obj.data||obj;
      if(!data.pets){ toast('ไฟล์ไม่ถูกต้อง'); return; }
      if(!confirm('กู้คืนข้อมูลจากไฟล์นี้? ข้อมูลปัจจุบันจะถูกแทนที่ (มีการสำรองอัตโนมัติก่อน)')) return;
      autoBackup();
      DB=Object.assign(freshDB(),data); saveDB(); toast('กู้คืนสำเร็จ'); render();
    }catch(err){ toast('อ่านไฟล์ไม่สำเร็จ'); }
  };
  r.readAsText(f);
}
function restoreAuto(){
  const bk=JSON.parse(localStorage.getItem(BACKUP_KEY));
  if(!bk){ toast('ไม่มีข้อมูลสำรอง'); return; }
  if(!confirm('กู้คืนจากข้อมูลสำรองอัตโนมัติ?')) return;
  DB=Object.assign(freshDB(),bk.data); saveDB(); toast('กู้คืนสำเร็จ'); render();
}
function saveSettings(){
  DB.settings.aiProvider=$('s_provider').value;
  DB.settings.apiKey=$('s_key').value.trim();
  DB.settings.model=$('s_model').value.trim();
  saveDB(); toast('บันทึกการตั้งค่าแล้ว'); moreBody();
}

/* ---------- Modal ---------- */
function openModal(title, html){
  $('modal').innerHTML=`<div class="head"><h3>${esc(title)}</h3><button class="x" onclick="closeModal()">✕</button></div>${html}`;
  $('modalBg').classList.add('on');
}
function closeModal(){ $('modalBg').classList.remove('on'); }

/* ---------- misc ---------- */
function noPet(){ return `<div class="card"><div class="empty"><span class="em">🐱</span>ยังไม่มีโปรไฟล์สัตว์เลี้ยง<br>
  <button class="btn primary" style="margin-top:10px" onclick="openPetForm()">＋ เพิ่มโปรไฟล์</button></div></div>`; }

/* ---------- ตัวเช็ก & แจ้งเตือนอัปเดต ---------- */
function showUpdateBar(v){
  let bar=$('updateBar');
  if(!bar){ bar=document.createElement('div'); bar.id='updateBar'; bar.className='updatebar'; document.body.appendChild(bar); }
  bar.innerHTML=`🔄 มีเวอร์ชันใหม่${v?' ('+esc(v)+')':''} — อัปเดตเพื่อรับฟีเจอร์ล่าสุด <button onclick="doUpdate()">อัปเดตเลย</button>`;
  bar.classList.add('on');
}
async function doUpdate(){
  const b=$('updateBar'); if(b) b.innerHTML='กำลังอัปเดต…';
  try{ if('caches' in window){ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); } }catch(e){}
  try{ if('serviceWorker' in navigator){ const rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r=>r.update())); } }catch(e){}
  location.reload();
}
async function checkUpdate(){
  try{
    const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok) return;
    const d=await r.json();
    if(d && d.version && d.version!==APP_VERSION) showUpdateBar(d.version);
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) checkUpdate(); });
setTimeout(checkUpdate, 2500);

/* ---------- init ---------- */
render();
setTimeout(checkDueNotifs, 1500);

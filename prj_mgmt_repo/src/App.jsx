// v7.1.0
import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";

/* ==========================================================
   GLOBALS
========================================================== */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@300;400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#07090f;-webkit-text-size-adjust:100%;overscroll-behavior:none}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:#1e2840;border-radius:2px}
  input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.35);cursor:pointer}
  select option{background:#0d1420;color:#c8d8f0}
  input[type=range]{accent-color:#38bdf8}
  @keyframes fu{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .fu{animation:fu 0.18s ease forwards}
  .drag-over{outline:2px dashed #38bdf8 !important;outline-offset:2px;border-radius:6px}

  /* Touch & pinch support */
  .gantt-canvas{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
  .gantt-canvas:active{cursor:grabbing}
  .scroll-x{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin}

  /* === RESPONSIVE === */
  .task-grid{display:grid;grid-template-columns:14px 1fr 82px 82px 72px 52px 52px 60px 94px 58px 52px 72px;gap:4px;padding:5px 0;border-bottom:1px solid #1a223622;align-items:center;min-width:800px}
  .task-grid-header{display:grid;grid-template-columns:14px 1fr 82px 82px 72px 52px 52px 60px 94px 58px 52px 72px;gap:4px;padding:3px 0 6px;border-bottom:1px solid #1a2236}

  @media(max-width:1024px){
    .hide-tablet{display:none!important}
    .task-grid,.task-grid-header{grid-template-columns:14px 1fr 82px 82px 72px 60px 94px 72px;min-width:600px}
  }

  @media(max-width:640px){
    .desktop-only{display:none!important}
    .mobile-only{display:flex!important}
    .task-grid,.task-grid-header{display:none!important}
    .task-card{display:flex!important;flex-direction:column;padding:10px 12px;border:1px solid #1a2236;border-radius:8px;margin-bottom:6px;background:#0f1520}
    .nav-label{display:none}
    .main-pad{padding:10px!important}
    .sidebar-grid{grid-template-columns:1fr!important}
    .stats-bar{display:none!important}
    .search-bar{width:120px!important}
  }
  .mobile-only{display:none}
  .task-card{display:none}
`;

const C = {
  bg:"#07090f",panel:"#0b0f1a",card:"#0f1520",card2:"#111826",
  border:"#1a2236",text:"#d4e4ff",muted:"#4a6080",dim:"#253040",
  cyan:"#38bdf8",blue:"#6366f1",green:"#34d399",yellow:"#fbbf24",
  orange:"#fb923c",red:"#f87171",purple:"#a78bfa",pink:"#f472b6",teal:"#2dd4bf",
};
const STATUS_C   = {"Not Started":C.muted,"In Progress":C.cyan,"At Risk":C.orange,"Blocked":C.red,"Done":C.green};
const PRIORITIES = ["Critical","High","Medium","Low"];
const PRI_C      = {Critical:C.red,High:C.orange,Medium:C.cyan,Low:C.green};
const ALL_TAGS   = ["focus","blocked","quick-win","milestone","review","habit","learning","deploy"];
const TAG_C      = {focus:C.yellow,blocked:C.red,"quick-win":C.green,milestone:C.purple,review:C.cyan,habit:C.teal,learning:C.blue,deploy:C.pink};

const St = {
  inp: {background:C.card,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,
        padding:"6px 9px",fontSize:11,outline:"none",fontFamily:"'JetBrains Mono',monospace",
        width:"100%",boxSizing:"border-box"},
  btn: {background:C.cyan,color:"#07090f",border:"none",borderRadius:6,padding:"6px 13px",
        fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"},
  ghost:{background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,
         padding:"6px 13px",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"},
  lbl: {fontSize:8,letterSpacing:"0.15em",textTransform:"uppercase",
        fontFamily:"'JetBrains Mono',monospace",color:C.muted},
};

/* ==========================================================
   UTILS
========================================================== */
let _id = 5000;
const uid   = () => String(++_id);
const TODAY  = new Date();
const fmtD   = d => { const x=new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
const addD   = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const diffD  = (a,b) => Math.round((new Date(b)-new Date(a))/86400000);
const clamp  = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const todayS = fmtD(TODAY);
const deepCopy = obj => JSON.parse(JSON.stringify(obj));

/* ==========================================================
   ROLL-UP MATH (Assigned vs Actual)
   assignedHrs = planned hours from date range x hpd
   actualHrs   = explicitly logged hours (field on task/subtask)
========================================================== */
const stAssigned = st => st.assignedHrs ?? Math.max(0.5, st.hpd * Math.max(1, diffD(st.start, st.end)));
const stActual   = st => st.actualHrs ?? 0;

const taskAssigned = t => {
  const active = (t.subtasks||[]).filter(s=>!s.archived);
  if(active.length) return active.reduce((s,st)=>s+stAssigned(st),0);
  return t.assignedHrs ?? t.hpd*Math.max(1,diffD(t.start,t.end));
};
const taskActual = t => {
  const active = (t.subtasks||[]).filter(s=>!s.archived);
  if(active.length) return active.reduce((s,st)=>s+stActual(st),0);
  return t.actualHrs ?? 0;
};

const projAssigned = pr => (pr.tasks||[]).filter(t=>!t.archived).reduce((s,t)=>s+taskAssigned(t),0);
const projActual   = pr => (pr.tasks||[]).filter(t=>!t.archived).reduce((s,t)=>s+taskActual(t),0);
const spaceAssigned= sp => (sp.projects||[]).filter(p=>!p.archived).reduce((s,p)=>s+projAssigned(p),0);
const spaceActual  = sp => (sp.projects||[]).filter(p=>!p.archived).reduce((s,p)=>s+projActual(p),0);

// Legacy compat
const stHrs    = stAssigned;
const taskHrs  = taskAssigned;
const projHrs  = projAssigned;

const taskProg = t => {
  const active=(t.subtasks||[]).filter(s=>!s.archived);
  if(!active.length) return t.progress||0;
  const w=active.reduce((s,st)=>s+stAssigned(st),0)||1;
  return Math.round(active.reduce((s,st)=>s+st.progress*stAssigned(st),0)/w);
};
const projProg = pr => {
  const active=(pr.tasks||[]).filter(t=>!t.archived);
  const w=active.reduce((s,t)=>s+taskAssigned(t),0)||1;
  return Math.round(active.reduce((s,t)=>s+taskProg(t)*taskAssigned(t),0)/w);
};
const spaceProg = sp => {
  const ps=(sp.projects||[]).filter(p=>!p.archived);
  return ps.length ? Math.round(ps.reduce((s,pr)=>s+projProg(pr),0)/ps.length) : 0;
};

/* ==========================================================
   DRIFT ANALYSIS
========================================================== */
function computeDrift(proj) {
  const bl = proj.baselines?.[0];
  if(!bl) return null;
  return (proj.tasks||[]).filter(t=>!t.archived).map(t=>{
    const snap = bl.snapshot.find(s=>s.id===t.id);
    if(!snap) return null;
    const endDrift   = diffD(snap.end, t.end);
    const daysLeft   = diffD(todayS, t.end);
    const totalSpan  = Math.max(1, diffD(snap.start, snap.end));
    const elapsed    = diffD(snap.start, todayS);
    const expectedProg = Math.round(clamp(elapsed/totalSpan*100, 0, 100));
    const currentProg  = taskProg(t);
    const progGap      = currentProg - expectedProg;
    const color = endDrift>5||progGap<-20?C.red:endDrift>2||progGap<-10?C.orange:daysLeft>=0&&daysLeft<14&&currentProg<80?C.yellow:C.green;
    return {id:t.id,name:t.name,endDrift,daysLeft,expectedProg,currentProg,progGap,color};
  }).filter(Boolean);
}

/* ==========================================================
   PERSISTENCE - localStorage + GitHub Gist sync
========================================================== */
const LS_KEY      = "prj_mgmt_0_v7";
const LS_SETTINGS = "prj_mgmt_0_v7_settings";

const loadLS   = () => { try { const r=localStorage.getItem(LS_KEY); return r?JSON.parse(r):null; } catch(e){return null;} };
const saveLS   = v  => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch(e){} };
const loadSettings = () => { try { const r=localStorage.getItem(LS_SETTINGS); return r?JSON.parse(r):{gistId:"",token:""}; } catch(e){return {gistId:"",token:""};} };
const saveSettings = v => { try { localStorage.setItem(LS_SETTINGS, JSON.stringify(v)); } catch(e){} };

/* Gist API helpers */
const GIST_FILE = "prj_mgmt_data.json";

async function gistLoad(gistId, token) {
  if(!gistId||!gistId.trim()) throw new Error("No Gist ID configured.");
  const headers = {"Accept":"application/vnd.github+json"};
  if(token?.trim()) headers["Authorization"] = `Bearer ${token.trim()}`;
  const res = await fetch(`https://api.github.com/gists/${gistId.trim()}`, {headers});
  if(!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  const data = await res.json();
  const file = data.files?.[GIST_FILE];
  if(!file) throw new Error(`File "${GIST_FILE}" not found in Gist. Make sure the Gist contains a file named exactly: ${GIST_FILE}`);
  const content = file.truncated
    ? await (await fetch(file.raw_url, {headers})).text()
    : file.content;
  const parsed = JSON.parse(content);
  return parsed.portfolios || parsed; // support both {spaces:[]} and raw []
}

async function gistSave(gistId, token, spaces) {
  if(!gistId?.trim()) throw new Error("No Gist ID configured.");
  if(!token?.trim()) throw new Error("Token required to write to Gist.");
  const payload = {version:7, savedAt:new Date().toISOString(), spaces};
  const res = await fetch(`https://api.github.com/gists/${gistId.trim()}`, {
    method:"PATCH",
    headers:{"Authorization":`Bearer ${token.trim()}`,"Content-Type":"application/json","Accept":"application/vnd.github+json"},
    body: JSON.stringify({files:{[GIST_FILE]:{content:JSON.stringify(payload,null,2)}}})
  });
  if(!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.message||`GitHub API ${res.status}`); }
  return true;
}

/* ==========================================================
   CSV EXPORT
========================================================== */
function exportCSV(spaces) {
  const rows=[["Space","Portfolio","Project","Task","Subtask","Start","End","Status","Priority","Progress%","AssignedHrs","ActualHrs","Tags","Archived"]];
  spaces.forEach(po=>po.portfolios.forEach(sp=>sp.projects.forEach(pr=>{
    if(!pr.tasks?.length){ rows.push([po.name,sp.name,pr.name,"","",pr.start,pr.end,pr.status,pr.priority,projProg(pr),projAssigned(pr).toFixed(1),projActual(pr).toFixed(1),(pr.tags||[]).join("|"),pr.archived]); return; }
    pr.tasks.forEach(t=>{
      if(!t.subtasks?.length){ rows.push([po.name,sp.name,pr.name,t.name,"",t.start,t.end,t.status,t.priority,taskProg(t),taskAssigned(t).toFixed(1),taskActual(t).toFixed(1),(t.tags||[]).join("|"),t.archived]); return; }
      t.subtasks.forEach(st=>rows.push([po.name,sp.name,pr.name,t.name,st.name,st.start,st.end,st.status,st.priority,st.progress,stAssigned(st).toFixed(1),stActual(st).toFixed(1),(st.tags||[]).join("|"),st.archived]));
    });
  })));
  const escCsv = v => '"' + String(v).split('"').join('""') + '"';
  const csv  = rows.map(r=>r.map(escCsv).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"),{href:url,download:`prj_mgmt_${todayS}.csv`});
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ==========================================================
   JSON BACKUP / RESTORE
========================================================== */
function exportJSON(spaces) {
  const payload = { version: 7, exportedAt: new Date().toISOString(), spaces };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"),{href:url,download:`prj_mgmt_backup_${todayS}.json`});
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function importJSON(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if(parsed.portfolios && Array.isArray(parsed.portfolios)) {
        onSuccess(parsed.portfolios);
      } else {
        onError("Invalid backup file - missing spaces array.");
      }
    } catch(err) { onError("Could not parse JSON: " + err.message); }
  };
  reader.readAsText(file);
}

/* ==========================================================
   DATA MANAGER MODAL
========================================================== */
function DataManager({spaces, setSpaces, onClose, onGistSave, gistStatus}) {
  const [settings, setSettings] = useState(()=>loadSettings());
  const [confirm,  setConfirm]  = useState(null);
  const [msg,      setMsg]      = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [tab,      setTab]      = useState("gist"); // "gist" | "backup" | "danger"
  const fileRef = useRef(null);
  const lsSize  = (() => { try { const r=localStorage.getItem(LS_KEY); return r?(r.length/1024).toFixed(1)+"KB":"empty"; } catch(e){return "?";} })();

  const saveSettingsAndClose = (s) => { saveSettings(s); setSettings(s); };

  /* -- Gist actions -- */
  const handleGistPull = async () => {
    setBusy(true); setMsg(null);
    try {
      const data = await gistLoad(settings.gistId, settings.token);
      setConfirm({
        msg: "Load data from Gist?",
        detail: `Found ${data.length} portfolio(s) in your Gist. Your current local data will be auto-downloaded as a backup first.`,
        onConfirm: () => {
          exportJSON(spaces);
          setSpaces(data);
          saveLS(data);
          setConfirm(null);
          setMsg("v Pulled from Gist successfully.");
        }
      });
    } catch(e) { setMsg("x Pull failed: " + e.message); }
    finally { setBusy(false); }
  };

  const handleGistPush = async () => {
    setBusy(true); setMsg(null);
    try {
      await gistSave(settings.gistId, settings.token, spaces);
      setMsg("v Pushed to Gist successfully.");
    } catch(e) { setMsg("x Push failed: " + e.message); }
    finally { setBusy(false); }
  };

  /* -- JSON backup -- */
  const handleImport = file => {
    if(!file) return;
    importJSON(file, newData => {
      setConfirm({
        msg: "Replace all data with backup?",
        detail: `Will overwrite current data with the imported backup. Your current data will be auto-downloaded first.`,
        onConfirm: () => {
          exportJSON(spaces);
          setSpaces(newData); saveLS(newData);
          setConfirm(null);
          setMsg("v Imported. Previous data was downloaded as backup.");
        }
      });
    }, err => setMsg("x Import failed: " + err));
  };

  /* -- Danger -- */
  const handleReset = () => setConfirm({
    msg:"Reset to factory data?",
    detail:"Deletes ALL your data and restores sample data. Current data auto-downloaded first.",
    onConfirm:()=>{ exportJSON(spaces); setSpaces(INIT); saveLS(INIT); setConfirm(null); setMsg("v Reset. Previous data was downloaded."); }
  });

  const DTab = ({id,label,color}) => (
    <button onClick={()=>setTab(id)} style={{background:"none",border:"none",borderBottom:tab===id?`2px solid ${color||C.cyan}`:"2px solid transparent",
      color:tab===id?(color||C.cyan):C.muted,cursor:"pointer",padding:"8px 14px",fontSize:10,fontWeight:700,
      fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{label}</button>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={onClose}>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)} danger/>}
      <div onClick={e=>e.stopPropagation()}
        style={{background:C.card,border:`1px solid ${C.cyan}44`,borderRadius:16,width:500,maxHeight:"90vh",overflow:"auto",boxShadow:"0 16px 70px rgba(0,0,0,0.95)"}}>

        {/* Header */}
        <div style={{padding:"20px 24px 0",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>o Data Manager</div>
              <div style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:3}}>
                localStorage: {lsSize} . Gist: {gistStatus}
              </div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>x</button>
          </div>
          <div style={{display:"flex",gap:0}}>
            <DTab id="gist"   label="GitHub Gist" color={C.cyan}/>
            <DTab id="backup" label="JSON Backup"  color={C.yellow}/>
            <DTab id="danger" label="Danger Zone"  color={C.red}/>
          </div>
        </div>

        <div style={{padding:"20px 24px"}}>
          {/* Status msg */}
          {msg&&<div style={{background:msg.startsWith("v")?`${C.green}18`:`${C.red}18`,border:`1px solid ${msg.startsWith("v")?C.green:C.red}44`,borderRadius:8,padding:"9px 13px",marginBottom:16,fontSize:10,color:msg.startsWith("v")?C.green:C.red,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.5}}>{msg}</div>}

          {/* -- GIST TAB -- */}
          {tab==="gist"&&<>
            {/* Setup instructions */}
            <div style={{background:`${C.cyan}0d`,border:`1px solid ${C.cyan}22`,borderRadius:10,padding:"13px 15px",marginBottom:16}}>
              <div style={{fontSize:9,fontWeight:700,color:C.cyan,letterSpacing:"0.12em",marginBottom:10,fontFamily:"'JetBrains Mono',monospace"}}>FIRST TIME SETUP</div>
              {[
                ["1","Go to github.com/settings/tokens > Generate new token (classic)"],
                ["2","Tick only the ","gist"," scope > Generate > copy the token"],
                ["3","Go to gist.github.com > New Gist > filename: ","prj_mgmt_data.json"],
                ["4","Paste ","[]"," as content > Create secret Gist > copy the Gist ID from the URL"],
                ["5","Paste both below > Save Settings > Push Data"],
              ].map(([n,...parts])=>(
                <div key={n} style={{display:"flex",gap:8,marginBottom:7,alignItems:"flex-start"}}>
                  <span style={{background:`${C.cyan}22`,color:C.cyan,borderRadius:4,padding:"1px 6px",fontSize:9,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{n}</span>
                  <span style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.5}}>
                    {parts.map((p,i)=>i%2===0?<span key={i}>{p}</span>:<span key={i} style={{color:C.text,background:C.card,padding:"0 4px",borderRadius:3}}>{p}</span>)}
                  </span>
                </div>
              ))}
            </div>

            {/* Credentials */}
            <div style={{marginBottom:14}}>
              <div style={{...St.lbl,marginBottom:5}}>GitHub Personal Access Token (gist scope)</div>
              <input type="password" value={settings.token} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                onChange={e=>setSettings(s=>({...s,token:e.target.value}))}
                style={{...St.inp,marginBottom:8,fontFamily:"'JetBrains Mono',monospace"}}/>
              <div style={{...St.lbl,marginBottom:5}}>Gist ID (from the URL: gist.github.com/username/THIS_PART)</div>
              <input type="text" value={settings.gistId} placeholder="e.g. a1b2c3d4e5f6g7h8i9j0"
                onChange={e=>setSettings(s=>({...s,gistId:e.target.value}))}
                style={{...St.inp,fontFamily:"'JetBrains Mono',monospace"}}/>
            </div>
            <button onClick={()=>saveSettingsAndClose({...settings})}
              style={{...St.btn,width:"100%",marginBottom:12,padding:"9px",fontSize:11}}>
              Save Settings
            </button>

            {/* Push / Pull */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:C.card2,borderRadius:10,padding:"13px 14px"}}>
                <div style={{fontSize:9,fontWeight:700,color:C.green,letterSpacing:"0.1em",marginBottom:6,fontFamily:"'JetBrains Mono',monospace"}}>PUSH -&gt; GIST</div>
                <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:10,lineHeight:1.5}}>Save current data to your Gist. Overwrites previous Gist content.</div>
                <button onClick={handleGistPush} disabled={busy||!settings.gistId||!settings.token}
                  style={{...St.btn,width:"100%",padding:"8px",fontSize:10,opacity:busy||!settings.gistId||!settings.token?0.4:1}}>
                  {busy?"Saving...":"^ Push to Gist"}
                </button>
              </div>
              <div style={{background:C.card2,borderRadius:10,padding:"13px 14px"}}>
                <div style={{fontSize:9,fontWeight:700,color:C.cyan,letterSpacing:"0.1em",marginBottom:6,fontFamily:"'JetBrains Mono',monospace"}}>PULL &lt;- GIST</div>
                <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:10,lineHeight:1.5}}>Load data from your Gist. Auto-backs up local data first.</div>
                <button onClick={handleGistPull} disabled={busy||!settings.gistId}
                  style={{...St.ghost,width:"100%",padding:"8px",fontSize:10,color:C.cyan,borderColor:`${C.cyan}44`,opacity:busy||!settings.gistId?0.4:1}}>
                  {busy?"Loading...":"v Pull from Gist"}
                </button>
              </div>
            </div>

            <div style={{marginTop:14,padding:"10px 13px",background:`${C.green}0d`,border:`1px solid ${C.green}22`,borderRadius:8,fontSize:9,color:C.green,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.7}}>
              <div style={{fontWeight:700,marginBottom:4}}>AUTO-SAVE CONFIRMATION</div>
              Yes — every change you make (tasks, dates, notes, progress, status) is automatically saved to localStorage within 1 second, and pushed to your GitHub Gist within 3 seconds of the last change. The top-right corner shows "v SAVED" and "o gist synced HH:MM" when successful. Gist stores full revision history so you can always roll back.
            </div>
            <div style={{marginTop:10,padding:"10px 13px",background:`${C.yellow}0d`,border:`1px solid ${C.yellow}22`,borderRadius:8,fontSize:9,color:C.yellow,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.6}}>
              Tip: Token stored only in this browser's localStorage — never sent anywhere except api.github.com. Gist revision history = full changelog.
            </div>
          </>}

          {/* -- BACKUP TAB -- */}
          {tab==="backup"&&<>
            <div style={{background:C.card2,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:700,color:C.cyan,letterSpacing:"0.15em",marginBottom:8,fontFamily:"'JetBrains Mono',monospace"}}>EXPORT JSON</div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:12,lineHeight:1.6}}>Downloads a complete <span style={{color:C.text}}>.json</span> backup of all your data. Store on OneDrive / SharePoint.</div>
              <button onClick={()=>exportJSON(spaces)} style={{...St.btn,width:"100%",padding:"10px",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <span>v</span> Export JSON Backup
              </button>
            </div>
            <div style={{background:C.card2,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
              <div style={{fontSize:9,fontWeight:700,color:C.yellow,letterSpacing:"0.15em",marginBottom:8,fontFamily:"'JetBrains Mono',monospace"}}>IMPORT JSON</div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:12,lineHeight:1.6}}>Load a previously exported <span style={{color:C.text}}>.json</span> file. Current data auto-downloaded before overwriting.</div>
              <input ref={fileRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>handleImport(e.target.files[0])}/>
              <button onClick={()=>fileRef.current?.click()} style={{...St.ghost,width:"100%",padding:"10px",fontSize:11,color:C.yellow,borderColor:`${C.yellow}44`,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <span>^</span> Import JSON Backup
              </button>
            </div>
            <div style={{background:C.card2,borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:9,fontWeight:700,color:C.teal,letterSpacing:"0.15em",marginBottom:8,fontFamily:"'JetBrains Mono',monospace"}}>EXPORT CSV</div>
              <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:12,lineHeight:1.6}}>Flat CSV for Excel / Sheets analysis. One-way - cannot be re-imported.</div>
              <button onClick={()=>exportCSV(spaces)} style={{...St.ghost,width:"100%",padding:"10px",fontSize:11,color:C.teal,borderColor:`${C.teal}44`,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <span>v</span> Export CSV (Excel / Sheets)
              </button>
            </div>
          </>}

          {/* -- DANGER TAB -- */}
          {tab==="danger"&&<>
            <div style={{background:`${C.red}0a`,border:`1px solid ${C.red}22`,borderRadius:10,padding:"16px"}}>
              <div style={{fontSize:9,fontWeight:700,color:C.red,letterSpacing:"0.15em",marginBottom:14,fontFamily:"'JetBrains Mono',monospace"}}>DANGER ZONE</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <button onClick={()=>{ try{localStorage.removeItem(LS_KEY);}catch(e){} saveLS(spaces); setMsg("v Browser storage cleared and re-saved."); }}
                  style={{...St.ghost,padding:"10px",fontSize:11,color:C.red,borderColor:`${C.red}33`}}>
                  Clear Browser Storage (re-saves current data)
                </button>
                <button onClick={handleReset}
                  style={{...St.ghost,padding:"10px",fontSize:11,color:C.red,borderColor:`${C.red}33`}}>
                  Factory Reset (restores sample data)
                </button>
              </div>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================
   DATA MAKERS
========================================================== */
const mkSub  = (id,nm,s,e,hpd,prog,st,pri="Medium",tags=[]) =>
  ({id,name:nm,start:s,end:e,hpd,assignedHrs:null,actualHrs:0,progress:prog,status:st,priority:pri,tags,notes:"",archived:false,flagged:false});
const mkTask = (id,nm,s,e,hpd,prog,st,subs=[],pri="Medium",tags=[]) =>
  ({id,name:nm,start:s,end:e,hpd,assignedHrs:null,actualHrs:0,progress:prog,status:st,priority:pri,tags,notes:"",subtasks:subs,archived:false,flagged:false});
const mkProj = (id,nm,s,e,st,pri,color,tasks=[],notes="",tags=[]) =>
  ({id,name:nm,start:s,end:e,status:st,priority:pri,color,tasks,notes,tags,baselines:[],archived:false,flagged:false});
const mkPortfolio     = (id,nm,color,projects=[]) => ({id,name:nm,color,projects,archived:false});
const mkSpace = (id,nm,color,portfolios=[]) => ({id,name:nm,color,portfolios,archived:false});

/* ==========================================================
   SAINT-GOBAIN: CERTAINTEED DATA (imported from PM spreadsheet)
========================================================== */
/* === SAINT-GOBAIN CERTAINTEED DATA === */
const SG_PORTFOLIO = mkPortfolio("sg_port","Saint-Gobain: CertainTeed",C.orange,[
  mkProj("sg_6001","Manufacturing Analysis","2026-01-30","2026-02-23","In Progress","High",C.orange,[
    mkTask("sg_6002","SAP Data Pull","2026-01-30","2026-01-30",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6003","Clean Data","2026-02-02","2026-02-05",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6004","Report","2026-02-16","2026-02-16",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6005","Growth Report","2026-02-23","2026-02-23",1,0,"In Progress",[],"Medium",[]),
  ],"Manufacturing Analysis tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6006","PLM","2026-01-21","2026-02-26","In Progress","High",C.yellow,[
    mkTask("sg_6007","Industry 4.0 Meeting","2026-01-21","2026-01-21",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6008","Review Data","2026-01-26","2026-01-30",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6009","Research","2026-02-02","2026-02-04",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6010","Purchasing Scope Doc","2026-02-04","2026-02-04",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6011","Design Parameters","2026-02-22","2026-02-24",1,0,"In Progress",[],"Medium",[]),
    mkTask("sg_6012","Presentation","2026-02-25","2026-02-25",1,0,"Not Started",[],"Medium",[]),
    mkTask("sg_6013","Windchill Meeting","2026-02-26","2026-02-26",1,0,"Not Started",[],"Medium",[]),
  ],"PLM tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6014","5S","2026-01-21","2026-01-21","In Progress","High",C.green,[
    mkTask("sg_6015","5S Task 1","2026-01-21","2026-01-21",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6016","5S Task 2","2026-01-21","2026-01-21",1,0,"In Progress",[],"Medium",[]),
  ],"5S tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6017","Automation 300C","2026-04-06","2026-05-01","Not Started","High",C.blue,[
    mkTask("sg_6018","Rockwell Level 1","2026-04-06","2026-04-10",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6019","Rockwell Level 2","2026-04-13","2026-04-16",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6020","Rockwell Level 3","2026-04-19","2026-04-24",1,0,"Not Started",[],"Medium",[]),
    mkTask("sg_6021","Rockwell Level Advanced Certification","2026-04-27","2026-05-01",1,0,"Not Started",[],"Medium",[]),
  ],"Automation 300C tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6022","NPD Support","2026-01-12","2026-03-30","In Progress","High",C.purple,[
    mkTask("sg_6023","HD Visit/Training 75C/150C/225C Setup Wk1","2026-01-12","2026-01-16",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6024","HD Visit/Training 75C/150C/225C Setup Wk2","2026-01-19","2026-01-23",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6025","75C/150C/225C Report","2026-01-28","2026-01-28",1,0,"In Progress",[],"Medium",[]),
    mkTask("sg_6026","Linear Raft Setup Instructions","2026-02-02","2026-02-05",1,0,"In Progress",[],"Medium",[]),
    mkTask("sg_6027","Integral Reveal Raft Prep","2026-03-10","2026-03-10",1,0,"Not Started",[],"Medium",[]),
    mkTask("sg_6028","Integral Reveal Wk1","2026-03-16","2026-03-20",1,0,"Not Started",[],"Medium",[]),
    mkTask("sg_6029","Integral Reveal Wk2","2026-03-22","2026-03-26",1,0,"Not Started",[],"Medium",[]),
    mkTask("sg_6030","Integral Reveal Instructions","2026-03-28","2026-03-30",1,0,"Not Started",[],"Medium",[]),
  ],"NPD Support tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6031","R&D Support","2026-01-16","2026-03-31","In Progress","High",C.pink,[
    mkTask("sg_6032","Terminus Corners CAD Request","2026-01-16","2026-01-16",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6033","Terminus Team Meeting","2026-02-04","2026-02-04",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6034","Terminus Compound Use and Cost Doc","2026-02-04","2026-02-04",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6035","QPC Test","2026-02-11","2026-02-11",1,0,"In Progress",[],"Medium",[]),
    mkTask("sg_6036","Test Report","2026-02-12","2026-02-12",1,0,"In Progress",[],"Medium",[]),
    mkTask("sg_6037","Production Process Map","2026-03-09","2026-03-11",1,0,"Not Started",[],"Medium",[]),
    mkTask("sg_6038","Terminus Support","2026-03-30","2026-03-31",1,0,"Not Started",[],"Medium",[]),
  ],"R&D Support tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6039","Laser Torsion Grid","2026-01-12","2026-02-24","In Progress","High",C.teal,[
    mkTask("sg_6040","Revision","2026-01-12","2026-01-16",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6041","Revision, Drawing, CAD","2026-01-27","2026-01-30",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6042","Testing","2026-02-17","2026-02-17",1,0,"In Progress",[],"Medium",[]),
    mkTask("sg_6043","Testing Report","2026-02-24","2026-02-24",1,0,"Not Started",[],"Medium",[]),
  ],"Laser Torsion Grid tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6044","Additional Testing","2026-01-14","2026-02-09","Done","High",C.red,[
    mkTask("sg_6045","Short Cut Test","2026-01-14","2026-01-14",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6046","Column Rings","2026-02-09","2026-02-09",1,100,"Done",[],"Medium",[]),
  ],"Additional Testing tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6047","Bradbury","2026-01-05","2026-04-09","In Progress","High",C.cyan,[
    mkTask("sg_6048","Minster Alignment Fixture Testing/Design Adjustment","2026-01-05","2026-01-05",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6049","Minster Alignment Fixture Testing Wk1","2026-01-15","2026-01-15",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6050","Measurements, Parts Ordering, Fitment Check","2026-01-27","2026-01-29",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6051","Minster Cutoff Die Alignment","2026-03-01","2026-03-02",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6052","Revisions, ECOs","2026-03-02","2026-03-02",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6053","Minster Alignment Fixture Testing Wk2","2026-03-03","2026-03-03",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6054","Bradbury Alignment Test Results","2026-04-06","2026-04-06",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6055","Bradbury Testing","2026-04-09","2026-04-09",1,0,"Not Started",[],"Medium",[]),
  ],"Bradbury tasks imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6056","Meetings","2026-02-02","2026-03-09","In Progress","Medium",C.muted,[
    mkTask("sg_6057","Plant Visit JP Jones","2026-02-02","2026-02-02",1,100,"Done",[],"Low",[]),
    mkTask("sg_6058","Alignment: Teressa & Margaret","2026-02-03","2026-02-03",1,100,"Done",[],"Low",[]),
    mkTask("sg_6059","Metal and Momentum - Ops Huddle","2026-02-04","2026-02-04",1,100,"Done",[],"Low",[]),
    mkTask("sg_6060","MOC","2026-02-04","2026-02-04",1,100,"Done",[],"Low",[]),
    mkTask("sg_6061","QMS Platform","2026-02-04","2026-02-04",1,100,"Done",[],"Low",[]),
    mkTask("sg_6062","Metal and Momentum - Ops Huddle Feb 9","2026-02-09","2026-02-09",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6063","MOC Feb 9","2026-02-09","2026-02-09",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6064","Bill 1:1","2026-02-10","2026-02-10",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6065","Metal and Momentum - Ops Huddle Feb 11","2026-02-11","2026-02-11",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6066","Monthly Ops Review","2026-02-11","2026-02-11",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6067","Weekly Review Ops Feb 16","2026-02-16","2026-02-16",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6068","NPD Ops Feb 18","2026-02-18","2026-02-18",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6069","SMAT Walkthrough","2026-02-18","2026-02-18",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6070","Birkman Components","2026-02-18","2026-02-18",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6071","Weekly Review Ops Feb 23","2026-02-23","2026-02-23",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6072","Norcross Historian/MES Overview Feb 23","2026-02-23","2026-02-23",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6073","NPD Ops Feb 23","2026-02-23","2026-02-23",1,0,"In Progress",[],"Low",[]),
    mkTask("sg_6074","Terminus","2026-02-27","2026-02-27",1,0,"Not Started",[],"Low",[]),
    mkTask("sg_6075","Norcross Historian/MES Overview Mar 2","2026-03-02","2026-03-02",1,0,"Not Started",[],"Low",[]),
    mkTask("sg_6076","Bill 1:1 Mar 3","2026-03-03","2026-03-03",1,0,"Not Started",[],"Low",[]),
    mkTask("sg_6077","NPD Ops Mar 4","2026-03-04","2026-03-04",1,0,"Not Started",[],"Low",[]),
    mkTask("sg_6078","Weekly Review Ops Mar 9","2026-03-09","2026-03-09",1,0,"Not Started",[],"Low",[]),
  ],"Meetings imported from CertainTeed PM sheet.",[]),
  mkProj("sg_6079","MISC","2026-02-03","2026-02-05","Done","Low",C.orange,[
    mkTask("sg_6080","Linear - Line 1 - Old Std. Box - Twist Issue","2026-02-03","2026-02-03",1,100,"Done",[],"Medium",[]),
    mkTask("sg_6081","SAF Visit","2026-02-05","2026-02-05",1,100,"Done",[],"Medium",[]),
  ],"MISC tasks imported from CertainTeed PM sheet.",[]),
]);

/* ==========================================================
   INITIAL DATA
========================================================== */
const INIT = [
  mkSpace("port_main","Life OS",C.cyan,[
    mkPortfolio("sp_work","Work",C.cyan,[
      mkProj("pr_remote","Remote Coder Transition","2026-01-01","2026-12-31","In Progress","High",C.cyan,[
        mkTask("t1","Python + Git","2026-01-01","2026-03-31",1.5,35,"In Progress",[
          mkSub("s1","Syntax & Types","2026-01-01","2026-01-15",1.5,100,"Done"),
          mkSub("s2","Functions & OOP","2026-01-16","2026-02-10",1.5,60,"In Progress"),
          mkSub("s3","File Handling","2026-02-11","2026-02-20",1,0,"Not Started"),
          mkSub("s4","Git + GitHub","2026-02-21","2026-03-10",1,0,"Not Started"),
          mkSub("s5","CLI Tool","2026-03-11","2026-03-31",2,0,"Not Started"),
        ],"High",["learning"]),
        mkTask("t2","SQL + Data","2026-04-01","2026-06-30",1.5,0,"Not Started",[
          mkSub("s6","PostgreSQL","2026-04-01","2026-04-20",1.5,0,"Not Started"),
          mkSub("s7","Joins & Indexing","2026-04-21","2026-05-15",1.5,0,"Not Started"),
          mkSub("s8","Pandas & Viz","2026-05-16","2026-06-15",1.5,0,"Not Started"),
          mkSub("s9","KPI Dashboard","2026-06-16","2026-06-30",2,0,"Not Started"),
        ],"High",["milestone"]),
        mkTask("t3","Cloud + APIs","2026-07-01","2026-09-30",2,0,"Not Started",[
          mkSub("s10","EC2/S3/IAM","2026-07-01","2026-07-25",2,0,"Not Started"),
          mkSub("s11","FastAPI/Flask","2026-07-26","2026-08-20",1.5,0,"Not Started"),
          mkSub("s12","Deploy API","2026-08-21","2026-09-15",2,0,"Not Started"),
        ],"High",["deploy","milestone"]),
        mkTask("t4","Portfolio","2026-10-01","2026-12-31",2,0,"Not Started",[
          mkSub("s13","Docker & CI/CD","2026-10-01","2026-10-31",2,0,"Not Started"),
          mkSub("s14","IoT Dashboard","2026-11-01","2026-11-30",2.5,0,"Not Started"),
          mkSub("s15","Resume Polish","2026-12-01","2026-12-31",2,0,"Not Started"),
        ],"Medium",["milestone","deploy"]),
      ],"12-month roadmap to remote technical role.",["focus","milestone"]),
    ]),
    mkPortfolio("sp_personal","Personal",C.purple,[
      mkProj("pr_jp","Japanese","2026-01-01","2026-12-31","In Progress","Medium",C.purple,[
        mkTask("t5","Kanji","2026-01-01","2026-12-31",0.5,20,"In Progress",[
          mkSub("s16","N5 Kanji (80)","2026-01-01","2026-03-31",0.5,60,"In Progress"),
          mkSub("s17","N4 Kanji (160)","2026-04-01","2026-08-31",0.5,0,"Not Started"),
        ],"Medium",["learning","habit"]),
        mkTask("t6","Anki Vocab","2026-01-01","2026-12-31",0.5,30,"In Progress",[
          mkSub("s18","Core 2000","2026-01-01","2026-06-30",0.5,40,"In Progress"),
          mkSub("s19","N4 Grammar","2026-07-01","2026-12-31",0.5,0,"Not Started"),
        ],"Medium",["habit"]),
        mkTask("t7","Classes","2026-01-01","2026-12-31",1.5,25,"In Progress",[],"Medium",["habit"]),
      ],"N4 by end of year.",["learning"]),
      mkProj("pr_bjj","Jiu Jitsu","2026-01-01","2026-12-31","In Progress","High",C.orange,[
        mkTask("t8","Gracie Fundamentals","2026-01-01","2026-06-30",2,35,"In Progress",[
          mkSub("s20","Guard passing","2026-01-01","2026-02-28",2,60,"In Progress"),
          mkSub("s21","Takedowns","2026-03-01","2026-04-30",2,0,"Not Started"),
          mkSub("s22","Chokes & arm bars","2026-05-01","2026-06-30",2,0,"Not Started"),
        ],"High",["focus"]),
        mkTask("t9","Leg Locks","2026-04-01","2026-12-31",1,0,"Not Started",[
          mkSub("s23","Heel hooks","2026-04-01","2026-06-30",1,0,"Not Started"),
          mkSub("s24","Knee bars","2026-07-01","2026-09-30",1,0,"Not Started"),
          mkSub("s25","Ashi garami","2026-10-01","2026-12-31",1,0,"Not Started"),
        ],"Medium",["learning"]),
        mkTask("t10","Rolling Sessions","2026-01-01","2026-12-31",2,25,"In Progress",[],"High",["habit"]),
      ],"3x/week. Compete Q4.",["focus"]),
      mkProj("pr_fit","Fitness","2026-01-01","2026-12-31","In Progress","High",C.green,[
        mkTask("t11","Strength","2026-01-01","2026-12-31",1,30,"In Progress",[
          mkSub("s26","Upper Mon/Thu","2026-01-01","2026-12-31",0.75,30,"In Progress"),
          mkSub("s27","Lower Tue/Fri","2026-01-01","2026-12-31",0.75,30,"In Progress"),
        ],"High",["habit"]),
        mkTask("t12","Zone 2 Cardio","2026-01-01","2026-12-31",0.75,25,"In Progress",[],"Medium",["habit"]),
        mkTask("t13","Sleep Protocol","2026-01-01","2026-12-31",0,20,"In Progress",[],"Medium",["habit"]),
      ],"Maintain fitness.",["habit"]),
    ]),
  ]),
  mkSpace("port_work","Work",C.orange,[
    SG_PORTFOLIO,
  ]),
];

const WDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

/* ==========================================================
   CALENDAR EXPORT UTILS
========================================================== */
function toICSDate(dateStr) { return dateStr.replace(/-/g,""); }
function buildICS(events) {
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//PRJ_MGMT_V6//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  events.forEach(ev=>{
    lines.push("BEGIN:VEVENT",`UID:${ev.id}@prjmgmt`,`DTSTART;VALUE=DATE:${toICSDate(ev.date)}`,
      `DTEND;VALUE=DATE:${toICSDate(ev.date)}`,`SUMMARY:${ev.title}`,`CATEGORIES:${ev.type||""}`,`STATUS:CONFIRMED`,"END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function shareViaEmail(events, subject) {
  // Generate ICS content and open mailto with it as body hint
  // Since browsers can't attach files via mailto, we open the ICS download
  // then open email so user can attach manually - or use the copy-link approach
  downloadICS(events, subject.replace(/\s+/g,"_")+".ics");
  const body = encodeURIComponent(
    "Hi,\n\nI'm sharing some calendar events with you.\n\nPlease find the attached .ics file to add these events to your calendar.\n\nEvents:\n" +
    events.map(e=>`- ${e.title} (${e.date})`).join("\n") +
    "\n\nYou can import the .ics file by double-clicking it or dragging it into your calendar app (Google Calendar, Outlook, Apple Calendar)."
  );
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
  window.open(mailtoUrl);
}

function generateICSText(events) {
  const fmt = d => d.replace(/-/g,"");
  const lines = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//PRJ_MGMT//v7//EN","CALSCALE:GREGORIAN","METHOD:REQUEST"
  ];
  events.forEach(ev=>{
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id}@prjmgmt`);
    lines.push(`DTSTART;VALUE=DATE:${fmt(ev.date||ev.start||"2026-01-01")}`);
    lines.push(`DTEND;VALUE=DATE:${fmt(ev.end||ev.date||"2026-01-01")}`);
    lines.push(`SUMMARY:${ev.title||ev.name||""}`);
    if(ev.projName) lines.push(`DESCRIPTION:Project: ${ev.projName}`);
    if(ev.portfolioName) lines.push(`CATEGORIES:${ev.portfolioName}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(events, filename="calendar.ics") {
  const blob=new Blob([buildICS(events)],{type:"text/calendar"});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement("a"),{href:url,download:filename});
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function exportGCal(ev) {
  const d=toICSDate(ev.date);
  const url=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${d}/${d}&details=${encodeURIComponent(ev.type||"")}`;
  window.open(url,"_blank");
}
function exportOutlookWeb(ev) {
  const url=`https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(ev.title)}&startdt=${ev.date}&enddt=${ev.date}&body=${encodeURIComponent(ev.type||"")}`;
  window.open(url,"_blank");
}

/* ==========================================================
   SHARED UI ATOMS
========================================================== */
function Bar({v,c,h=4}){
  return <div style={{background:C.border,height:h,borderRadius:99,overflow:"hidden",width:"100%"}}>
    <div style={{width:`${clamp(v,0,100)}%`,height:h,background:c,borderRadius:99,transition:"width 0.4s"}}/>
  </div>;
}
function TagChip({label,color,onRemove}){
  return <span style={{fontSize:8,background:`${color}22`,color,borderRadius:3,padding:"1px 6px",
    display:"inline-flex",alignItems:"center",gap:3,fontFamily:"'JetBrains Mono',monospace"}}>
    {label}{onRemove&&<span onClick={onRemove} style={{cursor:"pointer",opacity:0.7,fontSize:10,lineHeight:1}}>x</span>}
  </span>;
}
function Collapse({open,children}){
  return <div style={{overflow:"hidden",maxHeight:open?2000:0,transition:"max-height 0.25s ease",opacity:open?1:0}}>{children}</div>;
}
function InlineEdit({value,onChange,style={},placeholder=""}){
  const [editing,setEditing] = useState(false);
  const [val,setVal]         = useState(value);
  useEffect(()=>{ if(!editing) setVal(value); },[value,editing]);
  if(editing) return <input autoFocus value={val} placeholder={placeholder}
    onChange={e=>setVal(e.target.value)}
    onBlur={()=>{ setEditing(false); if(val.trim()&&val!==value) onChange(val.trim()); else setVal(value); }}
    onKeyDown={e=>{ if(e.key==="Enter"){ setEditing(false); if(val.trim()) onChange(val.trim()); } if(e.key==="Escape"){ setEditing(false); setVal(value); } }}
    style={{...St.inp,padding:"1px 5px",fontSize:"inherit",...style}}/>;
  return <span onDoubleClick={()=>setEditing(true)} style={{cursor:"text",...style}} title="Double-click to rename">{val||placeholder}</span>;
}
function ConfirmModal({msg,detail,onConfirm,onCancel,confirmLabel="Delete",danger=true}){
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:C.card,border:`1px solid ${danger?C.red:C.border}`,borderRadius:12,padding:24,maxWidth:380,width:"90%",boxShadow:"0 8px 48px rgba(0,0,0,0.8)"}}>
      <div style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"'Syne',sans-serif",marginBottom:8}}>{msg}</div>
      {detail&&<div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:18,lineHeight:1.5}}>{detail}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={St.ghost}>Cancel</button>
        <button onClick={onConfirm} style={{...St.btn,background:danger?C.red:C.cyan,color:"#fff"}}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}
function SortableRow({dragIdx,index,onReorder,children,style={}}){
  const [isOver,setIsOver]=useState(false);
  return <div
    draggable onDragStart={()=>{dragIdx.current=index;}}
    onDragOver={e=>{e.preventDefault();setIsOver(true);}}
    onDragLeave={()=>setIsOver(false)}
    onDrop={()=>{ setIsOver(false); if(dragIdx.current!==null&&dragIdx.current!==index) onReorder(dragIdx.current,index); dragIdx.current=null; }}
    className={isOver?"drag-over":""}
    style={{...style}}>{children}</div>;
}
function TagPicker({tags,onChange}){
  const [open,setOpen]=useState(false);
  return <div style={{position:"relative",display:"inline-block"}}>
    <button onClick={()=>setOpen(o=>!o)} style={{...St.ghost,padding:"1px 7px",fontSize:9,color:C.dim}}>+ tag</button>
    {open&&<div style={{position:"absolute",zIndex:200,top:"100%",left:0,background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:6,display:"flex",flexWrap:"wrap",gap:4,width:200,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
      {ALL_TAGS.map(t=>{
        const on=tags.includes(t);
        return <span key={t} onClick={()=>{onChange(on?tags.filter(x=>x!==t):[...tags,t]);}}
          style={{fontSize:9,background:on?`${TAG_C[t]}33`:`${TAG_C[t]}11`,color:TAG_C[t],border:`1px solid ${on?TAG_C[t]:TAG_C[t]+"44"}`,borderRadius:4,padding:"2px 7px",cursor:"pointer",fontFamily:"'JetBrains Mono',monospace"}}>{t}</span>;
      })}
      <button onClick={()=>setOpen(false)} style={{...St.ghost,padding:"2px 7px",fontSize:8,width:"100%",marginTop:2}}>close</button>
    </div>}
  </div>;
}
function DriftPanel({proj}){
  const drift = useMemo(()=>computeDrift(proj),[proj]);
  if(!drift) return <div style={{padding:"24px",textAlign:"center",color:C.muted,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>No baseline snapshot yet. Take a Snap Snapshot first.</div>;
  if(!drift.length) return <div style={{padding:"24px",textAlign:"center",color:C.muted,fontSize:11}}>No active tasks to compare.</div>;
  const slipped=drift.filter(d=>d.endDrift>2),behind=drift.filter(d=>d.progGap<-10),atRisk=drift.filter(d=>d.daysLeft>=0&&d.daysLeft<14&&d.currentProg<90),onTrack=drift.filter(d=>d.endDrift<=2&&d.progGap>=-10);
  return <div style={{padding:"14px 16px"}}>
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      {[[slipped.length,"Slipped",C.red],[behind.length,"Behind",C.orange],[atRisk.length,"At Risk",C.yellow],[onTrack.length,"On Track",C.green]].map(([n,l,c])=>(
        <div key={l} style={{background:`${c}15`,border:`1px solid ${c}44`,borderRadius:8,padding:"7px 13px",flex:1,minWidth:70}}>
          <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:"'JetBrains Mono',monospace"}}>{n}</div>
          <div style={{fontSize:8,color:c,letterSpacing:"0.1em"}}>{l.toUpperCase()}</div>
        </div>
      ))}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 60px 80px 70px 80px",gap:6,padding:"3px 0 6px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
      {["TASK","DAYS LEFT","END DRIFT","EXPECTED","CURRENT"].map(h=><div key={h} style={St.lbl}>{h}</div>)}
    </div>
    {drift.map(d=>{
      const driftLabel=d.endDrift===0?"on time":d.endDrift>0?`+${d.endDrift}d late`:`${Math.abs(d.endDrift)}d early`;
      return <div key={d.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 80px 70px 80px",gap:6,padding:"6px 0",borderBottom:`1px solid ${C.border}11`,alignItems:"center"}}>
        <span style={{fontSize:10,color:C.text,fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</span>
        <span style={{fontSize:9,color:d.daysLeft<0?C.red:d.daysLeft<7?C.orange:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{d.daysLeft<0?`${Math.abs(d.daysLeft)}d over`:`${d.daysLeft}d`}</span>
        <span style={{fontSize:9,color:d.color,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{driftLabel}</span>
        <span style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{d.expectedProg}%</span>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <span style={{fontSize:9,color:d.color,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{d.currentProg}%</span>
          <Bar v={d.currentProg} c={d.color} h={3}/>
        </div>
      </div>;
    })}
  </div>;
}
function ActionBtns({archived,onArchive,onDelete,size=10}){
  return <div style={{display:"flex",gap:2,alignItems:"center"}}>
    <button onClick={onArchive} title={archived?"Restore":"Archive"}
      style={{background:"none",border:`1px solid ${archived?C.cyan+"66":C.border}`,borderRadius:3,cursor:"pointer",
        color:archived?C.cyan:C.dim,fontSize:size-1,padding:"1px 4px",lineHeight:1.2,
        fontFamily:"'JetBrains Mono',monospace"}}>
      {archived?"↺":"▽"}
    </button>
    <button onClick={onDelete} title="Delete"
      style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:3,cursor:"pointer",
        color:C.red,fontSize:size-1,padding:"1px 4px",lineHeight:1.2}}>x</button>
  </div>;
}
function CtxMenu({items,onClose}){
  useEffect(()=>{
    const h=()=>onClose();
    const k=e=>{if(e.key==="Escape")onClose();};
    setTimeout(()=>document.addEventListener("click",h),0);
    document.addEventListener("keydown",k);
    return()=>{document.removeEventListener("click",h);document.removeEventListener("keydown",k);};
  },[onClose]);
  return <div style={{position:"absolute",right:0,top:"100%",zIndex:1000,background:C.card2,border:`1px solid ${C.border}`,borderRadius:9,padding:"5px",minWidth:170,boxShadow:"0 6px 28px rgba(0,0,0,0.6)"}}>
    {items.map((item,i)=>item==="---"
      ? <div key={i} style={{height:1,background:C.border,margin:"4px 0"}}/>
      : <button key={i} onClick={()=>{item.fn();onClose();}}
          style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"none",border:"none",color:item.danger?C.red:C.text,cursor:"pointer",padding:"6px 9px",fontSize:10,fontFamily:"'JetBrains Mono',monospace",borderRadius:5,textAlign:"left",whiteSpace:"nowrap"}}
          onMouseEnter={e=>e.currentTarget.style.background=item.danger?`${C.red}22`:C.card}
          onMouseLeave={e=>e.currentTarget.style.background="none"}>
          <span>{item.icon}</span><span>{item.label}</span>
        </button>
    )}
  </div>;
}

/* ==========================================================
   CROSS-DRAG CONTEXT (for move between spaces/projects)
========================================================== */
const DragCtx = React.createContext(null);

/* ==========================================================
   SUBTASK ROW
========================================================== */
function SubRow({sub,taskId,spaceColor,onUpdSub,dragIdx,index,onReorderSubs,onDelete,onArchive,onCopySub,portfolioId,projId}){
  const sh = stAssigned(sub);
  const assignedVal = sub.assignedHrs != null ? sub.assignedHrs : sh.toFixed(1);
  const actualVal   = sub.actualHrs   != null ? sub.actualHrs   : 0;
  const flagIcon    = sub.flagged ? "P" : "-";
  const flagLabel   = sub.flagged ? "Unflag" : "Flag";
  const archIcon    = sub.archived ? "^" : "v";
  const archLabel   = sub.archived ? "Restore" : "Archive";
  const dotColor    = sub.flagged ? C.yellow : spaceColor;
  const rowOpacity  = sub.archived ? 0.45 : 1;
  const textColor   = sub.archived ? C.dim : C.text;
  const [ctxMenu,setCtxMenu]=useState(false);
  const subMenuItems = [
    {icon:"=",label:"Copy Subtask",fn:()=>onCopySub(sub)},
    "---",
    {icon:flagIcon,label:flagLabel,fn:()=>onUpdSub(sub.id,()=>({flagged:!sub.flagged}))},
    {icon:archIcon,label:archLabel,fn:()=>onArchive(sub.id)},
    {icon:"x",label:"Delete",danger:true,fn:()=>onDelete(sub.id)},
  ];
  return (
    <SortableRow dragIdx={dragIdx} index={index} onReorder={onReorderSubs} style={{marginBottom:2}}>
      <div style={{display:"grid",gridTemplateColumns:"14px 1fr 82px 82px 72px 52px 52px 60px 94px 58px 52px 72px",
        gap:4,padding:"4px 0",borderBottom:"1px solid #ffffff11",alignItems:"center",minWidth:800,
        opacity:rowOpacity}}>
        <span style={{cursor:"grab",color:C.dim,fontSize:8,textAlign:"center"}}>::</span>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{width:4,height:4,borderRadius:"50%",background:dotColor,display:"inline-block",flexShrink:0}}/>
          <InlineEdit value={sub.name} onChange={nm=>onUpdSub(sub.id,()=>({name:nm}))}
            style={{fontSize:10,color:textColor,fontFamily:"'JetBrains Mono',monospace"}}/>
        </div>
        <input type="date" value={sub.start} onChange={e=>onUpdSub(sub.id,()=>({start:e.target.value}))}
          style={{...St.inp,padding:"2px 4px",fontSize:9}}/>
        <input type="date" value={sub.end} onChange={e=>onUpdSub(sub.id,()=>({end:e.target.value}))}
          style={{...St.inp,padding:"2px 4px",fontSize:9}}/>
        <select value={sub.status} onChange={e=>onUpdSub(sub.id,()=>({status:e.target.value}))}
          style={{...St.inp,padding:"2px 4px",fontSize:9,color:STATUS_C[sub.status]}}>
          {Object.keys(STATUS_C).map(s=><option key={s}>{s}</option>)}
        </select>
        <input type="number" min="0" step="0.5"
          value={assignedVal}
          onChange={e=>onUpdSub(sub.id,()=>({assignedHrs:parseFloat(e.target.value)||0}))}
          style={{...St.inp,padding:"2px 4px",fontSize:9,color:spaceColor}}/>
        <input type="number" min="0" step="0.5"
          value={actualVal}
          onChange={e=>onUpdSub(sub.id,()=>({actualHrs:parseFloat(e.target.value)||0}))}
          style={{...St.inp,padding:"2px 4px",fontSize:9,color:C.green}}/>
        <input type="range" min="0" max="100" value={sub.progress}
          onChange={e=>onUpdSub(sub.id,()=>({progress:+e.target.value}))}
          style={{width:"100%"}}/>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <Bar v={sub.progress} c={spaceColor} h={4}/>
          <span style={{fontSize:9,color:spaceColor,fontFamily:"'JetBrains Mono',monospace",minWidth:26}}>{sub.progress}%</span>
        </div>
        <select value={sub.priority} onChange={e=>onUpdSub(sub.id,()=>({priority:e.target.value}))}
          style={{...St.inp,padding:"2px 4px",fontSize:8,color:PRI_C[sub.priority]}}>
          {PRIORITIES.map(p=><option key={p}>{p}</option>)}
        </select>
        <div style={{display:"relative"}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setCtxMenu(m=>!m)} style={{background:"none",border:"1px solid #ffffff22",borderRadius:4,color:C.dim,cursor:"pointer",fontSize:11,padding:"0 5px",lineHeight:1.4}}>...</button>
          {ctxMenu && <CtxMenu onClose={()=>setCtxMenu(false)} items={subMenuItems}/>}
        </div>
        <ActionBtns archived={sub.archived} onArchive={()=>onArchive(sub.id)} onDelete={()=>onDelete(sub.id)} size={9}/>
      </div>
    </SortableRow>
  );
}

/* ==========================================================
   TASK ROW
========================================================== */

function TaskAttachments({task,onUpdTask,spaceColor}){
  const [adding,setAdding] = useState(false);
  const [newUrl,setNewUrl] = useState("");
  const [newLabel,setNewLabel] = useState("");
  const attachments = task.attachments||[];

  const addLink = () => {
    if(!newUrl.trim()) return;
    const url = newUrl.startsWith("http")?newUrl:"https://"+newUrl;
    const label = newLabel.trim()||url;
    onUpdTask(task.id,()=>({attachments:[...attachments,{id:uid(),url,label,type:"link",addedAt:todayS}]}));
    setNewUrl(""); setNewLabel(""); setAdding(false);
  };
  const removeAttachment = id => onUpdTask(task.id,()=>({attachments:attachments.filter(a=>a.id!==id)}));

  if(!attachments.length&&!adding) return (
    <div style={{padding:"2px 18px 6px"}}>
      <button onClick={()=>setAdding(true)}
        style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:9,
          fontFamily:"'JetBrains Mono',monospace",padding:"2px 0"}}>
        + Add link / attachment
      </button>
    </div>
  );

  return (
    <div style={{padding:"4px 18px 8px",borderBottom:`1px solid ${C.border}11`}}>
      {attachments.length>0&&(
        <div style={{marginBottom:4}}>
          {attachments.map(a=>(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <span style={{fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace"}}>@</span>
              <a href={a.url} target="_blank" rel="noopener noreferrer"
                style={{fontSize:9,color:spaceColor,fontFamily:"'JetBrains Mono',monospace",
                  textDecoration:"none",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                onClick={e=>e.stopPropagation()}>
                {a.label}
              </a>
              <button onClick={e=>{e.stopPropagation();removeAttachment(a.id);}}
                style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:10,padding:"0 2px",flexShrink:0}}>x</button>
            </div>
          ))}
        </div>
      )}
      {adding?(
        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
          <input value={newLabel} onChange={e=>setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            style={{...St.inp,fontSize:9,padding:"3px 7px",width:110}}/>
          <input value={newUrl} onChange={e=>setNewUrl(e.target.value)}
            placeholder="URL or link..."
            onKeyDown={e=>{if(e.key==="Enter")addLink();if(e.key==="Escape")setAdding(false);}}
            style={{...St.inp,fontSize:9,padding:"3px 7px",flex:1,minWidth:140}}/>
          <button onClick={addLink} style={{...St.btn,padding:"3px 9px",fontSize:9}}>Add</button>
          <button onClick={()=>setAdding(false)} style={{...St.ghost,padding:"3px 7px",fontSize:9}}>Cancel</button>
        </div>
      ):(
        <button onClick={()=>setAdding(true)}
          style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:9,
            fontFamily:"'JetBrains Mono',monospace",padding:"2px 0"}}>
          + Add link / attachment
        </button>
      )}
    </div>
  );
}

function TaskRow({task,spaceColor,onUpdTask,onUpdSub,onAddSub,taskDragIdx,taskIndex,onReorderTasks,onReorderSubs,onDeleteTask,onArchiveTask,onDeleteSub,onArchiveSub,onCopyTask,onCopySub,portfolioId,projId}){
  const [exp,setExp]          = useState(false);
  const [showArch,setShowArch]= useState(false);
  const [ctxMenu,setCtxMenu]  = useState(false);
  const subDragIdx             = useRef(null);
  const th=taskAssigned(task); const ta=taskActual(task); const tp=taskProg(task);
  const activeSubs = (task.subtasks||[]).filter(s=>!s.archived);
  const archSubs   = (task.subtasks||[]).filter(s=>s.archived);
  const dragCtx    = React.useContext(DragCtx);
  const taskFlagIcon  = task.flagged  ? "P" : "-";
  const taskFlagLabel = task.flagged  ? "Unflag" : "Flag";
  const taskArchIcon  = task.archived ? "^" : "v";
  const taskArchLabel = task.archived ? "Restore" : "Archive";
  const taskMenuItems = [
    {icon:"=",label:"Copy Task",fn:()=>onCopyTask(task)},
    {icon:"+ v",label:"Add Subtask",fn:()=>{onAddSub(task.id);setExp(true);}},
    "---",
    {icon:taskFlagIcon,label:taskFlagLabel,fn:()=>onUpdTask(task.id,()=>({flagged:!task.flagged}))},
    {icon:taskArchIcon,label:taskArchLabel,fn:()=>onArchiveTask(task.id)},
    {icon:"x",label:"Delete",danger:true,fn:()=>onDeleteTask(task.id)},
  ];

  return (
    <SortableRow dragIdx={taskDragIdx} index={taskIndex} onReorder={onReorderTasks} style={{marginBottom:2}}>
      <div style={{opacity:task.archived?0.45:1}}>
        <div style={{display:"grid",gridTemplateColumns:"14px 1fr 82px 82px 72px 52px 52px 60px 94px 58px 52px 72px",
          gap:4,padding:"5px 0",borderBottom:`1px solid ${C.border}22`,alignItems:"center",minWidth:800}}>
          <span style={{cursor:"grab",color:C.dim,fontSize:8,textAlign:"center"}}>::</span>
          <div style={{display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}>
            <span onClick={()=>setExp(e=>!e)} style={{color:spaceColor,cursor:"pointer",fontSize:10,flexShrink:0}}>{exp?"v":">"}</span>
            {task.flagged&&<span style={{color:C.yellow,fontSize:9,flexShrink:0}}>P</span>}
            <InlineEdit value={task.name} onChange={nm=>onUpdTask(task.id,()=>({name:nm}))}
              style={{fontSize:11,fontWeight:700,color:task.archived?C.dim:C.text,fontFamily:"'JetBrains Mono',monospace"}}/>
            {(task.tags||[]).slice(0,2).map(tg=><TagChip key={tg} label={tg} color={TAG_C[tg]||C.muted}/>)}
          </div>
          <input type="date" value={task.start} onChange={e=>onUpdTask(task.id,()=>({start:e.target.value}))}
            style={{...St.inp,padding:"2px 4px",fontSize:9}}/>
          <input type="date" value={task.end} onChange={e=>onUpdTask(task.id,()=>({end:e.target.value}))}
            style={{...St.inp,padding:"2px 4px",fontSize:9}}/>
          <select value={task.status} onChange={e=>onUpdTask(task.id,()=>({status:e.target.value}))}
            style={{...St.inp,padding:"2px 4px",fontSize:9,color:STATUS_C[task.status]}}>
            {Object.keys(STATUS_C).map(s=><option key={s}>{s}</option>)}
          </select>
          {/* Assigned Hrs */}
          <div style={{fontSize:9,color:spaceColor,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",fontWeight:700}}>
            {th.toFixed(1)}h
          </div>
          {/* Actual Hrs */}
          <div style={{fontSize:9,color:C.green,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",fontWeight:700}}>
            {ta.toFixed(1)}h
          </div>
          <input type="range" min="0" max="100" value={tp}
            onChange={e=>onUpdTask(task.id,()=>({progress:+e.target.value}))}
            style={{width:"100%"}}/>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <Bar v={tp} c={spaceColor} h={4}/>
            <span style={{fontSize:9,color:spaceColor,fontFamily:"'JetBrains Mono',monospace",minWidth:26}}>{tp}%</span>
          </div>
          <select value={task.priority} onChange={e=>onUpdTask(task.id,()=>({priority:e.target.value}))}
            style={{...St.inp,padding:"2px 4px",fontSize:8,color:PRI_C[task.priority]}}>
            {PRIORITIES.map(p=><option key={p}>{p}</option>)}
          </select>
          <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setCtxMenu(m=>!m)} style={{background:"none",border:`1px solid ${C.border}33`,borderRadius:4,color:C.dim,cursor:"pointer",fontSize:11,padding:"0 5px",lineHeight:1.4}}>...</button>
            {ctxMenu && <CtxMenu onClose={()=>setCtxMenu(false)} items={taskMenuItems}/>}
          </div>
          <ActionBtns archived={task.archived} onArchive={()=>onArchiveTask(task.id)} onDelete={()=>onDeleteTask(task.id)}/>
        </div>

        {/* Task Notes inline panel */}
        {exp&&(
          <div style={{padding:"6px 18px 4px",borderBottom:`1px solid ${C.border}11`}}>
            <textarea
              value={task.notes||""}
              onChange={e=>onUpdTask(task.id,()=>({notes:e.target.value}))}
              placeholder="Task notes, links, context..."
              rows={task.notes?3:1}
              onFocus={e=>e.target.rows=3}
              onBlur={e=>{if(!task.notes)e.target.rows=1;}}
              style={{...St.inp,resize:"vertical",fontSize:9,lineHeight:1.6,
                width:"100%",padding:"5px 8px",color:C.muted,
                borderColor:task.notes?`${spaceColor}44`:C.border,
                background:task.notes?"rgba(255,255,255,0.03)":"transparent"}}/>
          </div>
        )}

        {/* Task Attachments - links/URLs */}
        {exp&&(
          <TaskAttachments task={task} onUpdTask={onUpdTask} spaceColor={spaceColor}/>
        )}

        {/* Subtasks */}
        <Collapse open={exp}>
          <div style={{paddingLeft:18,marginBottom:4}}>
            {/* Subtask column header */}
            {activeSubs.length>0&&<div style={{display:"grid",gridTemplateColumns:"14px 1fr 82px 82px 72px 52px 52px 60px 94px 58px 52px 72px",
              gap:4,padding:"3px 0",minWidth:800}}>
              {["","SUBTASK","START","END","STATUS","ASGN","ACTL","PROG%","PROGRESS","PRI","",""].map((h,i)=>
                <div key={i} style={{...St.lbl,fontSize:7}}>{h}</div>)}
            </div>}
            {activeSubs.map((sub,si)=>(
              <SubRow key={sub.id} sub={sub} taskId={task.id} spaceColor={spaceColor}
                onUpdSub={(sid,fn)=>onUpdSub(task.id,sid,fn)}
                dragIdx={subDragIdx} index={si}
                onReorderSubs={(f,t)=>onReorderSubs(task.id,f,t)}
                onDelete={sid=>onDeleteSub(task.id,sid)}
                onArchive={sid=>onArchiveSub(task.id,sid)}
                onCopySub={onCopySub}
                portfolioId={portfolioId} projId={projId}/>
            ))}
            {archSubs.length>0&&<>
              <button onClick={()=>setShowArch(a=>!a)} style={{...St.ghost,padding:"2px 8px",fontSize:8,color:C.dim,marginBottom:4}}>
                {showArch?"v":">"} {archSubs.length} archived
              </button>
              <Collapse open={showArch}>
                {archSubs.map((sub,si)=>(
                  <SubRow key={sub.id} sub={sub} taskId={task.id} spaceColor={spaceColor}
                    onUpdSub={(sid,fn)=>onUpdSub(task.id,sid,fn)}
                    dragIdx={subDragIdx} index={activeSubs.length+si}
                    onReorderSubs={(f,t)=>onReorderSubs(task.id,f,t)}
                    onDelete={sid=>onDeleteSub(task.id,sid)}
                    onArchive={sid=>onArchiveSub(task.id,sid)}
                    onCopySub={onCopySub}
                    portfolioId={portfolioId} projId={projId}/>
                ))}
              </Collapse>
            </>}
            <button onClick={()=>{onAddSub(task.id);setExp(true);}} style={{...St.ghost,padding:"3px 10px",fontSize:9,marginTop:4}}>+ Subtask</button>
          </div>
        </Collapse>
      </div>
    </SortableRow>
  );
}

/* ==========================================================
   PROJECT DETAIL PANEL (side panel)
========================================================== */
function ProjectDetail({proj,spaceColor,portfolioName,onUpdate,onUpdTask,onUpdSub,onAddTask,onAddSub,onBaseline,onReorderTasks,onReorderSubs,onDeleteTask,onArchiveTask,onDeleteSub,onArchiveSub,onCopyTask,onCopySub,onPasteTask,onPasteSub,clipboard}){
  const [tab,setTab]          = useState("tasks");
  const [showBlId,setShowBlId]= useState(null);
  const [showArch,setShowArch]= useState(false);
  const taskDragIdx            = useRef(null);

  const reorderTasks = useCallback((from,to)=>{
    const n=[...proj.tasks]; const[m]=n.splice(from,1); n.splice(to,0,m); onReorderTasks(n);
  },[proj.tasks,onReorderTasks]);

  const reorderSubs = useCallback((tid,from,to)=>{
    const task=proj.tasks.find(t=>t.id===tid); if(!task)return;
    const n=[...task.subtasks]; const[m]=n.splice(from,1); n.splice(to,0,m); onReorderSubs(tid,n);
  },[proj.tasks,onReorderSubs]);

  const activeTasks = (proj.tasks||[]).filter(t=>!t.archived);
  const archTasks   = (proj.tasks||[]).filter(t=>t.archived);
  const totalAssigned = projAssigned(proj);
  const totalActual   = projActual(proj);

  return (
    <div style={{background:C.card,border:`1px solid ${spaceColor}33`,borderRadius:12,overflow:"hidden"}} className="fu">
      {/* Header */}
      <div style={{padding:"13px 17px",borderBottom:`1px solid ${C.border}`,background:C.card2}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:8}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:3}}>{portfolioName}</div>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
              <InlineEdit value={proj.name} onChange={nm=>onUpdate(()=>({name:nm}))}
                style={{fontSize:14,fontWeight:700,color:C.text,fontFamily:"'Syne',sans-serif"}}/>
              {(proj.tags||[]).map(tg=><TagChip key={tg} label={tg} color={TAG_C[tg]||C.muted}
                onRemove={()=>onUpdate(p=>({tags:(p.tags||[]).filter(x=>x!==tg)}))}/>)}
              <TagPicker tags={proj.tags||[]} onChange={tags=>onUpdate(()=>({tags}))}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <select value={proj.status} onChange={e=>onUpdate(()=>({status:e.target.value}))}
                style={{...St.inp,width:"auto",padding:"3px 7px",fontSize:10,color:STATUS_C[proj.status]}}>
                {Object.keys(STATUS_C).map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={proj.priority} onChange={e=>onUpdate(()=>({priority:e.target.value}))}
                style={{...St.inp,width:"auto",padding:"3px 7px",fontSize:10,color:PRI_C[proj.priority]}}>
                {PRIORITIES.map(p=><option key={p}>{p}</option>)}
              </select>
              <input type="date" value={proj.start} onChange={e=>onUpdate(()=>({start:e.target.value}))} style={{...St.inp,width:"auto",padding:"3px 7px",fontSize:10}}/>
              <span style={{fontSize:9,color:C.muted}}>&gt;</span>
              <input type="date" value={proj.end} onChange={e=>onUpdate(()=>({end:e.target.value}))} style={{...St.inp,width:"auto",padding:"3px 7px",fontSize:10}}/>
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:22,fontWeight:800,color:spaceColor,fontFamily:"'JetBrains Mono',monospace"}}>{projProg(proj)}%</div>
            <div style={{fontSize:9,color:spaceColor,fontFamily:"'JetBrains Mono',monospace"}}>{totalAssigned.toFixed(1)}h asgn</div>
            <div style={{fontSize:9,color:C.green,fontFamily:"'JetBrains Mono',monospace"}}>{totalActual.toFixed(1)}h actual</div>
          </div>
        </div>
        <Bar v={projProg(proj)} c={spaceColor} h={5}/>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
        {[["tasks","Tasks"],["drift","! Drift"],["baselines","Baselines"],["notes","Notes"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{background:"none",border:"none",borderBottom:tab===id?`2px solid ${spaceColor}`:"2px solid transparent",
              color:tab===id?spaceColor:C.muted,cursor:"pointer",padding:"8px 13px",fontSize:10,fontWeight:700,
              letterSpacing:"0.09em",textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap"}}>
            {lbl}{id==="baselines"&&proj.baselines?.length?` (${proj.baselines.length})`:""}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={onBaseline}
          style={{...St.ghost,margin:"4px 12px 4px 0",padding:"3px 10px",fontSize:9,
            color:C.yellow,borderColor:`${C.yellow}44`,whiteSpace:"nowrap"}}>Snap Snapshot</button>
      </div>

      {/* TASKS */}
      {tab==="tasks"&&(
        <div style={{padding:"10px 14px",overflowX:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"14px 1fr 82px 82px 72px 52px 52px 60px 94px 58px 52px 72px",
            gap:4,padding:"4px 0 6px",borderBottom:`1px solid ${C.border}`,marginBottom:4,minWidth:800}}>
            {["","TASK","START","END","STATUS","ASGN","ACTL","PROG%","PROGRESS","PRI","",""].map((h,i)=>(
              <div key={i} style={{...St.lbl,color:h==="ASGN"?spaceColor:h==="ACTL"?C.green:C.muted}}>{h}</div>
            ))}
          </div>
          <div style={{minWidth:800}}>
            {activeTasks.map((task,ti)=>(
              <TaskRow key={task.id} task={task} spaceColor={spaceColor}
                onUpdTask={onUpdTask} onUpdSub={onUpdSub} onAddSub={onAddSub}
                taskDragIdx={taskDragIdx} taskIndex={ti}
                onReorderTasks={reorderTasks} onReorderSubs={reorderSubs}
                onDeleteTask={onDeleteTask} onArchiveTask={onArchiveTask}
                onDeleteSub={onDeleteSub} onArchiveSub={onArchiveSub}
                onCopyTask={onCopyTask} onCopySub={onCopySub}/>
            ))}
            {archTasks.length>0&&(
              <div style={{marginTop:6}}>
                <button onClick={()=>setShowArch(a=>!a)} style={{...St.ghost,padding:"3px 10px",fontSize:9,color:C.dim}}>
                  {showArch?"v":">"} {archTasks.length} archived task{archTasks.length>1?"s":""}
                </button>
                <Collapse open={showArch}>
                  {archTasks.map((task,ti)=>(
                    <TaskRow key={task.id} task={task} spaceColor={spaceColor}
                      onUpdTask={onUpdTask} onUpdSub={onUpdSub} onAddSub={onAddSub}
                      taskDragIdx={taskDragIdx} taskIndex={activeTasks.length+ti}
                      onReorderTasks={reorderTasks} onReorderSubs={reorderSubs}
                      onDeleteTask={onDeleteTask} onArchiveTask={onArchiveTask}
                      onDeleteSub={onDeleteSub} onArchiveSub={onArchiveSub}
                      onCopyTask={onCopyTask} onCopySub={onCopySub}/>
                  ))}
                </Collapse>
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={onAddTask} style={{...St.ghost,flex:1,fontSize:10}}>+ Add Task</button>
            {clipboard?.type==="task"&&<button onClick={onPasteTask}
              style={{...St.ghost,padding:"6px 12px",fontSize:10,color:C.yellow,borderColor:`${C.yellow}44`}}>
              Copy Paste Task "{clipboard.item.name}"
            </button>}
          </div>
        </div>
      )}

      {tab==="drift"&&<DriftPanel proj={proj}/>}

      {tab==="baselines"&&(
        <div style={{padding:"12px 16px"}}>
          {!proj.baselines?.length&&(
            <div style={{color:C.muted,fontSize:11,fontFamily:"'JetBrains Mono',monospace",padding:"22px 0",textAlign:"center"}}>
              No snapshots yet - click Snap Snapshot to save the current schedule.
            </div>
          )}
          {(proj.baselines||[]).map(bl=>(
            <div key={bl.id} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:8,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 13px",cursor:"pointer"}}
                onClick={()=>setShowBlId(showBlId===bl.id?null:bl.id)}>
                <span style={{fontSize:11,color:C.yellow,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>Snap {bl.label}</span>
                <span style={{fontSize:9,color:C.muted}}>{showBlId===bl.id?"v":">"} {bl.snapshot.length} tasks</span>
              </div>
              <Collapse open={showBlId===bl.id}>
                <div style={{padding:"8px 13px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 82px 82px 50px 80px",gap:6,padding:"3px 0 6px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                    {["TASK","BL START","BL END","PROG","DRIFT"].map(h=><div key={h} style={St.lbl}>{h}</div>)}
                  </div>
                  {bl.snapshot.map(snap=>{
                    const live=proj.tasks.find(t=>t.id===snap.id);
                    const ed=live?diffD(snap.end,live.end):null;
                    return (
                      <div key={snap.id} style={{display:"grid",gridTemplateColumns:"1fr 82px 82px 50px 80px",gap:6,padding:"4px 0",borderBottom:`1px solid ${C.border}11`,alignItems:"center"}}>
                        <span style={{fontSize:10,color:C.text,fontFamily:"'JetBrains Mono',monospace"}}>{snap.name}</span>
                        <span style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{snap.start}</span>
                        <span style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{snap.end}</span>
                        <span style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{snap.progress}%</span>
                        <span style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",
                          color:!live?"#555":ed===0?C.green:ed>0?C.red:C.green}}>
                          {!live?"deleted":ed===0?"on track":`${ed>0?"+":""}${ed}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Collapse>
            </div>
          ))}
        </div>
      )}

      {tab==="notes"&&(
        <div style={{padding:"12px 16px"}}>
          <textarea value={proj.notes||""} rows={10}
            onChange={e=>onUpdate(()=>({notes:e.target.value}))}
            placeholder="Notes, decisions, links, context..."
            style={{...St.inp,resize:"vertical",lineHeight:1.7}}/>
        </div>
      )}
    </div>
  );
}
/* ==========================================================
   PORTFOLIOS TAB (renamed from Portfolios)
========================================================== */


function SpaceCtxMenu({port,clipboard,onCopy,onPaste,onArchive,onDelete,onClose}){
  const archLabel = port.archived ? "Restore Space" : "Archive Space";
  const archIcon  = port.archived ? "^" : "v";
  const pasteItem = clipboard && clipboard.type==="portfolio"
    ? {icon:"=",label:'Paste "'+clipboard.item.name+'"',fn:onPaste}
    : null;
  const items = [{icon:"=",label:"Copy Space",fn:onCopy}];
  if(pasteItem) items.push(pasteItem);
  items.push("---");
  items.push({icon:archIcon,label:archLabel,fn:onArchive});
  items.push({icon:"x",label:"Delete Space",danger:true,fn:onDelete});
  return <CtxMenu onClose={onClose} items={items}/>;
}

function PortfolioCtxMenu({sp,clipboard,onAdd,onPasteProject,onCopy,onPasteSpace,onArchive,onDelete,onClose}){
  const pasteProjectItem = clipboard && clipboard.type==="project"
    ? {icon:"=",label:'Paste proj "'+clipboard.item.name+'"',fn:onPasteProject}
    : null;
  const pastePortfolioItem = clipboard && clipboard.type==="space"
    ? {icon:"=",label:'Paste space "'+clipboard.item.name+'"',fn:onPasteSpace}
    : null;
  const archLabel = sp.archived ? "Restore Portfolio" : "Archive Portfolio";
  const archIcon  = sp.archived ? "^" : "v";
  const items = [{icon:"+ >",label:"Add Project",fn:onAdd}];
  if(pasteProjectItem) items.push(pasteProjectItem);
  if(pastePortfolioItem) items.push(pastePortfolioItem);
  items.push("---");
  items.push({icon:"=",label:"Copy Portfolio",fn:onCopy});
  items.push({icon:archIcon,label:archLabel,fn:onArchive});
  items.push({icon:"x",label:"Delete Portfolio",danger:true,fn:onDelete});
  return <CtxMenu onClose={onClose} items={items}/>;
}

function ProjCtxMenu({pr,sp,onCopy,onFlag,onArchive,onDelete,onClose}){
  const flagLabel = pr.flagged  ? "Unflag" : "Flag";
  const archLabel = pr.archived ? "Restore" : "Archive";
  const archIcon  = pr.archived ? "^" : "v";
  const items = [
    {icon:"=",label:"Copy Project",fn:onCopy},
    {icon:"P",label:flagLabel,fn:onFlag},
    "---",
    {icon:archIcon,label:archLabel,fn:onArchive},
    {icon:"x",label:"Delete Project",danger:true,fn:onDelete},
  ];
  return <CtxMenu onClose={onClose} items={items}/>;
}

function SpacesTab({spaces,setSpaces,searchQ,pushUndo,sendToVoid}){
  const [activeSpId,    setActiveSpId]    = useState(spaces[0]?.id);
  const [activePortId,   setActivePortId]   = useState(null);
  const [activeProjId, setActiveProjId] = useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [collapsedSp,  setCollapsedSp]  = useState({});
  const [spaceMenu,     setSpaceMenu]     = useState(null);
  const [portMenu,       setPortMenu]       = useState(null);
  const [prMenu,       setPrMenu]       = useState(null);
  const [clipboard,    setClipboard]    = useState(null); // {type:"project"|"task"|"subtask", item}
  const spaceDragIdx = useRef(null);
  const projDragIdx  = useRef(null);
  const toggleSpace  = sid => setCollapsedSp(s=>({...s,[sid]:!s[sid]}));

  const port  = spaces.find(p=>p.id===activeSpId)||spaces[0];
  const space = port?.portfolios.find(s=>s.id===activePortId);
  const proj  = port?.portfolios.flatMap(s=>s.projects).find(p=>p.id===activeProjId);

  /* -- generic updaters -- */
  const updSpace  = fn => setSpaces(ps=>ps.map(p=>p.id===activeSpId?{...p,...fn(p)}:p));
  const updPortfolio = (sid,fn) => updSpace(p=>({portfolios:p.portfolios.map(s=>s.id===sid?{...s,...fn(s)}:s)}));
  const updProj  = useCallback((sid,prid,fn)=>setSpaces(ps=>ps.map(p=>p.id!==activeSpId?p:
    {...p,portfolios:p.portfolios.map(s=>s.id!==sid?s:{...s,projects:s.projects.map(pr=>pr.id!==prid?pr:{...pr,...fn(pr)})})})),[activeSpId]);
  const updTask  = useCallback((sid,prid,tid,fn)=>updProj(sid,prid,pr=>({tasks:pr.tasks.map(t=>t.id===tid?{...t,...fn(t)}:t)})),[updProj]);
  const updSub   = useCallback((sid,prid,tid,stid,fn)=>updTask(sid,prid,tid,t=>({subtasks:t.subtasks.map(s=>s.id===stid?{...s,...fn(s)}:s)})),[updTask]);
  const findSid  = prid => port?.portfolios.find(s=>s.projects.some(pr=>pr.id===prid))?.id;

  /* -- adders -- */
  const addSpace   = () => { const np=mkSpace(uid(),"New Space",C.teal,[]); setSpaces(ps=>[...ps,np]); setActiveSpId(np.id); setActivePortId(null); setActiveProjId(null); };
  const copySpace  = pid => { const p=spaces.find(x=>x.id===pid); if(p) setClipboard({type:"portfolio",item:deepCopy(p)}); };
  const pasteSpace = () => {
    if(!clipboard||clipboard.type!=="portfolio") return;
    const np={...deepCopy(clipboard.item),id:uid(),name:clipboard.item.name+" (copy)",
      portfolios:(clipboard.item.portfolios||[]).map(sp=>({...deepCopy(sp),id:uid(),
        projects:(sp.projects||[]).map(pr=>({...deepCopy(pr),id:uid(),
          tasks:(pr.tasks||[]).map(t=>({...deepCopy(t),id:uid(),subtasks:(t.subtasks||[]).map(s=>({...deepCopy(s),id:uid()}))}))
        }))
      }))
    };
    setSpaces(ps=>[...ps,np]); setActiveSpId(np.id);
  };
  const archiveSpace = pid => {
    const p=spaces.find(x=>x.id===pid);
    if(p?.archived){ setSpaces(ps=>ps.map(x=>x.id===pid?{...x,archived:false}:x)); return; }
    ask("Archive space?","Hides this space. All data preserved.",
      ()=>{ setSpaces(ps=>ps.map(x=>x.id===pid?{...x,archived:true}:x)); if(activeSpId===pid&&spaces.length>1) setActiveSpId(spaces.find(x=>x.id!==pid)?.id); setConfirm(null); });
  };
  const deleteSpace  = pid => {
    const sp = spaces.find(x=>x.id===pid);
    ask("Delete space?","Permanently removes this space and ALL its portfolios, projects, tasks and subtasks.", ()=>{
      const snap = deepCopy(spaces);
      const vItem = sendToVoid&&sendToVoid("space", sp?.name||"Space", "(top level)", sp);
      setSpaces(ps=>ps.filter(x=>x.id!==pid));
      if(activeSpId===pid) setActiveSpId(spaces.find(x=>x.id!==pid)?.id);
      setConfirm(null);
      pushUndo&&pushUndo(`Deleted space "${sp?.name}"`, snap, vItem);
    });
  };
  const addPortfolio     = () => { const ns=mkPortfolio(uid(),"New Portfolio",port.color,[]); updSpace(p=>({portfolios:[...p.portfolios,ns]})); setActivePortId(ns.id); };
  const addProject   = sid => { const np=mkProj(uid(),"New Project",fmtD(TODAY),fmtD(addD(TODAY,30)),"Not Started","Medium",port.color); updPortfolio(sid,s=>({projects:[...s.projects,np]})); setActiveProjId(np.id); setActivePortId(sid); };
  const addTask      = (sid,prid) => { const nt=mkTask(uid(),"New Task",fmtD(TODAY),fmtD(addD(TODAY,14)),1,0,"Not Started"); updProj(sid,prid,pr=>({tasks:[...pr.tasks,nt]})); };
  const addSub       = (sid,prid,tid) => { const ns=mkSub(uid(),"New Subtask",fmtD(TODAY),fmtD(addD(TODAY,7)),1,0,"Not Started"); updTask(sid,prid,tid,t=>({subtasks:[...t.subtasks,ns]})); };
  const takeBaseline = (sid,prid) => updProj(sid,prid,pr=>({baselines:[...(pr.baselines||[]),{
    id:uid(), label:`BL${(pr.baselines||[]).length+1}.${new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}`,
    snapshot:pr.tasks.map(t=>({id:t.id,name:t.name,start:t.start,end:t.end,progress:t.progress,subtasks:(t.subtasks||[]).map(s=>({id:s.id,name:s.name,start:s.start,end:s.end,progress:s.progress}))}))
  }]}));

  /* -- clipboard copy/paste -- */
  const copyProject = pr => setClipboard({type:"project",item:deepCopy(pr)});
  const copyTask    = t  => setClipboard({type:"task",item:deepCopy(t)});
  const copySub     = st => setClipboard({type:"subtask",item:deepCopy(st)});

  const pasteProject = sid => {
    if(!clipboard||clipboard.type!=="project") return;
    const np={...deepCopy(clipboard.item),id:uid(),name:clipboard.item.name+" (copy)",tasks:(clipboard.item.tasks||[]).map(t=>({...deepCopy(t),id:uid(),subtasks:(t.subtasks||[]).map(st=>({...deepCopy(st),id:uid()}))}))};
    updPortfolio(sid,s=>({projects:[...s.projects,np]}));
    setActiveProjId(np.id); setActivePortId(sid);
  };
  const pasteTask = (sid,prid) => {
    if(!clipboard||clipboard.type!=="task") return;
    const nt={...deepCopy(clipboard.item),id:uid(),name:clipboard.item.name+" (copy)",subtasks:(clipboard.item.subtasks||[]).map(st=>({...deepCopy(st),id:uid()}))};
    updProj(sid,prid,pr=>({tasks:[...pr.tasks,nt]}));
  };
  const pasteSub = (sid,prid,tid) => {
    if(!clipboard||clipboard.type!=="subtask") return;
    const ns={...deepCopy(clipboard.item),id:uid(),name:clipboard.item.name+" (copy)"};
    updTask(sid,prid,tid,t=>({subtasks:[...t.subtasks,ns]}));
  };

  /* -- confirm helper -- */
  const ask = (msg,detail,onConfirm) => setConfirm({msg,detail,onConfirm});

  /* -- delete / archive -- */
  const deleteProject  = (sid,prid) => {
    const pr = port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid);
    ask("Delete project?","Permanently removes the project, all tasks, and subtasks.", ()=>{
      const snap = deepCopy(spaces);
      const vItem = sendToVoid&&sendToVoid("project", pr?.name||"Project", `${port?.name} › ${port?.portfolios.find(s=>s.id===sid)?.name}`, pr);
      updPortfolio(sid,s=>({projects:s.projects.filter(p=>p.id!==prid)}));
      setActiveProjId(null); setConfirm(null);
      pushUndo&&pushUndo(`Deleted project "${pr?.name}"`, snap, vItem);
    });
  };
  const archiveProject = (sid,prid) => {
    const pr=port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid);
    if(pr?.archived){ updProj(sid,prid,()=>({archived:false})); return; }
    ask("Archive project?","Hidden from view but fully recoverable.",
      ()=>{ updProj(sid,prid,()=>({archived:true})); if(activeProjId===prid)setActiveProjId(null); setConfirm(null); });
  };
  const deletePortfolio = sid => {
    const sp = port?.portfolios.find(s=>s.id===sid);
    ask("Delete portfolio?","Permanently removes this portfolio and ALL its projects, tasks, and subtasks.", ()=>{
      const snap = deepCopy(spaces);
      const vItem = sendToVoid&&sendToVoid("portfolio", sp?.name||"Portfolio", port?.name||"", sp);
      updSpace(p=>({portfolios:p.portfolios.filter(s=>s.id!==sid)}));
      if(activePortId===sid){setActivePortId(null);setActiveProjId(null);} setConfirm(null);
      pushUndo&&pushUndo(`Deleted portfolio "${sp?.name}"`, snap, vItem);
    });
  };
  const archivePortfolio = sid => {
    const sp=port?.portfolios.find(s=>s.id===sid);
    if(sp?.archived){ updPortfolio(sid,()=>({archived:false})); return; }
    ask("Archive portfolio?","Hides this portfolio. Projects preserved.",
      ()=>{ updPortfolio(sid,()=>({archived:true})); if(activePortId===sid){setActivePortId(null);setActiveProjId(null);} setConfirm(null); });
  };
  const copyPortfolio    = sid => { const sp=port?.portfolios.find(s=>s.id===sid); if(sp) setClipboard({type:"space",item:sp}); };
  const pastePortfolio   = () => {
    if(!clipboard||clipboard.type!=="space") return;
    const newSp = {...clipboard.item, id:uid(), name:clipboard.item.name+" (copy)",
      projects:(clipboard.item.projects||[]).map(pr=>({...pr,id:uid(),
        tasks:(pr.tasks||[]).map(t=>({...t,id:uid(),subtasks:(t.subtasks||[]).map(s=>({...s,id:uid()}))}))
      }))};
    updSpace(p=>({portfolios:[...p.portfolios,newSp]}));
    setActivePortId(newSp.id);
  };
  const deleteTask   = (sid,prid,tid) => {
    const t=port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid)?.tasks.find(t=>t.id===tid);
    const pr=port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid);
    const sc=(t?.subtasks||[]).length;
    ask("Delete task?",sc?`Will also delete ${sc} subtask${sc>1?"s":""}.`:"Task permanently removed.",()=>{
      const snap=deepCopy(spaces);
      const vItem=sendToVoid&&sendToVoid("task",t?.name||"Task",`${port?.name} › ${port?.portfolios.find(s=>s.id===sid)?.name} › ${pr?.name}`,t);
      updProj(sid,prid,pr=>({tasks:pr.tasks.filter(t=>t.id!==tid)})); setConfirm(null);
      pushUndo&&pushUndo(`Deleted task "${t?.name}"`,snap,vItem);
    });
  };
  const archiveTask  = (sid,prid,tid) => { const t=port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid)?.tasks.find(t=>t.id===tid); if(t?.archived){ updTask(sid,prid,tid,()=>({archived:false})); return; } updTask(sid,prid,tid,()=>({archived:true})); };
  const deleteSub    = (sid,prid,tid,stid) => {
    const st=port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid)?.tasks.find(t=>t.id===tid)?.subtasks.find(s=>s.id===stid);
    const t=port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid)?.tasks.find(t=>t.id===tid);
    ask("Delete subtask?","Permanently removed.",()=>{
      const snap=deepCopy(spaces);
      const vItem=sendToVoid&&sendToVoid("subtask",st?.name||"Subtask",`... › ${t?.name}`,st);
      updTask(sid,prid,tid,t=>({subtasks:t.subtasks.filter(s=>s.id!==stid)})); setConfirm(null);
      pushUndo&&pushUndo(`Deleted subtask "${st?.name}"`,snap,vItem);
    });
  };
  const archiveSub   = (sid,prid,tid,stid) => { const st=port?.portfolios.find(s=>s.id===sid)?.projects.find(p=>p.id===prid)?.tasks.find(t=>t.id===tid)?.subtasks.find(s=>s.id===stid); updSub(sid,prid,tid,stid,()=>({archived:!st?.archived})); };

  /* -- reorder -- */
  const reorderSpaces = (f,t) => updSpace(p=>{const n=[...p.portfolios];const[m]=n.splice(f,1);n.splice(t,0,m);return{portfolios:n};});
  const reorderProjs  = (sid,f,t) => updPortfolio(sid,s=>{const n=[...s.projects];const[m]=n.splice(f,1);n.splice(t,0,m);return{projects:n};});
  const reorderTasks  = (prid,tasks) => { const sid=findSid(prid); if(sid)updProj(sid,prid,()=>({tasks})); };
  const reorderSubs   = (prid,tid,subs) => { const sid=findSid(prid); if(sid)updTask(sid,prid,tid,()=>({subtasks:subs})); };

  /* -- cross-space drag: project drop target -- */
  const [projDropSid,setProjDropSid] = useState(null);
  const handleProjDrop = (sid) => {
    if(!clipboard||clipboard.type!=="project") return;
    pasteProject(sid);
    setProjDropSid(null);
  };

  /* -- search filter -- */
  const allProjects = port?.portfolios.flatMap(s=>s.projects.map(pr=>({...pr,portfolioId:s.id,portfolioName:s.name})))||[];
  const filteredProjs = searchQ?.trim()
    ? allProjects.filter(pr=>{ const q=searchQ.toLowerCase(); return pr.name.toLowerCase().includes(q)||(pr.tasks||[]).some(t=>t.name.toLowerCase().includes(q)||(t.subtasks||[]).some(st=>st.name.toLowerCase().includes(q))||((t.tags||[]).join(" ").toLowerCase().includes(q)))||((pr.tags||[]).join(" ").toLowerCase().includes(q)); })
    : null;

  const activeSpaces = port?.portfolios.filter(s=>!s.archived)||[];
  const archSpaces   = port?.portfolios.filter(s=>s.archived)||[];

  return (
    <div style={{display:"grid",gridTemplateColumns:"290px 1fr",gap:14,alignItems:"start"}}>
      {confirm&&<ConfirmModal {...confirm} onCancel={()=>setConfirm(null)}/>}

      {/* -- SIDEBAR -- */}
      <div>
        {/* Portfolio tab strip */}
        <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          {spaces.filter(p=>!p.archived).map(p=>(
            <div key={p.id} style={{position:"relative",display:"flex",alignItems:"center",gap:0}}>
              <button onClick={()=>{setActiveSpId(p.id);setActivePortId(null);setActiveProjId(null);setSpaceMenu(null);}}
                style={{...St.ghost,borderColor:activeSpId===p.id?p.color:C.border,borderRight:"none",
                  borderRadius:"6px 0 0 6px",
                  color:activeSpId===p.id?p.color:C.muted,padding:"4px 10px",fontSize:10}}>
                <InlineEdit value={p.name} onChange={nm=>setSpaces(ps=>ps.map(x=>x.id===p.id?{...x,name:nm}:x))}
                  style={{color:"inherit",fontSize:10}}/>
              </button>
              <div style={{position:"relative"}}>
                <button onClick={e=>{e.stopPropagation();setSpaceMenu(spaceMenu===p.id?null:p.id);}}
                  style={{...St.ghost,borderColor:activeSpId===p.id?p.color:C.border,borderLeft:`1px solid ${activeSpId===p.id?p.color+"44":C.border}`,
                    borderRadius:"0 6px 6px 0",color:C.dim,cursor:"pointer",
                    fontSize:9,padding:"4px 5px",lineHeight:1.4}}>...</button>
                {spaceMenu===p.id&&(
                  <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:400}} onClick={e=>e.stopPropagation()}>
                    <SpaceCtxMenu port={p} clipboard={clipboard}
                      onCopy={()=>{copySpace(p.id);setSpaceMenu(null);}}
                      onPaste={()=>{pasteSpace();setSpaceMenu(null);}}
                      onArchive={()=>{archiveSpace(p.id);setSpaceMenu(null);}}
                      onDelete={()=>{deleteSpace(p.id);setSpaceMenu(null);}}
                      onClose={()=>setSpaceMenu(null)}/>
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Archived Spaces — shown as dimmed tabs with restore on click */}
          {spaces.filter(p=>p.archived).map(p=>(
            <div key={p.id} style={{position:"relative",display:"flex",alignItems:"center",gap:0,opacity:0.4}}>
              <button title="Click ... to restore"
                style={{...St.ghost,borderColor:C.border,borderRight:"none",borderRadius:"6px 0 0 6px",
                  color:C.dim,padding:"4px 10px",fontSize:10,textDecoration:"line-through",cursor:"default"}}>
                {p.name}
              </button>
              <button onClick={e=>{e.stopPropagation();archiveSpace(p.id);}}
                title="Restore Space"
                style={{...St.ghost,borderColor:C.border,borderLeft:`1px solid ${C.border}`,
                  borderRadius:"0 6px 6px 0",color:C.cyan,cursor:"pointer",
                  fontSize:9,padding:"4px 6px",lineHeight:1.4}}>↺</button>
            </div>
          ))}
          <button onClick={addSpace} style={{...St.ghost,padding:"4px 9px",fontSize:9,color:C.teal,borderColor:`${C.teal}44`,marginLeft:"auto"}}>+ Space</button>
        </div>

        {/* Portfolio summary bar */}
        {port&&(()=>{
          const [portExpanded,setPortExpanded] = React.useState(false);
          const allProjs = port.portfolios.flatMap(sp=>sp.projects.filter(p=>!p.archived).map(p=>({...p,portfolioName:sp.name})));
          return (
            <div style={{background:C.card,border:`1px solid ${port.color}44`,borderRadius:10,padding:"10px 13px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <InlineEdit value={port.name}
                  onChange={nm=>setSpaces(ps=>ps.map(x=>x.id===port.id?{...x,name:nm}:x))}
                  style={{fontSize:12,fontWeight:700,color:port.color,fontFamily:"'Syne',sans-serif"}}/>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:9,color:port.color,fontFamily:"'JetBrains Mono',monospace"}}>
                    {allProjs.length} project{allProjs.length!==1?"s":""}
                  </span>
                  <button onClick={()=>setPortExpanded(e=>!e)}
                    style={{background:"none",border:"none",color:port.color,cursor:"pointer",fontSize:10,padding:"0 2px"}}>
                    {portExpanded?"v":">"}
                  </button>
                </div>
              </div>
              <Bar v={Math.round(activeSpaces.reduce((s,sp)=>s+spaceProg(sp),0)/Math.max(1,activeSpaces.length))} c={port.color}/>
              {portExpanded&&allProjs.length>0&&(
                <div style={{marginTop:8,borderTop:`1px solid ${port.color}22`,paddingTop:8}}>
                  {allProjs.map(pr=>(
                    <div key={pr.id}
                      onClick={()=>{setActiveProjId(pr.id);setActivePortId(port.portfolios.find(s=>s.projects.some(p=>p.id===pr.id))?.id);}}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:5,cursor:"pointer",
                        background:activeProjId===pr.id?`${pr.color}18`:"transparent",marginBottom:2}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:pr.color,flexShrink:0}}/>
                      <span style={{fontSize:10,color:activeProjId===pr.id?pr.color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pr.name}</span>
                      <span style={{fontSize:8,color:C.dim,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{pr.portfolioName}</span>
                      <span style={{fontSize:8,color:pr.color,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{pr.progress||0}%</span>
                    </div>
                  ))}
                </div>
              )}
              {portExpanded&&!allProjs.length&&(
                <div style={{marginTop:8,fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",padding:"4px 0"}}>No projects yet</div>
              )}
            </div>
          );
        })()}

        {/* Clipboard indicator */}
        {clipboard&&(
          <div style={{background:`${C.yellow}15`,border:`1px solid ${C.yellow}44`,borderRadius:7,padding:"6px 10px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:9,color:C.yellow,fontFamily:"'JetBrains Mono',monospace"}}>{clipboard.type === "space" ? "Space" : clipboard.type === "project" ? "Project" : clipboard.type === "task" ? "Task" : "Subtask"}: "{clipboard.item.name}"</span>
            <button onClick={()=>setClipboard(null)} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:11}}>x</button>
          </div>
        )}

        {/* Search results */}
        {filteredProjs ? (
          <div>
            <div style={{...St.lbl,marginBottom:8,padding:"0 2px"}}>Search . {filteredProjs.length} results</div>
            {filteredProjs.map(pr=>{
              const isActive=activeProjId===pr.id;
              return (
                <div key={pr.id} onClick={()=>{setActiveProjId(isActive?null:pr.id);setActivePortId(pr.portfolioId);}}
                  style={{background:isActive?C.card2:C.card,border:`1px solid ${isActive?pr.color+"88":C.border}`,
                    borderRadius:8,padding:"8px 12px",marginBottom:4,cursor:"pointer"}}>
                  <div style={{fontSize:8,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginBottom:2}}>{pr.portfolioName}</div>
                  <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:3}}>{pr.name}</div>
                  <Bar v={projProg(pr)} c={pr.color} h={2}/>
                </div>
              );
            })}
            {!filteredProjs.length&&<div style={{color:C.muted,fontSize:11,fontFamily:"'JetBrains Mono',monospace",padding:"12px 0"}}>No results.</div>}
          </div>
        ) : (
          <>
            {activeSpaces.map((sp,si)=>{
              const spCollapsed = !!collapsedSp[sp.id];
              const activePrjs  = sp.projects.filter(pr=>!pr.archived);
              const archPrjs    = sp.projects.filter(pr=>pr.archived);
              return (
              <SortableRow key={sp.id} dragIdx={spaceDragIdx} index={si} onReorder={reorderSpaces} style={{marginBottom:6}}>
                {/* Space header */}
                <div style={{display:"flex",alignItems:"center",gap:5,padding:"7px 10px",
                  background:C.card2,border:`1px solid ${spCollapsed?C.border:sp.color+"44"}`,
                  borderRadius:spCollapsed?8:"8px 8px 0 0",cursor:"pointer",userSelect:"none"}}
                  onClick={()=>toggleSpace(sp.id)}>
                  <span style={{cursor:"grab",color:C.dim,fontSize:8,flexShrink:0}} onClick={e=>e.stopPropagation()}>::</span>
                  <span style={{color:sp.color,fontSize:11,flexShrink:0,transition:"transform 0.2s",display:"inline-block",transform:spCollapsed?"rotate(-90deg)":"rotate(0deg)"}}>v</span>
                  <span style={{width:6,height:6,borderRadius:"50%",background:sp.color,display:"inline-block",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}} onClick={e=>e.stopPropagation()}>
                    <InlineEdit value={sp.name} onChange={nm=>updPortfolio(sp.id,()=>({name:nm}))}
                      style={{fontSize:10,fontWeight:700,color:spCollapsed?C.muted:sp.color}}/>
                  </div>
                  <span style={{fontSize:8,color:C.dim,fontFamily:"'JetBrains Mono',monospace",flexShrink:0,marginRight:4}}>
                    {activePrjs.length}p . {spaceProg(sp)}%
                  </span>
                  <button onClick={e=>{e.stopPropagation();addProject(sp.id);setCollapsedSp(s=>({...s,[sp.id]:false}));}}
                    style={{...St.ghost,padding:"2px 8px",fontSize:8,color:C.cyan,borderColor:`${C.cyan}44`,flexShrink:0}}>+ Project</button>
                  <div style={{position:"relative",flexShrink:0}} onClick={e=>e.stopPropagation()}>
                    <button onClick={e=>{e.stopPropagation();setPortMenu(portMenu===sp.id?null:sp.id);}}
                      style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:"pointer",fontSize:12,padding:"1px 6px",lineHeight:1.2}}>...</button>
                    {portMenu===sp.id&&(
                      <PortfolioCtxMenu sp={sp} clipboard={clipboard}
                        onAdd={()=>{addProject(sp.id);setCollapsedSp(s=>({...s,[sp.id]:false}));}}
                        onPasteProject={()=>pasteProject(sp.id)}
                        onCopy={()=>copyPortfolio(sp.id)}
                        onPasteSpace={()=>pastePortfolio()}
                        onArchive={()=>archivePortfolio(sp.id)}
                        onDelete={()=>deletePortfolio(sp.id)}
                        onClose={()=>setPortMenu(null)}/>
                    )}
                  </div>
                </div>

                {/* Projects list */}
                <Collapse open={!spCollapsed}>
                  <div style={{border:`1px solid ${sp.color}22`,borderTop:"none",borderRadius:"0 0 8px 8px",background:C.bg,padding:"4px 4px 6px"}}>
                    {activePrjs.map((pr,pi)=>{
                      const isActive=activeProjId===pr.id;
                      const prog=projProg(pr);
                      return (
                        <SortableRow key={pr.id} dragIdx={projDragIdx} index={pi}
                          onReorder={(f,t)=>reorderProjs(sp.id,f,t)}
                          style={{marginBottom:3}}>
                          <div onClick={()=>{setActivePortId(sp.id);setActiveProjId(isActive?null:pr.id);}}
                            style={{background:isActive?`${pr.color}12`:C.card,border:`1px solid ${isActive?pr.color+"88":C.border}`,
                              borderRadius:7,padding:"8px 10px",cursor:"pointer",transition:"all 0.15s"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,flex:1,minWidth:0}}>
                                <span style={{cursor:"grab",color:C.dim,fontSize:8,flexShrink:0}} onClick={e=>e.stopPropagation()}>::</span>
                                {pr.flagged&&<span style={{color:C.yellow,fontSize:9,flexShrink:0}}>P</span>}
                                <InlineEdit value={pr.name} onChange={nm=>updProj(sp.id,pr.id,()=>({name:nm}))}
                                  style={{fontSize:11,fontWeight:700,color:isActive?pr.color:C.text}}/>
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0,marginLeft:8}}>
                                <span style={{fontSize:12,fontWeight:800,color:pr.color,fontFamily:"'JetBrains Mono',monospace"}}>{prog}%</span>
                                <span style={{fontSize:10,color:isActive?pr.color:C.dim}}>{isActive?"v":">"}</span>
                                <div style={{position:"relative",zIndex:500}} onClick={e=>e.stopPropagation()}>
                                <button onClick={e=>{e.stopPropagation();setPrMenu(prMenu===pr.id?null:pr.id);}}
                                  style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,color:C.muted,cursor:"pointer",fontSize:12,padding:"1px 6px",lineHeight:1.2}}>...</button>
                                {prMenu===pr.id&&(
                                  <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",zIndex:1000}}>
                                  <ProjCtxMenu pr={pr} sp={sp}
                                    onCopy={()=>copyProject(pr)}
                                    onFlag={()=>updProj(sp.id,pr.id,()=>({flagged:!pr.flagged}))}
                                    onArchive={()=>archiveProject(sp.id,pr.id)}
                                    onDelete={()=>deleteProject(sp.id,pr.id)}
                                    onClose={()=>setPrMenu(null)}/>
                                  </div>
                                )}
                                </div>
                              </div>
                            </div>
                            <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:5}}>
                              <span style={{fontSize:8,background:`${PRI_C[pr.priority]}22`,color:PRI_C[pr.priority],borderRadius:3,padding:"1px 5px",fontFamily:"'JetBrains Mono',monospace"}}>{pr.priority}</span>
                              <span style={{fontSize:8,background:`${STATUS_C[pr.status]}22`,color:STATUS_C[pr.status],borderRadius:3,padding:"1px 5px",fontFamily:"'JetBrains Mono',monospace"}}>{pr.status}</span>
                              <span style={{fontSize:8,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{projAssigned(pr).toFixed(1)}h / {projActual(pr).toFixed(1)}h</span>
                              {(pr.tags||[]).slice(0,2).map(tg=><TagChip key={tg} label={tg} color={TAG_C[tg]||C.muted}/>)}
                            </div>
                            <Bar v={prog} c={pr.color} h={3}/>
                          </div>
                        </SortableRow>
                      );
                    })}
                    {archPrjs.map(pr=>(
                      <div key={pr.id} style={{marginBottom:3,opacity:0.4}}>
                        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div style={{fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace"}}>? {pr.name}</div>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>updProj(sp.id,pr.id,()=>({archived:false}))} style={{...St.ghost,padding:"2px 6px",fontSize:8,color:C.cyan}}>↺ restore</button>
                            <button onClick={()=>deleteProject(sp.id,pr.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:11}}>x</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {activePrjs.length===0&&archPrjs.length===0&&(
                      <div style={{padding:"12px 8px",color:C.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",textAlign:"center"}}>
                        No projects - click + Project above
                      </div>
                    )}
                  </div>
                </Collapse>
              </SortableRow>
              );
            })}

            {archSpaces.length>0&&(
              <div style={{marginTop:8,padding:"6px 10px",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,opacity:0.6}}>
                <div style={{...St.lbl,marginBottom:5}}>Archived Portfolios ({archSpaces.length})</div>
                {archSpaces.map(sp=>(
                  <div key={sp.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0"}}>
                    <span style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",textDecoration:"line-through"}}>{sp.name}</span>
                    <button onClick={()=>archivePortfolio(sp.id)} style={{...St.ghost,padding:"2px 7px",fontSize:8,color:C.cyan}}>↺ restore</button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={addPortfolio} style={{...St.ghost,width:"100%",fontSize:9,padding:"6px",marginTop:8,color:C.teal,borderColor:`${C.teal}33`}}>+ Add Portfolio</button>
          </>
        )}
      </div>

      {/* -- PROJECT DETAIL -- */}
      {proj&&space&&(
        <ProjectDetail key={proj.id}
          proj={proj} spaceColor={port.color} portfolioName={space.name}
          clipboard={clipboard}
          onUpdate={fn=>updProj(space.id,proj.id,fn)}
          onUpdTask={(tid,fn)=>updTask(space.id,proj.id,tid,fn)}
          onUpdSub={(tid,stid,fn)=>updSub(space.id,proj.id,tid,stid,fn)}
          onAddTask={()=>addTask(space.id,proj.id)}
          onAddSub={tid=>addSub(space.id,proj.id,tid)}
          onBaseline={()=>takeBaseline(space.id,proj.id)}
          onReorderTasks={tasks=>reorderTasks(proj.id,tasks)}
          onReorderSubs={(tid,subs)=>reorderSubs(proj.id,tid,subs)}
          onDeleteTask={tid=>deleteTask(space.id,proj.id,tid)}
          onArchiveTask={tid=>archiveTask(space.id,proj.id,tid)}
          onDeleteSub={(tid,stid)=>deleteSub(space.id,proj.id,tid,stid)}
          onArchiveSub={(tid,stid)=>archiveSub(space.id,proj.id,tid,stid)}
          onCopyTask={t=>copyTask(t)}
          onCopySub={st=>copySub(st)}
          onPasteTask={()=>pasteTask(space.id,proj.id)}
          onPasteSub={tid=>pasteSub(space.id,proj.id,tid)}
        />
      )}
    </div>
  );
}

/* ==========================================================
   TODAY FOCUS TAB
========================================================== */
function TodayFocus({spaces}){
  const items = useMemo(()=>{
    const arr=[];
    spaces.forEach(po=>po.portfolios.filter(s=>!s.archived).forEach(sp=>sp.projects.filter(p=>!p.archived).forEach(pr=>{
      (pr.tasks||[]).filter(t=>!t.archived).forEach(t=>{
        const dL=diffD(todayS,t.end);
        const overdue=t.end<todayS&&t.status!=="Done";
        const today=t.end===todayS;
        const soon=dL>=0&&dL<=3&&t.status!=="Done";
        if(overdue||today||soon||t.flagged){
          arr.push({...t,spaceName:po.name,spaceColor:po.color,portfolioName:sp.name,projName:pr.name,projColor:pr.color,daysLeft:dL,overdue,today,soon,tp:taskProg(t),assigned:taskAssigned(t),actual:taskActual(t)});
        }
      });
    })));
    return arr.sort((a,b)=>a.daysLeft-b.daysLeft);
  },[spaces]);

  const overdue=items.filter(i=>i.overdue),todays=items.filter(i=>i.today),soon=items.filter(i=>i.soon&&!i.today&&!i.overdue),flagged=items.filter(i=>i.flagged&&!i.overdue&&!i.today&&!i.soon);

  const renderGroup = (group,label,color) => !group.length?null:(
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{background:`${color}22`,color,borderRadius:5,padding:"2px 10px",fontSize:9,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{label} ({group.length})</span>
      </div>
      {group.map(item=>(
        <div key={item.id} style={{background:C.card,border:`1px solid ${item.overdue?C.red+"44":C.border}`,borderRadius:10,padding:"11px 14px",marginBottom:6}} className="fu">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div>
              <div style={{fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace",marginBottom:2}}>{item.spaceName} &gt; {item.portfolioName} &gt; {item.projName}</div>
              <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:"'Syne',sans-serif"}}>{item.name}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:9,color:item.overdue?C.red:item.today?C.orange:C.yellow,fontFamily:"'JetBrains Mono',monospace"}}>
                {item.overdue?`${Math.abs(item.daysLeft)}d overdue`:item.today?"Today":item.soon?`${item.daysLeft}d left`:""}
              </div>
              <div style={{fontSize:9,color:item.projColor,fontFamily:"'JetBrains Mono',monospace"}}>{item.tp}%</div>
            </div>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <div style={{flex:1}}><Bar v={item.tp} c={item.projColor} h={4}/></div>
            <span style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{item.assigned.toFixed(1)}h asgn / {item.actual.toFixed(1)}h actual</span>
            <span style={{fontSize:8,background:`${STATUS_C[item.status]}22`,color:STATUS_C[item.status],borderRadius:3,padding:"1px 6px",fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{item.status}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:19,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>Today Focus</div>
        <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>Overdue . due today . due within 3 days . flagged</div>
      </div>
      {!items.length&&<div style={{padding:"40px 0",textAlign:"center",color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>All clear - nothing urgent or flagged.</div>}
      {renderGroup(overdue,"OVERDUE",C.red)}
      {renderGroup(todays,"DUE TODAY",C.orange)}
      {renderGroup(soon,"COMING SOON",C.yellow)}
      {renderGroup(flagged,"FLAGGED",C.purple)}
    </div>
  );
}

/* ==========================================================
   GANTT TAB
========================================================== */
function GanttTab({spaces}){
  const LABEL=210; const CW=660;
  const [rangeStart,setRangeStart] = useState(new Date(2026,0,1));
  const [totalDays,setTotalDays]   = useState(90);
  const [selSpaces,setSelSpaces] = useState(new Set(["all"]));
  const [selPortfolios,setSelPortfolios] = useState(new Set(["all"]));
  const [selProjs,setSelProjs]  = useState(new Set(["all"]));
  const [showFilters,setShowFilters] = useState(false);
  const [expanded,setExpanded]     = useState({});
  const [blSel,setBlSel]           = useState({});
  const [dateFrom,setDateFrom]     = useState("2026-01-01");
  const [dateTo,setDateTo]         = useState("2026-03-31");
  const [ganttYear,setGanttYear]   = useState(2026);
  const ganttRef = useRef(null);
  const panRef   = useRef({active:false,startX:0,startOff:0});

  const ZOOMS=[{l:"5D",d:5},{l:"2W",d:14},{l:"1M",d:30},{l:"6M",d:180},{l:"1Y",d:365}];
  const QS=[{l:"Q1",m:0},{l:"Q2",m:3},{l:"Q3",m:6},{l:"Q4",m:9}];

  const jumpToQ = (monthStart) => {
    const s = new Date(ganttYear, monthStart, 1);
    const e = new Date(ganttYear, monthStart + 3, 0);
    setRangeStart(s); setTotalDays(diffD(fmtD(s), fmtD(e)));
    setDateFrom(fmtD(s)); setDateTo(fmtD(e));
  };
  const activeQ = () => {
    const yr=rangeStart.getFullYear(); const mo=rangeStart.getMonth();
    if(yr!==ganttYear) return null;
    if(totalDays>=85&&totalDays<=95) return Math.floor(mo/3);
    return null;
  };

  const activeSpaces = useMemo(()=>spaces.filter(p=>!p.archived),[spaces]);

  const allPortfolios = useMemo(()=>
    activeSpaces.flatMap(p=>p.portfolios.filter(s=>!s.archived).map(s=>({...s,spaceColor:p.color,spaceName:p.name,spaceId:p.id})))
  ,[activeSpaces]);

  const toggleSet = (setter, id) => setter(prev => {
    if(id==="all") return new Set(["all"]);
    const next = new Set(prev);
    next.delete("all");
    if(next.has(id)){
      next.delete(id);
      // allow full deselection — show nothing
    } else {
      next.add(id);
    }
    return next.size ? next : new Set(); // allow empty = show nothing
  });

  const filteredPortfolios = useMemo(()=>{
    if(selSpaces.has("all")) return allPortfolios;
    return allPortfolios.filter(s=>selSpaces.has(s.spaceId));
  },[selSpaces,allPortfolios]);

  const allProjects = useMemo(()=>
    filteredPortfolios.flatMap(s=>s.projects.filter(pr=>!pr.archived).map(pr=>({...pr,portfolioId:s.id,portfolioName:s.name,spaceColor:s.spaceColor,spaceId:s.spaceId,spaceName:s.spaceName})))
  ,[filteredPortfolios]);

  const visible = useMemo(()=>{
    let ps = selPortfolios.has("all") ? allProjects : allProjects.filter(pr=>selPortfolios.has(pr.portfolioId));
    if(!selProjs.has("all")) ps=ps.filter(pr=>selProjs.has(pr.id));
    const seen=new Set(); ps=ps.filter(pr=>{ if(seen.has(pr.id)) return false; seen.add(pr.id); return true; });
    return ps;
  },[allProjects,selPortfolios,selProjs]);

  const applyRange = () => {
    const s=new Date(dateFrom),e=new Date(dateTo);
    if(isNaN(s.getTime())||isNaN(e.getTime())||e<=s)return;
    setRangeStart(s); setTotalDays(Math.max(5,diffD(fmtD(s),fmtD(e))));
  };
  const resetView = () => {
    const q=Math.floor(TODAY.getMonth()/3);
    const s=new Date(TODAY.getFullYear(),q*3,1); const e=new Date(TODAY.getFullYear(),q*3+3,0);
    setRangeStart(s); setTotalDays(diffD(fmtD(s),fmtD(e)));
    setDateFrom(fmtD(s)); setDateTo(fmtD(e));
  };

  const onWheel = useCallback(e=>{
    e.preventDefault();
    const rect=ganttRef.current?.getBoundingClientRect();
    const cx=rect?clamp((e.clientX-rect.left-LABEL)/CW,0,1):0.5;
    if(Math.abs(e.deltaY)>=Math.abs(e.deltaX)){
      const factor=e.deltaY>0?1.2:0.83;
      const nd=clamp(Math.round(totalDays*factor),5,730);
      const pin=Math.round(cx*totalDays); const np=Math.round(cx*nd);
      setRangeStart(s=>addD(s,pin-np)); setTotalDays(nd);
    } else { setRangeStart(s=>addD(s,Math.round((e.deltaX/CW)*totalDays*0.5))); }
  },[totalDays]);

  useEffect(()=>{
    const el=ganttRef.current; if(!el)return;
    el.addEventListener("wheel",onWheel,{passive:false});
    return ()=>el.removeEventListener("wheel",onWheel);
  },[onWheel]);

  // Touch pinch-to-zoom + pan
  const touchRef = useRef({touches:[],startDays:totalDays,startOff:0});
  const onTouchStart = e => {
    const ts=[...e.touches].map(t=>({x:t.clientX,y:t.clientY}));
    touchRef.current = {touches:ts, startDays:totalDays, startOff:0, startRange:rangeStart};
  };
  const onTouchMove = useCallback(e=>{
    e.preventDefault();
    const ts=[...e.touches].map(t=>({x:t.clientX}));
    const prev=touchRef.current;
    if(ts.length===2&&prev.touches.length===2){
      // Pinch: zoom
      const currDist=Math.abs(ts[1].x-ts[0].x);
      const prevDist=Math.abs(prev.touches[0].x-prev.touches[1].x)||1;
      const scale=prevDist/currDist;
      const nd=clamp(Math.round(prev.startDays*scale),5,730);
      setTotalDays(nd);
    } else if(ts.length===1&&prev.touches.length>=1){
      // Pan
      const dx=ts[0].x-prev.touches[0].x;
      const daysDelta=Math.round(-dx/CW*totalDays);
      if(daysDelta!==0) setRangeStart(s=>addD(s,daysDelta));
    }
    touchRef.current.touches=ts;
  },[totalDays]);
  const onTouchEnd = () => {};

  useEffect(()=>{
    const el=ganttRef.current; if(!el)return;
    el.addEventListener("touchmove",onTouchMove,{passive:false});
    return ()=>el.removeEventListener("touchmove",onTouchMove);
  },[onTouchMove]);

  const onMouseDown = e=>{ panRef.current={active:true,startX:e.clientX,startOff:0}; };
  const onMouseMove = useCallback(e=>{
    if(!panRef.current.active)return;
    const dm=Math.round(-(e.clientX-panRef.current.startX)/CW*totalDays);
    const diff=dm-panRef.current.startOff;
    if(diff!==0){ setRangeStart(s=>addD(s,diff)); panRef.current.startOff=dm; }
  },[totalDays]);
  const onMouseUp = e=>{ panRef.current.active=false; };

  const endDate = addD(rangeStart,totalDays);
  const toX     = d => clamp(diffD(fmtD(rangeStart),d)/totalDays*CW,-8,CW+8);
  const todayX  = diffD(fmtD(rangeStart),todayS)/totalDays*CW;

  const ticks = useMemo(()=>{
    const t=[]; const step=totalDays<=10?1:totalDays<=30?3:totalDays<=90?7:totalDays<=180?14:30;
    for(let i=0;i<=totalDays;i+=step){ const d=addD(rangeStart,i); t.push({x:i/totalDays*CW,label:d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}); }
    return t;
  },[rangeStart,totalDays]);

  const ROW=34;

  return (
    <div onClick={()=>setShowFilters(false)}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:19,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>Gantt Timeline</div>
      </div>

      {/* Controls row 1: filters */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        {/* Filter toggle button */}
        <div style={{position:"relative"}}>
          <button onClick={e=>{e.stopPropagation();setShowFilters(f=>!f);}}
            style={{...St.ghost,padding:"5px 11px",fontSize:10,
              borderColor:(!selSpaces.has("all")||!selPortfolios.has("all")||!selProjs.has("all"))?C.cyan:C.border,
              color:(!selSpaces.has("all")||!selPortfolios.has("all")||!selProjs.has("all"))?C.cyan:C.muted}}>
            Filter {(!selSpaces.has("all")||!selPortfolios.has("all")||!selProjs.has("all"))?"*":""}
          </button>
          {showFilters&&(
            <div onClick={e=>e.stopPropagation()}
              style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:300,
                background:"#0d1525",border:`1px solid ${C.border}`,borderRadius:10,
                padding:"14px 16px",minWidth:280,boxShadow:"0 8px 32px rgba(0,0,0,0.7)"}}>
              {/* Space filter */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:8,color:C.cyan,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.15em",marginBottom:6}}>SPACE</div>
                <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer"}}>
                  <input type="checkbox" checked={selSpaces.has("all")} onChange={()=>setSelSpaces(new Set(["all"]))} style={{accentColor:C.cyan}}/>
                  <span style={{fontSize:10,color:selSpaces.has("all")?C.text:C.muted}}>All Spaces</span>
                </label>
                {activeSpaces.map(p=>(
                  <label key={p.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer"}}>
                    <input type="checkbox" checked={selSpaces.has(p.id)} onChange={()=>toggleSet(setSelSpaces,p.id)} style={{accentColor:p.color}}/>
                    <span style={{fontSize:10,color:selSpaces.has(p.id)?C.text:C.muted}}>{p.name}</span>
                  </label>
                ))}
              </div>
              {/* Portfolio filter */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:8,color:C.purple,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.15em",marginBottom:6}}>PORTFOLIO</div>
                <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer"}}>
                  <input type="checkbox" checked={selPortfolios.has("all")} onChange={()=>setSelPortfolios(new Set(["all"]))} style={{accentColor:C.cyan}}/>
                  <span style={{fontSize:10,color:selPortfolios.has("all")?C.text:C.muted}}>All Portfolios</span>
                </label>
                {allPortfolios.map(s=>(
                  <label key={s.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer"}}>
                    <input type="checkbox" checked={selPortfolios.has(s.id)} onChange={()=>toggleSet(setSelPortfolios,s.id)} style={{accentColor:s.spaceColor}}/>
                    <span style={{fontSize:10,color:selPortfolios.has(s.id)?C.text:C.muted}}>{s.spaceName} / {s.name}</span>
                  </label>
                ))}
              </div>
              {/* Project filter */}
              <div style={{marginBottom:8}}>
                <div style={{fontSize:8,color:C.teal,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.15em",marginBottom:6}}>PROJECT</div>
                <label style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer"}}>
                  <input type="checkbox" checked={selProjs.has("all")} onChange={()=>setSelProjs(new Set(["all"]))} style={{accentColor:C.cyan}}/>
                  <span style={{fontSize:10,color:selProjs.has("all")?C.text:C.muted}}>All Projects</span>
                </label>
                {allProjects.map(pr=>(
                  <label key={pr.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer"}}>
                    <input type="checkbox" checked={selProjs.has(pr.id)} onChange={()=>toggleSet(setSelProjs,pr.id)} style={{accentColor:pr.color||C.cyan}}/>
                    <span style={{fontSize:10,color:selProjs.has(pr.id)?C.text:C.muted}}>{pr.portfolioName} / {pr.name}</span>
                  </label>
                ))}
              </div>
              <button onClick={()=>{setSelSpaces(new Set(["all"]));setSelPortfolios(new Set(["all"]));setSelProjs(new Set(["all"]));}}
                style={{...St.ghost,fontSize:9,padding:"4px 10px",color:C.dim,width:"100%",marginTop:4}}>Reset Filters</button>
            </div>
          )}
        </div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:5,alignItems:"center",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"4px 10px"}}>
          <span style={St.lbl}>FROM</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            style={{...St.inp,width:"auto",padding:"2px 5px",fontSize:10,border:"none",background:"transparent"}}/>
          <span style={{fontSize:9,color:C.dim}}>&gt;</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            style={{...St.inp,width:"auto",padding:"2px 5px",fontSize:10,border:"none",background:"transparent"}}/>
          <button onClick={applyRange} style={{...St.btn,padding:"3px 9px",fontSize:9}}>Set</button>
        </div>
      </div>

      {/* Controls row 2: Year + Q + Zoom + Nav */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,background:C.card2,border:`1px solid ${C.border}`,borderRadius:7,padding:"3px 8px"}}>
          <button onClick={()=>setGanttYear(y=>y-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"0 2px"}}>&lt;</button>
          <span style={{fontSize:11,fontWeight:700,color:C.text,fontFamily:"'JetBrains Mono',monospace",minWidth:36,textAlign:"center"}}>{ganttYear}</span>
          <button onClick={()=>setGanttYear(y=>y+1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,padding:"0 2px"}}>&gt;</button>
        </div>
        <div style={{display:"flex",gap:3}}>
          {QS.map((q,qi)=>{
            const isActive=activeQ()===qi;
            return <button key={q.l} onClick={()=>jumpToQ(q.m)}
              style={{...St.ghost,padding:"4px 11px",fontSize:10,fontWeight:800,
                borderColor:isActive?C.cyan:C.border,color:isActive?C.cyan:C.muted,
                background:isActive?`${C.cyan}15`:"transparent"}}>{q.l}</button>;
          })}
          <button onClick={()=>{const s=new Date(ganttYear,0,1);setRangeStart(s);setTotalDays(365);setDateFrom(fmtD(s));setDateTo(`${ganttYear}-12-31`);}}
            style={{...St.ghost,padding:"4px 9px",fontSize:10,marginLeft:3,
              borderColor:totalDays>=364&&rangeStart.getFullYear()===ganttYear?C.purple:C.border,
              color:totalDays>=364&&rangeStart.getFullYear()===ganttYear?C.purple:C.muted}}>Full Year</button>
        </div>
        <div style={{width:1,height:20,background:C.border}}/>
        <div style={{display:"flex",gap:3}}>
          {ZOOMS.map(z=><button key={z.l} onClick={()=>setTotalDays(z.d)}
            style={{...St.ghost,padding:"4px 9px",fontSize:9,
              borderColor:Math.abs(z.d-totalDays)<5?C.teal:C.border,
              color:Math.abs(z.d-totalDays)<5?C.teal:C.muted}}>{z.l}</button>)}
        </div>
        <button onClick={()=>setRangeStart(s=>addD(s,-Math.round(totalDays*0.5)))} style={{...St.ghost,padding:"4px 9px"}}>&lt;</button>
        <button onClick={resetView} style={{...St.ghost,padding:"4px 9px",color:C.cyan,borderColor:`${C.cyan}55`}}>Today</button>
        <button onClick={()=>setRangeStart(s=>addD(s,Math.round(totalDays*0.5)))} style={{...St.ghost,padding:"4px 9px"}}>&gt;</button>
        <span style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:C.muted,marginLeft:4}}>
          {rangeStart.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} &gt; {endDate.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} ({totalDays}d)
        </span>
      </div>

      {/* Chart */}
      <div ref={ganttRef}
        className="gantt-canvas"
        style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",userSelect:"none"}}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div style={{overflowX:"hidden"}}>
          <div style={{minWidth:LABEL+CW}}>
            <div style={{display:"flex",background:C.panel,borderBottom:`1px solid ${C.border}`}}>
              <div style={{width:LABEL,flexShrink:0,padding:"7px 12px",fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:C.dim}}>PORTFOLIO / PROJECT / TASK</div>
              <div style={{width:CW,flexShrink:0,height:26,overflow:"hidden"}}>
                <svg width={CW} height={26}>
                  {ticks.map((t,i)=>(
                    <g key={i}>
                      <line x1={t.x} y1={0} x2={t.x} y2={26} stroke={C.border} strokeWidth={0.5}/>
                      <text x={t.x+2} y={17} fill={C.dim} fontSize={7} fontFamily="'JetBrains Mono',monospace">{t.label}</text>
                    </g>
                  ))}
                  {todayX>0&&todayX<CW&&<line x1={todayX} y1={0} x2={todayX} y2={26} stroke={C.cyan} strokeWidth={1.5} strokeDasharray="3,3"/>}
                </svg>
              </div>
            </div>

            {visible.map((pr,pi)=>{
              const exp  = !!expanded[pr.id];
              const prog = projProg(pr);
              const px   = toX(pr.start); const pw=Math.max(4,toX(pr.end)-toX(pr.start));
              const blId = blSel[pr.id];  const bl=blId?pr.baselines?.find(b=>b.id===blId):null;
              return (
                <div key={pr.id}>
                  <div style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${C.border}`,
                    background:pi%2===0?"#0a1018":"#0c1220",height:ROW,cursor:"pointer"}}
                    onClick={()=>setExpanded(e=>({...e,[pr.id]:!e[pr.id]}))}>
                    <div style={{width:LABEL,flexShrink:0,padding:"0 12px",display:"flex",alignItems:"center",gap:5,overflow:"hidden"}}>
                      <span style={{color:pr.spaceColor,fontSize:10,flexShrink:0}}>{exp?"v":">"}</span>
                      <span style={{width:5,height:5,borderRadius:"50%",background:pr.spaceColor,display:"inline-block",flexShrink:0}}/>
                      <div style={{overflow:"hidden",minWidth:0,flex:1}}>
                        <div style={{fontSize:7,color:C.dim,fontFamily:"'JetBrains Mono',monospace",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pr.portfolioName}</div>
                        <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pr.name}</div>
                      </div>
                      {pr.baselines?.length>0&&(
                        <select value={blId||""} onClick={e=>e.stopPropagation()}
                          onChange={e=>setBlSel(b=>({...b,[pr.id]:e.target.value||null}))}
                          style={{...St.inp,width:50,padding:"1px 2px",fontSize:7,color:C.yellow,flexShrink:0}}>
                          <option value="">BL</option>
                          {pr.baselines.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
                        </select>
                      )}
                    </div>
                    <div style={{width:CW,flexShrink:0,height:ROW,overflow:"hidden"}}>
                      <svg width={CW} height={ROW}>
                        {ticks.map((t,i)=><line key={i} x1={t.x} y1={0} x2={t.x} y2={ROW} stroke={C.border} strokeWidth={0.3}/>)}
                        {todayX>0&&todayX<CW&&<line x1={todayX} y1={0} x2={todayX} y2={ROW} stroke={C.cyan} strokeWidth={0.8} strokeDasharray="3,3" opacity={0.4}/>}
                        <rect x={px} y={11} width={pw} height={12} rx={2} fill={`${pr.spaceColor}33`} stroke={`${pr.spaceColor}66`} strokeWidth={1}/>
                        <rect x={px} y={13} width={Math.max(0,pw*prog/100)} height={8} rx={2} fill={pr.spaceColor} opacity={0.85}/>
                        {bl&&bl.snapshot.map(snap=>{
                          const bx=toX(snap.start),bw=Math.max(2,toX(snap.end)-toX(snap.start));
                          return <rect key={snap.id} x={bx} y={9} width={bw} height={3} rx={1} fill={C.yellow} opacity={0.55}/>;
                        })}
                      </svg>
                    </div>
                  </div>
                  {exp&&(pr.tasks||[]).filter(t=>!t.archived).map(task=>{
                    const tx=toX(task.start); const tw=Math.max(3,toX(task.end)-toX(task.start));
                    const tp=taskProg(task); const dL=diffD(todayS,task.end);
                    const overdue=task.end<todayS&&task.status!=="Done";
                    const blt=bl?.snapshot.find(s=>s.id===task.id);
                    return (
                      <div key={task.id} style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${C.border}22`,background:"#080e18",height:ROW-4}}>
                        <div style={{width:LABEL,flexShrink:0,padding:"0 12px 0 20px",display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}>
                          {task.flagged&&<span style={{color:C.yellow,fontSize:9,flexShrink:0}}>P</span>}
                          {overdue&&<span style={{color:C.red,fontSize:8,fontWeight:700,flexShrink:0}}>!</span>}
                          <span style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:overdue?C.red:dL<=7?C.orange:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.name}</span>
                        </div>
                        <div style={{width:CW,flexShrink:0,height:ROW-4,overflow:"hidden"}}>
                          <svg width={CW} height={ROW-4}>
                            {ticks.map((t,i)=><line key={i} x1={t.x} y1={0} x2={t.x} y2={ROW} stroke={C.border} strokeWidth={0.3}/>)}
                            <rect x={tx} y={8} width={tw} height={8} rx={2} fill={`${pr.spaceColor}22`} stroke={`${pr.spaceColor}44`} strokeWidth={1}/>
                            <rect x={tx} y={8} width={tw*tp/100} height={8} rx={2} fill={overdue?C.red:pr.spaceColor} opacity={0.7}/>
                            {blt&&(()=>{const blx=toX(blt.start),blw=Math.max(2,toX(blt.end)-toX(blt.start)); return <rect x={blx} y={6} width={blw} height={2} rx={1} fill={C.yellow} opacity={0.65}/>;})()}
                          </svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{padding:"6px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:14,alignItems:"center"}}>
          {[["Planned",`${C.cyan}66`],["Progress",C.cyan],["Baseline",C.yellow],["Today",C.cyan],["Overdue",C.red]].map(([l,c])=>(
            <span key={l} style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:c}}>{l}</span>
          ))}
          <span style={{marginLeft:"auto",fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:C.dim}}>
            scroll=zoom  drag=pan  []=jump half-range
          </span>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================
   CAPACITY TAB
========================================================== */
function CapacityTab({spaces}){
  const [viewMode,setViewMode]    = useState("week"); // "week" | "range" | "month"
  const [rangeW,setRangeW]        = useState(1);
  const [weekOff,setWeekOff]      = useState(0);
  const [monthOff,setMonthOff]    = useState(0);
  const [dateFrom,setDateFrom]    = useState(fmtD(TODAY));
  const [dateTo,setDateTo]        = useState(fmtD(addD(TODAY,13)));
  const [filterSpaceId,setFilterSpaceId] = useState("all");
  const [filterPortfolioId,setFilterPortfolioId]   = useState("all");
  const [dayDetail,setDayDetail]     = useState(null);
  const CAP=8;

  const activeSpaces  = useMemo(()=>spaces.filter(p=>!p.archived),[spaces]);
  const allPortfolios    = useMemo(()=>
    activeSpaces.flatMap(p=>p.portfolios.filter(s=>!s.archived).map(s=>({...s,spaceColor:p.color,spaceName:p.name,spaceId:p.id})))
  ,[activeSpaces]);
  const filteredPortfolios = useMemo(()=>
    filterSpaceId==="all" ? allPortfolios : allPortfolios.filter(s=>s.spaceId===filterSpaceId)
  ,[filterSpaceId,allPortfolios]);

  // Compute display dates based on viewMode
  const displayDates = useMemo(()=>{
    const arr=[];
    if(viewMode==="week"){
      const base=new Date(TODAY); const dow=base.getDay();
      base.setDate(base.getDate()-(dow===0?6:dow-1));
      for(let w=0;w<rangeW;w++) for(let d=0;d<7;d++){
        const dt=new Date(base); dt.setDate(base.getDate()+(weekOff+w)*7+d); arr.push(dt);
      }
    } else if(viewMode==="range"){
      const s=new Date(dateFrom+"T12:00:00"), e=new Date(dateTo+"T12:00:00");
      if(!isNaN(s)&&!isNaN(e)){
        let cur=new Date(s);
        while(cur<=e&&arr.length<90){arr.push(new Date(cur));cur.setDate(cur.getDate()+1);}
      }
    } else { // month
      const base=new Date(TODAY.getFullYear(),TODAY.getMonth()+monthOff,1);
      const end=new Date(base.getFullYear(),base.getMonth()+1,0);
      let cur=new Date(base);
      while(cur<=end){arr.push(new Date(cur));cur.setDate(cur.getDate()+1);}
    }
    return arr;
  },[viewMode,rangeW,weekOff,monthOff,dateFrom,dateTo]);

  const weekDates = displayDates; // legacy alias

  const capRows = useMemo(()=>{
    const rows=[];
    filteredPortfolios.forEach(sp=>{
        if(filterPortfolioId!=="all"&&sp.id!==filterPortfolioId) return;
        sp.projects.filter(pr=>!pr.archived).forEach(pr=>{
          const activeTasks=(pr.tasks||[]).filter(t=>!t.archived);
          if(!activeTasks.length) return;
          const projRow={id:pr.id,label:pr.name,sublabel:`${sp.name}`,color:pr.color,portfolioId:sp.id,portfolioName:sp.name,isProject:true,tasks:[]};
          activeTasks.forEach(t=>{
            const th=taskAssigned(t); const ta=taskActual(t);
            const dailyH=th/Math.max(1,diffD(t.start,t.end));
            const taskRow={id:t.id,label:t.name,color:pr.color,hpd:dailyH,assignedHrs:th,actualHrs:ta,isTask:true,subtasks:[],start:t.start,end:t.end,progress:taskProg(t),status:t.status};
            const activeSubs=(t.subtasks||[]).filter(s=>!s.archived);
            if(activeSubs.length){
              activeSubs.forEach(st=>{
                const sh=stAssigned(st); const sa=stActual(st);
                const dailySh=sh/Math.max(1,diffD(st.start,st.end));
                taskRow.subtasks.push({id:st.id,label:st.name,color:pr.color,hpd:dailySh,assignedHrs:sh,actualHrs:sa,start:st.start,end:st.end,progress:st.progress,status:st.status});
              });
            }
            projRow.tasks.push(taskRow);
          });
          projRow.start=pr.start; projRow.end=pr.end;
          rows.push(projRow);
        });
    });
    return rows;
  },[filteredPortfolios,filterPortfolioId]);

  const getDayLoad=(item,d)=>{
    const ds=fmtD(d);
    if(ds<item.start||ds>item.end) return 0;
    return item.hpd||0;
  };
  const getDayTotal=d=>{
    let tot=0;
    capRows.forEach(pr=>pr.tasks.forEach(t=>{
      if(t.subtasks.length) t.subtasks.forEach(st=>{tot+=getDayLoad(st,d);});
      else tot+=getDayLoad(t,d);
    }));
    return tot;
  };

  const getDayItems = ds => {
    const items=[];
    capRows.forEach(pr=>pr.tasks.forEach(t=>{
      if(t.subtasks.length){
        t.subtasks.forEach(st=>{
          if(ds>=st.start&&ds<=st.end){
            items.push({projLabel:pr.label,taskLabel:t.label,subLabel:st.label,color:pr.color,assigned:stAssigned(st),actual:stActual(st),progress:st.progress,status:st.status});
          }
        });
      } else if(ds>=t.start&&ds<=t.end){
        items.push({projLabel:pr.label,taskLabel:t.label,subLabel:null,color:pr.color,assigned:taskAssigned(t),actual:taskActual(t),progress:t.progress,status:t.status});
      }
    }));
    return items;
  };

  // Month label for monthly view
  const monthLabel = useMemo(()=>{
    const d=new Date(TODAY.getFullYear(),TODAY.getMonth()+monthOff,1);
    return d.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  },[monthOff]);

  const [expandedProj,setExpandedProj] = useState({});

  return (
    <div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:19,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>Capacity Planner</div>
        <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
          Click any day to see contributing tasks . Assigned (blue) vs Actual (green) hours
        </div>
      </div>

      {/* Day Detail Modal */}
      {dayDetail&&(()=>{
        const items=getDayItems(dayDetail);
        const totalAsgn=items.reduce((s,i)=>s+i.assigned,0);
        const totalActl=items.reduce((s,i)=>s+i.actual,0);
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}
            onClick={()=>setDayDetail(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.card,border:`1px solid ${C.cyan}44`,borderRadius:14,padding:22,minWidth:380,maxWidth:520,maxHeight:"80vh",overflow:"auto",boxShadow:"0 8px 48px rgba(0,0,0,0.8)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>{new Date(dayDetail+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
                  <div style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:3}}>{items.length} task{items.length!==1?"s":""} active . {totalAsgn.toFixed(1)}h asgn . {totalActl.toFixed(1)}h actual</div>
                </div>
                <button onClick={()=>setDayDetail(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>x</button>
              </div>
              {!items.length&&<div style={{color:C.muted,fontSize:11,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",padding:"20px 0"}}>No tasks scheduled this day.</div>}
              {items.map((item,i)=>(
                <div key={i} style={{background:C.card2,border:`1px solid ${item.color}33`,borderRadius:8,padding:"9px 12px",marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                    <div>
                      <div style={{fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace"}}>{item.projLabel}{item.subLabel?` > ${item.taskLabel}`:""}</div>
                      <div style={{fontSize:11,fontWeight:700,color:C.text,fontFamily:"'JetBrains Mono',monospace"}}>{item.subLabel||item.taskLabel}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:10,color:item.color,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{item.assigned.toFixed(1)}h</div>
                      <div style={{fontSize:9,color:C.green,fontFamily:"'JetBrains Mono',monospace"}}>{item.actual.toFixed(1)}h actual</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <div style={{flex:1}}><Bar v={item.progress} c={item.color} h={3}/></div>
                    <span style={{fontSize:8,color:STATUS_C[item.status]||C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{item.status}</span>
                    <span style={{fontSize:9,color:item.color,fontFamily:"'JetBrains Mono',monospace"}}>{item.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
        {/* View mode */}
        <div style={{display:"flex",gap:2,background:C.card2,border:`1px solid ${C.border}`,borderRadius:7,padding:3}}>
          {[["week","Week"],["range","Range"],["month","Month"]].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)}
              style={{...St.ghost,padding:"4px 10px",fontSize:9,border:"none",
                background:viewMode===v?C.cyan+"22":"transparent",
                color:viewMode===v?C.cyan:C.muted,borderRadius:5}}>
              {l}
            </button>
          ))}
        </div>

        {/* Space / Portfolio filters */}
        <select value={filterSpaceId} onChange={e=>{setFilterSpaceId(e.target.value);setFilterPortfolioId("all");}}
          style={{...St.inp,width:"auto",padding:"5px 9px",fontSize:10}}>
          <option value="all">All Spaces</option>
          {activeSpaces.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterPortfolioId} onChange={e=>setFilterPortfolioId(e.target.value)}
          style={{...St.inp,width:"auto",padding:"5px 9px",fontSize:10}}>
          <option value="all">All Portfolios</option>
          {filteredPortfolios.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Week mode controls */}
        {viewMode==="week"&&<>
          <div style={{display:"flex",gap:3}}>
            {[1,2,4].map(w=><button key={w} onClick={()=>setRangeW(w)}
              style={{...St.btn,background:rangeW===w?C.cyan:"#1a2236",color:rangeW===w?"#07090f":C.muted,padding:"5px 10px",fontSize:10}}>{w}W</button>)}
          </div>
          <button onClick={()=>setWeekOff(o=>o-1)} style={{...St.ghost,padding:"5px 9px"}}>&lt;</button>
          <button onClick={()=>setWeekOff(0)} style={{...St.ghost,padding:"5px 9px",color:C.cyan}}>This Week</button>
          <button onClick={()=>setWeekOff(o=>o+1)} style={{...St.ghost,padding:"5px 9px"}}>&gt;</button>
          <span style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:C.muted}}>
            {weekDates[0]?.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – {weekDates[weekDates.length-1]?.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
          </span>
        </>}

        {/* Date range mode */}
        {viewMode==="range"&&<>
          <div style={{display:"flex",alignItems:"center",gap:5,background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"4px 10px"}}>
            <span style={St.lbl}>FROM</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{...St.inp,width:"auto",padding:"2px 5px",fontSize:10,border:"none",background:"transparent"}}/>
            <span style={{fontSize:9,color:C.dim}}>–</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{...St.inp,width:"auto",padding:"2px 5px",fontSize:10,border:"none",background:"transparent"}}/>
          </div>
          <span style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{displayDates.length}d</span>
        </>}

        {/* Monthly mode */}
        {viewMode==="month"&&<>
          <button onClick={()=>setMonthOff(o=>o-1)} style={{...St.ghost,padding:"5px 9px"}}>&lt;</button>
          <span style={{fontSize:11,fontWeight:700,color:C.text,fontFamily:"'JetBrains Mono',monospace",minWidth:140,textAlign:"center"}}>{monthLabel}</span>
          <button onClick={()=>setMonthOff(0)} style={{...St.ghost,padding:"5px 9px",color:C.cyan}}>This Month</button>
          <button onClick={()=>setMonthOff(o=>o+1)} style={{...St.ghost,padding:"5px 9px"}}>&gt;</button>
        </>}
      </div>

      {/* Period summary cards */}
      {(()=>{
        const numCols = viewMode==="week" ? rangeW : viewMode==="month" ? 1 : 1;
        const chunkSize = viewMode==="week" ? 7 : displayDates.length;
        return (
          <div style={{display:"grid",gridTemplateColumns:`repeat(${numCols},1fr)`,gap:12,marginBottom:16}}>
            {Array.from({length:numCols},(_,wi)=>{
              const wD=displayDates.slice(wi*chunkSize,(wi+1)*chunkSize);
              const tot=wD.reduce((s,d)=>s+getDayTotal(d),0);
              const pct=Math.round(tot/(CAP*Math.max(1,wD.length))*100);
              const label=viewMode==="week"?`Week ${wi+1+weekOff}`:viewMode==="month"?monthLabel:"Custom Range";
              return (
                <div key={wi} style={{background:C.card,border:`1px solid ${C.cyan}33`,borderRadius:10,padding:"11px 14px"}}>
                  <div style={St.lbl}>{label}</div>
                  <div style={{display:"flex",justifyContent:"space-between",margin:"5px 0"}}>
                    <span style={{fontSize:20,fontWeight:800,color:C.cyan,fontFamily:"'JetBrains Mono',monospace"}}>{tot.toFixed(1)}h</span>
                    <span style={{fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:pct>90?C.red:pct>70?C.orange:C.green}}>{pct}%</span>
                  </div>
                  <Bar v={pct} c={pct>90?C.red:pct>70?C.orange:C.cyan} h={4}/>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Main grid */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"auto"}}>
        <div style={{minWidth:Math.max(displayDates.length*52+220,300)}}>
          <div style={{display:"grid",gridTemplateColumns:`220px repeat(${displayDates.length},minmax(48px,1fr))`,background:C.panel,borderBottom:`1px solid ${C.border}`}}>
            <div style={{padding:"7px 12px",fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:C.dim}}>PROJECT / TASK</div>
            {weekDates.map((d,i)=>{
              const isT=fmtD(d)===todayS;
              return (
                <div key={i} style={{padding:"4px 2px",textAlign:"center",borderLeft:`1px solid ${C.border}`,background:isT?`${C.cyan}11`:"transparent",cursor:"pointer"}}
                  onClick={()=>setDayDetail(fmtD(d))}>
                  <div style={{fontSize:7,fontFamily:"'JetBrains Mono',monospace",color:isT?C.cyan:C.dim}}>{WDAYS[d.getDay()===0?6:d.getDay()-1]}</div>
                  <div style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:isT?C.cyan:C.muted}}>{d.getMonth()+1}/{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {capRows.map(pr=>(
            <React.Fragment key={pr.id}>
              <div style={{display:"grid",gridTemplateColumns:`220px repeat(${displayDates.length},minmax(48px,1fr))`,borderBottom:`1px solid ${C.border}22`,background:C.card2,cursor:"pointer"}}
                onClick={()=>setExpandedProj(e=>({...e,[pr.id]:!e[pr.id]}))}>
                <div style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{color:pr.color,fontSize:10,flexShrink:0}}>{expandedProj[pr.id]?"v":">"}</span>
                  <span style={{width:6,height:6,borderRadius:"50%",background:pr.color,flexShrink:0}}/>
                  <div style={{overflow:"hidden",minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.text,fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pr.label}</div>
                    <div style={{fontSize:8,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{pr.sublabel} . {pr.tasks.length} tasks</div>
                  </div>
                </div>
                {weekDates.map((d,i)=>{
                  let tot=0;
                  pr.tasks.forEach(t=>{if(t.subtasks.length)t.subtasks.forEach(st=>{tot+=getDayLoad(st,d);});else tot+=getDayLoad(t,d);});
                  return (
                    <div key={i} onClick={e=>{e.stopPropagation();setDayDetail(fmtD(d));}} style={{padding:"4px 2px",borderLeft:`1px solid ${C.border}11`,display:"flex",flexDirection:"column",alignItems:"center",gap:1,cursor:"pointer"}}>
                      {tot>0&&<>
                        <div style={{width:"80%",height:22,background:`${pr.color}22`,borderRadius:3,overflow:"hidden",position:"relative"}}>
                          <div style={{position:"absolute",bottom:0,left:0,right:0,background:pr.color,opacity:0.75,height:`${Math.min(100,tot/CAP*100)}%`}}/>
                        </div>
                        <span style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:pr.color}}>{tot.toFixed(1)}h</span>
                      </>}
                      {!tot&&<span style={{fontSize:8,color:C.dim}}>-</span>}
                    </div>
                  );
                })}
              </div>

              {expandedProj[pr.id]&&pr.tasks.map(t=>(
                <React.Fragment key={t.id}>
                  <div style={{display:"grid",gridTemplateColumns:`220px repeat(${displayDates.length},minmax(48px,1fr))`,borderBottom:`1px solid ${C.border}11`,background:"#090d16"}}>
                    <div style={{padding:"5px 10px 5px 24px",display:"flex",alignItems:"center",gap:4}}>
                      <span style={{color:C.muted,fontSize:8,flexShrink:0}}>–</span>
                      <div style={{overflow:"hidden",minWidth:0}}>
                        <div style={{fontSize:9,fontWeight:700,color:C.muted,fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.label}</div>
                        <div style={{display:"flex",gap:4,marginTop:1}}>
                          <span style={{fontSize:7,fontFamily:"'JetBrains Mono',monospace",color:C.dim}}>{t.assignedHrs?.toFixed(1)||"0"}h asgn</span>
                          <span style={{fontSize:7,fontFamily:"'JetBrains Mono',monospace",color:C.green}}>{t.actualHrs?.toFixed(1)||"0"}h actual</span>
                        </div>
                      </div>
                    </div>
                    {weekDates.map((d,i)=>{
                      const load=t.subtasks.length?t.subtasks.reduce((s,st)=>s+getDayLoad(st,d),0):getDayLoad(t,d);
                      return (
                        <div key={i} onClick={()=>setDayDetail(fmtD(d))} style={{padding:"4px 2px",borderLeft:`1px solid ${C.border}11`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                          {load>0?<span style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:pr.color,fontWeight:700}}>{load.toFixed(1)}h</span>:<span style={{fontSize:8,color:C.dim}}>-</span>}
                        </div>
                      );
                    })}
                  </div>
                  {t.subtasks.map(st=>(
                    <div key={st.id} style={{display:"grid",gridTemplateColumns:`220px repeat(${displayDates.length},minmax(48px,1fr))`,borderBottom:`1px solid ${C.border}08`,background:"#070b13"}}>
                      <div style={{padding:"4px 10px 4px 38px",display:"flex",alignItems:"center",gap:4}}>
                        <span style={{color:C.dim,fontSize:7,flexShrink:0}}>·</span>
                        <div style={{overflow:"hidden",minWidth:0}}>
                          <div style={{fontSize:8,color:C.dim,fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.label}</div>
                          <div style={{display:"flex",gap:3,marginTop:1}}>
                            <span style={{fontSize:7,fontFamily:"'JetBrains Mono',monospace",color:C.muted}}>{st.assignedHrs?.toFixed(1)||"0"}h asgn</span>
                            <span style={{fontSize:7,fontFamily:"'JetBrains Mono',monospace",color:C.green}}>{st.actualHrs?.toFixed(1)||"0"}h actual</span>
                          </div>
                        </div>
                      </div>
                      {weekDates.map((d,i)=>{
                        const load=getDayLoad(st,d);
                        return (
                          <div key={i} onClick={()=>setDayDetail(fmtD(d))} style={{padding:"3px 2px",borderLeft:`1px solid ${C.border}08`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                            {load>0?<span style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:`${pr.color}aa`}}>{load.toFixed(1)}</span>:<span style={{fontSize:7,color:C.dim}}>.</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </React.Fragment>
          ))}

          {/* Totals row */}
          <div style={{display:"grid",gridTemplateColumns:`220px repeat(${displayDates.length},minmax(48px,1fr))`,background:C.panel,borderTop:`1px solid ${C.border}`}}>
            <div style={{padding:"7px 12px",fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:C.muted,fontWeight:700}}>TOTAL / REMAINING</div>
            {weekDates.map((d,i)=>{
              const tot=getDayTotal(d); const over=tot>CAP;
              return (
                <div key={i} onClick={()=>setDayDetail(fmtD(d))} style={{padding:"4px 3px",borderLeft:`1px solid ${C.border}`,textAlign:"center",cursor:"pointer"}}>
                  <div style={{fontSize:12,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:over?C.red:tot>6?C.orange:C.green}}>{tot.toFixed(1)}</div>
                  <div style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:over?C.red:C.dim}}>{over?`+${(tot-CAP).toFixed(1)}!`:`${(CAP-tot).toFixed(1)}r`}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================
   CALENDAR TAB
========================================================== */
function CalendarTab({spaces}){
  const [month,setMonth]       = useState(new Date(2026,1,1));
  const [filterPortfolioId,setFilterPortfolioId] = useState("all");
  const [events,setEvents]     = useState([
    {id:"e1",date:"2026-02-16",title:"Python: OOP",type:"remote"},
    {id:"e2",date:"2026-02-17",title:"Jiu Jitsu",type:"bjj"},
    {id:"e3",date:"2026-02-18",title:"Japanese Class",type:"japanese"},
    {id:"e4",date:"2026-02-19",title:"Strength",type:"strength"},
    {id:"e5",date:"2026-02-21",title:"Deep Build Block",type:"remote"},
  ]);
  const [newEv,setNewEv]       = useState({date:todayS,title:"",type:"remote"});
  const [showAdd,setShowAdd]   = useState(false);
  const [selectedEv,setSelectedEv] = useState(null);
  const [selectedDay,setSelectedDay] = useState(null); // date string for day popover

  const typeC={remote:C.cyan,japanese:C.purple,bjj:C.orange,strength:C.green,cardio:C.pink,personal:C.teal,project:C.blue,task:C.yellow};

  const allPortfolios = useMemo(()=>
    spaces.flatMap(p=>p.portfolios.filter(s=>!s.archived).map(s=>({...s,spaceName:p.name,spaceColor:p.color})))
  ,[spaces]);

  /* Derive project/task items from portfolio data */
  const portfolioEvents = useMemo(()=>{
    const ev=[];
    spaces.forEach(po=>po.portfolios.filter(s=>!s.archived).forEach(sp=>{
      if(filterPortfolioId!=="all"&&sp.id!==filterPortfolioId) return;
      sp.projects.filter(p=>!p.archived).forEach(pr=>{
        // Project start/end markers
        ev.push({id:`pe_${pr.id}_s`,date:pr.start,title:`? ${pr.name}`,type:"project",projColor:pr.color,portfolioName:sp.name,isPortfolio:true});
        ev.push({id:`pe_${pr.id}_e`,date:pr.end,title:`? ${pr.name}`,type:"project",projColor:pr.color,portfolioName:sp.name,isPortfolio:true});
        // Tasks due
        (pr.tasks||[]).filter(t=>!t.archived).forEach(t=>{
          ev.push({id:`te_${t.id}`,date:t.end,title:t.name,type:"task",projColor:pr.color,portfolioName:sp.name,projName:pr.name,isPortfolio:true});
        });
      });
    }));
    return ev;
  },[spaces,filterPortfolioId]);

  const dIM = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const fDow = new Date(month.getFullYear(),month.getMonth(),1).getDay();
  const adj  = fDow===0?6:fDow-1;
  const cells = Math.ceil((adj+dIM)/7)*7;

  const addEvent = () => {
    if(!newEv.title)return;
    setEvents(p=>[...p,{...newEv,id:uid()}]);
    setNewEv({date:todayS,title:"",type:"remote"});
    setShowAdd(false);
  };

  useEffect(()=>{
    if(!selectedEv&&!selectedDay) return;
    const h=e=>{if(e.key==="Escape"){setSelectedEv(null);setSelectedDay(null);}};
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[selectedEv,selectedDay]);

  return (
    <div onClick={()=>{setSelectedEv(null);setSelectedDay(null);}}>
      {/* Event mini-modal */}
      {selectedEv&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setSelectedEv(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"#0d1525",border:`1px solid ${selectedEv.projColor||typeC[selectedEv.type]||C.border}`,borderRadius:14,padding:24,minWidth:280,maxWidth:360,boxShadow:"0 8px 48px rgba(0,0,0,0.8)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <div style={{fontSize:7,fontFamily:"'JetBrains Mono',monospace",color:selectedEv.projColor||typeC[selectedEv.type]||C.cyan,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:5}}>
                  {selectedEv.type} . {selectedEv.date}
                  {selectedEv.portfolioName&&<span style={{color:C.dim}}> . {selectedEv.portfolioName}</span>}
                </div>
                <div style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif",lineHeight:1.2}}>{selectedEv.title}</div>
                {selectedEv.projName&&<div style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:4}}>Project: {selectedEv.projName}</div>}
              </div>
              <button onClick={()=>setSelectedEv(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 2px",marginLeft:12,flexShrink:0}}>x</button>
            </div>
            {!selectedEv.isPortfolio&&(
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:16}}>
                <div style={{fontSize:8,color:C.cyan,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.15em",marginBottom:2}}>ADD TO MY CALENDAR</div>
                <button onClick={()=>{exportGCal(selectedEv);setSelectedEv(null);}}
                  style={{...St.ghost,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-start",padding:"8px 12px",fontSize:11,color:C.text,borderColor:C.border}}>
                  <span style={{fontSize:13,color:C.cyan}}>+</span> Google Calendar
                </button>
                <button onClick={()=>{exportOutlookWeb(selectedEv);setSelectedEv(null);}}
                  style={{...St.ghost,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-start",padding:"8px 12px",fontSize:11,color:C.text,borderColor:C.border}}>
                  <span style={{fontSize:13,color:C.purple}}>+</span> Outlook Web
                </button>
                <button onClick={()=>{downloadICS([selectedEv],`${selectedEv.title.replace(/\s+/g,"_")}.ics`);setSelectedEv(null);}}
                  style={{...St.ghost,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-start",padding:"8px 12px",fontSize:11,color:C.text,borderColor:C.border}}>
                  <span style={{fontSize:13,color:C.teal}}>v</span> Download .ics
                </button>
                <div style={{fontSize:8,color:C.yellow,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.15em",marginTop:4,marginBottom:2}}>SHARE WITH OTHERS</div>
                <button onClick={()=>{shareViaEmail([selectedEv],selectedEv.title);setSelectedEv(null);}}
                  style={{...St.ghost,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-start",padding:"8px 12px",fontSize:11,color:C.text,borderColor:C.border}}>
                  <span style={{fontSize:13,color:C.yellow}}>@</span> Email invite (.ics)
                </button>
                <button onClick={()=>{
                    const txt = generateICSText([selectedEv]);
                    navigator.clipboard.writeText(txt).then(()=>alert("ICS text copied - paste into a .ics file and send to others"));
                  }}
                  style={{...St.ghost,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-start",padding:"8px 12px",fontSize:11,color:C.text,borderColor:C.border}}>
                  <span style={{fontSize:13,color:C.orange}}>c</span> Copy .ics text
                </button>
              </div>
            )}
            {!selectedEv.isPortfolio&&<div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>{setEvents(p=>p.filter(x=>x.id!==selectedEv.id));setSelectedEv(null);}} style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:6,cursor:"pointer",color:C.red,padding:"4px 10px",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>Del Delete</button>
            </div>}
          </div>
        </div>
      )}

      {/* Day detail popover */}
      {selectedDay&&(()=>{
        const ds=selectedDay;
        const myEvs=events.filter(e=>e.date===ds);
        const portEvs=portfolioEvents.filter(e=>e.date===ds);
        const dayEvs=[...myEvs,...portEvs];
        const exportable=dayEvs.filter(e=>!e.isPortfolio);
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}
            onClick={()=>setSelectedDay(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#0d1525",border:`1px solid ${C.border}`,borderRadius:14,padding:22,minWidth:340,maxWidth:480,maxHeight:"80vh",overflow:"auto",boxShadow:"0 8px 48px rgba(0,0,0,0.8)"}}>
              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>
                    {new Date(ds+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                  </div>
                  <div style={{fontSize:9,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
                    {dayEvs.length} event{dayEvs.length!==1?"s":""} scheduled
                  </div>
                </div>
                <button onClick={()=>setSelectedDay(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>x</button>
              </div>

              {/* Export ALL day events */}
              {exportable.length>0&&(
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:14}}>
                  <div style={{fontSize:8,color:C.cyan,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.15em",marginBottom:8}}>EXPORT ALL {exportable.length} EVENT{exportable.length!==1?"S":""}</div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>exportable.forEach(e=>exportGCal(e))}
                      style={{...St.ghost,flex:1,fontSize:9,padding:"6px 8px",color:C.cyan,borderColor:`${C.cyan}44`}}>
                      + GCal
                    </button>
                    <button onClick={()=>exportable.forEach(e=>exportOutlookWeb(e))}
                      style={{...St.ghost,flex:1,fontSize:9,padding:"6px 8px",color:C.purple,borderColor:`${C.purple}44`}}>
                      + Outlook
                    </button>
                    <button onClick={()=>downloadICS(exportable,`day_${ds}.ics`)}
                      style={{...St.ghost,flex:1,fontSize:9,padding:"6px 8px",color:C.teal,borderColor:`${C.teal}44`}}>
                      v .ics
                    </button>
                    <button onClick={()=>shareViaEmail(exportable,`Events for ${ds}`)}
                      style={{...St.ghost,flex:1,fontSize:9,padding:"6px 8px",color:C.yellow,borderColor:`${C.yellow}44`}}>
                      @ Share
                    </button>
                  </div>
                </div>
              )}

              {/* Event list */}
              {!dayEvs.length&&<div style={{color:C.muted,fontSize:11,fontFamily:"'JetBrains Mono',monospace",textAlign:"center",padding:"16px 0"}}>Nothing scheduled.</div>}
              {dayEvs.map(ev=>(
                <div key={ev.id}
                  style={{background:C.card2,border:`1px solid ${ev.projColor||typeC[ev.type]||C.border}44`,borderRadius:8,marginBottom:8,overflow:"hidden"}}>
                  {/* Event info row - click to open detail */}
                  <div onClick={()=>{setSelectedDay(null);setSelectedEv(ev);}}
                    style={{padding:"9px 12px",cursor:"pointer"}}>
                    <div style={{fontSize:7,fontFamily:"'JetBrains Mono',monospace",color:ev.projColor||typeC[ev.type]||C.muted,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.1em"}}>
                      {ev.type}{ev.portfolioName?` / ${ev.portfolioName}`:""}
                      {ev.isPortfolio&&<span style={{color:C.dim}}> [from data]</span>}
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:C.text}}>{ev.title}</div>
                    {ev.projName&&<div style={{fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>{ev.projName}</div>}
                  </div>
                  {/* Per-event export buttons */}
                  {!ev.isPortfolio&&(
                    <div style={{display:"flex",borderTop:`1px solid ${C.border}22`,padding:"5px 8px",gap:4,background:"rgba(0,0,0,0.2)"}}>
                      <button onClick={e=>{e.stopPropagation();exportGCal(ev);}}
                        style={{background:"none",border:"none",color:C.cyan,cursor:"pointer",fontSize:9,fontFamily:"'JetBrains Mono',monospace",padding:"2px 6px",borderRadius:4}}>
                        + GCal
                      </button>
                      <button onClick={e=>{e.stopPropagation();exportOutlookWeb(ev);}}
                        style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontSize:9,fontFamily:"'JetBrains Mono',monospace",padding:"2px 6px",borderRadius:4}}>
                        + Outlook
                      </button>
                      <button onClick={e=>{e.stopPropagation();downloadICS([ev],`${ev.title.replace(/\s+/g,"_")}.ics`);}}
                        style={{background:"none",border:"none",color:C.teal,cursor:"pointer",fontSize:9,fontFamily:"'JetBrains Mono',monospace",padding:"2px 6px",borderRadius:4}}>
                        v .ics
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{marginBottom:14}}>
        <div style={{fontSize:19,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>Calendar</div>
        <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
          Click event or day &gt; export (Google . Outlook . .ics) . Blue = projects/tasks from your data
        </div>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setMonth(m=>{const n=new Date(m);n.setMonth(m.getMonth()-1);return n;})} style={{...St.ghost,padding:"5px 9px"}}>&lt;</button>
          <span style={{fontSize:17,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>{month.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
          <button onClick={()=>setMonth(m=>{const n=new Date(m);n.setMonth(m.getMonth()+1);return n;})} style={{...St.ghost,padding:"5px 9px"}}>&gt;</button>
          <button onClick={()=>setMonth(new Date(TODAY.getFullYear(),TODAY.getMonth(),1))} style={{...St.ghost,padding:"5px 9px",color:C.cyan}}>Today</button>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <select value={filterPortfolioId} onChange={e=>setFilterPortfolioId(e.target.value)}
            style={{...St.inp,width:"auto",padding:"4px 8px",fontSize:10}}>
            <option value="all">All Portfolios</option>
            {allPortfolios.map(s=><option key={s.id} value={s.id}>{s.spaceName} &gt; {s.name}</option>)}
          </select>
          <button onClick={()=>downloadICS(events.filter(e=>e.date.startsWith(`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}`)),`cal_${month.getFullYear()}_${month.getMonth()+1}.ics`)}
            style={{...St.ghost,padding:"5px 9px",fontSize:9,color:C.purple,borderColor:`${C.purple}44`}}>v .ics this month</button>
          <button onClick={()=>downloadICS(events,"prj_mgmt_all.ics")}
            style={{...St.ghost,padding:"5px 9px",fontSize:9,color:C.teal,borderColor:`${C.teal}44`}}>v .ics all</button>
          <button onClick={()=>setShowAdd(v=>!v)} style={St.btn}>{showAdd?"Cancel":"+ Event"}</button>
        </div>
      </div>

      <Collapse open={showAdd}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{minWidth:130}}>
            <div style={St.lbl}>Date</div>
            <input type="date" value={newEv.date} onChange={e=>setNewEv(p=>({...p,date:e.target.value}))} style={{...St.inp,marginTop:3}}/>
          </div>
          <div style={{flex:1,minWidth:160}}>
            <div style={St.lbl}>Title</div>
            <input placeholder="Event..." value={newEv.title} onChange={e=>setNewEv(p=>({...p,title:e.target.value}))} style={{...St.inp,marginTop:3}}/>
          </div>
          <div>
            <div style={St.lbl}>Type</div>
            <select value={newEv.type} onChange={e=>setNewEv(p=>({...p,type:e.target.value}))} style={{...St.inp,marginTop:3,width:110,color:typeC[newEv.type]}}>
              {Object.keys(typeC).filter(t=>!["project","task"].includes(t)).map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={addEvent} style={St.btn}>Add</button>
        </div>
      </Collapse>

      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:18}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:C.panel,borderBottom:`1px solid ${C.border}`}}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>(
            <div key={d} style={{padding:"6px",textAlign:"center",fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:C.muted}}>{d}</div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {Array.from({length:cells},(_,i)=>{
            const dn=i-adj+1; const valid=dn>=1&&dn<=dIM;
            const ds=valid?`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}-${String(dn).padStart(2,"0")}`:null;
            const userEvs=ds?events.filter(e=>e.date===ds):[];
            const portEvs=ds?portfolioEvents.filter(e=>e.date===ds):[];
            const isT=ds===todayS;
            return (
              <div key={i} onClick={()=>valid&&ds&&setSelectedDay(ds)}
                style={{minHeight:72,padding:"5px",borderRight:`1px solid ${C.border}22`,borderBottom:`1px solid ${C.border}22`,
                  background:isT?`${C.cyan}08`:"transparent",cursor:valid?"pointer":"default",transition:"background 0.1s"}}
                onMouseEnter={e=>{if(valid)e.currentTarget.style.background=`${C.border}33`;}}
                onMouseLeave={e=>{e.currentTarget.style.background=isT?`${C.cyan}08`:"transparent";}}>
                {valid&&(
                  <>
                    <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:isT?C.cyan:C.muted,fontWeight:isT?700:400,marginBottom:2}}>{dn}</div>
                    {portEvs.slice(0,2).map(ev=>(
                      <div key={ev.id} onClick={e=>{e.stopPropagation();setSelectedEv(ev);}}
                        style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:ev.projColor||C.blue,background:`${ev.projColor||C.blue}15`,
                          borderRadius:3,padding:"1px 4px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}}>
                        {ev.title}
                      </div>
                    ))}
                    {userEvs.slice(0,2).map(ev=>(
                      <div key={ev.id} onClick={e=>{e.stopPropagation();setSelectedEv(ev);}}
                        style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:typeC[ev.type]||C.cyan,background:`${typeC[ev.type]||C.cyan}22`,
                          borderRadius:3,padding:"1px 4px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title}</span>
                        <span style={{opacity:0.5,flexShrink:0,marginLeft:2}}>›</span>
                      </div>
                    ))}
                    {(portEvs.length+userEvs.length)>4&&<div style={{fontSize:7,color:C.dim,fontFamily:"'JetBrains Mono',monospace"}}>+{portEvs.length+userEvs.length-4} more</div>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:8}}>
        <span style={{fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:C.dim}}>LEGEND:</span>
        {[["Project start/end",C.blue],["Task due",C.yellow],["Custom event",C.cyan]].map(([l,c])=>(
          <span key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,fontFamily:"'JetBrains Mono',monospace",color:C.muted}}>
            <span style={{width:8,height:8,borderRadius:2,background:`${c}44`,border:`1px solid ${c}66`,display:"inline-block"}}/>{l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================
   ARCHIVE TAB
========================================================== */
function ArchiveTab({spaces, setSpaces}){
  const [filter, setFilter] = useState("all"); // all | spaces | portfolios | projects | tasks | subtasks
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();

  // Collect all archived items across the hierarchy
  const archivedSpaces = spaces.filter(sp=>sp.archived).map(sp=>({
    type:"space", id:sp.id, name:sp.name, color:sp.color,
    path:"(top level)", obj:sp,
  }));

  const archivedPortfolios = spaces.flatMap(sp=>
    (sp.portfolios||[]).filter(po=>po.archived).map(po=>({
      type:"portfolio", id:po.id, name:po.name, color:sp.color,
      path:sp.name, spaceId:sp.id, obj:po,
    }))
  );

  const archivedProjects = spaces.flatMap(sp=>
    (sp.portfolios||[]).flatMap(po=>
      (po.projects||[]).filter(pr=>pr.archived).map(pr=>({
        type:"project", id:pr.id, name:pr.name, color:pr.color||sp.color,
        path:`${sp.name} › ${po.name}`, spaceId:sp.id, portId:po.id, obj:pr,
      }))
    )
  );

  const archivedTasks = spaces.flatMap(sp=>
    (sp.portfolios||[]).flatMap(po=>
      (po.projects||[]).flatMap(pr=>
        (pr.tasks||[]).filter(t=>t.archived).map(t=>({
          type:"task", id:t.id, name:t.name, color:sp.color,
          path:`${sp.name} › ${po.name} › ${pr.name}`,
          spaceId:sp.id, portId:po.id, projId:pr.id, obj:t,
        }))
      )
    )
  );

  const archivedSubs = spaces.flatMap(sp=>
    (sp.portfolios||[]).flatMap(po=>
      (po.projects||[]).flatMap(pr=>
        (pr.tasks||[]).flatMap(t=>
          (t.subtasks||[]).filter(st=>st.archived).map(st=>({
            type:"subtask", id:st.id, name:st.name, color:sp.color,
            path:`${sp.name} › ${po.name} › ${pr.name} › ${t.name}`,
            spaceId:sp.id, portId:po.id, projId:pr.id, taskId:t.id, obj:st,
          }))
        )
      )
    )
  );

  const all = [...archivedSpaces,...archivedPortfolios,...archivedProjects,...archivedTasks,...archivedSubs];
  const filtered = all
    .filter(i=> filter==="all" || i.type===filter.slice(0,-1)) // remove trailing s: "spaces"->"space"
    .filter(i=> !q || i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q));

  const total = all.length;

  const restore = item => {
    setSpaces(prev => prev.map(sp => {
      if(item.type==="space"){
        return sp.id===item.id ? {...sp,archived:false} : sp;
      }
      return {...sp, portfolios:(sp.portfolios||[]).map(po=>{
        if(item.type==="portfolio"){
          return po.id===item.id ? {...po,archived:false} : po;
        }
        return {...po, projects:(po.projects||[]).map(pr=>{
          if(item.type==="project"){
            return pr.id===item.id ? {...pr,archived:false} : pr;
          }
          return {...pr, tasks:(pr.tasks||[]).map(t=>{
            if(item.type==="task"){
              return t.id===item.id ? {...t,archived:false} : t;
            }
            return {...t, subtasks:(t.subtasks||[]).map(st=>
              item.type==="subtask"&&st.id===item.id ? {...st,archived:false} : st
            )};
          })};
        })};
      })};
    }));
  };

  const TYPE_LABELS = {space:"Space",portfolio:"Portfolio",project:"Project",task:"Task",subtask:"Subtask"};
  const FILTER_OPTS = [
    {v:"all",     label:`All (${total})`},
    {v:"spaces",  label:`Spaces (${archivedSpaces.length})`},
    {v:"portfolios",label:`Portfolios (${archivedPortfolios.length})`},
    {v:"projects",label:`Projects (${archivedProjects.length})`},
    {v:"tasks",   label:`Tasks (${archivedTasks.length})`},
    {v:"subtasks",label:`Subtasks (${archivedSubs.length})`},
  ];

  return (
    <div style={{maxWidth:860}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <div style={{fontSize:19,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif"}}>Archive</div>
          <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
            {total} archived item{total!==1?"s":""} . click ↺ to restore any item
          </div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="search archived..."
          style={{...St.inp,width:200,padding:"5px 10px",fontSize:10}}/>
      </div>

      {/* Filter chips */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {FILTER_OPTS.map(o=>(
          <button key={o.v} onClick={()=>setFilter(o.v)}
            style={{...St.ghost,padding:"3px 10px",fontSize:9,
              color:filter===o.v?C.cyan:C.muted,
              borderColor:filter===o.v?C.cyan:`${C.border}`}}>
            {o.label}
          </button>
        ))}
      </div>

      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"60px 0",color:C.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
          {total===0 ? "nothing archived yet" : "no matches"}
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {filtered.map(item=>(
            <div key={item.type+item.id}
              style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                background:C.card,border:`1px solid ${C.border}`,borderRadius:8,
                borderLeft:`3px solid ${item.color}`}}>
              <span style={{fontSize:8,color:item.color,fontFamily:"'JetBrains Mono',monospace",
                background:`${item.color}18`,padding:"2px 6px",borderRadius:4,flexShrink:0,textTransform:"uppercase",letterSpacing:"0.08em"}}>
                {TYPE_LABELS[item.type]}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,fontFamily:"'JetBrains Mono',monospace",
                  textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {item.name}
                </div>
                <div style={{fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
                  {item.path}
                </div>
              </div>
              <button onClick={()=>restore(item)}
                style={{...St.ghost,padding:"3px 10px",fontSize:9,color:C.cyan,borderColor:`${C.cyan}44`,flexShrink:0}}>
                ↺ restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==========================================================
   ROOT APP
========================================================== */
/* ==========================================================
   THE VOID TAB  — graveyard for permanently deleted items
========================================================== */
function TheVoidTab({theVoid, setTheVoid, spaces, setSpaces}){
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const TYPE_LABELS = {space:"Space",portfolio:"Portfolio",project:"Project",task:"Task",subtask:"Subtask"};
  const filtered = theVoid.filter(i=> !q || i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q));

  const restore = item => {
    // Re-insert at top level based on type — best effort
    if(item.type==="space"){
      setSpaces(s=>[...s, {...item.data, id:uid(), name:item.name+" (restored)"}]);
    }
    // For deeper types, we can only restore to void as we don't have the parent context reliably
    // so we just remove from void and let user know
    setTheVoid(v=>v.filter(x=>x.id!==item.id));
  };

  const purge = id => setTheVoid(v=>v.filter(x=>x.id!==id));
  const purgeAll = () => setTheVoid([]);

  return (
    <div style={{maxWidth:860}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <div style={{fontSize:19,fontWeight:800,color:C.red,fontFamily:"'Syne',sans-serif"}}>The Void</div>
          <div style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
            {theVoid.length} deleted item{theVoid.length!==1?"s":""} . permanently gone unless restored
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="search..."
            style={{...St.inp,width:160,padding:"5px 10px",fontSize:10}}/>
          {theVoid.length>0&&(
            <button onClick={purgeAll}
              style={{...St.ghost,padding:"4px 10px",fontSize:9,color:C.red,borderColor:`${C.red}44`}}>
              Purge All
            </button>
          )}
        </div>
      </div>

      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"80px 0"}}>
          <div style={{fontSize:32,marginBottom:12,opacity:0.2}}>x</div>
          <div style={{color:C.dim,fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
            {theVoid.length===0?"the void is empty":"no matches"}
          </div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {filtered.map(item=>(
            <div key={item.id}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                background:C.card,border:`1px solid ${C.red}22`,borderRadius:8,
                borderLeft:`3px solid ${C.red}66`}}>
              <span style={{fontSize:8,color:C.red,fontFamily:"'JetBrains Mono',monospace",
                background:`${C.red}18`,padding:"2px 6px",borderRadius:4,flexShrink:0,
                textTransform:"uppercase",letterSpacing:"0.08em"}}>
                {TYPE_LABELS[item.type]||item.type}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,fontFamily:"'JetBrains Mono',monospace",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {item.name}
                </div>
                <div style={{fontSize:9,color:C.dim,fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>
                  {item.path} · deleted {item.deletedAt}
                </div>
              </div>
              {item.type==="space"&&(
                <button onClick={()=>restore(item)}
                  style={{...St.ghost,padding:"3px 10px",fontSize:9,color:C.cyan,borderColor:`${C.cyan}44`,flexShrink:0}}>
                  ↺ restore
                </button>
              )}
              <button onClick={()=>purge(item.id)}
                style={{...St.ghost,padding:"3px 8px",fontSize:9,color:C.red,borderColor:`${C.red}44`,flexShrink:0}}>
                purge
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==========================================================
   TEAMS & COLLABORATORS FRAMEWORK (v1 scaffold)
   
   Architecture for future multi-user / permission system:
   
   ROLES (per entity level):
     - "owner"   : full CRUD, can invite/remove members, change settings
     - "admin"   : full CRUD on content, cannot delete space/portfolio
     - "editor"  : can create/edit tasks, cannot delete projects/portfolios
     - "viewer"  : read-only access
   
   SCOPE (permission can be applied at any level):
     - Space-level   : applies to all portfolios/projects within
     - Portfolio-level: applies to all projects within
     - Project-level : only that project's tasks/subtasks
   
   DATA MODEL (stored alongside spaces in future Gist sync):
   {
     teams: [
       { id: "team_1", name: "Manufacturing Team", members: ["user_a","user_b"] }
     ],
     collaborators: {
       // key: spaceId | portfolioId | projectId
       "port_work": [
         { userId: "user_a", email: "alice@company.com", role: "owner", scope: "space" },
         { userId: "user_b", email: "bob@company.com",   role: "editor", scope: "space" },
       ],
       "sg_port": [
         { userId: "user_c", email: "carol@company.com", role: "viewer", scope: "portfolio" },
       ],
     }
   }
   
   ENFORCEMENT (hook ready for wiring):
     - checkPerm(userId, entityId, action) -> boolean
     - Actions: "read" | "create" | "edit" | "delete" | "invite" | "settings"
   
   CURRENT STATE: Scaffold only — single-user mode.
   UI placeholder in Data Manager. Gist sync stores owner userId from settings.
   Full implementation: v2.0 when backend auth (Supabase/Clerk) is integrated.
========================================================== */

// Permission checker scaffold — always grants in single-user mode
const ROLES_HIERARCHY = ["viewer","editor","admin","owner"];
const PERM_MAP = {
  viewer:  ["read"],
  editor:  ["read","create","edit"],
  admin:   ["read","create","edit","delete"],
  owner:   ["read","create","edit","delete","invite","settings"],
};
function checkPerm(collaborators, entityId, userId, action){
  // Single-user mode: always grant
  if(!collaborators || !userId) return true;
  const perms = collaborators[entityId] || [];
  const entry = perms.find(p=>p.userId===userId);
  if(!entry) return false;
  return (PERM_MAP[entry.role]||[]).includes(action);
}

// Hook for permission-aware operations (scaffold)
function usePermissions(userId){
  return {
    can: (collaborators, entityId, action) => checkPerm(collaborators, entityId, userId, action),
    // Future: fetch from backend, subscribe to changes
  };
}

const NAV = [
  {id:"spaces",  icon:"*", label:"Spaces"},
  {id:"today",   icon:"o", label:"Focus"},
  {id:"gantt",   icon:"~", label:"Gantt"},
  {id:"capacity",icon:"+", label:"Capacity"},
  {id:"calendar",icon:"@", label:"Calendar"},
  {id:"archive", icon:"v", label:"Archive"},
  {id:"void",    icon:"x", label:"The Void"},
];

export default function App(){
  const [tab,setTab]                 = useState("spaces");
  const [spaces,setSpaces]   = useState(()=>loadLS()||INIT);
  const [searchQ,setSearchQ]         = useState("");
  const [saved,setSaved]             = useState(false);
  const [showDataMgr,setShowDataMgr] = useState(false);
  const [gistStatus,setGistStatus]   = useState("not configured");
  const [gistSyncing,setGistSyncing] = useState(false);
  const [theVoid,setTheVoid]         = useState([]); // deleted items {id,type,name,path,deletedAt,data,restoreFn}
  const [undoStack,setUndoStack]     = useState([]); // last 8 spaces snapshots
  const [undoBanner,setUndoBanner]   = useState(null); // {msg, timeout}
  const saveTimer  = useRef(null);
  const gistTimer  = useRef(null);

  const voidCount = theVoid.length;

  // Push to undo stack (max 8)
  const pushUndo = (msg, prevSpaces, voidItem) => {
    setUndoStack(s=>[{msg, prevSpaces, voidItem, ts:Date.now()},...s].slice(0,8));
    if(undoBanner?.timeout) clearTimeout(undoBanner.timeout);
    const t = setTimeout(()=>setUndoBanner(null), 6000);
    setUndoBanner({msg, timeout:t});
  };

  const doUndo = () => {
    if(!undoStack.length) return;
    const [top,...rest] = undoStack;
    setSpaces(top.prevSpaces);
    // remove from void if it was sent there
    if(top.voidItem) setTheVoid(v=>v.filter(x=>x.id!==top.voidItem.id));
    setUndoStack(rest);
    setUndoBanner(null);
  };

  // Send deleted item to The Void
  const sendToVoid = (type, name, path, data) => {
    const item = {id:uid(), type, name, path, deletedAt:new Date().toLocaleString(), data};
    setTheVoid(v=>[item,...v]);
    return item;
  };

  // Auto-save to localStorage + debounced Gist push
  useEffect(()=>{
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>{
      saveLS(spaces);
      setSaved(true);
      setTimeout(()=>setSaved(false),1800);
      // Auto-push to Gist if configured
      const s = loadSettings();
      if(s.gistId?.trim() && s.token?.trim()){
        clearTimeout(gistTimer.current);
        gistTimer.current = setTimeout(async ()=>{
          setGistSyncing(true);
          try {
            await gistSave(s.gistId, s.token, spaces);
            setGistStatus("synced " + new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
          } catch(e) {
            setGistStatus("sync failed");
          } finally { setGistSyncing(false); }
        }, 3000); // 3s after last change
      }
    },1000);
  },[spaces]);

  // On mount: pull from Gist if configured and local is empty/default
  useEffect(()=>{
    const s = loadSettings();
    if(s.gistId?.trim()){
      setGistStatus("configured");
    }
  },[]);

  // Focus badge count
  const focusBadge = useMemo(()=>{
    let n=0;
    spaces.forEach(po=>po.portfolios.filter(s=>!s.archived).forEach(sp=>sp.projects.filter(p=>!p.archived).forEach(pr=>{
      (pr.tasks||[]).filter(t=>!t.archived).forEach(t=>{
        if((t.end<todayS&&t.status!=="Done")||t.end===todayS||t.flagged) n++;
      });
    })));
    return n;
  },[spaces]);

  // Global stats
  const stats = useMemo(()=>{
    let projs=0,totalAssigned=0,totalActual=0,progSum=0;
    spaces.forEach(po=>po.portfolios.filter(s=>!s.archived).forEach(sp=>sp.projects.filter(p=>!p.archived).forEach(pr=>{
      projs++; totalAssigned+=projAssigned(pr); totalActual+=projActual(pr); progSum+=projProg(pr);
    })));
    return {projs,totalAssigned,totalActual,avgProg:projs?Math.round(progSum/projs):0};
  },[spaces]);

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'JetBrains Mono',monospace"}}>
      <style>{CSS}</style>
      {showDataMgr&&<DataManager spaces={spaces} setSpaces={setSpaces} onClose={()=>setShowDataMgr(false)} gistStatus={gistStatus}/>}
      {/* Top bar */}
      <div style={{background:C.panel,borderBottom:`1px solid ${C.border}`,padding:"0 20px",display:"flex",alignItems:"center",gap:12,height:52,position:"sticky",top:0,zIndex:100}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:8}}>
          <div style={{width:26,height:26,borderRadius:6,background:`linear-gradient(135deg,${C.cyan},${C.blue})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 12px ${C.cyan}44`,fontSize:12,fontWeight:800,color:"#07090f"}}>*</div>
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            <span style={{fontSize:11,fontWeight:800,color:C.text,fontFamily:"'Syne',sans-serif",letterSpacing:"0.05em",lineHeight:1.1}}>PRJ_MGMT</span>
            <span style={{fontSize:7,color:C.dim,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.1}}>v7.1.0</span>
          </div>
        </div>

        {/* Nav */}
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setTab(n.id)}
            style={{background:tab===n.id?`${C.cyan}18`:"none",border:"none",cursor:"pointer",padding:"4px 10px",borderRadius:6,
              color:n.id==="void"?(tab===n.id?C.red:C.muted):(tab===n.id?C.cyan:C.muted),fontSize:10,fontWeight:700,
              fontFamily:"'JetBrains Mono',monospace",display:"flex",alignItems:"center",gap:5,position:"relative"}}>
            <span>{n.icon}</span><span className="nav-label">{n.label}</span>
            {n.id==="today"&&focusBadge>0&&(
              <span style={{background:C.red,color:"#fff",borderRadius:99,fontSize:8,padding:"0 4px",fontWeight:800,minWidth:16,textAlign:"center",position:"absolute",top:-4,right:-4}}>{focusBadge}</span>
            )}
            {n.id==="void"&&voidCount>0&&(
              <span style={{background:C.red+"44",color:C.red,borderRadius:99,fontSize:8,padding:"0 4px",fontWeight:800,minWidth:16,textAlign:"center",position:"absolute",top:-4,right:-4}}>{voidCount}</span>
            )}
          </button>
        ))}

        <div style={{flex:1}}/>

        {/* Search */}
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.dim,fontSize:11}}>S</span>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search..."
            className="search-bar"
            style={{...St.inp,width:160,paddingLeft:24,fontSize:10,background:C.card2}}/>
          {searchQ&&<button onClick={()=>setSearchQ("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:12}}>x</button>}
        </div>

        {/* Save / Gist indicator */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1,minWidth:70}}>
          <span style={{fontSize:9,color:saved?C.green:C.dim,fontFamily:"'JetBrains Mono',monospace",transition:"color 0.3s"}}>
            {saved?"v SAVED":". . ."}
          </span>
          <span style={{fontSize:8,color:gistSyncing?C.yellow:gistStatus.startsWith("synced")?C.green:gistStatus==="sync failed"?C.red:C.dim,fontFamily:"'JetBrains Mono',monospace",transition:"color 0.3s"}}>
            {gistSyncing?"~ gist...":gistStatus.startsWith("synced")?"o "+gistStatus:gistStatus==="sync failed"?"o gist fail":gistStatus==="configured"?"o gist ready":"o no gist"}
          </span>
        </div>

        {/* Data Manager */}
        <button onClick={()=>setShowDataMgr(true)} style={{...St.ghost,padding:"4px 10px",fontSize:9,color:C.cyan,borderColor:`${C.cyan}44`,display:"flex",alignItems:"center",gap:5}}>
          <span>o</span> <span className="nav-label">Data</span>
        </button>

        {/* Stats */}
        <div className="stats-bar" style={{display:"flex",gap:12,borderLeft:`1px solid ${C.border}`,paddingLeft:12}}>
          {[[stats.projs,"PROJ"],[`${stats.avgProg}%`,"PROG"],[`${stats.totalAssigned.toFixed(0)}h`,"ASGN"],[`${stats.totalActual.toFixed(0)}h`,"ACTL"]].map(([v,l])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:800,color:l==="ACTL"?C.green:C.cyan,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
              <div style={{...St.lbl,fontSize:7}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Undo banner */}
      {undoBanner&&(
        <div className="fu" style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:C.card,border:`1px solid ${C.cyan}66`,borderRadius:10,padding:"10px 18px",
          display:"flex",alignItems:"center",gap:14,zIndex:500,boxShadow:"0 8px 32px rgba(0,0,0,0.7)"}}>
          <span style={{fontSize:10,color:C.text,fontFamily:"'JetBrains Mono',monospace"}}>{undoBanner.msg}</span>
          <button onClick={doUndo} style={{...St.btn,padding:"4px 12px",fontSize:10,background:C.cyan}}>↺ Undo</button>
          <button onClick={()=>{clearTimeout(undoBanner.timeout);setUndoBanner(null);}} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:14}}>x</button>
        </div>
      )}

      {/* Main content */}
      <div className="main-pad" style={{padding:20,maxWidth:1600,margin:"0 auto"}}>
        {tab==="spaces"   &&<SpacesTab   spaces={spaces} setSpaces={setSpaces} searchQ={searchQ} pushUndo={pushUndo} sendToVoid={sendToVoid}/>}
        {tab==="today"    &&<TodayFocus  spaces={spaces}/>}
        {tab==="gantt"    &&<GanttTab    spaces={spaces}/>}
        {tab==="capacity" &&<CapacityTab spaces={spaces}/>}
        {tab==="calendar" &&<CalendarTab spaces={spaces}/>}
        {tab==="archive"  &&<ArchiveTab  spaces={spaces} setSpaces={setSpaces}/>}
        {tab==="void"     &&<TheVoidTab  theVoid={theVoid} setTheVoid={setTheVoid} spaces={spaces} setSpaces={setSpaces}/>}
      </div>
    </div>
  );
}

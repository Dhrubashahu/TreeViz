"use strict";
/* ============================================================================
   TreeViz – standalone tree / metadata / population-frequency viewer & editor
   ========================================================================== */
const $=id=>document.getElementById(id);
const FONT="Segoe UI, Helvetica, Arial, sans-serif";
const PAL=["#636efa","#ef553b","#00cc96","#ab63fa","#ffa15a","#19d3f3","#ff6692","#b6e880","#ff97ff","#fecb52",
 "#2e91e5","#e15f99","#1ca71c","#fb0d0d","#da16ff","#222a2a","#b68100","#750d86","#eb663b","#511cfb","#00a08b","#fb00d1","#fc0080","#b2828d",
 "#6c7c32","#778aae","#862a16","#a777f1","#620042","#1616a7","#da60ca","#6c4516","#0d2a63","#af0038"];
const GRADS={
  viridis:[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]],
  plasma:[[13,8,135],[126,3,168],[204,71,120],[248,149,64],[240,249,33]],
  blues:[[239,246,255],[147,197,253],[59,130,246],[29,78,216],[23,37,84]],
  reds:[[255,245,240],[252,187,161],[251,106,74],[203,24,29],[103,0,13]],
  greens:[[240,253,244],[134,239,172],[34,197,94],[21,128,61],[5,46,22]],
  rdylbu:[[49,54,149],[116,173,209],[255,255,191],[244,109,67],[165,0,38]]};
function gradAt(name,t){const st=GRADS[name]||GRADS.viridis;if(!isFinite(t))return"#d1d5db";t=Math.max(0,Math.min(.99999,t))*(st.length-1);const i=Math.floor(t),f=t-i;
  return"rgb("+st[i].map((x,j)=>Math.round(x+(st[i+1][j]-x)*f)).join(",")+")"}
function textOn(c){const m=c.match(/\d+/g);if(!m)return"#111";const[r,g,b]=m.map(Number);return(r*299+g*587+b*114)/1000<140?"#fff":"#111"}
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const num=v=>{if(v===null||v===undefined)return NaN;if(typeof v==="number")return v;const s=String(v).trim();if(s===""||/^(na|nan|none|null|-)$/i.test(s))return NaN;const t=s.replace(/%$/,"").replace(/(\d),(\d{3})(?!\d)/g,"$1$2");return Number(t)};
const isNA=v=>v===null||v===undefined||String(v).trim()===""||/^(na|nan|none|null)$/i.test(String(v).trim());
const dispVal=v=>{const s=String(v??"").trim();return/^-?\d+\.0+$/.test(s)?s.replace(/\.0+$/,""):s};
const normCol=c=>String(c).toLowerCase().replace(/[^a-z0-9]/g,"");
const fmtN=(v,d=3)=>{if(!isFinite(v))return"NA";const a=Math.abs(v);if(a!==0&&(a<1e-3||a>=1e6))return v.toExponential(2);return String(+v.toFixed(d))};
let tt0;function toast(m,ms=2400){const t=$("toast");t.textContent=m;t.style.opacity=1;clearTimeout(tt0);tt0=setTimeout(()=>t.style.opacity=0,ms)}

/* ---------------------------------------------------------------- state */
let uid=0;
const mk=o=>Object.assign({id:++uid,name:"",orig:null,key:"",len:null,lab:"",children:[],parent:null,collapsed:false,bcolor:null,bwidth:null,hl:null,cl:"",tcolor:null},o);
const S={root:null,sel:new Set(),undo:[],redo:[],edits:0,byId:{},zoom:1,fitPending:true,
  meta:{columns:[],rows:[]},tipKey:"",sampleKey:"",mTip:new Map(),mSample:new Map(),
  colAuto:{},colOverride:{},catColors:{},numInfo:{},
  freq:null,freqCols:[],freqSamples:[],freqNodes:[],fIdx:new Map(),
  wide:null, // {id, columns, rows:Map}
  selSamples:[],sampleColors:{},sampleFilters:{},sampleSearch:"",
  tab:"samples",treeName:"tree",
  opts:{layout:"rect",scale:"phylo",xform:"linear",cap:30,boost:0,treeW:600,rowH:18,arc:350,rot:0,innerR:0,lw:1.5,borrow:true,borrow:true,
    showTips:true,align:false,nodeDots:false,nodeLabels:false,brLen:false,scaleBar:true,sup:false,supMin:0,legend:true,
    fs:12,tipOff:6,nlx:0,nly:-4,blx:0,bly:-4,blDec:4,
    labelCols:["__name"],cby:"",clab:true,dots:[],dotShape:"circle",dotSize:11,grad:"viridis",
    fmode:"bars",fstat:"mean",brSample:"",fgrad:"reds",shared:false,lofreq:false,minDepth:0,minFreq:0,posMode:"All",posList:"",sort:"mean",hideNodes:[],
    rowGap:16,barGap:6,barW:4.5,barH:13,barShift:0,rangeW:90,barLabels:true,
    wideCols:[],wideMode:"stack",wideNorm:true,wideW:140}};

/* ---------------------------------------------------------------- parsing */
function parseNewick(s){
  s=s.trim();let i=0;
  const ws=()=>{while(i<s.length&&/\s/.test(s[i]))i++};
  const cm=()=>{let o="";ws();while(s[i]==="["){let j=s.indexOf("]",i);if(j<0)j=s.length-1;o+=s.slice(i+1,j)+" ";i=j+1;ws()}return o};
  const label=()=>{ws();let l="";if(s[i]==="'"||s[i]==='"'){const q=s[i++];while(i<s.length){if(s[i]===q){if(s[i+1]===q){l+=q;i+=2;continue}i++;break}l+=s[i++]}return l}
    while(i<s.length&&!"(),:;[".includes(s[i]))l+=s[i++];return l.trim()};
  function node(depth){
    if(depth>20000)throw new Error("Tree too deep");
    let n=mk({}),c=cm();
    if(s[i]==="("){i++;for(;;){const ch=node(depth+1);ch.parent=n;n.children.push(ch);ws();if(s[i]===","){i++;continue}if(s[i]===")"){i++;break}
      throw new Error("Unexpected '"+(s[i]||"end of text")+"' at position "+i+". Is this a Newick tree?")}}
    c+=cm();const l=label();c+=cm();
    if(n.children.length)n.lab=l;else n.name=l;
    ws();if(s[i]===":"){i++;ws();const m=s.slice(i).match(/^[-+]?(?:[0-9]*\.?[0-9]+|[0-9]+\.)(?:[eE][-+]?[0-9]+)?/);if(m){n.len=parseFloat(m[0]);i+=m[0].length}c+=cm()}
    const mc=c.match(/!color=(#[0-9a-fA-F]{6})/);if(mc)n.bcolor=mc[1];
    return n}
  if(!s.length)throw new Error("Empty tree text");
  const r=node(0);r.len=null;return r}
function readTreeText(text,fname=""){
  text=text.replace(/^﻿/,"");const head=text.trimStart().slice(0,300).toLowerCase();fname=fname.toLowerCase();
  if(head.startsWith("<")||/\.(xml|phyloxml)$/.test(fname))return{root:parsePhyloXML(text),tr:{}};
  if(head.startsWith("#nexus")||/begin\s+trees/i.test(text)||/\.(nex|nexus)$/.test(fname)){
    const tr={};const m=text.match(/translate\s+([\s\S]*?);/i);
    if(m)m[1].split(",").forEach(p=>{const b=p.trim().match(/^(\S+)\s+([\s\S]+)$/);if(b)tr[b[1]]=b[2].trim().replace(/^['"]|['"]$/g,"")});
    const t=text.match(/^\s*tree\s+[^=]*=\s*(?:\[&[RUru]\]\s*)?([\s\S]*?;)/im);
    if(!t)throw new Error("No 'tree … = (…);' line found in the NEXUS file");
    return{root:parseNewick(t[1]),tr}}
  const m=text.match(/\([\s\S]*?;/);if(!m)throw new Error("No Newick string ending in ';' found");
  return{root:parseNewick(m[0]),tr:{}}}
function parsePhyloXML(text){
  const doc=new DOMParser().parseFromString(text,"application/xml");
  const cl=doc.getElementsByTagName("clade")[0];if(!cl)throw new Error("No <clade> in XML");
  function rec(el){const n=mk({});
    for(const ch of el.children){const t=ch.localName;
      if(t==="name")n.name=ch.textContent.trim();
      else if(t==="branch_length")n.len=parseFloat(ch.textContent);
      else if(t==="confidence")n.lab=ch.textContent.trim();
      else if(t==="clade"){const c=rec(ch);c.parent=n;n.children.push(c)}}
    if(el.getAttribute("branch_length"))n.len=parseFloat(el.getAttribute("branch_length"));
    if(n.children.length&&n.name&&!n.lab){n.lab=n.name;n.name=""}
    return n}
  const r=rec(cl);r.len=null;return r}
function parseTable(text,fname=""){
  text=text.replace(/^﻿/,"");
  const first=text.split(/\r?\n/,1)[0]||"";
  let d=/\.tsv$/i.test(fname)?"\t":/\.csv$/i.test(fname)?",":null;
  if(!d){const t=(first.match(/\t/g)||[]).length,c=(first.match(/,/g)||[]).length,sc=(first.match(/;/g)||[]).length;d=t>=c&&t>=sc&&t>0?"\t":sc>c?";":","}
  const rows=[];let row=[],f="",q=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=ch;continue}
    if(ch==='"'&&f===""){q=true;continue}
    if(ch===d){row.push(f);f="";continue}
    if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(f);f="";if(row.length>1||row[0]!=="")rows.push(row);row=[];continue}
    f+=ch}
  if(f!==""||row.length){row.push(f);rows.push(row)}
  if(!rows.length)throw new Error("Empty table");
  const cols=rows[0].map((c,i)=>c.trim()||("col"+(i+1)));
  return{columns:cols,rows:rows.slice(1).map(r=>{const o={};cols.forEach((c,i)=>o[c]=r[i]===undefined?"":r[i].trim());return o})}}
async function readTableFile(file){
  if(/\.xlsx?$/i.test(file.name)){
    if(typeof XLSX==="undefined")throw new Error("Excel support not available");
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
    const cols=(aoa[0]||[]).map((c,i)=>String(c).trim()||("col"+(i+1)));
    return{columns:cols,rows:aoa.slice(1).filter(r=>r.some(v=>String(v).trim()!=="")).map(r=>{const o={};cols.forEach((c,i)=>o[c]=String(r[i]??"").trim());return o})}}
  return parseTable(await file.text(),file.name)}

/* ---------------------------------------------------------------- tree utils */
const isTip=n=>!n.children.length;
function tipsOf(n,a=[]){if(isTip(n))a.push(n);else n.children.forEach(c=>tipsOf(c,a));return a}
function allNodes(n=S.root,a=[]){a.push(n);n.children.forEach(c=>allNodes(c,a));return a}
function nTips(n){return isTip(n)?1:n.children.reduce((s,c)=>s+nTips(c),0)}
function descendants(n,a=[]){a.push(n);n.children.forEach(c=>descendants(c,a));return a}
function cleanup(){
  (function f(n){n.children.forEach(f);
    if(n.children.length===1&&n.parent){const c=n.children[0],p=n.parent,k=p.children.indexOf(n);
      c.len=(c.len==null&&n.len==null)?null:(c.len||0)+(n.len||0);mergeKey(c,n);p.children[k]=c;c.parent=p}})(S.root);
  while(S.root.children.length===1){const c=S.root.children[0];c.parent=null;c.len=null;S.root=c}}
function mergeKey(c,n){const ks=[n.key,...(n.alias||[])].filter(Boolean);if(!ks.length)return;if(!c.key){c.key=ks.shift()}c.alias=[...new Set([...(c.alias||[]),...ks])].filter(k=>k!==c.key)}
function ser(n){return{i:n.id,n:n.name,o:n.orig,k:n.key,al:n.alias,l:n.len,b:n.lab,x:n.collapsed,bc:n.bcolor,bw:n.bwidth,h:n.hl,cl:n.cl,tc:n.tcolor,c:n.children.map(ser)}}
function de(o,p){const n={id:o.i,name:o.n,orig:o.o,key:o.k,alias:o.al,len:o.l,lab:o.b,collapsed:o.x,bcolor:o.bc,bwidth:o.bw,hl:o.h,cl:o.cl,tcolor:o.tc,parent:p,children:[]};
  if(n.id>uid)uid=n.id;n.children=o.c.map(c=>de(c,n));return n}
const snap=()=>JSON.stringify(ser(S.root));
function pushUndo(){S.undo.push(snap());if(S.undo.length>150)S.undo.shift();S.redo=[]}
function doUndo(){if(!S.undo.length)return;S.redo.push(snap());S.root=de(JSON.parse(S.undo.pop()),null);S.sel.clear();S.edits++;afterEdit()}
function doRedo(){if(!S.redo.length)return;S.undo.push(snap());S.root=de(JSON.parse(S.redo.pop()),null);S.sel.clear();S.edits++;afterEdit()}
function edit(fn){if(!S.root)return;pushUndo();fn();S.edits++;afterEdit()}
function afterEdit(){render();updInfo();if(S.tab==="tips")renderTab()}
function reroot(n,frac){
  if(!n.parent)return toast("That is already the root.");
  const path=[];for(let x=n;x;x=x.parent)path.push(x);const k=path.length-1;
  const E=path.slice(0,k).map(x=>({len:x.len,lab:x.lab,key:x.key,al:x.alias,bc:x.bcolor,bw:x.bwidth}));
  for(let i=0;i<k;i++)path[i+1].children=path[i+1].children.filter(c=>c!==path[i]);
  const R=mk({});R.children=[n,path[1]];n.parent=R;path[1].parent=R;
  const L=E[0].len;n.len=L==null?null:L*frac;path[1].len=L==null?null:L*(1-frac);
  const setE=(q,e)=>{q.lab=e.lab;q.key=e.key;q.alias=e.al;q.bcolor=e.bc;q.bwidth=e.bw};
  // the split branch keeps its identity on the n side; the other half gets a copy of the label only
  path[1].lab=E[0].lab;path[1].key="";path[1].alias=null;path[1].bcolor=E[0].bc;path[1].bwidth=E[0].bw;
  for(let i=1;i<k;i++){const q=path[i+1];path[i].children.push(q);q.parent=path[i];q.len=E[i].len;setE(q,E[i])}
  R.len=null;R.lab="";R.key="";S.root=R;cleanup()}
function midpointRoot(){
  const nodes=allNodes();const adj=new Map(nodes.map(n=>[n,[]]));
  nodes.forEach(n=>{if(n.parent){const w=n.len==null?1:n.len;adj.get(n).push([n.parent,w,n]);adj.get(n.parent).push([n,w,n])}});
  const far=s=>{const d=new Map([[s,0]]),pr=new Map([[s,null]]),q=[s];let best=s;
    while(q.length){const u=q.shift();for(const[v,w,e]of adj.get(u))if(!d.has(v)){d.set(v,d.get(u)+w);pr.set(v,[u,e,w]);q.push(v);if(isTip(v)&&d.get(v)>d.get(best))best=v}}
    return{best,d,pr}};
  const a=far(tipsOf(S.root)[0]).best,r=far(a),b=r.best,half=r.d.get(b)/2;let cur=b;
  while(cur!==a){const[u,e,w]=r.pr.get(cur);const dv=r.d.get(cur);
    if(dv-w<=half&&dv>=half){const fromU=half-(dv-w);const frac=w?(e===cur?(w-fromU)/w:fromU/w):.5;
      if(e.parent===S.root&&S.root.children.length===2){const sib=S.root.children.find(c=>c!==e),tot=(e.len||0)+(sib.len||0);e.len=tot*frac;sib.len=tot*(1-frac);return}
      reroot(e,Math.min(1,Math.max(0,frac)));return}
    cur=u}}
function mrca(ns){if(!ns.length)return null;const ch=n=>{const a=[];for(;n;n=n.parent)a.push(n);return a};let c=ch(ns[0]);
  for(const n of ns.slice(1)){const s=new Set(ch(n));c=c.filter(x=>s.has(x))}return c[0]}
function ladderize(n,asc){n.children.forEach(c=>ladderize(c,asc));n.children.sort((a,b)=>asc?nTips(a)-nTips(b):nTips(b)-nTips(a))}
function nq(x){return/[\s(),:;\[\]']/.test(x)?"'"+x.replace(/'/g,"''")+"'":x}
const fmtL=x=>String(parseFloat(Number(x).toPrecision(10)));
function toNewick(n,ann,isRoot=true){
  let s=n.children.length?"("+n.children.map(c=>toNewick(c,ann,false)).join(",")+")"+(n.lab?nq(n.lab):""):nq(n.name);
  if(ann&&n.bcolor)s+="[&!color="+n.bcolor+"]";if(!isRoot&&n.len!=null)s+=":"+fmtL(n.len);return isRoot?s+";":s}

/* ---------------------------------------------------------------- metadata */
function buildIndex(col){const m=new Map();if(!col)return m;S.meta.rows.forEach(r=>{const k=String(r[col]??"").trim();if(k!==""){if(!m.has(k))m.set(k,r);const lk=k.toLowerCase();if(!m.has("\u0001"+lk))m.set("\u0001"+lk,r)}});return m}
function lookupIn(m,k){if(k==null)return null;k=String(k).trim();return m.get(k)||m.get("\u0001"+k.toLowerCase())||null}
function pwsCols(){const f=k=>S.meta.columns.find(c=>k.includes(normCol(c)));return{p:f(["person","host","participant"]),w:f(["week","wk","timepoint"]),s:f(["bodysite","site","body_site","location"]),t:f(["type","sampletype","seqtype"])}}
const bv=v=>{const x=num(v);return isFinite(x)?String(x):String(v??"").trim().toLowerCase()};
function buildBorrow(){S.borrowCache=new Map();S.borrowIdx=new Map();const c=pwsCols();S.pws=c;if(!c.p||!c.w||!c.s)return;
  const fs=new Set(S.freqSamples);const key=r=>bv(r[c.p])+"|"+bv(r[c.w])+"|"+bv(r[c.s]);
  const score=r=>(c.t&&/pop/i.test(String(r[c.t]))?2:0)+(fs.has(String(r[S.sampleKey]??"").trim())?2:0)+S.meta.columns.filter(k=>!isNA(r[k])).length/1000;
  S.meta.rows.forEach(r=>{const k=key(r);const o=S.borrowIdx.get(k);if(!o||score(r)>score(o))S.borrowIdx.set(k,r)})}
function metaOfTip(n){const base=lookupIn(S.mTip,n.orig!=null?n.orig:n.name);if(!base||!S.opts.borrow||!S.borrowIdx||!S.borrowIdx.size)return base;
  if(S.borrowCache.has(base))return S.borrowCache.get(base);const c=S.pws;
  const m=S.borrowIdx.get(bv(base[c.p])+"|"+bv(base[c.w])+"|"+bv(base[c.s]));let out=base;
  if(m&&m!==base){const add=S.meta.columns.filter(k=>isNA(base[k])&&!isNA(m[k]));
    if(add.length){out=Object.assign({},base);add.forEach(k=>out[k]=m[k]);Object.defineProperty(out,"__from",{value:String(m[S.sampleKey||S.tipKey]??""),enumerable:false});Object.defineProperty(out,"__borrowed",{value:new Set(add),enumerable:false})}}
  S.borrowCache.set(base,out);return out}
const metaOfSample=s=>lookupIn(S.mSample,s);
function bestKey(cands){if(!S.meta.columns.length)return"";const set=new Set(cands.map(x=>String(x).trim().toLowerCase()));let best=S.meta.columns[0],sc=-1;
  S.meta.columns.forEach(c=>{let k=0;S.meta.rows.forEach(r=>{if(set.has(String(r[c]??"").trim().toLowerCase()))k++});if(k>sc){sc=k;best=c}});return best}
function analyseColumns(){
  S.colAuto={};S.numInfo={};S.catColors={};
  S.meta.columns.forEach(c=>{
    const vals=S.meta.rows.map(r=>r[c]).filter(v=>!isNA(v));const uniq=[...new Set(vals.map(String))];
    const nums=vals.map(num).filter(isFinite);const isNum=vals.length>0&&nums.length>=.9*vals.length;
    if(isNum){const pos=nums.filter(x=>x>0);S.numInfo[c]={min:Math.min(...nums),max:Math.max(...nums),minPos:pos.length?Math.min(...pos):1e-6}}
    S.colAuto[c]=isNum&&uniq.length>15?"grad":"cat";
    uniq.sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
    S.catColors[c]={};uniq.slice(0,500).forEach((v,i)=>S.catColors[c][v]=PAL[i%PAL.length])})}
const colType=c=>S.colOverride[c]||S.colAuto[c]||"cat";
function colourFor(col,v){
  if(isNA(v))return null;const t=colType(col);
  if(t==="grad"||t==="glog"){const x=num(v),ni=S.numInfo[col];if(!ni||!isFinite(x))return null;
    let f;if(t==="glog"){const lo=Math.log10(ni.minPos),hi=Math.log10(Math.max(ni.max,ni.minPos*10));f=(Math.log10(Math.max(x,ni.minPos))-lo)/((hi-lo)||1)}else f=(x-ni.min)/((ni.max-ni.min)||1);
    return gradAt(S.opts.grad,f)}
  const m=S.catColors[col]||(S.catColors[col]={});const k=String(v);if(!m[k])m[k]=PAL[Object.keys(m).length%PAL.length];return m[k]}

/* ---------------------------------------------------------------- frequency table */
const FIELD_ALIASES={sample:["sample","sampleid","sample_uid","sampleuid"],node:["node","nodename","clade"],
  freq:["derivedallelefrequency","frequency","freq","af","alleleFrequency"],truePos:["truepos","position","pos"],
  rel:["relativepos","relpos"],allele:["derivedallele","allele"],depth:["depth","dp","coverage"],lofreq:["inlofreqvcf","lofreq"],rowType:["rowtype"]};
function findCol(cols,key){const al=FIELD_ALIASES[key].map(normCol);for(const a of al){const c=cols.find(c=>normCol(c)===a);if(c)return c}return null}
function loadFreqTable(tab){
  const cols=tab.columns,cS=findCol(cols,"sample"),cN=findCol(cols,"node");
  if(cS&&cN){
    const cF=findCol(cols,"freq");if(!cF)throw new Error("Frequency table needs a frequency column (derived_allele_frequency / frequency)");
    const cP=findCol(cols,"truePos"),cR=findCol(cols,"rel"),cA=findCol(cols,"allele"),cD=findCol(cols,"depth"),cL=findCol(cols,"lofreq"),cT=findCol(cols,"rowType");
    const sumCols=cols.filter(c=>/^summary_/.test(c));
    const rows=tab.rows.map(r=>{const allele=cA?String(r[cA]).toUpperCase():"";
      const o={raw:r,Sample:String(r[cS]).trim(),node:String(r[cN]).trim(),pos:cP?normPos(r[cP]):"",rel:cR?num(r[cR]):NaN,allele,
        freq:num(r[cF]),depth:cD?num(r[cD]):NaN,lofreq:cL?(num(r[cL])||0):0,type:cT&&String(r[cT]).trim()?String(r[cT]).trim():"site",
        reads:allele&&r[allele]!==undefined?num(r[allele]):NaN};
      sumCols.forEach(c=>o[c.replace(/^summary_/,"s_")]=num(r[c]));return o}).filter(o=>o.Sample&&o.node);
    S.freq=rows;S.freqCols=cols;S.wide=null;
    S.fIdx=new Map();rows.forEach(o=>{let m=S.fIdx.get(o.Sample);if(!m)S.fIdx.set(o.Sample,m=new Map());let a=m.get(o.node);if(!a)m.set(o.node,a=[]);a.push(o)});
    S.freqSamples=[...S.fIdx.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    S.freqNodes=[...new Set(rows.map(o=>o.node))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    S.selSamples=S.selSamples.filter(s=>S.fIdx.has(s));S.opts.hideNodes=[];
    return`${rows.length} rows · ${S.freqSamples.length} samples · ${S.freqNodes.length} nodes`}
  // otherwise: wide per-tip value table (rows = tips, numeric columns)
  const tipNames=S.root?tipsOf(S.root).map(t=>t.orig??t.name):[];const set=new Set(tipNames.map(x=>x.toLowerCase()));
  let id=cols[0],sc=-1;cols.forEach(c=>{const k=tab.rows.filter(r=>set.has(String(r[c]).trim().toLowerCase())).length;if(k>sc){sc=k;id=c}});
  const numCols=cols.filter(c=>c!==id&&tab.rows.filter(r=>isFinite(num(r[c]))).length>=.5*tab.rows.length);
  const m=new Map();tab.rows.forEach(r=>{const k=String(r[id]).trim();const o={};numCols.forEach(c=>o[c]=num(r[c])||0);m.set(k,o);m.set("\u0001"+k.toLowerCase(),o)});
  S.wide={id,columns:numCols,rows:m};S.freq=null;S.fIdx=new Map();S.freqSamples=[];S.freqNodes=[];S.selSamples=[];
  S.opts.wideCols=numCols.slice(0,15);
  return`No Sample+node columns, so loaded as a per-tip value table (${numCols.length} numeric columns, matched on “${id}”)`}
function normPos(v){if(isNA(v))return"";const s=String(v).trim(),n=Number(s);return isFinite(n)&&Number.isInteger(n)?String(n):s}
function parsePosList(t){return new Set(String(t||"").split(/[\s,;]+/).map(normPos).filter(Boolean))}
const wideOf=n=>S.wide?lookupIn(S.wide.rows,n.orig??n.name):null;

/* filtered rows for selected samples: Map node -> Map sample -> rows */
function filteredFreq(){
  const o=S.opts,out=new Map();if(!S.freq||!S.selSamples.length)return out;
  const hidden=new Set(o.hideNodes),pos=parsePosList(o.posList);
  for(const s of S.selSamples){const m=S.fIdx.get(s);if(!m)continue;
    for(const[node,rows]of m){if(hidden.has(node))continue;
      const keep=rows.filter(r=>{
        if(r.type==="site"){if(!isFinite(r.freq))return false;
          if(pos.size&&o.posMode==="Include"&&!pos.has(r.pos))return false;
          if(pos.size&&o.posMode==="Exclude"&&pos.has(r.pos))return false;
          if(o.minDepth>0&&!(r.depth>=o.minDepth))return false;
          if(o.lofreq&&r.lofreq!==1)return false}
        return true});
      if(!keep.length)continue;let a=out.get(node);if(!a)out.set(node,a=new Map());a.set(s,keep)}}
  if(o.shared&&S.selSamples.length>1){
    for(const[node,m]of out){const sets=S.selSamples.map(s=>new Set((m.get(s)||[]).filter(r=>r.type==="site").map(r=>r.pos)));
      const common=new Set([...sets[0]].filter(p=>sets.every(st=>st.has(p))));
      for(const[s,rows]of m){const k=rows.filter(r=>r.type!=="site"||common.has(r.pos));if(k.length)m.set(s,k);else m.delete(s)}
      if(!m.size)out.delete(node)}}
  return out}
function statOf(rows){
  const site=rows.filter(r=>r.type==="site"&&isFinite(r.freq)).map(r=>r.freq);
  if(site.length){const s=[...site].sort((a,b)=>a-b);const med=s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;
    return{mean:s.reduce((a,b)=>a+b,0)/s.length,median:med,max:s[s.length-1],min:s[0],n:s.length}}
  const sm=rows.find(r=>r.type!=="site");if(sm)return{mean:sm.s_mean_frequency,median:sm.s_median_frequency,max:sm.s_max_frequency,min:sm.s_min_frequency,n:sm.s_n_sites};
  return null}
function positionOrder(node,m){
  const o=S.opts,info=new Map();
  for(const[s,rows]of m)rows.forEach(r=>{if(r.type!=="site")return;let x=info.get(r.pos);if(!x)info.set(r.pos,x={pos:r.pos,rel:r.rel,sum:0,n:0,by:{}});x.sum+=r.freq;x.n++;x.by[s]=Math.max(x.by[s]??-1,r.freq)});
  const arr=[...info.values()];const relCmp=(a,b)=>(isFinite(a.rel)?a.rel:1e18)-(isFinite(b.rel)?b.rel:1e18)||String(a.pos).localeCompare(String(b.pos),undefined,{numeric:true});
  if(o.sort==="rel")arr.sort(relCmp);
  else if(o.sort==="priority")arr.sort((a,b)=>{for(const s of S.selSamples){const d=(b.by[s]??-1)-(a.by[s]??-1);if(d)return d}return relCmp(a,b)});
  else arr.sort((a,b)=>(b.sum/b.n)-(a.sum/a.n)||b.n-a.n||relCmp(a,b));
  return arr.map(x=>x.pos)}
function sampleLabel(s){const cols=S.opts.labelCols.filter(c=>c!=="__name");const m=metaOfSample(s);if(!m||!cols.length)return[{t:s,c:null}];
  const parts=cols.filter(c=>!isNA(m[c])).map(c=>({t:dispVal(m[c]),c:colourFor(c,m[c])}));return parts.length?parts:[{t:s,c:null}]}

/* ---------------------------------------------------------------- layout */
let G={};
function capLen(n){const o=S.opts;let l=n.len==null?(o.scale==="phylo"&&hasLengths()?0:1):n.len;if(o.scale!=="phylo")l=1;if(o.cap>0)l=Math.min(l,o.cap);return Math.max(0,l)}
let _hasLen=null;function hasLengths(){if(_hasLen===null)_hasLen=allNodes().some(n=>n.parent&&n.len!=null&&n.len>0);return _hasLen}
function xform(v,max){const o=S.opts;if(o.xform==="log1p")v=Math.log1p(v);else if(o.xform==="sqrt")v=Math.sqrt(Math.max(v,0));
  if(o.boost>0&&max>0){const mx=o.xform==="log1p"?Math.log1p(max):o.xform==="sqrt"?Math.sqrt(max):max;v=mx*Math.log1p(o.boost*(v/mx))/Math.log1p(o.boost)}return v}
function layout(){
  const o=S.opts;S.byId={};_hasLen=null;
  (function pre(n){S.byId[n.id]=n;n.rx=n.parent?n.parent.rx+capLen(n):0;n.children.forEach(pre)})(S.root);
  (function h(n){n.h=isTip(n)?0:1+Math.max(...n.children.map(h));return n.h})(S.root);
  if(o.scale==="clado"){const H=S.root.h;allNodes().forEach(n=>n.rx=H-n.h)}
  const maxRaw=Math.max(...allNodes().map(n=>n.rx))||1;
  allNodes().forEach(n=>n.xv=xform(n.rx,maxRaw));
  let r=0;const vis=[];
  (function walk(n){if(isTip(n)||n.collapsed){n.row=r++;vis.push(n);return}n.children.forEach(walk);n.row=(n.children[0].row+n.children[n.children.length-1].row)/2})(S.root);
  (function xm(n){n.xmax=isTip(n)?n.xv:Math.max(...n.children.map(xm));return n.xmax})(S.root);
  const maxXV=S.root.xmax||1;const nr=Math.max(1,r);
  const L=o.layout,W=o.treeW,rh=o.rowH;
  if(L==="rect"||L==="slant"){const sx=W/maxXV;allNodes().forEach(n=>{n.X=n.xv*sx;n.Y=n.row*rh;n.ang=0})}
  else if(L==="circ"){const sr=W/maxXV,arc=o.arc,full=arc>=359.5;
    const th=row=>o.rot-90+(full?(row+.5)/nr*360:(nr>1?row/(nr-1):.5)*arc);
    allNodes().forEach(n=>{n.R=o.innerR+n.xv*sr;n.TH=th(n.row);const a=n.TH*Math.PI/180;n.X=n.R*Math.cos(a);n.Y=n.R*Math.sin(a);n.ang=n.TH})}
  else{ // radial / unrooted equal-angle
    const sc=W/maxXV;const cnt=n=>(isTip(n)||n.collapsed)?1:n.children.reduce((s,c)=>s+cnt(c),0);
    S.root.X=0;S.root.Y=0;S.root.ang=0;
    (function place(n,a0,a1){if(isTip(n)||n.collapsed)return;const tot=cnt(n);let a=a0;
      n.children.forEach(c=>{const w=(a1-a0)*cnt(c)/tot,mid=a+w/2;const d=(c.xv-n.xv)*sc;
        c.X=n.X+d*Math.cos(mid);c.Y=n.Y+d*Math.sin(mid);c.ang=mid*180/Math.PI;place(c,a,a+w);a+=w})})(S.root,o.rot*Math.PI/180,o.rot*Math.PI/180+2*Math.PI);
    allNodes().forEach(n=>{if(!isFinite(n.X)){n.X=n.parent?n.parent.X:0;n.Y=n.parent?n.parent.Y:0;n.ang=0}})}
  G={vis,rows:r,maxXV,maxRaw};}
function isVisible(n){for(let p=n.parent;p;p=p.parent)if(p.collapsed)return false;return true}
function rowRange(n){if(isTip(n)||n.collapsed)return[n.row,n.row];return[rowRange(n.children[0])[0],rowRange(n.children[n.children.length-1])[1]]}
const pol=(r,deg)=>{const a=deg*Math.PI/180;return[r*Math.cos(a),r*Math.sin(a)]};
function branchPath(n){const p=n.parent,L=S.opts.layout;
  if(L==="rect")return`M${p.X},${p.Y}V${n.Y}H${n.X}`;
  if(L==="circ"){const[x1,y1]=pol(p.R,p.TH),[x2,y2]=pol(p.R,n.TH);const d=n.TH-p.TH;
    if(Math.abs(d)<1e-6)return`M${x1},${y1}L${n.X},${n.Y}`;
    return`M${x1},${y1}A${p.R},${p.R} 0 ${Math.abs(d)>180?1:0} ${d>0?1:0} ${x2},${y2}L${n.X},${n.Y}`}
  return`M${p.X},${p.Y}L${n.X},${n.Y}`}
function branchHit(n){const p=n.parent,L=S.opts.layout;
  if(L==="rect")return`M${p.X},${n.Y}H${n.X}`;if(L==="circ"){const[x,y]=pol(p.R,n.TH);return`M${x},${y}L${n.X},${n.Y}`}return`M${p.X},${p.Y}L${n.X},${n.Y}`}
function branchMid(n){const p=n.parent,L=S.opts.layout;
  if(L==="rect")return[(p.X+n.X)/2,n.Y];if(L==="circ")return pol((p.R+n.R)/2,n.TH);return[(p.X+n.X)/2,(p.Y+n.Y)/2]}

/* ---------------------------------------------------------------- rendering */
function tipLabelParts(n){const cols=S.opts.labelCols;if(!cols.length)return[{t:n.name,c:null}];const m=metaOfTip(n);const out=[];
  cols.forEach(c=>{if(c==="__name")out.push({t:n.name,c:null});else if(m&&!isNA(m[c]))out.push({t:dispVal(m[c]),c:colourFor(c,m[c])})});
  return out.length?out:[{t:n.name,c:null}]}
const partsText=p=>p.map(x=>x.t).join(" | ");
function tspans(parts,base){return parts.map((p,i)=>(i?`<tspan fill="#9ca3af"> | </tspan>`:"")+`<tspan fill="${p.c||base}">${esc(p.t)}</tspan>`).join("")}
function metaTip(n){const m=metaOfTip(n);let s=n.name;if(n.orig&&n.orig!==n.name)s+=` (orig: ${n.orig})`;if(m){S.meta.columns.forEach(c=>s+=`\n${c}: ${isNA(m[c])?"NA":dispVal(m[c])}${m.__borrowed&&m.__borrowed.has(c)?"  ← from "+m.__from:""}`)}else if(S.meta.columns.length)s+="\n(no metadata row for this tip)";return s}

function render(){
  const svg=$("svg");$("empty").style.display=S.root?"none":"flex";if(!S.root){svg.innerHTML="";return}
  layout();
  const o=S.opts,fs=o.fs,L=o.layout,vis=G.vis,lw=o.lw;
  const rectish=L==="rect"||L==="slant";
  const ff=filteredFreq();
  const nodeByKey=new Map();allNodes().forEach(n=>{if(!isVisible(n))return;if(n.key)nodeByKey.set(n.key,n);(n.alias||[]).forEach(a=>nodeByKey.set(a,n))});const rowsUsed=new Map();
  // branch colouring by frequency
  let brVal=null;if(o.brSample&&ff.size){brVal=new Map();for(const[node,m]of ff){const r=m.get(o.brSample);if(r){const st=statOf(r);if(st)brVal.set(node,st[o.fstat==="n"?"mean":o.fstat])}}}
  const P=[];// layers
  const Lhl=[],Lui=[],Lbr=[],Lnd=[],Ltip=[],Ldec=[],Lfreq=[],Llab=[],Lhit=[];
  // ---- branches & internal nodes
  (function draw(n){
    if(n.parent){let col=n.bcolor||"#222",w=n.bwidth||lw;
      const bk=brVal?[n.key,...(n.alias||[])].find(k=>k&&brVal.has(k)):null;if(bk&&!n.bcolor){col=gradAt(o.fgrad,brVal.get(bk));w=Math.max(w,lw*2.2)}
      const d=branchPath(n);
      if(S.sel.has(n.id))Lui.push(`<path class="ui" d="${d}" fill="none" stroke="#f59e0b" stroke-opacity=".6" stroke-width="${w+7}" stroke-linecap="round"/>`);
      Lbr.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`);
      const tt=`${[n.key,...(n.alias||[])].filter(Boolean).join(" = ")||n.lab||n.name||"branch"}\nlength: ${n.len==null?"–":fmtL(n.len)}`+(bk?`\n${o.brSample} ${o.fstat}: ${fmtN(brVal.get(bk))}`:"")+((n.alias||[]).length?`\nalso: ${n.alias.join(", ")}`:"");
      Lhit.push(`<path class="ui" data-id="${n.id}" data-tt="${esc(tt)}" d="${branchHit(n)}" stroke="#000" stroke-opacity="0" stroke-width="${Math.max(10,lw+8)}" fill="none" style="cursor:pointer"/>`);
      if(o.cap>0&&o.scale==="phylo"&&n.len>o.cap){const[mx,my]=branchMid(n);Lbr.push(`<text x="${mx}" y="${my+4}" text-anchor="middle" font-size="${fs+2}" font-weight="700" fill="#b91c1c" font-family="${FONT}" data-tt="${esc('Branch shortened for display: true length '+fmtL(n.len)+' (cap '+o.cap+')')}">//</text>`)}
      if(o.brLen&&n.len!=null){const[mx,my]=branchMid(n);Llab.push(`<text x="${mx+o.blx}" y="${my+o.bly}" text-anchor="middle" font-size="${Math.max(7,fs-2)}" fill="#6b7280" font-family="${FONT}">${esc(+n.len.toFixed(o.blDec))}</text>`)}}
    else if(rectish)Lbr.push(`<path d="M${n.X-12},${n.Y}H${n.X}" stroke="${n.bcolor||"#222"}" stroke-width="${lw}"/>`);
    if(isTip(n)||n.collapsed)return;
    if(o.nodeDots)Lnd.push(`<circle cx="${n.X}" cy="${n.Y}" r="${Math.max(2.5,lw+1)}" fill="#fff" stroke="#222" stroke-width="1"/>`);
    Lhit.push(`<circle class="ui" data-id="${n.id}" data-tt="${esc((n.lab||n.key||"node")+"\n"+nTips(n)+" tips")}" cx="${n.X}" cy="${n.Y}" r="${Math.max(4.5,lw+3)}" fill="${S.sel.has(n.id)?"#f59e0b":"#000"}" fill-opacity="${S.sel.has(n.id)?.85:0}" style="cursor:pointer"/>`);
    if(o.nodeLabels&&(n.lab||n.key))Llab.push(`<text x="${n.X+o.nlx}" y="${n.Y+o.nly}" text-anchor="end" font-size="${Math.max(7,fs-2)}" fill="#374151" font-family="${FONT}">${esc(n.lab||n.key)}</text>`);
    else if(o.sup&&n.lab&&n.parent){const v=parseFloat(n.lab);if(!isNaN(v)&&v>=o.supMin)Llab.push(`<text x="${n.X-3}" y="${n.Y-3}" text-anchor="end" font-size="${Math.max(7,fs-3)}" fill="#6b7280" font-family="${FONT}">${esc(n.lab)}</text>`)}
    n.children.forEach(draw)})(S.root);

  // ---- tips and tip-side decorations (local frame)
  const labW=o.showTips?Math.max(0,...vis.map(n=>isTip(n)?partsText(tipLabelParts(n)).length:(n.cl||n.lab||"").length+10))*fs*.58:0;
  const alignPos=rectish?Math.max(...vis.map(n=>n.X)):L==="circ"?Math.max(...vis.map(n=>n.R)):0;
  const dotCols=o.dots.filter(c=>S.meta.columns.includes(c));
  const wideCols=S.wide?o.wideCols.filter(c=>S.wide.columns.includes(c)):[];
  const ds=o.dotSize;let colStart=(o.showTips?o.tipOff+labW+8:o.tipOff+4);
  const dotX=dotCols.map((c,i)=>colStart+i*(ds+3)+ds/2);let wideX0=colStart+dotCols.length*(ds+3)+(dotCols.length?8:0);
  const wideW=wideCols.length?(o.wideMode==="stack"?o.wideW:wideCols.length*Math.max(8,o.rowH-2)):0;
  const decoEnd=wideX0+wideW;
  let wideDen=1;if(wideCols.length&&!o.wideNorm){let mx=0;vis.forEach(n=>{const w=wideOf(n);if(w)mx=Math.max(mx,wideCols.reduce((s,c)=>s+(w[c]||0),0))});wideDen=mx<=1.0001?1:mx<=100.0001?100:mx||1}
  let heatMax=0;if(wideCols.length)vis.forEach(n=>{const w=wideOf(n);if(w)wideCols.forEach(c=>heatMax=Math.max(heatMax,w[c]||0))});heatMax=heatMax||1;
  G.extentX=(rectish?alignPos:0)+((dotCols.length||wideCols.length)?decoEnd:(o.showTips?o.tipOff+labW:0));
  G.extentR=alignPos+((dotCols.length||wideCols.length)?decoEnd:(o.showTips?o.tipOff+labW:0));
  vis.forEach(n=>{
    const ang=L==="radial"?(n.ang||0):L==="circ"?n.TH:0;
    const own=rectish?n.X:L==="circ"?n.R:0;const dA=(L==="radial")?0:alignPos-own;
    const flip=(L==="circ"||L==="radial")&&(((ang%360)+360)%360>90&&((ang%360)+360)%360<270);
    const gOpen=`<g transform="translate(${n.X},${n.Y}) rotate(${ang})">`,gFlip=`<g transform="translate(${n.X},${n.Y}) rotate(${ang+180})">`;
    if(!isTip(n)){ // collapsed clade
      const ext=Math.max(8,(n.xmax-n.xv)*(rectish||L==="circ"?(o.treeW/G.maxXV):(o.treeW/G.maxXV))),hh=Math.max(3,o.rowH*.42),col=n.bcolor||"#555";
      const tri=`<polygon points="0,0 ${ext},${-hh} ${ext},${hh}" fill="${col}" fill-opacity=".3" stroke="${col}"/>`;
      Ltip.push(gOpen+tri+`<polygon class="ui" data-id="${n.id}" data-tt="${esc((n.cl||n.lab||"collapsed clade")+"\n"+nTips(n)+" tips")}" points="0,0 ${ext},${-hh} ${ext},${hh}" fill="#000" fill-opacity="0" style="cursor:pointer"/>`+(S.sel.has(n.id)?`<polygon class="ui" points="0,0 ${ext},${-hh} ${ext},${hh}" fill="none" stroke="#f59e0b" stroke-width="3"/>`:"")+"</g>");
      if(o.showTips){const t=`${n.cl||n.lab||""}${n.cl||n.lab?" ":""}(${nTips(n)} tips)`,x=Math.max(ext,o.align?dA:0)+o.tipOff;
        Ltip.push(flip?gFlip+`<text x="${-x}" y="${fs*.35}" text-anchor="end" font-size="${fs}" font-style="italic" fill="#333" font-family="${FONT}">${esc(t)}</text></g>`:gOpen+`<text x="${x}" y="${fs*.35}" font-size="${fs}" font-style="italic" fill="#333" font-family="${FONT}">${esc(t)}</text></g>`)}
      return}
    const m=metaOfTip(n);const tcol=o.cby&&m?colourFor(o.cby,m[o.cby]):null;
    const parts=tipLabelParts(n);const base=n.tcolor||(o.clab&&tcol?tcol:"#1f2937");
    const lx=(o.align&&L!=="radial"?dA:0)+o.tipOff;let s="";
    if(o.align&&L!=="radial"&&o.showTips&&dA>2)s+=`<path d="M${tcol?5:1},0H${dA}" stroke="#c7ccd4" stroke-width=".7" stroke-dasharray="1.5 2.5"/>`;
    if(tcol)s+=`<circle cx="0" cy="0" r="${Math.max(2.5,Math.min(o.rowH*.3,7))}" fill="${tcol}" stroke="#333" stroke-width=".5"/>`;
    dotCols.forEach((c,i)=>{const v=m?m[c]:undefined,col=colourFor(c,v),x=dA+dotX[i];const t=esc(`${n.name}\n${c}: ${isNA(v)?"NA (no value for this tip)":dispVal(v)}${m&&m.__borrowed&&m.__borrowed.has(c)?"\n(from population sample "+m.__from+")":""}`);
      s+=o.dotShape==="square"?`<rect x="${x-ds/2}" y="${-ds/2}" width="${ds}" height="${ds}" fill="${col||"#fff"}" stroke="${col?"#333":"#cbd5e1"}" stroke-width=".5" data-tt="${t}"/>`
        :`<circle cx="${x}" cy="0" r="${ds/2}" fill="${col||"#fff"}" stroke="${col?"#333":"#cbd5e1"}" stroke-width=".5" data-tt="${t}"/>`});
    if(wideCols.length){const w=wideOf(n);const x0=dA+wideX0,h=Math.max(3,o.rowH-3);
      if(o.wideMode==="stack"){s+=`<rect x="${x0}" y="${-h/2}" width="${o.wideW}" height="${h}" fill="#f3f4f6"/>`;
        if(w){const vals=wideCols.map(c=>Math.max(0,w[c]||0)),sum=vals.reduce((a,b)=>a+b,0),den=o.wideNorm?(sum||1):wideDen;let xx=x0;
          vals.forEach((v,i)=>{const ww=v/den*o.wideW;if(ww>0){s+=`<rect x="${xx}" y="${-h/2}" width="${ww}" height="${h}" fill="${wideColour(wideCols[i])}" data-tt="${esc(n.name+"\n"+wideCols[i]+": "+fmtN(v,4))}"/>`;xx+=ww}})}}
      else{const cw=Math.max(8,o.rowH-2);wideCols.forEach((c,i)=>{const v=w?(w[c]||0):NaN;s+=`<rect x="${x0+i*cw}" y="${-h/2}" width="${cw-1}" height="${h}" fill="${w?gradAt(o.fgrad,v/heatMax):"#f3f4f6"}" data-tt="${esc(n.name+"\n"+c+": "+fmtN(v,4))}"/>`})}}
    if(S.sel.has(n.id))s+=`<rect class="ui" x="${lx-3}" y="${-o.rowH/2+1}" width="${partsText(parts).length*fs*.58+6}" height="${o.rowH-2}" fill="#f59e0b" fill-opacity=".3" rx="3"/>`;
    Ltip.push(gOpen+s+"</g>");
    if(o.showTips){const tw=partsText(parts).length*fs*.58;
      const txt=flip?`<text x="${-lx}" y="${fs*.35}" text-anchor="end" font-size="${fs}" fill="${base}" font-family="${FONT}">${tspans(parts,base)}</text>`
                    :`<text x="${lx}" y="${fs*.35}" font-size="${fs}" fill="${base}" font-family="${FONT}">${tspans(parts,base)}</text>`;
      const hit=flip?`<rect class="ui" data-id="${n.id}" data-tt="${esc(metaTip(n))}" x="${-lx-tw-2}" y="${-o.rowH/2}" width="${tw+4}" height="${o.rowH}" fill="#000" fill-opacity="0" style="cursor:pointer"/>`
                    :`<rect class="ui" data-id="${n.id}" data-tt="${esc(metaTip(n))}" x="${lx-2}" y="${-o.rowH/2}" width="${tw+4}" height="${o.rowH}" fill="#000" fill-opacity="0" style="cursor:pointer"/>`;
      Ltip.push((flip?gFlip:gOpen)+txt+"</g>");Lhit.push((flip?gFlip:gOpen)+hit+"</g>")}
    else Lhit.push(`<circle class="ui" data-id="${n.id}" data-tt="${esc(metaTip(n))}" cx="${n.X}" cy="${n.Y}" r="6" fill="#000" fill-opacity="0" style="cursor:pointer"/>`)});
  // ---- highlight clades
  allNodes().forEach(n=>{if(!n.hl||!isVisible(n))return;
    if(rectish){const[a,b]=rowRange(n);const x0=(n.parent?n.parent.X:n.X)+(n.parent?(n.X-n.parent.X)*.5:0)-2;
      Lhl.push(`<rect x="${x0}" y="${a*o.rowH-o.rowH/2}" width="${G.extentX-x0+8}" height="${(b-a+1)*o.rowH}" fill="${n.hl}" fill-opacity=".45" rx="3"/>`)}
    else if(L==="circ"){const[a,b]=rowRange(n);const nr=G.rows,full=o.arc>=359.5;const step=full?360/nr:(nr>1?o.arc/(nr-1):o.arc);
      const t0=vis[a].TH-step/2,t1=vis[b].TH+step/2,r0=(n.parent?(n.parent.R+n.R)/2:n.R),r1=G.extentR+6;
      const[ax,ay]=pol(r0,t0),[bx,by]=pol(r1,t0),[cx,cy]=pol(r1,t1),[dx,dy]=pol(r0,t1);const lg=(t1-t0)>180?1:0;
      Lhl.push(`<path d="M${ax},${ay}L${bx},${by}A${r1},${r1} 0 ${lg} 1 ${cx},${cy}L${dx},${dy}A${r0},${r0} 0 ${lg} 0 ${ax},${ay}Z" fill="${n.hl}" fill-opacity=".45"/>`)}
    else descendants(n).forEach(d=>{if(d.parent&&isVisible(d))Lhl.push(`<path d="${branchPath(d)}" fill="none" stroke="${n.hl}" stroke-opacity=".6" stroke-width="${lw+12}" stroke-linecap="round"/>`)})});
  // column headers (rectangular only)
  if(rectish){const yTop=-o.rowH/2-6;const hdr=(x,t)=>`<text transform="translate(${x},${yTop}) rotate(-50)" font-size="${Math.max(8,fs-1)}" fill="#333" font-family="${FONT}">${esc(t)}</text>`;
    dotCols.forEach((c,i)=>Ldec.push(hdr(alignPos+dotX[i]+2,c)));
    if(wideCols.length){if(o.wideMode==="stack")Ldec.push(`<text x="${alignPos+wideX0}" y="${yTop}" font-size="${fs}" font-weight="600" font-family="${FONT}">${esc(S.wide.id?"Tip values":"")}</text>`);
      else wideCols.forEach((c,i)=>Ldec.push(hdr(alignPos+wideX0+i*Math.max(8,o.rowH-2)+3,c)))}}
  // clade labels
  allNodes().forEach(n=>{if(!n.cl||!isVisible(n)||isTip(n)||n.collapsed)return;const[a,b]=rowRange(n);
    if(rectish){const x=G.extentX+10;Llab.push(`<path d="M${x},${a*o.rowH-o.rowH/2+2}V${(b+.5)*o.rowH-2}" stroke="#444" stroke-width="2"/><text x="${x+7}" y="${(a+b)/2*o.rowH+fs*.35}" font-size="${fs+1}" font-weight="700" font-family="${FONT}">${esc(n.cl)}</text>`)}
    else if(L==="circ"){const r=G.extentR+12,t0=vis[a].TH,t1=vis[b].TH;const[x0,y0]=pol(r,t0),[x1,y1]=pol(r,t1);const[tx,ty]=pol(r+10,(t0+t1)/2);const mid=(((t0+t1)/2%360)+360)%360;
      Llab.push(`<path d="M${x0},${y0}A${r},${r} 0 ${t1-t0>180?1:0} 1 ${x1},${y1}" fill="none" stroke="#444" stroke-width="2"/><text x="${tx}" y="${ty}" text-anchor="${mid>90&&mid<270?"end":"start"}" font-size="${fs+1}" font-weight="700" font-family="${FONT}">${esc(n.cl)}</text>`)}
    else Llab.push(`<text x="${n.X}" y="${n.Y-6}" font-size="${fs+1}" font-weight="700" font-family="${FONT}">${esc(n.cl)}</text>`)});

  // ---- population frequencies on branches
  if(ff.size&&o.fmode!=="off"){
    const wantBars=(o.fmode==="bars"||o.fmode==="both")&&rectish,wantVals=o.fmode==="values"||o.fmode==="both"||!rectish;
    for(const[node,m]of ff){const n=nodeByKey.get(node);if(!n)continue;
      const[mx0,my]=n.parent?branchMid(n):[n.X,n.Y];const mx=mx0+(rectish?o.barShift:0);
      if(wantBars){const order=positionOrder(node,m);const pi=new Map(order.map((p,i)=>[p,i]));
        const xs=mx-(order.length-1)*o.barGap/2;let k=rowsUsed.get(n.id)||0;
        for(const s of S.selSamples){const rows=m.get(s);if(!rows)continue;const col=S.sampleColors[s]||"#1f77b4";
          const sums=rows.filter(r=>r.type!=="site");const sites=rows.filter(r=>r.type==="site"&&r.freq>=o.minFreq);
          if(sums.length){const r=sums[0];if(!isFinite(r.s_max_frequency)||r.s_max_frequency<o.minFreq)continue;
            const base=my+(k+1)*o.rowGap;k++;const W=o.rangeW,x0=mx;const X=v=>x0+(isFinite(v)?v:0)*W,yy=base-o.barH/2;
            const tt=esc(`Node: ${node}\nSample: ${s}\nsites with data: ${fmtN(r.s_n_sites,0)} / total ${fmtN(r.s_total_node_sites,0)}\nsegregating: ${fmtN(r.s_n_segregating_sites,0)}\nmin/Q1/median/Q3/max: ${[r.s_min_frequency,r.s_q1_frequency,r.s_median_frequency,r.s_q3_frequency,r.s_max_frequency].map(v=>fmtN(v,4)).join(" / ")}\nmean: ${fmtN(r.s_mean_frequency,4)}`);
            Lfreq.push(`<path d="M${x0},${yy}H${x0+W}M${x0},${yy-4}V${yy+4}M${x0+W},${yy-4}V${yy+4}" stroke="#9ca3af" stroke-width="1"/>`+
              `<path d="M${X(r.s_min_frequency)},${yy}H${X(r.s_max_frequency)}" stroke="${col}" stroke-width="3" data-tt="${tt}"/>`+
              `<path d="M${X(isFinite(r.s_q1_frequency)?r.s_q1_frequency:r.s_min_frequency)},${yy}H${X(isFinite(r.s_q3_frequency)?r.s_q3_frequency:r.s_max_frequency)}" stroke="${col}" stroke-opacity=".6" stroke-width="7" data-tt="${tt}"/>`+
              `<path d="M${X(r.s_median_frequency)},${yy-4}l4,4l-4,4l-4,-4Z" fill="#111" data-tt="${tt}"/>`+
              `<text x="${x0+W+6}" y="${yy+3}" font-size="${Math.max(7,fs-3)}" fill="#333" font-family="${FONT}">${fmtN(r.s_min_frequency,2)}–${fmtN(r.s_max_frequency,2)}</text>`);
            if(o.barLabels)Lfreq.push(`<text x="${x0-6}" y="${yy+3}" text-anchor="end" font-size="${Math.max(7,fs-2)}" font-family="${FONT}" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(node)} | ${tspans(sampleLabel(s),col)}</text>`);
            continue}
          if(!sites.length)continue;const base=my+(k+1)*o.rowGap;k++;
          let g="";const best=new Map();sites.forEach(r=>{const p=best.get(r.pos);if(!p||r.freq>p.freq)best.set(r.pos,r)});
          for(const r of best.values()){const i=pi.get(r.pos);if(i===undefined)continue;const x=xs+i*o.barGap-o.barW/2;const h=r.freq===0?0:Math.min(o.barH,Math.max(r.freq,.01)*o.barH);
            const tt=esc(`Node: ${node}\nSample: ${s}\nPosition: ${r.pos||"–"}${isFinite(r.rel)?" (relative "+r.rel+")":""}\nAllele: ${r.allele||"–"}\nFrequency: ${fmtN(r.freq,4)}\nDepth: ${isFinite(r.depth)?r.depth:"–"}\nDerived reads: ${isFinite(r.reads)?r.reads:"–"}\nLoFreq support: ${r.lofreq}`);
            g+=`<rect x="${x}" y="${base-o.barH}" width="${o.barW}" height="${o.barH}" fill="#fff" fill-opacity=".85" stroke="#8a8a8a" stroke-width=".6" data-tt="${tt}"/>`;
            if(h>0)g+=`<rect x="${x}" y="${base-h}" width="${o.barW}" height="${h}" fill="${col}" stroke="#222" stroke-width=".3" data-tt="${tt}"/>`}
          Lfreq.push(g);
          if(o.barLabels)Lfreq.push(`<text x="${xs-o.barGap}" y="${base-o.barH/2+3}" text-anchor="end" font-size="${Math.max(7,fs-2)}" font-family="${FONT}" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(node)} | ${tspans(sampleLabel(s),col)}</text>`)}
        rowsUsed.set(n.id,k)}
      if(wantVals){let k=0;for(const s of S.selSamples){const rows=m.get(s);if(!rows)continue;const st=statOf(rows);if(!st)continue;
        const v=o.fstat==="n"?st.n:st[o.fstat];if(o.fstat!=="n"&&isFinite(st.max)&&st.max<o.minFreq)continue;
        const txt=o.fstat==="n"?String(v):fmtN(v,2);const bw=txt.length*fs*.6+8,bh=fs+4;
        const off=wantBars?-(bh+4):6;const x=mx-bw/2,y=my+off+k*(bh+2)-(wantBars?k*2*(bh+2):0);k++;
        const fill=o.fstat==="n"?"#fff":gradAt(o.fgrad,v);const col=S.sampleColors[s]||"#1f77b4";
        const tt=esc(`Node: ${node}\nSample: ${s}\npositions: ${st.n}\nmean ${fmtN(st.mean,4)} · median ${fmtN(st.median,4)}\nmin ${fmtN(st.min,4)} · max ${fmtN(st.max,4)}`);
        Lfreq.push(`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${fill}" stroke="${col}" stroke-width="2" data-tt="${tt}"/><text x="${mx}" y="${y+bh/2+fs*.35}" text-anchor="middle" font-size="${fs-1}" font-weight="600" fill="${textOn(fill)}" font-family="${FONT}" pointer-events="none">${txt}</text>`)}}}}

  // ---- assemble, fit, scale bar, legend
  svg.setAttribute("viewBox","0 0 10 10");
  svg.innerHTML=`<g id="gTree">${Lhl.join("")}${Lui.join("")}${Lbr.join("")}${Lnd.join("")}${Ldec.join("")}${Ltip.join("")}${Llab.join("")}${Lfreq.join("")}${Lhit.join("")}</g><g id="gExtra"></g>`;
  let bb=$("gTree").getBBox();
  let extra="";
  const capped=o.cap>0&&allNodes().some(n=>n.parent&&n.len>o.cap);
  if(o.scaleBar&&o.scale==="phylo"&&o.xform==="linear"&&o.boost===0&&hasLengths()){
    const sx=o.treeW/G.maxXV;const len=niceLen(G.maxRaw*.2),px=len*sx,y=bb.y+bb.height+22,x=bb.x+10;
    extra+=`<path d="M${x},${y}H${x+px}M${x},${y-4}V${y+4}M${x+px},${y-4}V${y+4}" stroke="#222" stroke-width="1.2"/><text x="${x+px/2}" y="${y+15}" text-anchor="middle" font-size="${fs-1}" font-family="${FONT}">${+len.toPrecision(3)}</text>`+(capped?`<text x="${x+px+12}" y="${y+4}" font-size="${fs-1}" fill="#b91c1c" font-family="${FONT}">// = branch longer than ${o.cap}, shortened</text>`:"")}
  if(o.legend)extra+=legendSvg(bb.x+bb.width+30,bb.y+10,ff);
  $("gExtra").innerHTML=extra;
  bb=svg.getBBox();const pad=20;
  const vb=[bb.x-pad,bb.y-pad,bb.width+2*pad,bb.height+2*pad];
  svg.setAttribute("viewBox",vb.join(" "));S.vb=vb;
  svg.insertAdjacentHTML("afterbegin",`<rect class="bgr" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#fff"/>`);
  metaWarn();
  autosave();
  if(S.fitPending){S.fitPending=false;fitZoom()}else applyZoom()}
function metaWarn(){const el=$("metaWarn");if(!el)return;const o=S.opts;if(!S.root||!S.meta.columns.length){el.innerHTML="";return}
  const cols=[...new Set([o.cby,...o.dots,...o.labelCols].filter(c=>c&&c!=="__name"&&S.meta.columns.includes(c)))];const tips=tipsOf(S.root);const msg=[];
  cols.forEach(c=>{const k=tips.filter(t=>{const m=metaOfTip(t);return m&&!isNA(m[c])}).length;if(k<tips.length){const tot=S.meta.rows.filter(r=>!isNA(r[c])).length;
    msg.push(`<b>${esc(c)}</b>: ${k}/${tips.length} tips have a value${k===0&&tot<S.meta.rows.length?` (filled in only ${tot} of ${S.meta.rows.length} metadata rows – probably population samples only)`:""}.`)}});
  const unm=tips.filter(t=>!lookupIn(S.mTip,t.orig??t.name)).length;if(unm===tips.length){el.innerHTML=`None of the ${tips.length} tips match a metadata row – choose the right “Tip lookup column”.`;return}if(unm)msg.unshift(`${unm}/${tips.length} tips have no metadata row (e.g. ${esc(tips.find(t=>!lookupIn(S.mTip,t.orig??t.name)).name)}).`);
  el.innerHTML=msg.length?msg.join("<br>")+(S.pws&&S.pws.p&&S.pws.w&&S.pws.s?(o.borrow?"":"<br>Tick “borrow from matching population sample” to fill them."):"<br>(Borrowing needs Person, week and BodySite columns.)"):""}
function niceLen(v){const p=Math.pow(10,Math.floor(Math.log10(v||1)));const m=v/p;return(m>=5?5:m>=2?2:1)*p}
function wideColour(c){const k="__wide__";const m=S.catColors[k]||(S.catColors[k]={});if(!m[c])m[c]=PAL[Object.keys(m).length%PAL.length];return m[c]}
function legendSvg(x0,y0,ff){
  const o=S.opts,fs=Math.max(9,o.fs-1);const blocks=[];
  const used=[];if(o.cby)used.push(o.cby);o.dots.forEach(c=>{if(!used.includes(c))used.push(c)});o.labelCols.forEach(c=>{if(c!=="__name"&&!used.includes(c))used.push(c)});
  used.filter(c=>S.meta.columns.includes(c)).forEach(c=>{const t=colType(c);
    if(t==="grad"||t==="glog"){const ni=S.numInfo[c];if(ni)blocks.push({title:c+(t==="glog"?" (log scale)":""),grad:o.grad,lo:t==="glog"?ni.minPos:ni.min,hi:ni.max,na:true})}
    else{const vals=new Set();(G.vis||[]).forEach(n=>{const m=metaOfTip(n);if(m&&!isNA(m[c]))vals.add(String(m[c]))});
      S.selSamples.forEach(s=>{const m=metaOfSample(s);if(m&&!isNA(m[c]))vals.add(String(m[c]))});
      const arr=[...vals].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      if(arr.length)blocks.push({title:c,items:arr.slice(0,40).map(v=>({label:dispVal(v),color:colourFor(c,v)})),more:arr.length>40?arr.length-40:0})}});
  if(S.wide&&o.wideCols.length){if(o.wideMode==="stack")blocks.push({title:"Tip values",items:o.wideCols.map(c=>({label:c,color:wideColour(c)}))});else blocks.push({title:"Tip values",grad:o.fgrad,lo:0,hi:"max"})}
  if(S.selSamples.length&&ff&&ff.size){blocks.push({title:"Population samples",items:S.selSamples.map(s=>({label:s,color:S.sampleColors[s]}))});
    if(o.fmode!=="bars"||o.brSample||!(o.layout==="rect"||o.layout==="slant"))blocks.push({title:"Allele frequency",grad:o.fgrad,lo:0,hi:1})}
  let y=y0,s="";
  blocks.forEach(b=>{s+=`<text x="${x0}" y="${y}" font-size="${fs+1}" font-weight="700" font-family="${FONT}">${esc(b.title)}</text>`;y+=8;
    if(b.items){b.items.forEach(it=>{s+=`<rect x="${x0}" y="${y}" width="11" height="11" rx="2" fill="${it.color}" stroke="#444" stroke-width=".4"/><text x="${x0+16}" y="${y+9.5}" font-size="${fs}" font-family="${FONT}">${esc(it.label)}</text>`;y+=15});
      if(b.more){s+=`<text x="${x0}" y="${y+9}" font-size="${fs}" fill="#777" font-family="${FONT}">… ${b.more} more</text>`;y+=15}}
    else{const id="lg"+Math.random().toString(36).slice(2,8);
      s+=`<defs><linearGradient id="${id}">${[0,.25,.5,.75,1].map(t=>`<stop offset="${t*100}%" stop-color="${gradAt(b.grad,t)}"/>`).join("")}</linearGradient></defs><rect x="${x0}" y="${y}" width="130" height="11" fill="url(#${id})" stroke="#444" stroke-width=".4"/>`;
      s+=`<text x="${x0}" y="${y+24}" font-size="${fs}" font-family="${FONT}">${typeof b.lo==="number"?fmtN(b.lo):b.lo}</text><text x="${x0+130}" y="${y+24}" text-anchor="end" font-size="${fs}" font-family="${FONT}">${typeof b.hi==="number"?fmtN(b.hi):b.hi}</text>`;
      y+=30;if(b.na){s+=`<circle cx="${x0+5}" cy="${y+3}" r="5" fill="#fff" stroke="#cbd5e1"/><text x="${x0+16}" y="${y+7}" font-size="${fs}" fill="#555" font-family="${FONT}">NA / no value</text>`;y+=16}}
    y+=12});
  return s}

/* ---------------------------------------------------------------- zoom */
function applyZoom(){const svg=$("svg");if(!S.vb)return;svg.setAttribute("width",S.vb[2]*S.zoom);svg.setAttribute("height",S.vb[3]*S.zoom)}
function fitZoom(){const w=$("wrap");if(!S.vb)return;const zw=(w.clientWidth-24)/S.vb[2],zh=(w.clientHeight-8)/S.vb[3];S.zoom=Math.max(.05,Math.min(1.6,zh>=zw?zw:Math.max(zh,Math.min(zw,1))));applyZoom()}

/* ---------------------------------------------------------------- selection & info */
const selNodes=()=>[...S.sel].map(i=>S.byId[i]).filter(Boolean);
function updInfo(){
  if(!S.root){$("info").textContent="No tree loaded";return}
  const ns=selNodes();let t="";
  if(ns.length===1){const n=ns[0];t=isTip(n)?`Tip: ${n.name}`:`Node ${n.lab||n.key||""} · ${nTips(n)} tips`;if(n.len!=null)t+=` · length ${fmtL(n.len)}`}
  else if(ns.length)t=`${ns.length} selected`;
  $("selinfo").textContent=t||"Click a branch, node or tip. Ctrl/Shift+click adds more. Double-click a node to collapse.";
  $("info").textContent=`${tipsOf(S.root).length} tips · ${S.edits} edits`+(S.freq?` · ${S.selSamples.length}/${S.freqSamples.length} samples selected`:"")+(t?` · ${t}`:"");
  if(ns.length===1){$("e_rn").value=isTip(ns[0])?ns[0].name:ns[0].lab;$("e_cl").value=ns[0].cl||"";$("e_bl").value=ns[0].len??""}}
$("svg").addEventListener("click",e=>{
  const t=e.target.closest("[data-id]");
  if(!t){if(!e.ctrlKey&&!e.shiftKey&&!e.metaKey&&S.sel.size){S.sel.clear();render();updInfo()}return}
  const id=+t.dataset.id,now=Date.now();
  if(S.last&&S.last.id===id&&now-S.last.t<420){S.last=null;const n=S.byId[id];if(n&&!isTip(n)){S.sel=new Set([id]);edit(()=>{n.collapsed=!n.collapsed});return}}
  S.last={id,t:now};
  if(e.ctrlKey||e.shiftKey||e.metaKey){S.sel.has(id)?S.sel.delete(id):S.sel.add(id)}else S.sel=new Set([id]);
  render();updInfo()});
// tooltip
$("wrap").addEventListener("mousemove",e=>{const t=e.target.closest&&e.target.closest("[data-tt]");const d=$("tt");
  if(!t){d.style.display="none";return}d.textContent=t.getAttribute("data-tt");d.style.display="block";
  const x=Math.min(e.clientX+14,innerWidth-d.offsetWidth-8),y=Math.min(e.clientY+14,innerHeight-d.offsetHeight-8);d.style.left=x+"px";d.style.top=y+"px"});
$("wrap").addEventListener("mouseleave",()=>$("tt").style.display="none");
$("wrap").addEventListener("wheel",e=>{if(S.root&&(e.shiftKey||e.altKey)&&!e.ctrlKey){e.preventDefault();const up=(e.deltaY||e.deltaX)<0;
    if(e.shiftKey){S.opts.treeW=Math.max(60,Math.min(6000,S.opts.treeW*(up?1.1:1/1.1)));$("o_treeW").value=S.opts.treeW}else{S.opts.rowH=Math.max(3,Math.min(120,S.opts.rowH*(up?1.1:1/1.1)));$("o_rowH").value=S.opts.rowH}rerender();return}
  if(!e.ctrlKey)return;e.preventDefault();S.zoom=Math.max(.05,Math.min(8,S.zoom*(e.deltaY<0?1.12:1/1.12)));applyZoom()},{passive:false});

/* ---------------------------------------------------------------- edit actions */
function need(){const ns=selNodes();if(!ns.length){toast("Select a branch, node or tip first.");return null}return ns}
const on=(id,f)=>$(id).addEventListener("click",f);
on("e_rr",()=>{const ns=need();if(!ns)return;let f=parseFloat($("e_rf").value);f=isNaN(f)?.5:Math.min(1,Math.max(0,f));edit(()=>reroot(ns[0],f));S.sel.clear();updInfo();render()});
on("e_rmrca",()=>{const ns=need();if(!ns)return;const m=mrca(ns);if(!m||!m.parent)return toast("The common ancestor is already the root.");edit(()=>reroot(m,.5));S.sel.clear();render()});
on("e_rmid",()=>{edit(midpointRoot);S.sel.clear();render()});
on("e_rnb",()=>{const ns=need();if(!ns)return;const v=$("e_rn").value;edit(()=>ns.forEach(n=>{if(isTip(n))n.name=v;else n.lab=v}))});
on("e_clb",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>n.cl=$("e_cl").value))});
on("e_blb",()=>{const ns=need();if(!ns)return;const v=parseFloat($("e_bl").value);if(isNaN(v))return;edit(()=>ns.forEach(n=>{if(n.parent)n.len=v}))});
on("e_col",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>{if(!isTip(n))n.collapsed=!n.collapsed}))});
on("e_flip",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>n.children.reverse()))});
on("e_mirror",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>descendants(n).forEach(d=>d.children.reverse())))});
on("e_prune",()=>{const ns=need();if(!ns)return;if(ns.some(n=>!n.parent))return toast("Can't prune the root.");
  edit(()=>{ns.forEach(n=>{let x=n;while(x&&x.parent){const p=x.parent;p.children=p.children.filter(c=>c!==x);x.parent=null;if(p.children.length)break;x=p}});cleanup()});S.sel.clear();render();updInfo()});
on("e_keep",()=>{const ns=need();if(!ns)return;const keep=new Set();ns.forEach(n=>tipsOf(n).forEach(t=>keep.add(t.id)));
  edit(()=>{(function rec(n){if(isTip(n))return keep.has(n.id);n.children=n.children.filter(rec);return n.children.length>0})(S.root);cleanup()});S.sel.clear();render();updInfo()});
on("e_sub",()=>{const ns=need();if(!ns)return;const n=ns[0];if(!n.parent||isTip(n))return;edit(()=>{n.parent=null;n.len=null;S.root=n});S.sel.clear();render()});
on("e_selclade",()=>{const ns=need();if(!ns)return;const s=new Set();ns.forEach(n=>descendants(n).forEach(d=>s.add(d.id)));S.sel=s;render();updInfo()});
on("e_seltips",()=>{const ns=need();if(!ns)return;const s=new Set();ns.forEach(n=>tipsOf(n).forEach(d=>s.add(d.id)));S.sel=s;render();updInfo()});
on("e_clear",()=>{S.sel.clear();render();updInfo()});
const bcol=()=>$("e_bc").value,bwid=()=>parseFloat($("e_bw").value)||3;
on("e_bcb",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>{n.bcolor=bcol();n.bwidth=bwid()}))});
on("e_bcc",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>descendants(n).forEach(d=>{d.bcolor=bcol();d.bwidth=bwid()})))});
on("e_bcr",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>descendants(n).forEach(d=>{d.bcolor=null;d.bwidth=null})))});
on("e_hcb",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>n.hl=$("e_hc").value))});
on("e_hcr",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>n.hl=null))});
on("e_tcb",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>tipsOf(n).forEach(t=>t.tcolor=$("e_tc").value)))});
on("e_tcr",()=>{const ns=need();if(!ns)return;edit(()=>ns.forEach(n=>tipsOf(n).forEach(t=>t.tcolor=null)))});
on("e_lad1",()=>edit(()=>ladderize(S.root,true)));on("e_lad2",()=>edit(()=>ladderize(S.root,false)));
on("e_expall",()=>edit(()=>allNodes().forEach(n=>n.collapsed=false)));
on("e_resetc",()=>edit(()=>allNodes().forEach(n=>{n.bcolor=null;n.bwidth=null;n.hl=null;n.tcolor=null})));
on("b_undo",doUndo);on("b_redo",doRedo);
on("b_zin",()=>{S.zoom*=1.2;applyZoom()});on("b_zout",()=>{S.zoom/=1.2;applyZoom()});on("b_fit",fitZoom);on("b_100",()=>{S.zoom=1;applyZoom()});
document.addEventListener("keydown",e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?doRedo():doUndo()}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();doRedo()}
  else if(e.key==="Delete")$("e_prune").click();else if(e.key==="Escape")$("e_clear").click()});
// find / select
function selectBy(fn,add){const s=add?new Set(S.sel):new Set();tipsOf(S.root).forEach(t=>{if(fn(t))s.add(t.id)});S.sel=s;render();updInfo();toast(s.size+" selected")}
on("s_qb",()=>{if(!S.root)return;const q=$("s_q").value.trim();if(!q)return;const m=q.match(/^\/(.+)\/([a-z]*)$/);let re=null;try{if(m)re=new RegExp(m[1],m[2]||"i")}catch(e){return toast("Bad regex")}
  selectBy(t=>re?re.test(t.name):t.name.toLowerCase().includes(q.toLowerCase()))});
$("s_q").addEventListener("keydown",e=>{if(e.key==="Enter")$("s_qb").click()});
function fillSval(){const c=$("s_col").value;const v=[...new Set(S.meta.rows.map(r=>r[c]).filter(x=>!isNA(x)).map(String))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));$("s_val").innerHTML=v.slice(0,1000).map(x=>`<option>${esc(x)}</option>`).join("")}
$("s_col").addEventListener("change",fillSval);
const mm=add=>()=>{if(!S.root)return;const c=$("s_col").value,v=$("s_val").value;selectBy(t=>{const m=metaOfTip(t);return m&&String(m[c])===v},add)};
on("s_rep",mm(false));on("s_add",mm(true));

/* ---------------------------------------------------------------- option binding */
const OPT_IDS={layout:"s",scale:"s",xform:"s",cap:"n",boost:"n",treeW:"n",rowH:"n",arc:"n",rot:"n",innerR:"n",lw:"n",showTips:"b",align:"b",nodeDots:"b",nodeLabels:"b",brLen:"b",scaleBar:"b",sup:"b",supMin:"n",legend:"b",
  fs:"n",tipOff:"n",nlx:"n",nly:"n",blx:"n",bly:"n",blDec:"n",cby:"s",clab:"b",dotShape:"s",dotSize:"n",grad:"s",fmode:"s",fstat:"s",brSample:"s",fgrad:"s",shared:"b",lofreq:"b",minDepth:"n",minFreq:"n",posMode:"s",posList:"s",sort:"s",
  rowGap:"n",barGap:"n",barW:"n",barH:"n",barShift:"n",rangeW:"n",barLabels:"b",tipKey:"K",sampleKey:"K",borrow:"b"};
let rT=0;function rerender(fit){if(fit)S.fitPending=true;cancelAnimationFrame(rT);rT=requestAnimationFrame(()=>{render();updInfo()})}
Object.entries(OPT_IDS).forEach(([k,t])=>{const el=$("o_"+k);if(!el)return;
  const h=()=>{if(t==="K"){S[k]=el.value;if(k==="tipKey")S.mTip=buildIndex(el.value);else S.mSample=buildIndex(el.value);buildBorrow();renderTab();rerender();return}
    if(k==="borrow"){S.opts.borrow=el.checked;S.borrowCache=new Map();renderTab();rerender();return}
    S.opts[k]=t==="b"?el.checked:t==="n"?(parseFloat(el.value)||0):el.value;
    if(k==="posMode")$("o_posList").style.display=el.value==="All"?"none":"block";
    if(k==="layout")showModeRows();
    rerender(["layout","scale","xform"].includes(k))};
  el.addEventListener(el.type==="range"||el.tagName==="TEXTAREA"||el.type==="number"?"input":"change",h);if(el.type==="number")el.addEventListener("change",h)});
function syncControls(){Object.entries(OPT_IDS).forEach(([k,t])=>{const el=$("o_"+k);if(!el||t==="K")return;const v=S.opts[k];if(t==="b")el.checked=!!v;else el.value=v});
  $("o_posList").style.display=S.opts.posMode==="All"?"none":"block";showModeRows()}
function showModeRows(){document.querySelectorAll("[data-mode]").forEach(r=>r.style.display=r.dataset.mode.split(" ").includes(S.opts.layout)?"flex":"none")}
function checkList(id,items,key,labels){const el=$(id);if(!items.length){el.innerHTML='<span class="muted">none</span>';return}
  el.innerHTML=`<div style="margin-bottom:2px"><a href="#" data-all="1">All</a> · <a href="#" data-none="1">None</a></div>`+items.map((c,i)=>`<label><input type="checkbox" data-i="${i}" ${S.opts[key].includes(c)?"checked":""}> ${esc(labels?labels[i]:c)}</label>`).join("");
  el.querySelectorAll("input").forEach(cb=>cb.addEventListener("change",()=>{const it=items[+cb.dataset.i];const a=S.opts[key];
    if(cb.checked){if(!a.includes(it))a.push(it)}else S.opts[key]=a.filter(x=>x!==it);rerender()}));
  el.querySelector("[data-all]").addEventListener("click",e=>{e.preventDefault();S.opts[key]=[...items];checkList(id,items,key,labels);rerender()});
  el.querySelector("[data-none]").addEventListener("click",e=>{e.preventDefault();S.opts[key]=[];checkList(id,items,key,labels);rerender()})}
function refreshMetaControls(){
  const cols=S.meta.columns,opt=(a,first="")=>first+a.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("o_tipKey").innerHTML=opt(cols,'<option value="">(none)</option>');$("o_tipKey").value=S.tipKey;$("o_sampleKey").innerHTML=opt(cols,'<option value="">(none)</option>');$("o_sampleKey").value=S.sampleKey;
  $("o_cby").innerHTML=opt(cols,'<option value="">(none)</option>');$("o_cby").value=S.opts.cby;
  checkList("c_labelCols",["__name",...cols],"labelCols",["Tip / sample name",...cols].map(dispName));
  checkList("c_dots",cols,"dots");
  $("s_col").innerHTML=opt(cols,'<option value="">(none)</option>');fillSval()}
const dispName=c=>c;
function refreshFreqControls(){
  $("o_brSample").innerHTML='<option value="">(none)</option>'+S.selSamples.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  if(!S.selSamples.includes(S.opts.brSample))S.opts.brSample="";$("o_brSample").value=S.opts.brSample;
  checkList("c_hideNodes",S.freqNodes,"hideNodes");
  $("freqNote").innerHTML=S.freq?`${S.freqSamples.length} population samples · ${S.freqNodes.length} nodes. Tick samples in the <b>Population samples</b> tab below.`
    :S.wide?`Per-tip value table loaded (${S.wide.columns.length} columns). Pick columns in the <b>Columns &amp; colours</b> tab.`:"Load a population frequency table, then tick samples in the “Population samples” tab below."}

/* ---------------------------------------------------------------- bottom drawer tabs */
document.querySelectorAll("#tabs button[data-tab]").forEach(b=>b.addEventListener("click",()=>{S.tab=b.dataset.tab;document.querySelectorAll("#tabs button[data-tab]").forEach(x=>x.classList.toggle("on",x===b));$("drawer").classList.remove("min");renderTab()}));
on("b_drawer",()=>{$("drawer").classList.toggle("min");$("b_drawer").textContent=$("drawer").classList.contains("min")?"▴":"▾"});
function cellStyle(c,v){const t=colType(c);if((t==="grad"||t==="glog")&&!isNA(v)){const col=colourFor(c,v);if(col)return` style="background:${col};color:${textOn(col)}"`}return""}
function sampleRows(){return S.freqSamples.map(s=>({s,m:metaOfSample(s)}))}
function filterCols(){return S.meta.columns.filter(c=>["person","week","bodysite","site","type","sampletype"].includes(normCol(c)))}
function renderTab(){const b=$("tabbody");const T=S.tab;
  if(T==="samples"){
    if(!S.freq){b.innerHTML='<div class="muted">No population frequency table loaded. Expected columns (PopSeqViz format): <code>Sample, node, true_pos, relative_pos, derived_allele, derived_allele_frequency, depth, A, C, G, T, in_lofreq_vcf</code> (plus optional <code>row_type</code> / <code>summary_*</code>). At minimum: <code>Sample, node, derived_allele_frequency</code>.</div>';return}
    const fc=filterCols(),cols=S.meta.columns.filter(c=>c!==S.sampleKey);
    let h='<div class="flt">';fc.forEach(c=>{const vals=[...new Set(sampleRows().map(r=>r.m?r.m[c]:"").filter(v=>!isNA(v)).map(String))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      const sel=S.sampleFilters[c]||[];h+=`<label>${esc(c)}<br><select multiple size="4" data-f="${esc(c)}">${vals.map(v=>`<option ${sel.includes(v)?"selected":""}>${esc(v)}</option>`).join("")}</select></label>`});
    h+=`<div style="display:flex;flex-direction:column;gap:4px"><input type="text" id="t_sq" placeholder="search samples…" value="${esc(S.sampleSearch)}"><div class="row"><button id="t_all">Select shown</button><button id="t_none">Clear selection</button><button id="t_clrf">Clear filters</button></div><span class="note">Click a sample <b>name</b> to show only that sample; tick boxes to compare several (tick order = colour order and sort priority).</span></div></div>`;
    const shown=sampleRows().filter(r=>{for(const c of fc){const f=S.sampleFilters[c];if(f&&f.length&&!(r.m&&f.includes(String(r.m[c]))))return false}
      if(S.sampleSearch){const q=S.sampleSearch.toLowerCase();if(!(r.s.toLowerCase().includes(q)||(r.m&&Object.values(r.m).some(v=>String(v).toLowerCase().includes(q)))))return false}return true});
    h+=`<table class="t"><thead><tr><th>Select</th><th>Sample</th><th>nodes</th>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
    shown.slice(0,3000).forEach(r=>{const on=S.selSamples.includes(r.s);const col=S.sampleColors[r.s];
      h+=`<tr><td><input type="checkbox" data-s="${esc(r.s)}" ${on?"checked":""}> ${on?`<span style="display:inline-block;width:12px;height:12px;background:${col};border:1px solid #333;border-radius:2px;vertical-align:middle"></span>`:""}</td><td><a href="#" data-only="${esc(r.s)}" title="show only this sample">${esc(r.s)}</a></td><td>${S.fIdx.get(r.s).size}</td>${cols.map(c=>`<td${cellStyle(c,r.m?r.m[c]:"")}>${esc(r.m?r.m[c]:"")}</td>`).join("")}</tr>`});
    h+="</tbody></table>";if(!S.meta.columns.length)h+='<div class="note">Load a metadata table to see person / site / week here (matched on the “Sample lookup column”).</div>';
    b.innerHTML=h;b.dataset.shown=JSON.stringify(shown.map(r=>r.s));
    b.querySelectorAll("select[data-f]").forEach(sel=>sel.addEventListener("change",()=>{S.sampleFilters[sel.dataset.f]=[...sel.selectedOptions].map(o=>o.value);renderTab()}));
    const sq=$("t_sq");sq.addEventListener("input",()=>{S.sampleSearch=sq.value;clearTimeout(sq._t);sq._t=setTimeout(()=>{renderTab();const e=$("t_sq");e.focus();e.setSelectionRange(e.value.length,e.value.length)},250)});
    on("t_all",()=>{shown.forEach(r=>{if(!S.selSamples.includes(r.s))S.selSamples.push(r.s)});samplesChanged()});
    on("t_none",()=>{S.selSamples=[];samplesChanged()});on("t_clrf",()=>{S.sampleFilters={};S.sampleSearch="";renderTab()});
    b.querySelectorAll("a[data-only]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();S.selSamples=[a.dataset.only];samplesChanged()}));
    b.querySelectorAll("input[data-s]").forEach(cb=>cb.addEventListener("change",()=>{const s=cb.dataset.s;if(cb.checked){if(!S.selSamples.includes(s))S.selSamples.push(s)}else S.selSamples=S.selSamples.filter(x=>x!==s);samplesChanged()}));
    return}
  if(T==="selected"){
    if(!S.selSamples.length){b.innerHTML='<div class="muted">No samples selected.</div>';return}
    const cols=S.meta.columns.filter(c=>c!==S.sampleKey);const ff=filteredFreq();
    let h=`<table class="t"><thead><tr><th>Colour</th><th>Order</th><th>Sample</th><th>nodes shown</th>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}<th></th></tr></thead><tbody>`;
    S.selSamples.forEach((s,i)=>{const m=metaOfSample(s);let nn=0;ff.forEach(mm=>{if(mm.has(s))nn++});
      h+=`<tr><td><input type="color" data-c="${esc(s)}" value="${toHex(S.sampleColors[s])}"></td><td><button data-up="${i}">↑</button><button data-dn="${i}">↓</button></td><td>${esc(s)}</td><td>${nn}</td>${cols.map(c=>`<td${cellStyle(c,m?m[c]:"")}>${esc(m?m[c]:"")}</td>`).join("")}<td><button data-rm="${esc(s)}">remove</button></td></tr>`});
    b.innerHTML=h+"</tbody></table>";
    b.querySelectorAll("input[data-c]").forEach(x=>x.addEventListener("input",()=>{S.sampleColors[x.dataset.c]=x.value;rerender()}));
    b.querySelectorAll("[data-up]").forEach(x=>x.addEventListener("click",()=>{const i=+x.dataset.up;if(i>0){[S.selSamples[i-1],S.selSamples[i]]=[S.selSamples[i],S.selSamples[i-1]];samplesChanged(true)}}));
    b.querySelectorAll("[data-dn]").forEach(x=>x.addEventListener("click",()=>{const i=+x.dataset.dn;if(i<S.selSamples.length-1){[S.selSamples[i+1],S.selSamples[i]]=[S.selSamples[i],S.selSamples[i+1]];samplesChanged(true)}}));
    b.querySelectorAll("[data-rm]").forEach(x=>x.addEventListener("click",()=>{S.selSamples=S.selSamples.filter(s=>s!==x.dataset.rm);samplesChanged()}));return}
  if(T==="rows"){
    const rows=freqRowsFlat();if(!rows.length){b.innerHTML='<div class="muted">No frequency rows for the current selection / filters.</div>';return}
    const cols=["Sample","node","true_pos","relative_pos","derived_allele","frequency","depth","derived_reads","lofreq","row_type"];
    b.innerHTML=`<div class="note">${rows.length} rows${rows.length>2000?" (first 2000 shown — export CSV for all)":""}</div><table class="t"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`+
      rows.slice(0,2000).map(r=>`<tr>${cols.map(c=>`<td${c==="frequency"&&isFinite(r[c])?` style="background:${gradAt(S.opts.fgrad,r[c])};color:${textOn(gradAt(S.opts.fgrad,r[c]))}"`:""}>${esc(typeof r[c]==="number"?fmtN(r[c],4):r[c])}</td>`).join("")}</tr>`).join("")+"</tbody></table>";return}
  if(T==="tips"){
    if(!S.root){b.innerHTML="";return}const tips=tipOrder();const cols=S.meta.columns;
    b.innerHTML=`<table class="t"><thead><tr><th>#</th><th>Tip</th>${cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`+
      tips.map((t,i)=>{const m=metaOfTip(t);return`<tr><td>${i+1}</td><td>${esc(t.name)}</td>${cols.map(c=>`<td${cellStyle(c,m?m[c]:"")}>${esc(m?m[c]:"")}</td>`).join("")}</tr>`}).join("")+"</tbody></table>"+
      (cols.length&&tips.some(t=>!metaOfTip(t))?`<div class="note">${tips.filter(t=>!metaOfTip(t)).length} tips have no metadata row (check the “Tip lookup column”).</div>`:"");return}
  if(T==="cols"){
    let h="";
    if(S.meta.columns.length){h+=`<div class="note" style="margin-bottom:6px">Choose how each metadata column is coloured. <b>Gradient</b> = number scale (good for read fractions, depth, Cq). <b>Gradient (log)</b> spreads out values spanning several orders of magnitude (e.g. 0.0001–0.9). Missing values are drawn white/empty.</div><table class="t"><thead><tr><th>Column</th><th>Type</th><th>Range / values</th><th>Category colours</th></tr></thead><tbody>`;
      S.meta.columns.forEach(c=>{const t=colType(c),ni=S.numInfo[c],nn=S.meta.rows.filter(r=>!isNA(r[c])).length;
        h+=`<tr><td><b>${esc(c)}</b><div class="note">${nn}/${S.meta.rows.length} filled</div></td><td><select data-ct="${esc(c)}">${[["cat","Category"],["grad","Gradient"],["glog","Gradient (log)"]].map(([v,l])=>`<option value="${v}" ${t===v?"selected":""} ${v!=="cat"&&!ni?"disabled":""}>${l}${S.colAuto[c]===v?" (auto)":""}</option>`).join("")}</select></td>`;
        if(t!=="cat"&&ni)h+=`<td>${fmtN(ni.min)} – ${fmtN(ni.max)}</td><td><span style="display:inline-block;width:140px;height:12px;background:linear-gradient(90deg,${[0,.25,.5,.75,1].map(x=>gradAt(S.opts.grad,x)).join(",")})"></span></td>`;
        else{const m=S.catColors[c]||{};const ks=Object.keys(m);if(ks.length>60){h+=`<td>${ks.length} values</td><td class="muted">many distinct values (looks like an ID column) – colours assigned automatically</td></tr>`;return}h+=`<td>${ks.length} values</td><td style="white-space:normal;max-width:520px">${ks.slice(0,30).map(k=>`<label style="display:inline-flex;align-items:center;gap:3px;margin:1px 6px 1px 0"><input type="color" data-cc="${esc(c)}" data-cv="${esc(k)}" value="${toHex(m[k])}">${esc(k)}</label>`).join("")}${ks.length>30?" …":""}</td>`}
        h+="</tr>"});h+="</tbody></table>"}
    else h+='<div class="muted">Load a metadata table to set column types and colours.</div>';
    if(S.wide){h+=`<h4 style="margin:10px 0 4px">Per-tip value table</h4><div class="row"><select id="w_mode"><option value="stack">Stacked bars</option><option value="heat">Heatmap</option></select><label><input type="checkbox" id="w_norm" ${S.opts.wideNorm?"checked":""}> normalise rows to 100%</label><span>width</span><input type="number" id="w_w" value="${S.opts.wideW}"></div><div class="chk" id="w_cols" style="max-height:160px"></div>`}
    b.innerHTML=h;
    b.querySelectorAll("select[data-ct]").forEach(s=>s.addEventListener("change",()=>{S.colOverride[s.dataset.ct]=s.value;renderTab();rerender()}));
    b.querySelectorAll("input[data-cc]").forEach(x=>x.addEventListener("input",()=>{S.catColors[x.dataset.cc][x.dataset.cv]=x.value;rerender()}));
    if(S.wide){$("w_mode").value=S.opts.wideMode;$("w_mode").addEventListener("change",e=>{S.opts.wideMode=e.target.value;rerender()});$("w_norm").addEventListener("change",e=>{S.opts.wideNorm=e.target.checked;rerender()});
      $("w_w").addEventListener("input",e=>{S.opts.wideW=+e.target.value||140;rerender()});checkList("w_cols",S.wide.columns,"wideCols")}}}
function toHex(c){if(!c)return"#888888";if(c[0]==="#"&&c.length===7)return c;const m=c.match(/\d+/g);if(!m)return"#888888";return"#"+m.slice(0,3).map(x=>(+x).toString(16).padStart(2,"0")).join("")}
function samplesChanged(keepCols){const used=new Set(Object.keys(S.sampleColors).filter(s=>S.selSamples.includes(s)).map(s=>S.sampleColors[s]));
  S.selSamples.forEach((s,i)=>{if(!S.sampleColors[s]||(!keepCols&&false)){S.sampleColors[s]=PAL.find(c=>!used.has(c))||PAL[i%PAL.length];used.add(S.sampleColors[s])}});
  refreshFreqControls();renderTab();rerender()}
function freqRowsFlat(){const ff=filteredFreq(),out=[];for(const[node,m]of ff)for(const[s,rows]of m)rows.forEach(r=>{if(r.type==="site"&&r.freq<S.opts.minFreq)return;
  out.push({Sample:s,node,true_pos:r.pos,relative_pos:isFinite(r.rel)?r.rel:"",derived_allele:r.allele,frequency:r.freq,depth:r.depth,derived_reads:r.reads,lofreq:r.lofreq,row_type:r.type})});return out}
function tipOrder(){const a=[];(function w(n){if(isTip(n))a.push(n);else n.children.forEach(w)})(S.root);return a}

/* ---------------------------------------------------------------- export */
function dl(name,data,type){const b=data instanceof Blob?data:new Blob([data],{type});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("Saved "+name)}
function svgString(){const c=$("svg").cloneNode(true);c.querySelectorAll(".ui").forEach(x=>x.remove());c.querySelectorAll("[data-tt]").forEach(x=>x.removeAttribute("data-tt"));
  c.setAttribute("width",S.vb[2]);c.setAttribute("height",S.vb[3]);return'<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(c)}
const csv=rows=>rows.map(r=>r.map(v=>{v=String(v??"");return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(",")).join("\n")+"\n";
on("x_svg",()=>S.root&&dl(S.treeName+".svg",svgString(),"image/svg+xml"));
on("x_png",()=>{if(!S.root)return;const img=new Image();img.onload=()=>{const k=3,cv=document.createElement("canvas");cv.width=S.vb[2]*k;cv.height=S.vb[3]*k;const x=cv.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,cv.width,cv.height);x.drawImage(img,0,0,cv.width,cv.height);cv.toBlob(b=>dl(S.treeName+".png",b))};img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgString())});
on("x_nwk",()=>S.root&&dl(S.treeName+"_edited.nwk",toNewick(S.root,false)+"\n","text/plain"));
on("x_nex",()=>S.root&&dl(S.treeName+"_edited.nex","#NEXUS\nbegin trees;\n\ttree tree1 = [&R] "+toNewick(S.root,true)+"\nend;\n","text/plain"));
on("x_tips",()=>{if(!S.root)return;const cols=S.meta.columns;dl(S.treeName+"_tips.csv",csv([["order","tip","original_name",...cols],...tipOrder().map((t,i)=>{const m=metaOfTip(t)||{};return[i+1,t.name,t.orig,...cols.map(c=>m[c])]})]),"text/csv")});
on("x_freq",()=>{const r=freqRowsFlat();if(!r.length)return toast("No frequency rows for the current selection");const c=Object.keys(r[0]);dl("frequency_rows.csv",csv([c,...r.map(x=>c.map(k=>x[k]))]),"text/csv")});

/* ---------------------------------------------------------------- loading */
function setTree(root,tr,name){
  tr=tr||{};let i=0;
  (function pre(n){if(isTip(n)){if(tr[n.name]!==undefined)n.name=tr[n.name];n.orig=n.name;n.key=n.name}else{n.key=n.lab&&isNaN(parseFloat(n.lab))?n.lab:("internal_"+i);i++}n.children.forEach(pre)})(root);
  S.root=root;S.orig=snap();S.sel=new Set();S.undo=[];S.redo=[];S.edits=0;S.treeName=(name||"tree").replace(/\.[^.]+$/,"");S.fitPending=true;
  const nt=tipsOf(root).length;S.opts.rowH=nt>250?8:nt>120?12:nt>60?15:18;S.opts.fs=nt>250?7:nt>120?9:nt>60?11:12;
  if(!hasLengths())S.opts.scale="clado";
  // re-match keys
  if(S.meta.columns.length){S.tipKey=bestKey(tipsOf(root).map(t=>t.name));S.mTip=buildIndex(S.tipKey);buildBorrow();refreshMetaControls()}
  $("fl_tree").classList.add("ok");$("fl_tree").firstChild.textContent=(name||"Tree").slice(0,22)+" ";
  syncControls();render();updInfo();renderTab()}
function setMeta(tab,name){
  S.meta=tab;S.colOverride={};analyseColumns();
  S.tipKey=bestKey(S.root?tipsOf(S.root).map(t=>t.name):[]);S.sampleKey=S.freqSamples.length?bestKey(S.freqSamples):S.tipKey;
  S.mTip=buildIndex(S.tipKey);S.mSample=buildIndex(S.sampleKey);
  const pref=["person","week","bodysite"];const byN={};tab.columns.forEach(c=>byN[normCol(c)]=c);
  S.opts.dots=pref.map(p=>byN[p]).filter(Boolean);S.opts.labelCols=S.opts.dots.length?[...S.opts.dots]:["__name"];buildBorrow();
  $("fl_meta").classList.add("ok");$("fl_meta").firstChild.textContent=(name||"Metadata").slice(0,22)+" ";
  refreshMetaControls();render();updInfo();renderTab();
  const miss=S.root?tipsOf(S.root).filter(t=>!metaOfTip(t)).length:0;
  toast(`Metadata: ${tab.rows.length} rows, ${tab.columns.length} columns. Tips matched on “${S.tipKey}”${miss?` (${miss} tips unmatched)`:""}.`,4000)}
function setFreq(tab,name){
  const msg=loadFreqTable(tab);
  if(S.meta.columns.length&&S.freqSamples.length){S.sampleKey=bestKey(S.freqSamples);S.mSample=buildIndex(S.sampleKey);refreshMetaControls()}buildBorrow();
  $("fl_freq").classList.add("ok");$("fl_freq").firstChild.textContent=(name||"Frequency").slice(0,22)+" ";
  // pick first sample automatically so something shows
  if(S.freq&&!S.selSamples.length&&S.freqSamples.length){S.selSamples=[S.freqSamples[0]]}
  S.tab=S.freq?"samples":"cols";document.querySelectorAll("#tabs button[data-tab]").forEach(x=>x.classList.toggle("on",x.dataset.tab===S.tab));
  samplesChanged();toast(msg,4500)}
async function onFile(input,kind){const f=input.files[0];if(!f)return;input.value="";
  try{if(kind==="tree"){const{root,tr}=readTreeText(await f.text(),f.name);setTree(root,tr,f.name);toast(`Tree: ${tipsOf(root).length} tips`)}
    else if(kind==="meta")setMeta(await readTableFile(f),f.name);
    else if(kind==="freq")setFreq(await readTableFile(f),f.name);
    else if(kind==="sess")loadSession(JSON.parse(await f.text()))}
  catch(e){console.error(e);toast("Could not read "+f.name+": "+e.message,6000)}}
$("f_tree").addEventListener("change",e=>onFile(e.target,"tree"));$("f_meta").addEventListener("change",e=>onFile(e.target,"meta"));
$("f_freq").addEventListener("change",e=>onFile(e.target,"freq"));$("f_sess").addEventListener("change",e=>onFile(e.target,"sess"));
on("b_paste",()=>{$("paste").style.display="flex";$("pasteText").focus()});on("pasteCancel",()=>$("paste").style.display="none");
on("pasteOk",()=>{try{const{root,tr}=readTreeText($("pasteText").value,"pasted");setTree(root,tr,"pasted_tree");$("paste").style.display="none"}catch(e){toast("Could not read tree: "+e.message,5000)}});
// drag & drop
document.addEventListener("dragover",e=>e.preventDefault());
document.addEventListener("drop",async e=>{e.preventDefault();for(const f of e.dataTransfer.files){const n=f.name.toLowerCase();
  try{if(/\.(nwk|newick|tree|treefile|tre|nex|nexus|xml|phyloxml|contree)$/.test(n)){const{root,tr}=readTreeText(await f.text(),f.name);setTree(root,tr,f.name)}
    else if(/\.json$/.test(n))loadSession(JSON.parse(await f.text()));
    else{const tab=await readTableFile(f);const nc=tab.columns.map(normCol);if(nc.includes("node")&&nc.some(c=>c.startsWith("sample")))setFreq(tab,f.name);else setMeta(tab,f.name)}}
  catch(err){toast("Could not read "+f.name+": "+err.message,6000)}}});
// session
function sessionObj(){return{app:"TreeViz",version:2,treeName:S.treeName,tree:S.root?ser(S.root):null,meta:S.meta,tipKey:S.tipKey,sampleKey:S.sampleKey,colOverride:S.colOverride,catColors:S.catColors,
  freqTable:S.freq?{columns:S.freqCols,rows:S.freq.map(r=>r.raw)}:null,wide:S.wide?{id:S.wide.id,columns:S.wide.columns,rows:[...S.wide.rows].filter(([k])=>k[0]!=="\u0001")}:null,
  selSamples:S.selSamples,sampleColors:S.sampleColors,opts:S.opts,orig:S.orig||null,savedAt:Date.now()}}
on("b_save",()=>{if(!S.root)return toast("Nothing to save yet");dl(S.treeName+".treeviz.json",JSON.stringify(sessionObj()),"application/json")});
function loadSession(o,msg){
  if(!o||!o.tree)throw new Error("Not a TreeViz session file");
  S.meta=o.meta||{columns:[],rows:[]};analyseColumns();S.colOverride=o.colOverride||{};if(o.catColors)Object.assign(S.catColors,o.catColors);
  if(o.freqTable)loadFreqTable(o.freqTable);else{S.freq=null;S.fIdx=new Map();S.freqSamples=[];S.freqNodes=[]}
  if(o.wide){const m=new Map();o.wide.rows.forEach(([k,v])=>{m.set(k,v);m.set("\u0001"+k.toLowerCase(),v)});S.wide={id:o.wide.id,columns:o.wide.columns,rows:m}}
  S.root=de(o.tree,null);S.orig=o.orig||snap();S.treeName=o.treeName||"tree";S.sel=new Set();S.undo=[];S.redo=[];S.edits=0;
  S.tipKey=o.tipKey||"";S.sampleKey=o.sampleKey||"";S.mTip=buildIndex(S.tipKey);S.mSample=buildIndex(S.sampleKey);buildBorrow();
  Object.assign(S.opts,o.opts||{});S.selSamples=(o.selSamples||[]).filter(s=>S.fIdx.has(s));S.sampleColors=o.sampleColors||{};
  ["fl_tree","fl_meta","fl_freq"].forEach(id=>$(id).classList.add("ok"));
  refreshMetaControls();refreshFreqControls();syncControls();S.fitPending=true;render();updInfo();renderTab();toast(msg||"Session loaded")}
on("b_help",()=>{alertBox()});
function alertBox(){const h=`<b>TreeViz – quick help</b><br><br>
<b>Files</b>: Tree (Newick / NEXUS with translate / PhyloXML), Metadata (CSV/TSV/XLSX; one row per sample), Population frequency table (PopSeqViz long format: Sample, node, true_pos, derived_allele_frequency, depth, A/C/G/T, in_lofreq_vcf …). You can also drag &amp; drop files onto the window.<br>
<b>Population frequencies</b>: tick samples in the bottom “Population samples” tab. Each selected sample is drawn as a row of bars on every branch named in the table (one bar per SNP position, height = derived allele frequency), or as value badges / coloured branches.<br>
<b>Editing</b>: click a branch/tip/node; Ctrl/Shift-click for multi-select; double-click to collapse; Delete = prune; Ctrl+Z / Ctrl+Y = undo / redo; Ctrl + mouse wheel = zoom.<br>
<b>Numbers</b>: number columns get colour gradients (switch to log scale for read fractions) in “Columns &amp; colours”.<br>
<b>Save session</b> stores tree edits, data and all settings in one .json file you can reopen later.`;
  $("tabbody").innerHTML=`<div style="max-width:900px;line-height:1.5">${h}</div>`;$("drawer").classList.remove("min")}
window.addEventListener("resize",()=>{});
syncControls();refreshMetaControls();refreshFreqControls();renderTab();updInfo();
// expose for testing
window.TV={S,render,setTree,setMeta,setFreq,readTreeText,parseTable,toNewick,filteredFreq,allNodes,tipsOf,reroot};

/* ---------------------------------------------------------------- resizable panels */
(function(){const side=$("side"),dr=$("drawer");
  function drag(el,onMove){el.addEventListener("mousedown",e=>{e.preventDefault();document.body.style.userSelect="none";const mv=ev=>onMove(ev),up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);document.body.style.userSelect=""};document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up)})}
  drag($("vsplit"),e=>{const w=Math.max(200,Math.min(innerWidth*.6,e.clientX));side.style.width=side.style.minWidth=w+"px"});
  drag($("hsplit"),e=>{const h=Math.max(32,Math.min(innerHeight-150,innerHeight-e.clientY));dr.style.height=h+"px";dr.classList.remove("min")});
  try{const w=localStorage.getItem("tv_side");if(w)side.style.width=side.style.minWidth=w}catch(e){}
  addEventListener("beforeunload",()=>{try{localStorage.setItem("tv_side",side.style.width)}catch(e){}})})();
["treeW","rowH"].forEach(k=>{const n=$("o_"+k+"_n"),r=$("o_"+k);
  n.addEventListener("change",()=>{const v=parseFloat(n.value);if(!isFinite(v)||v<=0)return;S.opts[k]=v;r.value=v;rerender()});
  const sync=()=>{n.value=Math.round(S.opts[k]*10)/10};r.addEventListener("input",sync);setInterval(()=>{if(document.activeElement!==n)sync()},500);sync()});

/* ---------------------------------------------------------------- restore: original tree, auto-save, checkpoints (IndexedDB, stays on this computer) */
const DB={db:null,open(){return new Promise(res=>{try{const r=indexedDB.open("treeviz",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>{DB.db=r.result;res(DB.db)};r.onerror=()=>res(null)}catch(e){res(null)}})},
  async get(k){const d=DB.db||await DB.open();if(!d)return null;return new Promise(res=>{try{const q=d.transaction("kv").objectStore("kv").get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)}catch(e){res(null)}})},
  async set(k,v){const d=DB.db||await DB.open();if(!d)return false;return new Promise(res=>{try{const t=d.transaction("kv","readwrite");t.objectStore("kv").put(v,k);t.oncomplete=()=>res(true);t.onerror=()=>res(false)}catch(e){res(false)}})},
  async del(k){const d=DB.db||await DB.open();if(!d)return;try{d.transaction("kv","readwrite").objectStore("kv").delete(k)}catch(e){}}};
let asT=0,restoring=false;
function autosave(){if(!S.root||restoring)return;clearTimeout(asT);asT=setTimeout(async()=>{try{await DB.set("last",JSON.stringify(sessionObj()));refreshRestore()}catch(e){console.warn("autosave failed",e)}},1500)}
const fmtT=t=>{const d=new Date(t);return d.toLocaleDateString()+" "+d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})};
async function refreshRestore(){const sel=$("b_restore");if(!sel)return;
  const last=await DB.get("last"),cps=JSON.parse(await DB.get("checkpoints")||"[]");let lastInfo=null;try{if(last){const o=JSON.parse(last);lastInfo={name:o.treeName,t:o.savedAt}}}catch(e){}
  let h='<option value="">⟲ Restore…</option>';
  if(S.root&&S.orig)h+='<option value="orig">Original tree (as first loaded) — keeps data &amp; settings</option>';
  if(lastInfo)h+=`<option value="last">Last auto-saved session — ${esc(lastInfo.name)} (${fmtT(lastInfo.t)})</option>`;
  cps.forEach((c,i)=>h+=`<option value="cp${i}">Checkpoint: ${esc(c.label)} (${fmtT(c.t)})</option>`);
  if(cps.length)h+='<option value="clearcp">— delete all checkpoints</option>';
  sel.innerHTML=h;sel.value="";
  const eb=$("restoreBox");if(eb)eb.style.display=(!S.root&&lastInfo)?"block":"none";if(eb&&lastInfo)$("restoreInfo").textContent=`${lastInfo.name}, saved ${fmtT(lastInfo.t)}`}
async function restoreLast(){const v=await DB.get("last");if(!v)return toast("No auto-saved session found");restoring=true;try{loadSession(JSON.parse(v),"Last session restored")}finally{restoring=false;autosave()}}
$("b_restore").addEventListener("change",async e=>{const v=e.target.value;e.target.value="";if(!v)return;
  if(v==="orig"){if(!S.orig)return;edit(()=>{S.root=de(JSON.parse(S.orig),null)});S.sel.clear();toast("Original tree restored (Undo brings your edits back)")}
  else if(v==="last")await restoreLast();
  else if(v==="clearcp"){await DB.set("checkpoints","[]");toast("Checkpoints deleted")}
  else if(v.startsWith("cp")){const cps=JSON.parse(await DB.get("checkpoints")||"[]"),c=cps[+v.slice(2)];if(c){restoring=true;try{loadSession(JSON.parse(c.data),"Checkpoint restored: "+c.label)}finally{restoring=false;autosave()}}}
  refreshRestore()});
on("b_cp",async()=>{if(!S.root)return toast("Nothing to save yet");const cps=JSON.parse(await DB.get("checkpoints")||"[]");
  const label=`${S.treeName} · ${S.opts.layout} · ${S.edits} edits`;cps.unshift({label,t:Date.now(),data:JSON.stringify(sessionObj())});
  const ok=await DB.set("checkpoints",JSON.stringify(cps.slice(0,15)));toast(ok?"Checkpoint saved – pick it from “Restore…” any time":"Could not save checkpoint (browser storage blocked)");refreshRestore()});
on("b_restoreLast",restoreLast);on("b_restoreNo",()=>{$("restoreBox").style.display="none"});
refreshRestore();

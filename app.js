
const state = {
  drugs: [...(window.DRUGS || [])],
  q: "",
  category: "全部",
  status: "全部",
  selected: null
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function render(){
  const q = state.q.trim().toLowerCase();
  const rows = state.drugs.filter(d =>
    (state.category==="全部" || d.category===state.category) &&
    (state.status==="全部" || d.verification_status===state.status) &&
    (!q || [d.name,d.generic,d.spec,d.manufacturer,d.brand_name].join(" ").toLowerCase().includes(q))
  );
  $("#count").textContent = `${rows.length} 条`;
  $("#list").innerHTML = rows.map((d,i)=>`
    <article class="drug" data-id="${esc(d.id)}">
      <div class="drug-main">
        <div class="title">${esc(d.name)}</div>
        <div class="meta">${esc(d.generic)} · ${esc(d.spec)} · ${esc(d.form)}</div>
        <div class="meta">${esc(d.manufacturer || "生产企业待核验")}</div>
      </div>
      <div class="badges">
        <span class="badge">${esc(d.category)}</span>
        <span class="badge ${d.verification_status!=="已核验"?"warn":""}">${esc(d.verification_status)}</span>
      </div>
    </article>`).join("") || `<div class="empty">没有匹配药品</div>`;
  document.querySelectorAll(".drug").forEach(el=>el.onclick=()=>openDrug(el.dataset.id));
}

function openDrug(id){
  const d = state.drugs.find(x=>x.id===id); if(!d)return;
  state.selected=d;
  $("#detail").innerHTML=`
    <div class="detail-head">
      <div><div class="eyebrow">药品档案</div><h2>${esc(d.name)}</h2><p>${esc(d.generic)} · ${esc(d.spec)}</p></div>
      <button id="close">关闭</button>
    </div>
    <div class="grid">
      ${field("生产企业",d.manufacturer)}${field("剂型",d.form)}${field("类别",d.category)}
      ${field("批准文号",d.approval_no || "待核验")}${field("商品名",d.brand_name || "待核验")}
      ${field("核验状态",d.verification_status)}
    </div>
    ${section("适应证",d.indications)}${section("用法用量",d.dosage)}
    ${section("禁忌",d.contraindications)}${section("不良反应",d.adverse_reactions)}
    ${section("注意事项",d.precautions)}${section("特殊人群",d.special_population)}
    ${section("药物相互作用",d.interactions)}${section("基层用药提示",d.primary_care_tips)}
    <div class="source">来源：${esc(d.source || "待补充")} ${d.source_url?` · ${esc(d.source_url)}`:""}<br>最后核验：${esc(d.verified_at || "待补充")}</div>`;
  $("#detailPanel").classList.add("open");
  $("#close").onclick=()=>$("#detailPanel").classList.remove("open");
}
function field(k,v){return `<div class="kv"><b>${esc(k)}</b><span>${esc(v||"—")}</span></div>`}
function section(k,v){return `<section class="sec"><h3>${esc(k)}</h3><p>${esc(v||"待核验/待录入")}</p></section>`}

$("#search").oninput=e=>{state.q=e.target.value;render()};
$("#category").onchange=e=>{state.category=e.target.value;render()};
$("#status").onchange=e=>{state.status=e.target.value;render()};

$("#export").onclick=()=>{
  const cols=["id","name","spec","generic","category","manufacturer","form","approval_no","brand_name","indications","dosage","contraindications","adverse_reactions","precautions","special_population","interactions","primary_care_tips","verification_status","source","source_url","verified_at"];
  const csv=[cols.join(","),...state.drugs.map(d=>cols.map(c=>`"${String(d[c]??"").replaceAll('"','""')}"`).join(","))].join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="基层用药助手_药品数据库.csv";a.click();
};

$("#import").onclick=()=>$("#file").click();
$("#file").onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    const lines=r.result.replace(/^\ufeff/,"").split(/\r?\n/).filter(Boolean);
    const headers=lines.shift().split(",").map(x=>x.replace(/^"|"$/g,""));
    const parsed=lines.map(line=>{
      const cells=[]; let cur="",q=false;
      for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"' && line[i+1]==='"'){cur+='"';i++;continue} if(ch==='"'){q=!q;continue} if(ch===','&&!q){cells.push(cur);cur="";}else cur+=ch;} cells.push(cur);
      const o={}; headers.forEach((h,i)=>o[h]=cells[i]||""); return o;
    });
    if(parsed.length){state.drugs=parsed;render();alert(`已导入 ${parsed.length} 条记录。`)}
  };
  r.readAsText(f,"utf-8");
};

const cats=[...new Set(state.drugs.map(d=>d.category))];
$("#category").innerHTML=`<option>全部</option>`+cats.map(x=>`<option>${esc(x)}</option>`).join("");
render();

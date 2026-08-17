(() => {
  const D = window.EMERGENCY_DATA;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const overlay = $('#overlay');
  const modalTitle = $('#modalTitle');
  const modalSubtitle = $('#modalSubtitle');
  const modalContent = $('#modalContent');
  let currentTopicTab = 'complaint';

  const esc = (s='') => String(s).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

  function openModal(title, subtitle, html) {
    modalTitle.textContent = title;
    modalSubtitle.textContent = subtitle || '';
    modalContent.innerHTML = html;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
  }

  function closeModal(){
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
  }

  function renderWorkspace(){
    $('#workspaceGrid').innerHTML = D.workspace.map(x => `
      <button class="workspace-card" data-open="${esc(x.name)}">
        <span class="icon">${x.icon}</span>
        <strong>${esc(x.name)}</strong>
        <small>${esc(x.desc)}</small>
      </button>`).join('');
  }

  function renderCritical(){
    $('#criticalGrid').innerHTML = D.critical.map(x => `
      <button class="critical-card" data-critical="${esc(x.name)}">
        <strong>${esc(x.name)}</strong><small>${esc(x.desc)}</small>
      </button>`).join('');
  }

  function renderTopics(){
    const arr = D[currentTopicTab];
    $('#topicGrid').innerHTML = arr.map(x => `
      <button class="topic-card" data-topic="${esc(x)}">
        <strong>${esc(x)}</strong><span>→</span>
      </button>`).join('');
  }

  function emergencyCard(name, critical=false){
    const sections = ['立即评估','红旗征象','首要处置','必要检查/鉴别','动态复评','转诊/留观','记录要点'];
    openModal(
      name,
      critical ? '高危入口 · 内容框架已建立，医学细节待指南核验' : '急症处置卡 · 临床内容待指南核验',
      `<div class="callout">本页目前只提供安全的信息架构，不提供未经核验的具体药物剂量或操作参数。</div>
      <div class="badges"><span class="badge warn">医学内容：待核验</span><span class="badge">支持收藏</span><span class="badge">支持最近使用</span><span class="badge">支持来源字段</span></div>
      ${sections.map((x,i)=>`<section class="modal-card"><h3>${i+1}. ${x}</h3><p>${x==='红旗征象'?'正式版将在此突出“立即抢救 / 立即转诊 / 升级监护”的触发条件。':'正式版将在此绑定结构化内容、来源、版本和更新时间。'}</p></section>`).join('')}`
    );
  }

  function openWorkspace(name){
    if(name === '抢救用药') return openDrugList();
    if(name === '急救流程') return openListModal('急救流程','流程卡目录',D.flows,'flow');
    if(name === '计算工具') return openTools();
    if(name === '急诊病历') return openRecords();
    if(name === '待办') {
      $('#todoInput').focus();
      document.querySelector('.two-col').scrollIntoView({behavior:'smooth'});
      return;
    }
    if(name === '急症处置') return openListModal('急症处置','按主诉优先进入',D.complaint,'topic');
    const sections = D.genericSections[name] || [];
    openModal(name,'功能结构',sections.map(x=>`<div class="modal-card"><h3>${esc(x)}</h3><p>字段已预留，待后续补充真实内容。</p></div>`).join(''));
  }

  function openListModal(title, subtitle, arr, type){
    openModal(title, subtitle, arr.map(x=>`<div class="search-result" data-${type}="${esc(x)}"><strong>${esc(x)}</strong><span>打开 →</span></div>`).join(''));
  }

  function openDrugList(){
    openModal('抢救用药','所有高风险字段默认显示核验状态', `
      <div class="callout">药物剂量、途径、稀释、泵速等高风险字段在未完成权威核验前保持锁定。</div>
      ${D.drugs.map(x=>`<div class="search-result" data-drug="${esc(x.name)}"><div><strong>${esc(x.name)}</strong><br><span>${esc(x.group)}</span></div><span>待核验 →</span></div>`).join('')}
    `);
  }

  function openDrug(name){
    const drug = D.drugs.find(x=>x.name===name);
    openModal(name, drug?.group || '抢救药物', `
      <div class="badges"><span class="badge warn">未完成临床核验</span><span class="badge">来源：待绑定</span></div>
      ${['适应证','成人剂量','给药途径','稀释方法','泵速/滴速','最大剂量','禁忌与慎用','不良反应','特殊人群','指南来源与更新时间'].map(x=>`<section class="modal-card"><h3>${x}</h3><p>此字段已建模；正式临床数值将在权威来源核验后写入。</p></section>`).join('')}
    `);
  }

  function openFlow(name){
    openModal(name,'流程卡原型', `
      <div class="callout">流程节点已搭建；正式版每个节点都应包含“进入条件、操作、升级条件、复评时间点、来源”。</div>
      ${['触发条件','立即评估','第一优先级处置','第二优先级处置','动态复评','升级/转诊条件','记录闭环'].map((x,i)=>`<section class="modal-card"><h3>${i+1}. ${x}</h3><p>待绑定经审核的临床流程。</p></section>`).join('')}
    `);
  }

  function openTools(){
    openModal('计算工具','高风险计算默认锁定', `
      <section class="modal-card"><h3>输液滴速演示</h3><div class="tool-form">
        <label>液体总量（mL）<input id="volInput" type="number" min="0" placeholder="例如 500"></label>
        <label>计划时间（小时）<input id="hourInput" type="number" min="0" step="0.1" placeholder="例如 4"></label>
        <label>输液器滴系数（滴/mL）<input id="factorInput" type="number" min="0" placeholder="请按本机构输液器填写"></label>
        <button id="calcDripBtn">计算演示</button>
        <div id="dripResult" class="result-box">等待输入。公式：总量 × 滴系数 ÷ 总分钟数。</div>
      </div></section>
      ${D.tools.slice(1).map(x=>`<section class="modal-card"><h3>${esc(x)}</h3><p>界面入口已预留。涉及临床评分与治疗决策的规则，在来源核验前暂不开放自动结论。</p></section>`).join('')}
    `);
  }

  function openRecords(){
    openModal('急诊病历','可编辑结构化模板', `
      <div class="tool-form">
        <label>模板<select id="recordType">${D.records.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>
        <label>记录草稿<textarea id="recordDraft" placeholder="选择模板后生成结构化骨架…"></textarea></label>
        <button id="generateRecordBtn">生成骨架</button>
        <div class="result-box">原型阶段仅在本页编辑，不上传患者信息。正式版需要隐私与权限设计。</div>
      </div>`
    );
  }

  function generateRecord(){
    const type = $('#recordType')?.value || '急诊记录';
    const template = `${type}\n\n主诉：\n现病史/事件经过：\n生命体征：\n意识/气道/呼吸/循环：\n查体：\n辅助检查：\n初步判断及鉴别：\n处置经过：\n动态复评：\n患者去向：\n交代事项：\n记录时间：`;
    const box = $('#recordDraft');
    if(box) box.value = template;
  }

  function setupTodos(){
    const key='emergency_assistant_v02_todos';
    let todos=[];
    try{ todos=JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){}
    if(!todos.length) todos=[{text:'复核抢救车药品',done:false},{text:'补充常用急症流程',done:false}];
    const save=()=>localStorage.setItem(key,JSON.stringify(todos));
    const render=()=>{
      $('#todoList').innerHTML=todos.map((t,i)=>`<li class="${t.done?'done':''}"><input type="checkbox" data-todo-check="${i}" ${t.done?'checked':''}><span>${esc(t.text)}</span><button data-todo-del="${i}">删除</button></li>`).join('');
      $('#todoCount').textContent=`${todos.filter(x=>!x.done).length} 项`;
      save();
    };
    $('#addTodoBtn').addEventListener('click',()=>{
      const v=$('#todoInput').value.trim();
      if(!v) return;
      todos.unshift({text:v,done:false});
      $('#todoInput').value='';
      render();
    });
    $('#todoInput').addEventListener('keydown',e=>{if(e.key==='Enter') $('#addTodoBtn').click();});
    $('#todoList').addEventListener('change',e=>{
      if(e.target.matches('[data-todo-check]')){
        todos[+e.target.dataset.todoCheck].done=e.target.checked;
        render();
      }
    });
    $('#todoList').addEventListener('click',e=>{
      if(e.target.matches('[data-todo-del]')){
        todos.splice(+e.target.dataset.todoDel,1);
        render();
      }
    });
    render();
  }

  function allSearchItems(){
    return [
      ...D.complaint.map(name=>({name,type:'主诉',action:'topic'})),
      ...D.diagnosis.map(name=>({name,type:'诊断',action:'topic'})),
      ...D.drugs.map(x=>({name:x.name,type:'抢救用药',action:'drug'})),
      ...D.flows.map(name=>({name,type:'急救流程',action:'flow'})),
      ...D.tools.map(name=>({name,type:'计算工具',action:'tools'})),
      ...D.records.map(name=>({name,type:'病历模板',action:'records'}))
    ];
  }

  function search(){
    const q=$('#globalSearch').value.trim().toLowerCase();
    if(!q) return;
    const hits=allSearchItems().filter(x=>x.name.toLowerCase().includes(q)||x.type.toLowerCase().includes(q));
    openModal(`搜索：${q}`, `${hits.length} 个结果`, hits.length ? hits.map((x,i)=>`<div class="search-result" data-search-index="${i}"><div><strong>${esc(x.name)}</strong><br><span>${esc(x.type)}</span></div><span>打开 →</span></div>`).join('') : '<div class="modal-card"><h3>暂无结果</h3><p>后续可加入同义词、拼音、商品名/通用名以及症状关联搜索。</p></div>');
    modalContent.dataset.searchResults=JSON.stringify(hits);
  }

  renderWorkspace();
  renderCritical();
  renderTopics();
  setupTodos();

  $('#searchBtn').addEventListener('click',search);
  $('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter') search();});
  $('#closeModalBtn').addEventListener('click',closeModal);
  overlay.addEventListener('click',e=>{if(e.target===overlay) closeModal();});

  $$('[data-topic-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    currentTopicTab=btn.dataset.topicTab;
    $$('[data-topic-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    renderTopics();
  }));

  document.body.addEventListener('click',e=>{
    const open=e.target.closest('[data-open]');
    if(open){openWorkspace(open.dataset.open);return;}
    const c=e.target.closest('[data-critical]');
    if(c){emergencyCard(c.dataset.critical,true);return;}
    const t=e.target.closest('[data-topic]');
    if(t){emergencyCard(t.dataset.topic);return;}
    const d=e.target.closest('[data-drug]');
    if(d){openDrug(d.dataset.drug);return;}
    const f=e.target.closest('[data-flow]');
    if(f){openFlow(f.dataset.flow);return;}
    const s=e.target.closest('[data-search-index]');
    if(s){
      const hits=JSON.parse(modalContent.dataset.searchResults||'[]');
      const item=hits[+s.dataset.searchIndex];
      if(!item) return;
      if(item.action==='topic') emergencyCard(item.name);
      if(item.action==='drug') openDrug(item.name);
      if(item.action==='flow') openFlow(item.name);
      if(item.action==='tools') openTools();
      if(item.action==='records') openRecords();
      return;
    }
    if(e.target.closest('[data-action="open-critical"]')){emergencyCard('立即抢救入口',true);return;}
    if(e.target.matches('[data-scroll="top"]')){window.scrollTo({top:0,behavior:'smooth'});return;}
    if(e.target.id==='calcDripBtn'){
      const v=Number($('#volInput').value),h=Number($('#hourInput').value),fct=Number($('#factorInput').value);
      const box=$('#dripResult');
      if(!(v>0&&h>0&&fct>0)){box.textContent='请完整填写正数。';return;}
      const r=v*fct/(h*60);
      box.textContent=`演示结果：约 ${r.toFixed(1)} 滴/分。请以本机构输液器滴系数和临床要求复核。`;
      return;
    }
    if(e.target.id==='generateRecordBtn'){generateRecord();return;}
  });
})();
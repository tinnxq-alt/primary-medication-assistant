let drugs=[];
fetch('drugs.json').then(r=>r.json()).then(d=>{drugs=d;render(d)});
document.getElementById('search').oninput=e=>{
let k=e.target.value;
render(drugs.filter(x=>JSON.stringify(x).includes(k)));
};
function render(arr){
document.getElementById('list').innerHTML=arr.map(x=>`
<div class="card">
<b>${x.name||''}</b><br>
通用名：${x.generic||''}<br>
分类：${x.category||''}<br>
规格：${x.spec||''}<br>
剂型：${x.form||''}<br>
适应症：${x.indication||''}<br>
用法：${x.dose||''}
</div>`).join('');
}
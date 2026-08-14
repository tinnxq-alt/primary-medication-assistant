let drugs = [];


const list = document.getElementById("drugList");
const count = document.getElementById("count");


//读取数据库

fetch("drugs.json")
.then(res=>res.json())
.then(data=>{

    drugs=data;

    count.innerHTML=drugs.length;

    showDrugs(drugs);

})
.catch(err=>{

    list.innerHTML=
    "<p>药品数据库加载失败</p>";

});



//显示药品

function showDrugs(data){

    list.innerHTML="";


    data.forEach(drug=>{


        let div=document.createElement("div");

        div.className="drug-card";


        div.innerHTML=`

        <h3>
        ${drug.name}
        </h3>

        <p>
        通用名：
        ${drug.generic}
        </p>


        <p>
        分类：
        ${drug.category}
        </p>


        <button onclick='showDetail(${JSON.stringify(drug)})'>
        查看详情
        </button>

        `;


        list.appendChild(div);


    });


}



//搜索

function searchDrug(){


let keyword=
document.getElementById("searchInput").value;


let category=
document.getElementById("category").value;



let result=drugs.filter(item=>{


let matchKeyword=

item.name.includes(keyword)
||
item.generic.includes(keyword);



let matchCategory=

category===""
||
item.category.includes(category);



return matchKeyword&&matchCategory;


});


showDrugs(result);


}



//分类筛选

function filterCategory(type){


let result=

drugs.filter(item=>

item.category.includes(type)

);


showDrugs(result);


}



//详情

function showDetail(drug){


document.getElementById("detailName")
.innerHTML=drug.name;



document.getElementById("detailContent")
.innerHTML=

`

<p>
通用名：
${drug.generic}
</p>

<p>
分类：
${drug.category}
</p>


<p>
规格：
${drug.spec||""}
</p>


<p>
适应症：
${drug.indication||""}
</p>


<p>
常用剂量：
${drug.dose||""}
</p>


<p>
注意事项：
${drug.warning||""}
</p>

`;



document
.getElementById("detail")
.classList
.remove("hidden");


}



//关闭详情

function closeDetail(){

document
.getElementById("detail")
.classList
.add("hidden");

}

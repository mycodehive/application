(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const els = {
    input:$("fileInput"), choose:$("chooseBtn"), drop:$("dropZone"),
    queue:$("queueSection"), list:$("fileList"), summary:$("queueSummary"),
    clear:$("clearBtn"), convertAll:$("convertAllBtn"),
    downloadBar:$("downloadBar"), downloadAll:$("downloadAllBtn"),
    doneTitle:$("doneTitle"), doneDetail:$("doneDetail"), toast:$("toastRoot")
  };

  const items = [];
  let busy = false;

  const uid = () => "f_" + Math.random().toString(36).slice(2,9) + Date.now().toString(36);
  const fmtSize = bytes => {
    if(bytes < 1024) return bytes + " B";
    if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/1024/1024).toFixed(2) + " MB";
  };

  function toast(message,type=""){
    const node=document.createElement("div");
    node.className="toast "+type;
    node.textContent=message;
    els.toast.appendChild(node);
    setTimeout(()=>node.remove(),2600);
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function addFiles(fileList){
    const incoming=[...fileList];
    let rejected=0;
    incoming.forEach(file=>{
      if(!/\.xls$/i.test(file.name)){ rejected++; return; }
      const duplicate=items.some(x=>x.file.name===file.name && x.file.size===file.size && x.file.lastModified===file.lastModified);
      if(duplicate) return;
      items.push({
        id:uid(),file,status:"ready",error:null,workbook:null,
        output:null,outputName:file.name.replace(/\.xls$/i,"")+".xlsx",
        audit:null
      });
    });
    if(rejected) toast(".xls 파일만 추가할 수 있습니다.","error");
    render();
  }

  function workbookAudit(wb){
    let cells=0,styled=0,formulas=0,links=0,merges=0,rows=0,cols=0,comments=0;
    for(const name of wb.SheetNames){
      const ws=wb.Sheets[name];
      merges += ws["!merges"]?.length || 0;
      rows += ws["!rows"]?.filter(Boolean).length || 0;
      cols += ws["!cols"]?.filter(Boolean).length || 0;
      for(const key of Object.keys(ws)){
        if(key[0]==="!") continue;
        const cell=ws[key];
        if(!cell || typeof cell!=="object") continue;
        cells++;
        if(cell.s && Object.keys(cell.s).length) styled++;
        if(cell.f) formulas++;
        if(cell.l) links++;
        if(cell.c?.length) comments += cell.c.length;
      }
    }
    return {sheets:wb.SheetNames.length,cells,styled,formulas,links,merges,rows,cols,comments};
  }

  async function inspectItem(item){
    if(item.workbook || item.status==="reading") return;
    item.status="reading"; render();
    try{
      if(typeof XLSX==="undefined") throw new Error("변환 라이브러리를 불러오지 못했습니다.");
      const buffer=await item.file.arrayBuffer();
      item.workbook=XLSX.read(buffer,{
        type:"array",
        cellStyles:true,
        cellNF:true,
        cellText:true,
        cellDates:false,
        cellHTML:false,
        bookVBA:true,
        bookFiles:true,
        bookDeps:true
      });
      item.audit=workbookAudit(item.workbook);
      item.status="ready";
    }catch(error){
      console.error(error);
      item.status="error";
      item.error=error?.message || "파일을 읽을 수 없습니다.";
    }
    render();
  }

  async function convertItem(item){
    if(item.status==="done") return true;
    if(item.status==="error" && !item.workbook) return false;
    try{
      if(!item.workbook) await inspectItem(item);
      if(!item.workbook) return false;
      item.status="converting"; item.error=null; render();
      await new Promise(r=>setTimeout(r,20));

      const output=XLSX.write(item.workbook,{
        type:"array",
        bookType:"xlsx",
        cellStyles:true,
        bookSST:true,
        compression:true,
        Props:item.workbook.Props
      });

      item.output=new Blob([output],{
        type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      item.status="done";
      render();
      return true;
    }catch(error){
      console.error(error);
      item.status="error";
      item.error=error?.message || "변환 중 오류가 발생했습니다.";
      render();
      return false;
    }
  }

  async function convertAll(){
    if(busy || !items.length) return;
    busy=true; render();
    for(const item of items) await convertItem(item);
    busy=false; render();
    const done=items.filter(x=>x.status==="done").length;
    if(done) toast(done+"개 파일을 XLSX로 변환했습니다.","ok");
  }

  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  async function downloadAll(){
    const done=items.filter(x=>x.status==="done"&&x.output);
    if(!done.length) return;
    if(done.length===1){downloadBlob(done[0].output,done[0].outputName);return;}
    try{
      if(typeof JSZip==="undefined") throw new Error("ZIP 라이브러리를 불러오지 못했습니다.");
      const zip=new JSZip();
      done.forEach(item=>zip.file(item.outputName,item.output));
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      downloadBlob(blob,"convxls_"+new Date().toISOString().slice(0,10)+".zip");
    }catch(error){
      console.error(error);
      toast("묶음 다운로드에 실패했습니다. 개별 다운로드를 이용해주세요.","error");
    }
  }

  function removeItem(id){
    if(busy) return;
    const index=items.findIndex(x=>x.id===id);
    if(index>=0) items.splice(index,1);
    render();
  }

  function clearAll(){
    if(busy) return;
    items.length=0; render();
  }

  function render(){
    els.queue.classList.toggle("hidden",items.length===0);
    els.drop.classList.toggle("hidden",items.length>0);
    els.summary.textContent=items.length+"개 파일 · "+fmtSize(items.reduce((s,x)=>s+x.file.size,0));
    els.convertAll.disabled=busy || !items.some(x=>x.status!=="done"&&x.status!=="reading");
    els.clear.disabled=busy;

    els.list.innerHTML=items.map(item=>{
      const a=item.audit;
      const audit=a?[
        a.sheets+" 시트",
        a.cells.toLocaleString()+" 셀",
        a.styled.toLocaleString()+" 서식셀",
        a.merges+" 병합",
        a.formulas+" 수식"
      ].map(x=>"<span>"+x+"</span>").join(""):"<span>파일 분석 전</span>";
      const stateText={
        ready:item.workbook?"변환 대기":"준비",
        reading:"분석 중",
        converting:"변환 중",
        done:"완료",
        error:"오류"
      }[item.status]||item.status;
      const action=item.status==="done"
        ? '<button class="file-action" data-download="'+item.id+'">다운로드</button>'
        : item.status==="error"
          ? '<button class="file-action" data-retry="'+item.id+'">다시 시도</button>'
          : "";
      return '<div class="file-row '+item.status+'">'+
        '<div class="file-icon">XLS</div>'+
        '<div class="file-main"><strong title="'+escapeHtml(item.file.name)+'">'+escapeHtml(item.file.name)+'</strong>'+
        '<small>'+fmtSize(item.file.size)+(item.error?' · '+escapeHtml(item.error):'')+'</small>'+
        '<div class="progress"><i></i></div></div>'+
        '<div class="audit">'+audit+'</div>'+
        '<div class="file-state"><span class="badge '+item.status+'">'+stateText+'</span>'+action+
        '<button class="remove-btn" data-remove="'+item.id+'" title="목록에서 제거">×</button></div>'+
      '</div>';
    }).join("");

    els.list.querySelectorAll("[data-remove]").forEach(btn=>btn.addEventListener("click",()=>removeItem(btn.dataset.remove)));
    els.list.querySelectorAll("[data-download]").forEach(btn=>btn.addEventListener("click",()=>{
      const item=items.find(x=>x.id===btn.dataset.download);
      if(item?.output) downloadBlob(item.output,item.outputName);
    }));
    els.list.querySelectorAll("[data-retry]").forEach(btn=>btn.addEventListener("click",async()=>{
      const item=items.find(x=>x.id===btn.dataset.retry);
      if(item){item.status="ready";item.error=null;item.workbook=null;await convertItem(item);}
    }));

    const done=items.filter(x=>x.status==="done").length;
    els.downloadBar.classList.toggle("hidden",done===0);
    els.doneTitle.textContent=done+"개 파일 변환 완료";
    els.doneDetail.textContent=done===items.length?"모든 파일을 다운로드할 수 있습니다.":items.length+"개 중 "+done+"개 완료";
    els.downloadAll.textContent=done>1?"ZIP으로 전체 다운로드":"XLSX 다운로드";
  }

  els.choose.addEventListener("click",()=>els.input.click());
  els.input.addEventListener("change",()=>{addFiles(els.input.files);els.input.value="";});
  els.drop.addEventListener("dragover",event=>{event.preventDefault();els.drop.classList.add("dragover");});
  els.drop.addEventListener("dragleave",()=>els.drop.classList.remove("dragover"));
  els.drop.addEventListener("drop",event=>{
    event.preventDefault();els.drop.classList.remove("dragover");addFiles(event.dataTransfer.files);
  });
  els.drop.addEventListener("click",event=>{if(!event.target.closest("button")) els.input.click();});
  els.convertAll.addEventListener("click",convertAll);
  els.clear.addEventListener("click",clearAll);
  els.downloadAll.addEventListener("click",downloadAll);

  window.addEventListener("dragover",event=>event.preventDefault());
  window.addEventListener("drop",event=>{if(!els.drop.contains(event.target))event.preventDefault();});

  render();
})();

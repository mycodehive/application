
const STORAGE = {
  SHEET_URL: "sejongLunchSheetUrl",
  LOCAL_DB: "sejongLunchLocalDb",
  LOCAL_DB_NAME: "sejongLunchLocalDbName",
};

const state = {
  restaurants: [],
  usingGoogleSheet: false,
  usingLocalExcel: false,
  sourceLabel: "기본 DB",
  sheetUrl: localStorage.getItem(STORAGE.SHEET_URL) || "",
  lastPicked: [],
};

const $ = (id) => document.getElementById(id);
const els = {
  category: $("category"),
  distance: $("distance"),
  price: $("price"),
  candidate: $("candidate"),
  dbDot: $("dbDot"),
  dbText: $("dbText"),
  pick: $("pick"),
  pickCount: $("pickCount"),
  result: $("result"),
  resultGrid: $("resultGrid"),
  resultSummary: $("resultSummary"),
  reroll: $("reroll"),
  verified: $("verified"),
  dbButton: $("dbButton"),
  modal: $("modalBackdrop"),
  closeModal: $("closeModal"),
  sheetUrl: $("sheetUrl"),
  saveSheet: $("saveSheet"),
  useDefault: $("useDefault"),
  excelFile: $("excelFile"),
  excelStatus: $("excelStatus"),
  toast: $("toast"),
};

function normalizeCategory(raw=""){
  const s = String(raw).trim();
  const known = [
    "한식","일식","중식","분식","양식","베트남","태국","인도","멕시코","대만",
    "아시아","샤브샤브","샐러드","버거","브런치","샌드위치","간편식","닭요리"
  ];
  for(const k of known) if(s.includes(k)) return k;
  const first = s.split("/")[0].trim();
  return first === "교내" ? "기타" : (first || "기타");
}

function parsePrice(text=""){
  const s = String(text).replace(/,/g,"").trim();
  if(!s || s.includes("확인 필요")) return null;
  if(s.includes("1만원 이하")) return 10000;
  const man = s.match(/(\d+(?:\.\d+)?)만원/);
  if(man) return Number(man[1]) * 10000;
  const nums = (s.match(/\d+/g)||[]).map(Number);
  if(!nums.length) return null;
  if(nums.length >= 2 && (s.includes("~") || s.includes("-"))) return (nums[0]+nums[1])/2;
  return nums[0];
}

function matchesPrice(text, band){
  if(band === "all") return true;
  const p = parsePrice(text);
  if(p == null) return false;
  if(band === "under10000") return p <= 10000;
  if(band === "10000to20000") return p > 10000 && p <= 20000;
  if(band === "20000to30000") return p > 20000 && p <= 30000;
  if(band === "over30000") return p > 30000;
  return true;
}

function isLunchAvailable(v=""){
  const s = String(v).trim();
  return s === "가능" || s.startsWith("가능(");
}

function getFilters(){
  return {
    category: els.category.value,
    maxDistance: Number(els.distance.value),
    price: els.price.value,
    pickCount: Math.min(3, Math.max(1, Number(els.pickCount.value || 3))),
  };
}

function candidates(){
  const f = getFilters();
  return state.restaurants.filter(r => {
    if(!r.name) return false;
    if(Number(r.distance || 999999) > f.maxDistance) return false;

    if(f.category !== "전체"){
      const raw = String(r.category || "");
      if(normalizeCategory(raw) !== f.category && !raw.includes(f.category)) return false;
    }

    if(!matchesPrice(r.price, f.price)) return false;
    if(!isLunchAvailable(r.todayLunch)) return false;
    return true;
  });
}

function updateCandidate(){
  const list = candidates();
  const requested = Math.min(3, Math.max(1, Number(els.pickCount.value || 3)));
  const actual = Math.min(requested, list.length);

  els.candidate.innerHTML = list.length
    ? `조건에 맞는 식당이 <strong>${list.length}곳</strong> 있습니다. 무작위로 <strong>${actual}곳</strong> 추천합니다.`
    : `조건에 맞는 식당이 <strong>0곳</strong>입니다. 조건을 넓혀보세요.`;

  els.pick.disabled = !list.length;
}

function updateCategories(){
  const current = els.category.value || "전체";
  const cats = [...new Set(state.restaurants.map(r => normalizeCategory(r.category)).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"ko"));
  els.category.innerHTML = `<option value="전체">전체</option>` +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if([...els.category.options].some(o => o.value === current)) els.category.value = current;
}

function renderSource(){
  const connected = state.usingGoogleSheet || state.usingLocalExcel;
  els.dbDot.classList.toggle("online", connected);
  els.dbText.textContent = `${state.sourceLabel} · ${state.restaurants.length.toLocaleString()}곳`;
  const dates = state.restaurants.map(r=>r.verifiedDate).filter(Boolean).sort();
  els.verified.textContent = dates.length ? `DB 검증일 ${dates[dates.length-1]}` : "";
}

function shuffleArray(items){
  const arr = [...items];
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildNaverMapUrl(restaurant){
  const query = String(restaurant.name || "").trim();
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

function restaurantCardHtml(r, index, totalCandidates){
  const numberLabel = index + 1;
  const category = escapeHtml(r.category || "-");
  const name = escapeHtml(r.name || "-");
  const menu = escapeHtml(r.menu || "대표 메뉴 정보 없음");
  const distance = `${Number(r.distance || 0).toLocaleString()}m`;
  const price = escapeHtml(r.price || "확인 필요");
  const hours = escapeHtml(r.hours || r.todayLunch || "확인 필요");
  const address = escapeHtml(r.address || "주소 정보 없음");
  const mapUrl = buildNaverMapUrl(r);

  return `
    <article class="result-card">
      <div class="result-head">
        <div class="result-label">TODAY'S RANDOM PICK · ${numberLabel}</div>
        <div class="result-name">${name}</div>
        <div class="result-menu">${menu}</div>
      </div>
      <div class="result-body">
        <div class="match-pill">후보 ${totalCandidates}곳 중 무작위 선정</div>
        <div class="facts">
          <div class="fact"><small>분류</small><strong>${category}</strong></div>
          <div class="fact"><small>거리</small><strong>${distance}</strong></div>
          <div class="fact"><small>가격</small><strong>${price}</strong></div>
          <div class="fact"><small>영업</small><strong>${hours}</strong></div>
        </div>
        <div class="address">${address}</div>
        <div class="actions one">
          <a class="action secondary" href="${mapUrl}" target="_blank" rel="noopener">📍 네이버지도 보기</a>
        </div>
      </div>
    </article>
  `;
}

function pickRestaurant(){
  const list = candidates();
  if(!list.length) return;

  const requested = Math.min(3, Math.max(1, Number(els.pickCount.value || 3)));
  const count = Math.min(requested, list.length);

  els.pick.disabled = true;
  els.pick.textContent = "오늘의 점심을 고르는 중…";

  setTimeout(() => {
    // 중복 없이 무작위 추첨
    let pool = [...list];

    // 직전 추첨 식당들이 있다면 후보가 충분할 때 우선 제외
    if(Array.isArray(state.lastPicked) && state.lastPicked.length && pool.length > count){
      const previousNames = new Set(state.lastPicked);
      const withoutPrevious = pool.filter(r => !previousNames.has(r.name));
      if(withoutPrevious.length >= count) pool = withoutPrevious;
    }

    const selected = shuffleArray(pool).slice(0, count);
    state.lastPicked = selected.map(r => r.name);

    els.resultSummary.textContent =
      selected.length === 1
        ? "오늘의 추천 1곳"
        : `오늘의 추천 ${selected.length}곳`;

    els.resultGrid.innerHTML = selected
      .map((r, i) => restaurantCardHtml(r, i, list.length))
      .join("");

    els.result.classList.add("show");
    els.pick.disabled = false;
    els.pick.textContent = "🎲 오늘의 점심 최대 3곳 뽑기";
    els.result.scrollIntoView({behavior:"smooth", block:"nearest"});
  }, 450);
}

function escapeHtml(v=""){
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function parseCSV(text){
  const rows=[]; let row=[]; let cell=""; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch === '"' && text[i+1] === '"'){cell+='"';i++;}
      else if(ch === '"') quoted=false;
      else cell+=ch;
    }else{
      if(ch === '"') quoted=true;
      else if(ch === ","){row.push(cell);cell="";}
      else if(ch === "\n"){row.push(cell);rows.push(row);row=[];cell="";}
      else if(ch !== "\r") cell+=ch;
    }
  }
  if(cell.length || row.length){row.push(cell);rows.push(row);}
  return rows;
}

function rowsToRestaurants(rows){
  if(!rows.length) return [];
  const headers = rows[0].map(x=>String(x ?? "").trim());
  const idx = (...names)=>{
    for(const n of names){const i=headers.indexOf(n);if(i>=0)return i;}
    return -1;
  };
  const I = {
    category:idx("분류"),
    name:idx("식당명"),
    menu:idx("주메뉴","대표메뉴"),
    price:idx("가격","가격대"),
    distance:idx("정문거리(m)","거리_m","거리"),
    zone:idx("거리구간"),
    address:idx("주소"),
    todayLunch:idx("오늘점심","오늘 점심"),
    hours:idx("일요일 영업","영업시간"),
    rating:idx("평점"),
    reviews:idx("리뷰수"),
    note:idx("비고"),
    sourceUrl:idx("출처URL","지도URL","URL"),
    verifiedDate:idx("검증일")
  };

  if(I.category < 0 || I.name < 0 || I.distance < 0){
    throw new Error("필수 열(분류, 식당명, 정문거리(m))을 찾을 수 없습니다.");
  }

  const value=(r,i)=>i>=0?String(r[i] ?? "").trim():"";
  return rows.slice(1)
    .filter(r => r.some(x => String(x ?? "").trim()))
    .map((r,n)=>({
      id:n+1,
      category:value(r,I.category),
      name:value(r,I.name),
      menu:value(r,I.menu),
      price:value(r,I.price),
      distance:Number(value(r,I.distance).replace(/[^\d.]/g,"")) || 999999,
      zone:value(r,I.zone),
      address:value(r,I.address),
      todayLunch:value(r,I.todayLunch),
      hours:value(r,I.hours),
      rating:value(r,I.rating),
      reviews:value(r,I.reviews),
      note:value(r,I.note),
      sourceUrl:value(r,I.sourceUrl),
      verifiedDate:value(r,I.verifiedDate)
    }))
    .filter(r=>r.name);
}

function sheetUrlToCsv(input){
  const v = String(input||"").trim();
  if(!v) return "";
  if(/output=csv|tqx=out:csv/i.test(v)) return v;

  const match = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if(!match) return v;

  const sheetId = match[1];
  const gidMatch = v.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "";
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  return gid ? `${base}&gid=${gid}` : `${base}&sheet=${encodeURIComponent("전체_DB")}`;
}

async function loadGoogleSheet(input, save=true){
  const csvUrl = sheetUrlToCsv(input);
  if(!csvUrl) throw new Error("Google Sheet 주소를 입력하세요.");

  const res = await fetch(csvUrl,{cache:"no-store"});
  if(!res.ok) throw new Error("Google Sheet를 불러올 수 없습니다. 공개/웹 게시 설정을 확인하세요.");
  const text = await res.text();

  if(/<!doctype html|<html/i.test(text.slice(0,500))){
    throw new Error("시트 대신 로그인/HTML 페이지가 반환됐습니다. Google Sheets로 변환 후 공개 또는 웹 게시가 필요합니다.");
  }

  const parsed = rowsToRestaurants(parseCSV(text));
  if(!parsed.length) throw new Error("시트에서 식당 데이터를 찾지 못했습니다.");

  state.restaurants = parsed;
  state.usingGoogleSheet = true;
  state.usingLocalExcel = false;
  state.sourceLabel = "Google Sheets";
  state.sheetUrl = input;
  if(save) localStorage.setItem(STORAGE.SHEET_URL, input);
  localStorage.removeItem(STORAGE.LOCAL_DB);
  localStorage.removeItem(STORAGE.LOCAL_DB_NAME);
  afterLoad();
}

async function loadExcelFile(file){
  if(!file) return;
  if(typeof XLSX === "undefined"){
    throw new Error("Excel 읽기 모듈을 불러오지 못했습니다. 인터넷 연결 후 다시 시도하세요.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {type:"array"});

  const sheetName = workbook.SheetNames.includes("전체_DB")
    ? "전체_DB"
    : workbook.SheetNames[0];

  if(!sheetName) throw new Error("Excel 파일에 시트가 없습니다.");

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header:1,
    raw:false,
    defval:""
  });

  const parsed = rowsToRestaurants(rows);
  if(!parsed.length) throw new Error("Excel 파일에서 식당 데이터를 찾지 못했습니다.");

  state.restaurants = parsed;
  state.usingGoogleSheet = false;
  state.usingLocalExcel = true;
  state.sourceLabel = `Excel · ${file.name}`;
  state.sheetUrl = "";

  // 126 rows are small enough to persist in browser storage.
  try{
    localStorage.setItem(STORAGE.LOCAL_DB, JSON.stringify(parsed));
    localStorage.setItem(STORAGE.LOCAL_DB_NAME, file.name);
    localStorage.removeItem(STORAGE.SHEET_URL);
  }catch(e){
    console.warn("로컬 DB 저장 실패", e);
  }

  afterLoad();
  els.excelStatus.textContent = `${file.name} · ${parsed.length}개 식당 연결 완료`;
  els.excelStatus.classList.add("show");
}

function loadDefault(){
  if(!Array.isArray(window.DEFAULT_RESTAURANTS)){
    throw new Error("기본 DB를 불러오지 못했습니다.");
  }

  state.restaurants = window.DEFAULT_RESTAURANTS;
  state.usingGoogleSheet = false;
  state.usingLocalExcel = false;
  state.sourceLabel = "기본 DB";
  state.sheetUrl = "";
  afterLoad();
}

function loadStoredLocalDb(){
  const raw = localStorage.getItem(STORAGE.LOCAL_DB);
  if(!raw) return false;
  try{
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed) || !parsed.length) return false;
    state.restaurants = parsed;
    state.usingLocalExcel = true;
    state.usingGoogleSheet = false;
    state.sourceLabel = `Excel · ${localStorage.getItem(STORAGE.LOCAL_DB_NAME) || "저장된 파일"}`;
    afterLoad();
    return true;
  }catch(e){
    return false;
  }
}

function afterLoad(){
  updateCategories();
  renderSource();
  updateCandidate();
  state.lastPicked=[];
}

function toast(msg){
  els.toast.textContent=msg;
  els.toast.classList.add("show");
  setTimeout(()=>els.toast.classList.remove("show"),2600);
}

function openModal(){
  els.sheetUrl.value = state.sheetUrl || "";
  els.excelStatus.classList.remove("show");
  els.modal.classList.add("show");
}
function closeModal(){els.modal.classList.remove("show");}

async function init(){
  try{
    if(loadStoredLocalDb()) return;

    if(state.sheetUrl){
      try{
        await loadGoogleSheet(state.sheetUrl,false);
        return;
      }catch(e){
        console.warn(e);
        toast("Google Sheets 연결 실패 · 기본 DB로 시작합니다.");
      }
    }

    loadDefault();
  }catch(e){
    els.candidate.textContent=e.message;
  }
}

[els.category,els.distance,els.price,els.pickCount].forEach(el=>{
  el.addEventListener("change",()=>{
    state.lastPicked=[];
    updateCandidate();
  });
});

document.querySelectorAll(".quick").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".quick").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    const kind=btn.dataset.kind;
    if(kind==="near"){els.distance.value="500";els.price.value="all";}
    if(kind==="budget"){els.distance.value="1000";els.price.value="under10000";}
    if(kind==="walk"){els.distance.value="300";els.price.value="all";}
    if(kind==="any"){els.category.value="전체";els.distance.value="2000";els.price.value="all";}
    state.lastPicked=[];
    updateCandidate();
  });
});

els.pick.addEventListener("click",pickRestaurant);
els.reroll.addEventListener("click",pickRestaurant);
els.dbButton.addEventListener("click",openModal);
els.closeModal.addEventListener("click",closeModal);
els.modal.addEventListener("click",e=>{if(e.target===els.modal)closeModal();});

els.excelFile.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  els.excelStatus.textContent = "Excel 파일을 읽는 중…";
  els.excelStatus.classList.add("show");
  try{
    await loadExcelFile(file);
    toast(`Excel DB ${state.restaurants.length}곳 연결 완료`);
    setTimeout(closeModal, 500);
  }catch(err){
    els.excelStatus.textContent = err.message;
    toast(err.message);
  }
});

els.saveSheet.addEventListener("click",async()=>{
  els.saveSheet.disabled=true;
  els.saveSheet.textContent="연결 중…";
  try{
    await loadGoogleSheet(els.sheetUrl.value,true);
    closeModal();
    toast("Google Sheets DB에 연결했습니다.");
  }catch(e){
    toast(e.message);
  }finally{
    els.saveSheet.disabled=false;
    els.saveSheet.textContent="Google Sheets 연결";
  }
});

els.useDefault.addEventListener("click",()=>{
  localStorage.removeItem(STORAGE.LOCAL_DB);
  localStorage.removeItem(STORAGE.LOCAL_DB_NAME);
  localStorage.removeItem(STORAGE.SHEET_URL);
  loadDefault();
  closeModal();
  toast("기본 126개 식당 DB를 사용합니다.");
});

init();

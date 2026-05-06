/* ---------- Firebase 설정 ---------- */
    const firebaseConfig = {
      apiKey: "AIzaSyBrBnVuXca2Ou1oMFOLzq3KGEN8xiK5L_U",
      authDomain: "film-find-5242d.firebaseapp.com",
      projectId: "film-find-5242d",
      storageBucket: "film-find-5242d.firebasestorage.app",
      messagingSenderId: "185123433624",
      appId: "1:185123433624:web:269eb9b4b6437887f2f4ed",
      measurementId: "G-V9KL8XS9KJ"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    const FILM_COLLECTION = "films";
    const HISTORY_COLLECTION = "history";

    const PLATE_COLLECTION = "plates";
    const PLATE_USAGE_SUB = "usage";
    const FILM_PRINT_SUB = "printHistory";
    const CONFIG_COLLECTION = "appConfig";
    const AUTH_DOC = "auth";

    /* ---------- 모드/로그인 ---------- */
    const MODE_ADMIN = "admin";
    const MODE_PRINTER = "printer";
    const MODE_VIEWER = "viewer";

    const DEFAULT_ADMIN_PW = "0605";
    const DEFAULT_PRINTER_PW = "1234";
    const DEFAULT_VIEWER_PW = "0000";

    /* ✅ 로그인 유지 규칙:
       - 앱/브라우저 창 완전 종료 후 재접속 시 재로그인
       -> localStorage 금지 / sessionStorage 사용 */
    const UNLOCK_KEY = "filmAppUnlocked";
    const UNLOCK_MODE_KEY = "filmAppMode";

    /* ---------- 앱 설정/키 ---------- */
    const DEVICE_KEY = "filmDeviceLabel";
    const SORT_KEY = "filmSortOption";
    const THEME_KEY = "filmTheme";
    const VIEW_KEY = "filmViewMode";

    let films = [];
    let plates = [];

    let currentSearchText = "";
    let unsubscribeFilms = null;
    let unsubscribePlates = null;

    let historyEntries = [];
    let historyLoaded = false;

    const VISIBLE_STEP = 30;
    let visibleCount = VISIBLE_STEP;
    let loadingMore = false;

    let currentViewMode = localStorage.getItem(VIEW_KEY) || "list";

    let currentSelectedImageDataUrl = null;
    let currentImageRotation = 0;

    let currentMemoFilmId = null;
    let currentFilmPrintId = null;
    let currentFilmPrintHistoryId = null;
    let currentHistoryNoteId = null;

    let currentTab = "films";
    let currentMode = null;

    let authConfig = { adminPw: DEFAULT_ADMIN_PW, printerPw: DEFAULT_PRINTER_PW, viewerPw: DEFAULT_VIEWER_PW };

    let currentPlateMemoId = null;
    let currentPlateUseId = null;
    let currentPlateHistoryId = null;

    /* ---------- 유틸 ---------- */
    function showToast(msg) {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function formatDate(iso) { return iso ? iso : "-"; }

    function formatShortDate(iso) {
      if (!iso) return "-";
      const parts = String(iso).split("-");
      if (parts.length !== 3) return iso;
      return `${parts[0].slice(2)}/${parts[1]}/${parts[2]}`;
    }

    function formatTs(ts) {
      const d = new Date(ts || 0);
      if (isNaN(d.getTime())) return "-";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${day} ${hh}:${mm}`;
    }

    function safeStr(v){ return String(v ?? "").trim(); }

    /* ---------- 로컬 설정 ---------- */
    function getSortOption(){ return localStorage.getItem(SORT_KEY) || "updated"; }
    function setSortOption(opt){ localStorage.setItem(SORT_KEY, opt); }

    function getDeviceLabel(){ return localStorage.getItem(DEVICE_KEY) || ""; }
    function setDeviceLabel(label){
      localStorage.setItem(DEVICE_KEY, label);
      const badgeText = document.getElementById("deviceBadgeText");
      if (badgeText) badgeText.textContent = label || "기기 미지정";
    }

    function getTheme(){ return localStorage.getItem(THEME_KEY) || "default"; }
    function setTheme(theme){
      localStorage.setItem(THEME_KEY, theme);
      const root = document.documentElement;
      if (theme === "default") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", theme);
    }

    function setViewMode(mode){
      currentViewMode = mode;
      localStorage.setItem(VIEW_KEY, mode);
      applyViewMode();
    }

    function applyViewMode(){
      const list = document.getElementById("list");
      const btn = document.getElementById("viewToggleBtn");
      if (!list || !btn) return;
      if (currentViewMode === "gallery"){
        list.classList.add("gallery");
        btn.textContent = "리스트";
      } else {
        list.classList.remove("gallery");
        btn.textContent = "갤러리";
      }
    }

    /* ---------- 패널 닫기 ---------- */
    function closeAllPanels(){
      const ids = ["settingsCard","historyCard","formCard","plateFormCard"];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
    }

    /* ---------- 이미지 뷰어 ---------- */
        /* [수정] 이미지 뷰어 열기 (초기화 로직 추가됨) */
    function openImageViewer(src){
      const viewer = document.getElementById("imageViewer");
      const img = document.getElementById("viewerImage");
      if (!viewer || !img) return;
      
      img.src = src || "";
      
      // ★ 뷰어 열 때 위치/배율 초기화 ★
      viewerState.scale = 1;
      viewerState.pointX = 0;
      viewerState.pointY = 0;
      updateViewerTransform(); 
      
      viewer.style.display = "flex";
    }

    function closeImageViewer(){
      const viewer = document.getElementById("imageViewer");
      const img = document.getElementById("viewerImage");
      if (!viewer || !img) return;
      viewer.style.display = "none";
      img.src = "";
    }

    /* ---------- 검색 placeholder ---------- */
    function updateSearchPlaceholder(){
      const searchInput = document.getElementById("searchInput");
      if (!searchInput) return;
      if (currentTab === "films") {
        searchInput.placeholder = "제품명 / 필름번호 / 제판타입 / 위치 / 제판방법 / MESH / 요청 인쇄자 검색";
      } else {
        searchInput.placeholder = "제품명 / 필름번호 / 판번호 / 텐션 / 판위치 / MESH 검색";
      }
    }

    function setActiveTabUI(){
      const tabFilmsBtn = document.getElementById("tabFilmsBtn");
      const tabPlatesBtn = document.getElementById("tabPlatesBtn");
      if (tabFilmsBtn) tabFilmsBtn.classList.toggle("active", currentTab === "films");
      if (tabPlatesBtn) tabPlatesBtn.classList.toggle("active", currentTab === "plates");

      updateSearchPlaceholder();
      closeAllPanels();

      const si = document.getElementById("searchInput");
      if (si) si.value = "";
      currentSearchText = "";
      visibleCount = VISIBLE_STEP;

      renderCurrentTab();
    }

    function switchToTab(tab){
      if (currentMode === MODE_PRINTER && tab !== "plates") return;
      currentTab = tab;
      setActiveTabUI();
    }

    /* ---------- 모드 UI ---------- */
    function applyModeUI(){
      const modeText = document.getElementById("modeChipText");
      const subtitle = document.getElementById("subtitleText");
      const settingsBtn = document.getElementById("settingsBtn");
      const historyBtn = document.getElementById("historyBtn");
      const exportBtn = document.getElementById("exportBtn");
      const importBtn = document.getElementById("importBtn");
      const newFilmBtn = document.getElementById("newFilmBtn");
      const viewToggleBtn = document.getElementById("viewToggleBtn");
      const pwSection = document.getElementById("pwSection");
      const printerListSection = document.getElementById("printerListSection");

      const tabFilmsBtn = document.getElementById("tabFilmsBtn");
      const tabPlatesBtn = document.getElementById("tabPlatesBtn");

      if (currentMode === MODE_ADMIN){
        if (modeText) modeText.textContent = "관리자";
        if (subtitle) subtitle.textContent = "필름/판 관리";
        if (settingsBtn) settingsBtn.style.display = "inline-block";
        if (historyBtn) historyBtn.style.display = "inline-block";
        if (exportBtn) exportBtn.style.display = "inline-block";
        if (importBtn) importBtn.style.display = "inline-block";
        if (newFilmBtn) newFilmBtn.style.display = "inline-block";
        if (viewToggleBtn) viewToggleBtn.style.display = "inline-block";
        if (pwSection) pwSection.style.display = "block";
        if (printerListSection) printerListSection.style.display = "block";

        if (tabFilmsBtn) tabFilmsBtn.style.display = "inline-flex";
        if (tabPlatesBtn) tabPlatesBtn.style.display = "inline-flex";
      }

      if (currentMode === MODE_PRINTER){
        if (modeText) modeText.textContent = "인쇄기사";
        if (subtitle) subtitle.textContent = "판 전용";
        if (settingsBtn) settingsBtn.style.display = "none";
        if (historyBtn) historyBtn.style.display = "none";
        if (exportBtn) exportBtn.style.display = "none";
        if (importBtn) importBtn.style.display = "none";
        if (newFilmBtn) newFilmBtn.style.display = "none";
        if (viewToggleBtn) viewToggleBtn.style.display = "none";
        if (pwSection) pwSection.style.display = "none";
        if (printerListSection) printerListSection.style.display = "none";

        if (tabFilmsBtn) tabFilmsBtn.style.display = "none";
        if (tabPlatesBtn) tabPlatesBtn.style.display = "inline-flex";

        currentTab = "plates";
        setActiveTabUI();
      }

      if (currentMode === MODE_VIEWER){
        if (modeText) modeText.textContent = "조회";
        if (subtitle) subtitle.textContent = "조회 전용";
        if (settingsBtn) settingsBtn.style.display = "none";
        if (historyBtn) historyBtn.style.display = "none";
        if (exportBtn) exportBtn.style.display = "none";
        if (importBtn) importBtn.style.display = "none";
        if (newFilmBtn) newFilmBtn.style.display = "none";
        if (viewToggleBtn) viewToggleBtn.style.display = "inline-block";
        if (pwSection) pwSection.style.display = "none";
        if (printerListSection) printerListSection.style.display = "none";

        if (tabFilmsBtn) tabFilmsBtn.style.display = "inline-flex";
        if (tabPlatesBtn) tabPlatesBtn.style.display = "inline-flex";
      }

      updateSearchPlaceholder();
    }

    /* ---------- Firestore: 인증 설정 ---------- */
    async function loadAuthConfig(){
      try{
        const ref = db.collection(CONFIG_COLLECTION).doc(AUTH_DOC);
        const snap = await ref.get();
        if (snap.exists){
          const data = snap.data() || {};
          authConfig.adminPw = data.adminPw || DEFAULT_ADMIN_PW;
          authConfig.printerPw = data.printerPw || DEFAULT_PRINTER_PW;
          authConfig.viewerPw = data.viewerPw || DEFAULT_VIEWER_PW;
        } else {
          await ref.set({
            adminPw: DEFAULT_ADMIN_PW,
            printerPw: DEFAULT_PRINTER_PW,
            viewerPw: DEFAULT_VIEWER_PW,
            updatedAt: Date.now()
          }, { merge:true });
          authConfig.adminPw = DEFAULT_ADMIN_PW;
          authConfig.printerPw = DEFAULT_PRINTER_PW;
          authConfig.viewerPw = DEFAULT_VIEWER_PW;
        }
      } catch(e){
        console.error("authConfig 로드 오류:", e);
        authConfig.adminPw = DEFAULT_ADMIN_PW;
        authConfig.printerPw = DEFAULT_PRINTER_PW;
        authConfig.viewerPw = DEFAULT_VIEWER_PW;
      }
    }

    async function saveAuthConfig(newAdminPw, newPrinterPw, newViewerPw){
      const ref = db.collection(CONFIG_COLLECTION).doc(AUTH_DOC);
      await ref.set({
        adminPw: newAdminPw,
        printerPw: newPrinterPw,
        viewerPw: newViewerPw,
        updatedAt: Date.now()
      }, { merge:true });

      authConfig.adminPw = newAdminPw;
      authConfig.printerPw = newPrinterPw;
      authConfig.viewerPw = newViewerPw;
    }

    function detectModeByPassword(pw){
      if (pw === authConfig.adminPw) return MODE_ADMIN;
      if (pw === authConfig.printerPw) return MODE_PRINTER;
      if (pw === authConfig.viewerPw) return MODE_VIEWER;
      return null;
    }

    /* ---------- 실시간 동기화 ---------- */
    function startFilmsListener(){
      if (unsubscribeFilms) unsubscribeFilms();
      unsubscribeFilms = db.collection(FILM_COLLECTION).onSnapshot(
        (snapshot) => {
          films = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          if (currentTab === "films") renderList(currentSearchText);
        },
        (error) => {
          console.error("필름 실시간 동기화 오류:", error);
          showToast("서버 동기화 중 오류가 발생했어.");
        }
      );
    }

    function startPlatesListener(){
      if (unsubscribePlates) unsubscribePlates();
      unsubscribePlates = db.collection(PLATE_COLLECTION).onSnapshot(
        (snapshot) => {
          plates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
		  updateDashboard();
          if (currentTab === "plates") renderPlatesList(currentSearchText);
        },
        (error) => {
          console.error("판 실시간 동기화 오류:", error);
          showToast("판 동기화 중 오류가 발생했어.");
        }
      );
    }

    /* ---------- 히스토리 ---------- */
    async function addHistory(action, filmLike, changes = []){
      try{
        const entry = {
          action,
          filmId: filmLike?.id || filmLike?.filmId || null,
          filmNumber: safeStr(filmLike?.filmNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber || filmLike?.plateNumber) || safeStr(filmLike?.filmNumber) || "",
          productName: safeStr(filmLike?.productName) || "",
          deviceName: getDeviceLabel() || "",
          timestamp: Date.now(),
          changes: Array.isArray(changes) ? changes : [],
        };
        // 위 filmNumber 라인 너무 길게 보이니까 정리(실제 값은 아래에서 재세팅)
        entry.filmNumber = safeStr(filmLike?.filmNumber || filmLike?.plateNumber || "");
        await db.collection(HISTORY_COLLECTION).add(entry);
        if (historyLoaded) await loadHistory();
      } catch(e){
        console.error("히스토리 기록 중 오류:", e);
      }
    }

    async function loadHistory(){
      try{
        const snap = await db.collection(HISTORY_COLLECTION).orderBy("timestamp","desc").limit(100).get();
        historyEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        historyLoaded = true;
        renderHistory();
      } catch(e){
        console.error("히스토리 로드 오류:", e);
        showToast("히스토리를 불러오지 못했어.");
      }
    }

    function actionLabel(action){
      if (action === "등록") return "필름 등록";
      if (action === "수정") return "필름 수정";
      if (action === "삭제") return "필름 삭제";
      if (action === "오늘 사용") return "오늘 사용 체크";
      if (action === "필름 인쇄") return "필름 출력 등록";
      if (action === "판 등록") return "판 등록";
      if (action === "판 수정") return "판 수정";
      if (action === "판 삭제") return "판 삭제";
      return action || "변경";
    }

    function renderHistory(){
      const list = document.getElementById("historyList");
      if (!list) return;
      list.innerHTML = "";

      if (!historyEntries.length){
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.innerHTML = "아직 기록이 없어.";
        list.appendChild(empty);
        return;
      }

      historyEntries.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "history-row";

        const ts = formatTs(entry.timestamp || 0);
        const device = entry.deviceName || "기기 미지정";
        const filmLabel =
          (safeStr(entry.filmNumber) ? safeStr(entry.filmNumber) : "") +
          (safeStr(entry.productName) ? ` (${safeStr(entry.productName)})` : "");

        const changesArr = Array.isArray(entry.changes) ? entry.changes : [];
        const noteText = safeStr(entry.note);

        row.innerHTML =
          `<div class="history-headline">` +
            `<div>` +
              `<span class="history-time">${ts}</span>` +
              `<span class="history-device">${device}</span>` +
              `<span class="history-action-chip">${actionLabel(entry.action)}</span>` +
            `</div>` +
            `<button class="history-pencil" data-id="${entry.id}">✏️</button>` +
          `</div>` +
          `<div class="history-film">${filmLabel || "정보 없음"}</div>` +
          (changesArr.length ? `<div class="history-changes">변경 항목: ${changesArr.join(", ")}</div>` : "") +
          (noteText ? `<div class="history-note">${noteText}</div>` : "");

        const pencilBtn = row.querySelector(".history-pencil");
        if (pencilBtn) pencilBtn.addEventListener("click", () => openHistoryNoteModal(entry.id));

        list.appendChild(row);
      });
    }

    function openHistoryCard(){
      const card = document.getElementById("historyCard");
      const isOpen = card.style.display === "block";
      closeAllPanels();
      if (!isOpen){
        card.style.display = "block";
        if (!historyLoaded) loadHistory(); else renderHistory();
      }
    }
    function closeHistoryCard(){ document.getElementById("historyCard").style.display = "none"; }

    /* ---------- 히스토리 메모 모달 ---------- */
    function openHistoryNoteModal(historyId){
      const entry = historyEntries.find(h => h.id === historyId);
      if (!entry) return;
      currentHistoryNoteId = historyId;
      const modal = document.getElementById("historyNoteModal");
      const ta = document.getElementById("historyNoteTextarea");
      if (ta) ta.value = entry.note || "";
      modal.classList.add("show");
    }
    function closeHistoryNoteModal(){
      const modal = document.getElementById("historyNoteModal");
      modal.classList.remove("show");
      currentHistoryNoteId = null;
    }
    async function saveHistoryNoteModal(){
      if (!currentHistoryNoteId) return;
      const ta = document.getElementById("historyNoteTextarea");
      const note = safeStr(ta.value);
      try{
        await db.collection(HISTORY_COLLECTION).doc(currentHistoryNoteId).set({ note }, { merge:true });
        const idx = historyEntries.findIndex(h => h.id === currentHistoryNoteId);
        if (idx >= 0) historyEntries[idx].note = note;
        renderHistory();
        showToast("히스토리 메모 저장됨.");
        closeHistoryNoteModal();
      } catch(e){
        console.error(e);
        showToast("히스토리 메모 저장 중 오류.");
      }
    }

    /* ---------- 필름 메모 ---------- */
    function openMemoSheet(filmId){
      const film = films.find(f => f.id === filmId);
      if (!film) return;
      currentMemoFilmId = filmId;

      const title = document.getElementById("memoSheetTitle");
      const sub = document.getElementById("memoSheetSub");
      const ta = document.getElementById("memoTextarea");
      const sheet = document.getElementById("memoSheet");

      if (title) title.textContent = `메모 · ${film.filmNumber || ""}`;
      if (sub) sub.textContent = film.productName ? film.productName : "필름별 메모";
      if (ta) ta.value = film.memo || "";

      // 조회 모드면 저장 버튼 비활성(보기만)
      const saveBtn = document.getElementById("memoSheetSaveBtn");
      if (saveBtn) saveBtn.style.display = (currentMode === MODE_ADMIN) ? "inline-block" : "none";

      sheet.classList.add("show");
    }
    function closeMemoSheet(){
      document.getElementById("memoSheet").classList.remove("show");
      currentMemoFilmId = null;
    }
    async function saveMemoSheet(){
      if (currentMode !== MODE_ADMIN) return;
      if (!currentMemoFilmId) return;
      const ta = document.getElementById("memoTextarea");
      const memo = safeStr(ta.value);
      try{
        await db.collection(FILM_COLLECTION).doc(currentMemoFilmId).set({ memo, updatedAt: Date.now() }, { merge:true });
        showToast("메모를 저장했어.");
        closeMemoSheet();
      } catch(e){
        console.error(e);
        showToast("메모 저장 중 오류.");
      }
    }

    /* ---------- 필름 출력 날짜/기록 ---------- */
    function openFilmPrintSheet(filmId){
      if (currentMode !== MODE_ADMIN) return;
      const film = films.find(f => f.id === filmId);
      if (!film) return;
      currentFilmPrintId = filmId;

      const sheet = document.getElementById("filmPrintSheet");
      const title = document.getElementById("filmPrintTitle");
      const sub = document.getElementById("filmPrintSub");
      const meta = document.getElementById("filmPrintMeta");
      const dateInput = document.getElementById("filmPrintDate");
      const memoInput = document.getElementById("filmPrintMemo");

      if (title) title.textContent = `필름 출력 등록 · ${film.filmNumber || ""}`;
      if (sub) sub.textContent = film.productName || "오늘 날짜가 기본으로 입력됨";
      if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
      if (memoInput) memoInput.value = "";

      if (meta){
        meta.innerHTML = "";
        const chip1 = document.createElement("div");
        chip1.className = "usage-chip";
        chip1.textContent = `제품: ${film.productName || "-"}`;
        const chip2 = document.createElement("div");
        chip2.className = "usage-chip";
        chip2.textContent = `필름: ${film.filmNumber || "-"}`;
        meta.appendChild(chip1);
        meta.appendChild(chip2);
      }

      sheet.classList.add("show");
    }

    function closeFilmPrintSheet(){
      const sheet = document.getElementById("filmPrintSheet");
      if (sheet) sheet.classList.remove("show");
      currentFilmPrintId = null;
    }

    async function saveFilmPrintSheet(){
      if (currentMode !== MODE_ADMIN) return;
      if (!currentFilmPrintId) return;

      const film = films.find(f => f.id === currentFilmPrintId);
      if (!film) return;

      const date = safeStr(document.getElementById("filmPrintDate")?.value);
      const memo = safeStr(document.getElementById("filmPrintMemo")?.value);
      if (!date){
        showToast("출력 날짜를 선택해줘.");
        return;
      }

      try{
        const filmRef = db.collection(FILM_COLLECTION).doc(film.id);
        const entry = {
          date,
          memo,
          deviceName: getDeviceLabel() || "",
          timestamp: Date.now()
        };

        await filmRef.collection(FILM_PRINT_SUB).add(entry);
        await filmRef.set({
          lastPrintedDate: date,
          lastPrintedAt: entry.timestamp,
          updatedAt: entry.timestamp
        }, { merge:true });

        await addHistory("필름 인쇄", {
          id: film.id,
          productName: film.productName,
          filmNumber: film.filmNumber
        }, [`출력 날짜: ${date}`]);

        showToast("필름 출력 기록 저장됨.");
        closeFilmPrintSheet();
      } catch(e){
        console.error(e);
        showToast("필름 출력 기록 저장 중 오류.");
      }
    }

    async function openFilmPrintHistorySheet(filmId){
      const film = films.find(f => f.id === filmId);
      if (!film) return;
      currentFilmPrintHistoryId = filmId;

      const sheet = document.getElementById("filmPrintHistorySheet");
      const title = document.getElementById("filmPrintHistoryTitle");
      const sub = document.getElementById("filmPrintHistorySub");
      const meta = document.getElementById("filmPrintHistoryMeta");
      const list = document.getElementById("filmPrintHistoryList");

      if (title) title.textContent = `필름 출력 기록 · ${film.filmNumber || ""}`;
      if (sub) sub.textContent = film.productName || "출력 날짜 / 기기 / 메모";

      if (meta){
        meta.innerHTML = "";
        const chip1 = document.createElement("div");
        chip1.className = "usage-chip";
        chip1.textContent = `최근: ${formatShortDate(film.lastPrintedDate || "")}`;
        const chip2 = document.createElement("div");
        chip2.className = "usage-chip";
        chip2.textContent = `제품: ${film.productName || "-"}`;
        meta.appendChild(chip1);
        meta.appendChild(chip2);
      }

      if (list) list.innerHTML = "<div style='padding:20px;text-align:center;color:#999'>기록 로딩 중...</div>";
      sheet.classList.add("show");

      try{
        const snap = await db.collection(FILM_COLLECTION).doc(film.id)
          .collection(FILM_PRINT_SUB).orderBy("date", "desc").limit(100).get();
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (!list) return;
        list.innerHTML = "";
        if (!rows.length){
          list.innerHTML = "<div class='history-empty'>출력 기록이 없어.</div>";
          return;
        }

        rows.forEach(r => {
          const row = document.createElement("div");
          row.className = "usage-row";
          row.innerHTML =
            `<div class="u-top">` +
              `<div class="film-print-record-date">${formatShortDate(r.date || "")}</div>` +
              `<div class="u-time">${formatTs(r.timestamp || 0)}</div>` +
            `</div>` +
            `<div style="margin-top:4px"><span class="label">기기</span>${r.deviceName || "기기 미지정"}</div>` +
            (safeStr(r.memo) ? `<div class="u-memo">${r.memo}</div>` : "");
          list.appendChild(row);
        });
      } catch(e){
        console.error(e);
        if (list) list.innerHTML = "<div class='history-empty'>기록을 불러오지 못했어.</div>";
        showToast("필름 출력 기록 로드 실패.");
      }
    }

    function closeFilmPrintHistorySheet(){
      const sheet = document.getElementById("filmPrintHistorySheet");
      if (sheet) sheet.classList.remove("show");
      currentFilmPrintHistoryId = null;
    }

    /* ---------- 판 메모 ---------- */
    function openPlateMemoSheet(plateId){
      const plate = plates.find(p => p.id === plateId);
      if (!plate) return;
      currentPlateMemoId = plateId;

      const title = document.getElementById("plateMemoTitle");
      const sub = document.getElementById("plateMemoSub");
      const ta = document.getElementById("plateMemoTextarea");
      const sheet = document.getElementById("plateMemoSheet");

      const label = plate.plateNumber || "";
      if (title) title.textContent = `판 메모 · ${label}`;
      if (sub) sub.textContent = plate.productName ? plate.productName : "판별 메모";
      if (ta) ta.value = plate.memo || "";

      const saveBtn = document.getElementById("plateMemoSaveBtn");
      if (saveBtn) saveBtn.style.display = (currentMode === MODE_ADMIN) ? "inline-block" : "none";

      sheet.classList.add("show");
    }
    function closePlateMemoSheet(){
      document.getElementById("plateMemoSheet").classList.remove("show");
      currentPlateMemoId = null;
    }
    async function savePlateMemoSheet(){
      if (currentMode !== MODE_ADMIN) return;
      if (!currentPlateMemoId) return;
      const ta = document.getElementById("plateMemoTextarea");
      const memo = safeStr(ta.value);
      try{
        await db.collection(PLATE_COLLECTION).doc(currentPlateMemoId).set({ memo, updatedAt: Date.now() }, { merge:true });
        showToast("판 메모 저장됨.");
        closePlateMemoSheet();
      } catch(e){
        console.error(e);
        showToast("판 메모 저장 중 오류.");
      }
    }

    /* ---------- 제판 방법 토글 ---------- */
    function clearPlateInfoForm(){ document.querySelectorAll(".toggle-btn").forEach(btn => btn.classList.remove("active")); }
    function setPlateInfoToForm(str){
      clearPlateInfoForm();
      if (!str) return;
      const parts = str.split(" ");
      document.querySelectorAll(".toggle-btn").forEach(btn => {
        if (parts.includes(btn.dataset.value)) btn.classList.add("active");
      });
    }
    function getPlateInfoFromForm(){
      const groups = document.querySelectorAll(".toggle-group");
      const values = [];
      groups.forEach(group => {
        const active = group.querySelector(".toggle-btn.active");
        if (active) values.push(active.dataset.value);
      });
      return values.join(" ");
    }

    /* ---------- 필름 폼 ---------- */
    function resetImagePreview(){
      const wrapper = document.getElementById("imagePreviewWrapper");
      const img = document.getElementById("imagePreview");
      currentSelectedImageDataUrl = null;
      currentImageRotation = 0;
      if (img){
        img.src = "";
        img.style.transform = "rotate(0deg)";
      }
      if (wrapper) wrapper.style.display = "none";
    }
    function applyPreviewRotation(){
      const img = document.getElementById("imagePreview");
      if (!img) return;
      img.style.transform = "rotate(" + currentImageRotation + "deg)";
    }

    function resetForm(){
      document.getElementById("filmId").value = "";
      document.getElementById("productName").value = "";
      document.getElementById("filmNumber").value = "";
      document.getElementById("method").value = "";
      document.getElementById("mesh").value = "";
      document.getElementById("location").value = "";
      document.getElementById("requestPrinter").value = "";
      document.getElementById("lastUsed").value = "";
      document.getElementById("imageInput").value = "";
      clearPlateInfoForm();
      resetImagePreview();
    }

    function getLastFilmForDefaults(){
      if (!films.length) return null;
      return films.reduce((acc, cur) => {
        const a = acc.updatedAt || acc.createdAt || 0;
        const b = cur.updatedAt || cur.createdAt || 0;
        return b > a ? cur : acc;
      });
    }

    function openFormNew(){
      if (currentMode !== MODE_ADMIN) return;
      resetForm();
      const last = getLastFilmForDefaults();
      if (last){
        document.getElementById("method").value = last.method || "";
        document.getElementById("mesh").value = last.mesh || "";
        document.getElementById("location").value = last.location || "";
        document.getElementById("requestPrinter").value = last.requestPrinter || "";
        setPlateInfoToForm(last.plateInfo || "");
      }
      document.getElementById("formCard").style.display = "block";
      document.getElementById("productName").focus();
    }

    function toggleFormNew(){
      if (currentMode !== MODE_ADMIN) return;
      const card = document.getElementById("formCard");
      const isOpen = card.style.display === "block";
      closeAllPanels();
      if (!isOpen) openFormNew();
    }

    function openFormCopyFrom(id){
      if (currentMode !== MODE_ADMIN) return;
      const film = films.find(f => f.id === id);
      if (!film) return;
      resetForm();
      document.getElementById("productName").value = film.productName || "";
      document.getElementById("filmNumber").value = "";
      document.getElementById("method").value = film.method || "";
      document.getElementById("mesh").value = film.mesh || "";
      document.getElementById("location").value = film.location || "";
      document.getElementById("requestPrinter").value = film.requestPrinter || "";
      document.getElementById("lastUsed").value = "";
      setPlateInfoToForm(film.plateInfo || "");
      closeAllPanels();
      document.getElementById("formCard").style.display = "block";
      document.getElementById("productName").focus();
    }

    function openFormForEdit(id){
      if (currentMode !== MODE_ADMIN) return;
      const film = films.find(f => f.id === id);
      if (!film) return;
      closeAllPanels();
      resetImagePreview();

      document.getElementById("filmId").value = film.id;
      document.getElementById("productName").value = film.productName || "";
      document.getElementById("filmNumber").value = film.filmNumber || "";
      document.getElementById("method").value = film.method || "";
      document.getElementById("mesh").value = film.mesh || "";
      document.getElementById("location").value = film.location || "";
      document.getElementById("requestPrinter").value = film.requestPrinter || "";
      document.getElementById("lastUsed").value = film.lastUsed || "";
      document.getElementById("imageInput").value = "";
      setPlateInfoToForm(film.plateInfo || "");

      // 기존 이미지 미리보기는 "선택하면" 뜨게 유지
      document.getElementById("formCard").style.display = "block";
      document.getElementById("productName").focus();
    }

    function closeForm(){
      document.getElementById("formCard").style.display = "none";
      resetForm();
    }

    function updateCountBar(filteredLength, totalLength, hasFilter){
      const bar = document.getElementById("countBar");
      if (!bar) return;
      if (hasFilter) bar.innerHTML = `검색 결과 <strong>${filteredLength}</strong>개 / 전체 ${totalLength}개`;
      else bar.innerHTML = (currentTab === "films") ? `총 <strong>${totalLength}</strong>개 필름` : `총 <strong>${totalLength}</strong>개 판`;
    }

    async function readFileAsDataURL(file){
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }

    function rotateDataURL90(dataUrl, dir){
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          const w = img.width;
          const h = img.height;

          const cw = h;
          const ch = w;
          canvas.width = cw;
          canvas.height = ch;

          ctx.translate(cw / 2, ch / 2);
          ctx.rotate((dir === "left" ? -90 : 90) * Math.PI / 180);
          ctx.drawImage(img, -w/2, -h/2);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.src = dataUrl;
      });
    }
        /* ---------- [추가] 이미지 리사이징(압축) 함수 ---------- */
    function compressImage(file, maxWidth, quality) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            let width = img.width;
            let height = img.height;

            // 가로 크기가 maxWidth보다 크면 줄이기 (비율 유지)
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // JPG로 변환 및 압축 (quality: 0.1 ~ 1.0)
            // 0.7 정도면 화질은 좋고 용량은 확 줄어듦
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
      });
    }


        async function saveFilm(e){
      e.preventDefault();
      if (currentMode !== MODE_ADMIN) return;

      const id = safeStr(document.getElementById("filmId").value);
      const productName = safeStr(document.getElementById("productName").value);
      const filmNumber = safeStr(document.getElementById("filmNumber").value);
      const method = safeStr(document.getElementById("method").value);
      const mesh = safeStr(document.getElementById("mesh").value);
      const location = safeStr(document.getElementById("location").value);
      const requestPrinter = safeStr(document.getElementById("requestPrinter").value);
      const lastUsed = safeStr(document.getElementById("lastUsed").value);
      const plateInfo = getPlateInfoFromForm();

      if (!productName || !filmNumber){
        showToast("제품 이름/필름 번호는 필수야.");
        return;
      }

      let imageDataUrl = "";
      const file = document.getElementById("imageInput").files?.[0];
      
      // ✅ [수정된 부분] 사진이 있으면 압축 먼저 진행!
      if (file){
        try {
          // 1. 압축 실행 (가로 최대 1000px, 퀄리티 0.7)
          // 1000px이면 폰카 원본보다 훨씬 작아져서 파이어베이스에 잘 들어감
          imageDataUrl = await compressImage(file, 1000, 0.7);

          // 2. 회전 상태 반영 (압축된 이미지로 회전)
          let rot = ((currentImageRotation % 360) + 360) % 360;
          if (rot === 90) imageDataUrl = await rotateDataURL90(imageDataUrl, "right");
          if (rot === 180){ imageDataUrl = await rotateDataURL90(await rotateDataURL90(imageDataUrl, "right"), "right"); }
          if (rot === 270) imageDataUrl = await rotateDataURL90(imageDataUrl, "left");
          
        } catch(err) {
          console.error("이미지 처리 중 오류:", err);
          alert("사진 처리 오류: " + err.message); // 오류 내용 폰에 띄우기
          return;
        }
      }

      const payload = {
        productName, filmNumber, method, mesh, location, requestPrinter, lastUsed, plateInfo,
        updatedAt: Date.now(),
      };
      if (!id) payload.createdAt = Date.now();
      
      // 파일이 선택되었을 때만 이미지 데이터 업데이트
      if (file) payload.imageDataUrl = imageDataUrl;

      try{
        if (id){
          await db.collection(FILM_COLLECTION).doc(id).set(payload, { merge:true });
          await addHistory("수정", { id, productName, filmNumber }, ["필름 수정"]);
          showToast("수정 저장됨.");
        } else {
          const ref = await db.collection(FILM_COLLECTION).add(payload);
          await addHistory("등록", { id: ref.id, productName, filmNumber }, ["필름 등록"]);
          showToast("등록됨.");
        }
        closeForm();
      } catch(e){
        console.error(e);
        // 저장 실패 시 메시지 (보통 용량 문제)
        alert("저장 실패: " + e.message);
        showToast("저장 중 오류가 났어.");
      }
    }

    /* ---------- 필름 리스트 ---------- */
    function renderList(filterText = ""){
      const listEl = document.getElementById("list");
      const emptyText = document.getElementById("emptyText");
      if (!listEl || !emptyText) return;

      listEl.innerHTML = "";
      currentSearchText = filterText || "";

      // 인쇄기사 모드: 필름 리스트 아예 안 보임
      if (currentMode === MODE_PRINTER){
        emptyText.style.display = "block";
        emptyText.innerHTML = "필름 탭은 인쇄기사 모드에서 보이지 않아.";
        updateCountBar(0, 0, false);
        return;
      }

      const text = safeStr(filterText).toLowerCase();

      let filtered = films.filter(f => {
        if (!text) return true;
        const combined =
          (f.productName || "") + " " +
          (f.filmNumber || "") + " " +
          (f.method || "") + " " +
          (f.mesh || "") + " " +
          (f.location || "") + " " +
          (f.plateInfo || "") + " " +
          (f.requestPrinter || "");
        return combined.toLowerCase().includes(text);
      });

      const sortOpt = getSortOption();
      filtered = filtered.slice().sort((a,b) => {
        if (sortOpt === "name") return (a.productName || "").localeCompare(b.productName || "", "ko");
        if (sortOpt === "number") return (a.filmNumber || "").localeCompare(b.filmNumber || "", "ko");
        if (sortOpt === "lastUsed") return (b.lastUsed || "").localeCompare(a.lastUsed || "");
        const atA = a.updatedAt || a.createdAt || 0;
        const atB = b.updatedAt || b.createdAt || 0;
        return atB - atA;
      });

      updateCountBar(filtered.length, films.length, !!text);

      let toRender = filtered;
      if (!text){
        visibleCount = Math.min(visibleCount || VISIBLE_STEP, filtered.length);
        toRender = filtered.slice(0, visibleCount);
      }

      if (filtered.length === 0){
        emptyText.style.display = "block";
        emptyText.innerHTML = "등록된 필름이 없습니다.<br/>오른쪽 위 <b>+ 새 필름</b> 버튼으로 추가하세요.";
        return;
      } else {
        emptyText.style.display = "none";
      }

      toRender.forEach((film) => {
        const card = document.createElement("div");
        card.className = "card";

        const img = document.createElement("img");
        if (film.imageDataUrl){
          img.src = film.imageDataUrl;
          img.addEventListener("click", () => openImageViewer(film.imageDataUrl));
        } else {
          img.alt = "이미지 없음";
        }
        card.appendChild(img);

        const content = document.createElement("div");
        content.className = "card-content";

        const rowMain = document.createElement("div");
        rowMain.className = "card-row-main";
        const title = document.createElement("div");
        title.className = "card-title";
        title.textContent = film.productName || "(제품명 없음)";

        const tag = document.createElement("div");
        tag.className = "card-tag";
        tag.textContent = film.filmNumber || "번호 없음";

        rowMain.appendChild(title);
        rowMain.appendChild(tag);
        content.appendChild(rowMain);

        const rowMethod = document.createElement("div");
        rowMethod.className = "card-row";
        rowMethod.innerHTML = '<span class="label">제판 타입</span>' + (film.method || "-");
        content.appendChild(rowMethod);

        const rowMesh = document.createElement("div");
        rowMesh.className = "card-row";
        rowMesh.innerHTML = '<span class="label">MESH</span>' + (film.mesh || "-");
        content.appendChild(rowMesh);

        const rowPlate = document.createElement("div");
        rowPlate.className = "card-row";
        rowPlate.innerHTML = '<span class="label">제판 방법</span>' + (film.plateInfo || "-");
        content.appendChild(rowPlate);

        const rowLoc = document.createElement("div");
        rowLoc.className = "card-row";
        rowLoc.innerHTML = '<span class="label">필름 위치</span>' + (film.location || "-");
        content.appendChild(rowLoc);

        const rowReq = document.createElement("div");
        rowReq.className = "card-row";
        rowReq.innerHTML = '<span class="label">요청 인쇄자</span>' + (film.requestPrinter || "-");
        content.appendChild(rowReq);

        const footer = document.createElement("div");
        footer.className = "card-footer";

        const dateWrap = document.createElement("div");
        dateWrap.style.display = "flex";
        dateWrap.style.flexDirection = "column";
        dateWrap.style.gap = "3px";

        const lastUsed = document.createElement("div");
        lastUsed.className = "last-used";
        lastUsed.textContent = "마지막 사용일: " + formatDate(film.lastUsed || "");
        dateWrap.appendChild(lastUsed);

        const printLatest = document.createElement("button");
        printLatest.type = "button";
        printLatest.className = "film-print-latest" + (film.lastPrintedDate ? "" : " empty");
        printLatest.textContent = "최근 출력일: " + formatShortDate(film.lastPrintedDate || "");
        if (film.lastPrintedDate){
          printLatest.addEventListener("click", () => openFilmPrintHistorySheet(film.id));
        }
        dateWrap.appendChild(printLatest);
        footer.appendChild(dateWrap);

        const btnWrap = document.createElement("div");
        btnWrap.className = "card-buttons";

        const canEditFilms = (currentMode === MODE_ADMIN);
        const canViewOnly = (currentMode === MODE_VIEWER);

        if (canEditFilms){
          const useTodayBtn = document.createElement("button");
          useTodayBtn.className = "btn btn-secondary btn-small";
          useTodayBtn.textContent = "오늘 사용";
          useTodayBtn.addEventListener("click", async () => {
            const today = new Date().toISOString().slice(0,10);
            try{
              await db.collection(FILM_COLLECTION).doc(film.id).set({ lastUsed: today, updatedAt: Date.now() }, { merge:true });
              await addHistory("오늘 사용", { id: film.id, productName: film.productName, filmNumber: film.filmNumber }, ["마지막 사용일"]);
              showToast("오늘 사용으로 기록했어.");
            } catch(e){
              console.error(e);
              showToast("오늘 사용 기록 중 오류.");
            }
          });
          btnWrap.appendChild(useTodayBtn);

          const printBtn = document.createElement("button");
          printBtn.className = "btn btn-primary btn-small";
          printBtn.textContent = "필름 출력";
          printBtn.addEventListener("click", () => openFilmPrintSheet(film.id));
          btnWrap.appendChild(printBtn);

          const editBtn = document.createElement("button");editBtn.className = "btn btn-secondary btn-small";
          editBtn.textContent = "수정";
          editBtn.addEventListener("click", () => openFormForEdit(film.id));
          btnWrap.appendChild(editBtn);

          const copyBtn = document.createElement("button");
          copyBtn.className = "btn btn-ghost btn-small";
          copyBtn.textContent = "복사";
          copyBtn.addEventListener("click", () => openFormCopyFrom(film.id));
          btnWrap.appendChild(copyBtn);

          const memoBtn = document.createElement("button");
          memoBtn.className = "btn btn-ghost btn-small" + (safeStr(film.memo) ? " btn-memo-has" : "");
          memoBtn.textContent = "메모";
          memoBtn.addEventListener("click", () => openMemoSheet(film.id));
          btnWrap.appendChild(memoBtn);

          const plateNewBtn = document.createElement("button");
          plateNewBtn.className = "btn btn-primary btn-small";
          plateNewBtn.textContent = "판 등록";
          plateNewBtn.addEventListener("click", () => openPlateFormFromFilm(film.id));
          btnWrap.appendChild(plateNewBtn);

          const delBtn = document.createElement("button");
          delBtn.className = "btn btn-danger btn-small";
          delBtn.textContent = "삭제";
          delBtn.addEventListener("click", async () => {
            if (!confirm("이 필름을 삭제할까? (연결된 판 데이터는 남아있을 수 있어)")) return;
            try{
              await db.collection(FILM_COLLECTION).doc(film.id).delete();
              await addHistory("삭제", { id: film.id, productName: film.productName, filmNumber: film.filmNumber }, ["삭제"]);
              showToast("삭제했어.");
            } catch(e){
              console.error(e);
              showToast("삭제 중 오류.");
            }
          });
          btnWrap.appendChild(delBtn);
        } else if (canViewOnly){
          const memoBtn = document.createElement("button");
          memoBtn.className = "btn btn-ghost btn-small";
          memoBtn.textContent = "메모";
          memoBtn.addEventListener("click", () => openMemoSheet(film.id));
          btnWrap.appendChild(memoBtn);

          const printHistoryBtn = document.createElement("button");
          printHistoryBtn.className = "btn btn-secondary btn-small";
          printHistoryBtn.textContent = "출력 기록";
          printHistoryBtn.addEventListener("click", () => openFilmPrintHistorySheet(film.id));
          btnWrap.appendChild(printHistoryBtn);

          const plateHint = document.createElement("button");
          plateHint.className = "btn btn-secondary btn-small";
          plateHint.textContent = "연결 판 보기";
          plateHint.addEventListener("click", () => {
            currentTab = "plates";
            setActiveTabUI();
            const si = document.getElementById("searchInput");
            if (si) si.value = (film.filmNumber || "");
            currentSearchText = (film.filmNumber || "");
            renderPlatesList(currentSearchText);
          });
          btnWrap.appendChild(plateHint);
        }

        footer.appendChild(btnWrap);
        content.appendChild(footer);
        card.appendChild(content);

        listEl.appendChild(card);
      });

      applyViewMode();
    }

    /* ---------- 인쇄기사 목록 (파이어베이스 공유) ---------- */
    async function loadPrinterList(){
      try{
        const ref = db.collection(CONFIG_COLLECTION).doc("printers");
        const snap = await ref.get();
        if (!snap.exists){
          await ref.set({ names: ["최성규"], updatedAt: Date.now() }, { merge:true });
          return ["최성규"];
        }
        const data = snap.data() || {};
        const names = Array.isArray(data.names) ? data.names : [];
        return names.length ? names : ["최성규"];
      } catch(e){
        console.error("인쇄기사 목록 로드 오류:", e);
        return ["최성규"];
      }
    }

    async function savePrinterList(names){
      const clean = (names || [])
        .map(s => safeStr(s))
        .filter(Boolean)
        .filter((v,i,arr) => arr.indexOf(v) === i);
      await db.collection(CONFIG_COLLECTION).doc("printers").set({ names: clean, updatedAt: Date.now() }, { merge:true });
    }

    async function fillPrinterSelect(selectEl){
      const names = await loadPrinterList();
      selectEl.innerHTML = "";
      names.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = n;
        selectEl.appendChild(opt);
      });
    }

    async function refreshPrinterManagerUI(){
      const wrap = document.getElementById("printerListWrap");
      if (!wrap) return;
      wrap.innerHTML = "";
      const names = await loadPrinterList();
      names.forEach((n) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "btn btn-ghost btn-small";
        chip.textContent = `✖ ${n}`;
        chip.addEventListener("click", async () => {
          if (!confirm(`"${n}" 삭제할까?`)) return;
          const cur = await loadPrinterList();
          await savePrinterList(cur.filter(x => x !== n));
          await refreshPrinterManagerUI();
          showToast("목록 업데이트됨.");
        });
        wrap.appendChild(chip);
      });
    }

    /* ---------- 판 폼 ---------- */
    /* ---------- 판 폼 (재활용 로직 포함) ---------- */
    
    /* ---------- 판 폼 (재활용 + 설정 팝업 로직) ---------- */
    
    let reuseTarget = null; // 재사용할 대상 임시 저장용

    /* [1] 판 등록 버튼 클릭 */
    function openPlateFormFromFilm(filmId){
      if (currentMode !== MODE_ADMIN) return;
      const film = films.find(f => f.id === filmId);
      if (!film) return;

      const emptyPlates = plates.filter(p => p.status === 'empty');

      if (emptyPlates.length === 0) {
        openNewPlateForm(film); 
      } else {
        showEmptyPlatePicker(film, emptyPlates);
      }
    }

    /* [2] 빈 판 목록 보여주기 */
    function showEmptyPlatePicker(film, emptyList) {
      const modal = document.getElementById("emptyPlateModal");
      const listEl = document.getElementById("emptyPlateList");
      const newBtn = document.getElementById("btnMakeNewPlate");

      listEl.innerHTML = "";
      emptyList.forEach(p => {
        const row = document.createElement("div");
        row.style.padding = "8px"; row.style.borderBottom = "1px solid #f0f0f0"; row.style.cursor = "pointer";
        row.style.fontSize = "13px"; row.style.display = "flex"; row.style.justifyContent = "space-between";
        
        const isSameMesh = (p.mesh == film.mesh);
        const meshStyle = isSameMesh ? "color:var(--primary-1);font-weight:bold" : "color:#999";
        
        row.innerHTML = `<div><strong>${p.plateNumber}</strong> <span style="${meshStyle}">(${p.mesh||"-"}목)</span></div><div style="font-size:11px;color:#777">누적: ${(p.totalUsedQty||0).toLocaleString()}</div>`;
        
        // ★ 클릭 시 바로 저장이 아니라 '설정 팝업'을 띄움
        row.onclick = () => openReuseModal(film, p);
        listEl.appendChild(row);
      });

      newBtn.onclick = () => { modal.style.display = "none"; openNewPlateForm(film); };
      closeAllPanels();
      modal.style.display = "flex";
    }

    /* [3] 재사용 설정 팝업 열기 (텐션/수량 입력) */
    function openReuseModal(film, plate) {
      document.getElementById("emptyPlateModal").style.display = "none"; // 목록 창 닫기
      
      reuseTarget = { film, plate }; // 대상 저장
      
      document.getElementById("reuseModalTitle").textContent = `${plate.plateNumber} 판을 다시 사용할게.`;
      document.getElementById("reuseTension").value = ""; // 텐션은 매번 새로 입력
      document.getElementById("reuseMaxQty").value = "5000"; // 기본값
      
      document.getElementById("reuseModal").style.display = "flex"; // 설정 창 열기
    }

    /* [4] 최종 저장 (설정값 적용) */
    document.getElementById("btnConfirmReuse").onclick = async () => {
      if(!reuseTarget) return;
      const { film, plate } = reuseTarget;
      const tension = safeStr(document.getElementById("reuseTension").value);
      const maxQty = Number(document.getElementById("reuseMaxQty").value);

      try {
        await db.collection(PLATE_COLLECTION).doc(plate.id).set({
          status: 'active',
          filmId: film.id, 
          productName: film.productName, 
          filmNumber: film.filmNumber,
          tension: tension,   // ★ 입력한 텐션 적용
          maxQty: maxQty,     // ★ 입력한 최대수량 적용
          usedQty: 0, 
          updatedAt: Date.now()
        }, { merge: true });
        
        await addHistory("재사용", { id: plate.id, plateNumber: plate.plateNumber, productName: film.productName }, ["빈 판 재할당", `텐션: ${tension}`]);
        
        document.getElementById("reuseModal").style.display = "none";
        showToast("판 세팅 완료! 작업 시작해.");
      } catch(e) { console.error(e); showToast("오류 발생"); }
    };

    /* [5] 새 판 등록 폼 (기존 유지) */
    function openNewPlateForm(film) {
      document.getElementById("plateId").value = "";
      document.getElementById("plateFilmId").value = film.id;
      document.getElementById("plateProductName").value = film.productName || "";
      document.getElementById("plateFilmNumber").value = film.filmNumber || "";
      
      const meshVal = film.mesh || "";
      document.getElementById("plateMesh").value = meshVal;
      document.getElementById("plateNumber").value = meshVal ? `${meshVal}-1` : `PLATE-1`; 

      document.getElementById("plateTension").value = "";
      document.getElementById("plateLocation").value = "";
      document.getElementById("plateMaxQty").value = 5000;

      document.getElementById("plateFormCard").style.display = "block";
      document.getElementById("plateNumber").focus();
    }

    function closePlateForm(){
      document.getElementById("plateFormCard").style.display = "none";
      ["plateId","plateFilmId","plateProductName","plateFilmNumber","plateNumber","plateTension","plateLocation","plateMesh"].forEach(id => document.getElementById(id).value = "");
      document.getElementById("plateMaxQty").value = 5000;
    }

    /* [수정] 판 저장 (평생 누적 변수 초기화 포함) */
    async function savePlate(e){
      e.preventDefault();
      if (currentMode !== MODE_ADMIN) return;

      const id = safeStr(document.getElementById("plateId").value);
      const filmId = safeStr(document.getElementById("plateFilmId").value);
      const pn = safeStr(document.getElementById("plateProductName").value);
      const fn = safeStr(document.getElementById("plateFilmNumber").value);
      const plateNumber = safeStr(document.getElementById("plateNumber").value);
      const tension = safeStr(document.getElementById("plateTension").value);
      const location = safeStr(document.getElementById("plateLocation").value);
      const mesh = safeStr(document.getElementById("plateMesh").value);
      const maxQty = Number(document.getElementById("plateMaxQty").value || 5000);

      if (!plateNumber){ showToast("판 번호는 필수야."); return; }

      const payload = {
        filmId, productName: pn, filmNumber: fn, plateNumber,
        tension, location, mesh, maxQty: maxQty > 0 ? maxQty : 5000,
        updatedAt: Date.now(),
      };
      
      if (!id) {
        payload.createdAt = Date.now();
        payload.usedQty = 0;      
        payload.totalUsedQty = 0; 
        payload.status = pn ? 'active' : 'empty';
      }

      try{
        if (id){
          await db.collection(PLATE_COLLECTION).doc(id).set(payload, { merge:true });
          await addHistory("판 수정", { id, productName: pn, filmNumber: fn, plateNumber }, ["판 수정"]);
          showToast("수정 저장됨.");
        } else {
          const ref = await db.collection(PLATE_COLLECTION).add(payload);
          await addHistory("판 등록", { id: ref.id, productName: pn, filmNumber: fn, plateNumber }, ["판 등록"]);
          showToast("등록됨.");
        }
        closePlateForm();
      } catch(e){ console.error(e); showToast("오류 발생"); }
    }

    /* ---------- 판 사용등록 / 히스토리 ---------- */
     /* [수정 2단계] 뱃지용 비율 계산 (현재 작업 수량 기준) */
    /* [수정] 사용량 비율 계산 (이번 작업 목표량 기준) */
    function getPlateUsedRatio(plate){
      // 뱃지 색깔과 %는 '현재 작업 수량(usedQty)' vs '최대 수량(maxQty)' 으로 계산
      const current = Number(plate?.usedQty || 0);
      const max = Number(plate?.maxQty || 5000);
      
      if (!max) return { pct: 0, used: current, max };
      
      const pct = (current / max) * 100;
      return { pct, used: current, max };
    }
  // ✅ 4) 사용량 뱃지(적정/유의/주의/경고) + 색 클래스 추가
  function getUsageBadgeInfo(plate){
      const { pct } = getPlateUsedRatio(plate);
      // 퍼센트에 따라 뱃지 색깔 결정
      if (pct > 100) return { label: "초과", show: true, cls: "over" };
      if (pct >= 90) return { label: "주의", show: true, cls: "danger" };
      if (pct >= 70) return { label: "유의", show: true, cls: "warn" };
      return { label: "적정", show: true, cls: "ok" };
        }

    function openPlateUseSheet(plateId){
      if (currentMode !== MODE_ADMIN && currentMode !== MODE_PRINTER) return;

      const plate = plates.find(p => p.id === plateId);
      if (!plate) return;
      currentPlateUseId = plateId;

      const sheet = document.getElementById("plateUseSheet");
      const meta = document.getElementById("plateUseMeta");
      const title = document.getElementById("plateUseTitle");
      const sub = document.getElementById("plateUseSub");
      const qtyInput = document.getElementById("plateUseQty");
      const memoInput = document.getElementById("plateUseMemo");
      const whoSelect = document.getElementById("plateUseWho");

      if (title) title.textContent = `판 사용등록 · ${plate.plateNumber || ""}`;
      if (sub) sub.textContent = "시간은 자동 기록";

      if (qtyInput) qtyInput.value = "";
      if (memoInput) memoInput.value = "";

      // ✅ 2) 필름 등록의 요청인쇄자 방식처럼: 파이어베이스 공유 목록 select 채우기
      if (whoSelect) fillPrinterSelect(whoSelect);

      // meta 표시
      if (meta){
        const r = getPlateUsedRatio(plate);
        const pct = Math.round(r.pct);
        meta.innerHTML = "";
        const chip1 = document.createElement("div");
        chip1.className = "usage-chip";
        chip1.textContent = `제품: ${plate.productName || "-"}`;
        const chip2 = document.createElement("div");
        chip2.className = "usage-chip";
        chip2.textContent = `필름: ${plate.filmNumber || "-"}`;
        const chip3 = document.createElement("div");
        chip3.className = "progress-pill";
        chip3.textContent = `사용량: ${r.used}/${r.max} (${isFinite(pct)?pct:0}%)`;
        meta.appendChild(chip1);
        meta.appendChild(chip2);
        meta.appendChild(chip3);
      }

      sheet.classList.add("show");
    }

    function closePlateUseSheet(){
      const sheet = document.getElementById("plateUseSheet");
      if (sheet) sheet.classList.remove("show");
      currentPlateUseId = null;
    }

   /* [수정 3단계] 사용등록 저장 (현재수량 + 평생수량 동시 증가) */
    async function savePlateUse(){
      if (!currentPlateUseId) return;
      if (currentMode !== MODE_ADMIN && currentMode !== MODE_PRINTER) return;

      const plate = plates.find(p => p.id === currentPlateUseId);
      if (!plate) return;

      const who = safeStr(document.getElementById("plateUseWho").value);
      const qty = Number(document.getElementById("plateUseQty").value || 0);
      const memo = safeStr(document.getElementById("plateUseMemo").value);

      if (!who){ showToast("인쇄기사를 선택해줘."); return; }
      if (!qty || qty <= 0){ showToast("인쇄 수량을 입력해줘."); return; }

      const entry = { who, qty, memo, timestamp: Date.now(), deviceName: getDeviceLabel() || "" };

      try{
        const plateRef = db.collection(PLATE_COLLECTION).doc(plate.id);
        const usageRef = plateRef.collection(PLATE_USAGE_SUB);

        await db.runTransaction(async (tx) => {
          const snap = await tx.get(plateRef);
          const cur = snap.exists ? (snap.data() || {}) : {};
          
          const curCurrent = Number(cur.usedQty || 0);
          // 평생 누적량이 없으면(옛날 데이터) 현재 수량과 같다고 가정
          const curTotal = (cur.totalUsedQty !== undefined) ? Number(cur.totalUsedQty) : curCurrent;

          tx.set(plateRef, { 
            usedQty: curCurrent + qty,      // 현재 작업 누적
            totalUsedQty: curTotal + qty,   // 평생 누적 (계속 쌓임)
            updatedAt: Date.now() 
          }, { merge:true });
          
          const newUsageDoc = usageRef.doc();
          tx.set(newUsageDoc, entry);
        });

        showToast("사용등록 저장됨.");
        closePlateUseSheet();
      } catch(e){
        console.error(e);
        showToast("사용등록 저장 중 오류.");
      }
    }
	/* [추가 4단계] 판 탈막(초기화) 기능 */
   /* [수정] 탈막 기능 (상세 기록 저장) */
   /* [수정] 탈막 기능 (전체 히스토리 + 개별 판 히스토리 모두 기록) */
    async function reclaimPlate(plate) {
      if(!confirm(`[탈막] ${plate.plateNumber} 판을 초기화할까?\n현재 수량은 0이 되지만, 총 누적은 유지돼.`)) return;
      
      try {
        // 1. 기록할 텍스트 만들기 (제품명 + 텐션)
        const info = `[${plate.productName||"제품없음"}] 작업종료 (텐션: ${plate.tension||"-"})`;

        // 2. 판 상태 초기화 (DB 업데이트)
        await db.collection(PLATE_COLLECTION).doc(plate.id).set({
          status: 'empty',
          filmId: null, productName: null, filmNumber: null,
          usedQty: 0, updatedAt: Date.now()
        }, { merge: true });
        
        // 3. ★ [추가된 기능] 개별 판 히스토리(Usage)에 '탈막 기록' 남기기
        // (이게 들어가야 판별 히스토리에서도 보입니다!)
        await db.collection(PLATE_COLLECTION).doc(plate.id).collection(PLATE_USAGE_SUB).add({
            who: "시스템(탈막)",  // 누가
            qty: 0,              // 수량 (0)
            memo: info,          // 내용 (제품명+텐션)
            timestamp: Date.now(),
            deviceName: getDeviceLabel() || ""
        });

        // 4. 전체 히스토리에 기록 (기존 기능)
        await addHistory("탈막", { 
          id: plate.id, plateNumber: plate.plateNumber, productName: plate.productName 
        }, ["초기화", info]);
        
        showToast("탈막 완료! 개별 기록에도 저장됐어.");
      } catch(e) {
        console.error(e);
        showToast("오류 발생");
      }
    }
        

   /* [수정] 판 히스토리 (수량 막대 + 텐션 꺾은선 그래프 적용) */
    let myChart = null; // 차트 담을 그릇

    async function openPlateHistorySheet(plateId){
      const plate = plates.find(p => p.id === plateId);
      if (!plate) return;
      currentPlateHistoryId = plateId;

      const sheet = document.getElementById("plateHistorySheet");
      const list = document.getElementById("plateUsageList");
      const meta = document.getElementById("plateHistoryMeta");

      // 1. 제목 및 상단 정보
      document.getElementById("plateHistoryTitle").textContent = `판 히스토리 · ${plate.plateNumber}`;
      
      if(meta) {
         const r = getPlateUsedRatio(plate);
         meta.innerHTML = `<div class="usage-chip">${plate.productName||"-"}</div><div class="progress-pill">현재 텐션: ${plate.tension||"-"}</div>`;
      }

      // 2. 그래프 영역 만들기 (없으면 생성, 리스트 위에 삽입)
      // 기존에 차트 캔버스가 없으면 여기서 강제로 만듭니다.
      let chartContainer = sheet.querySelector(".chart-container");
      if(!chartContainer) {
          chartContainer = document.createElement("div");
          chartContainer.className = "chart-container";
          chartContainer.style.cssText = "padding:10px; background:#f8f9fa; border-radius:12px; margin-bottom:10px; border:1px solid #eee;";
          chartContainer.innerHTML = '<canvas id="plateUsageChart" style="width:100%; height:180px;"></canvas>';
          // 리스트(plateUsageList) 바로 위에 끼워넣기
          if(list) list.parentNode.insertBefore(chartContainer, list);
      }

      if (list) list.innerHTML = "<div style='padding:20px;text-align:center;color:#999'>데이터 로딩 중...</div>";

      try {
        // 3. 데이터 가져오기 (최근 30개)
        const snap = await db.collection(PLATE_COLLECTION).doc(plate.id)
          .collection(PLATE_USAGE_SUB).orderBy("timestamp", "desc").limit(30).get();
        
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 4. 리스트 그리기
        if (list) list.innerHTML = "";
        if (!rows.length && list) list.innerHTML = "<div class='history-empty'>기록이 없어.</div>";
        
        rows.forEach(r => {
            const div = document.createElement("div");
            div.className = "usage-row";
            div.innerHTML = `<div class="u-top"><div class="u-who">${r.who||"-"}</div><div class="u-time">${formatTs(r.timestamp)}</div></div>
                             <div style="margin-top:4px">수량: <b>${(r.qty||0).toLocaleString()}</b> <span style="color:#888;font-size:11px;margin-left:8px">${r.memo||""}</span></div>`;
            list.appendChild(div);
        });

        // 5. ★ 차트 그리기 (핵심!)
        const ctx = document.getElementById('plateUsageChart');
        if(ctx) {
          if(myChart) myChart.destroy(); // 기존 차트 삭제 (안 하면 겹쳐 보임)
          
          // 시간 순서대로 뒤집기 (과거 -> 현재)
          const chartData = rows.slice().reverse();
          
          const labels = chartData.map(d => { 
             const dt = new Date(d.timestamp); 
             return `${dt.getMonth()+1}/${dt.getDate()}`; 
          });
          
          const qtyData = chartData.map(d => d.qty || 0);
          
          // [중요] 메모에서 '텐션: 숫자' 또는 '텐션 숫자'를 찾아서 뽑아냄
          const tensionData = chartData.map(d => {
             const txt = d.memo || "";
             const match = txt.match(/텐션[:\s]*([\d\.]+)/); // "텐션 23" 또는 "텐션: 23.5" 찾기
             return match ? parseFloat(match[1]) : null;
          });

          myChart = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [
                { 
                  label: '작업 수량', 
                  data: qtyData, 
                  backgroundColor: 'rgba(127, 157, 255, 0.5)', 
                  yAxisID: 'y', 
                  order: 2 
                },
                { 
                  type: 'line', 
                  label: '텐션', 
                  data: tensionData, 
                  borderColor: '#ff6b81', // 빨간색 선
                  backgroundColor: '#ff6b81', 
                  borderWidth: 2, 
                  pointRadius: 4, 
                  spanGaps: true, // 중간에 값 없어도 선 이어주기
                  yAxisID: 'y1', 
                  order: 1 
                }
              ]
            },
            options: {
              responsive: true, 
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              scales: {
                y: { beginAtZero: true, display: false }, // 왼쪽 축(수량) 숨김
                y1: { 
                    type: 'linear', 
                    display: true, 
                    position: 'right', 
                    grid: { drawOnChartArea: false }, 
                    min: 10, // 텐션 그래프 범위 설정 (예쁘게 보이게)
                    title: { display: true, text: '텐션' } 
                },
                x: { grid: { display: false } }
              }
            }
          });
        }
        sheet.classList.add("show");

      } catch(e){ console.error(e);
        showToast("히스토리 로드 실패");
      }
    }

    function closePlateHistorySheet(){
      const sheet = document.getElementById("plateHistorySheet");
      if (sheet) sheet.classList.remove("show");
      currentPlateHistoryId = null;
    }

    /* ---------- 판 리스트 ---------- */
    /* [수정 5단계] 판 리스트 렌더링 (판 번호 메인 + 탈막/폐기 + 총누적) */
  /* [수정] 리스트 렌더링 (총 누적은 숫자만 표시) */
   /* [수정] 리스트 렌더링 (대시보드 필터 적용됨) */
    function renderPlatesList(filterText = ""){
      const listEl = document.getElementById("list");
      const emptyText = document.getElementById("emptyText");
      if (!listEl || !emptyText) return;

      listEl.innerHTML = "";
      currentSearchText = filterText || "";

      const text = safeStr(filterText).toLowerCase();

      // 1. 텍스트 검색 필터
      let filtered = plates.filter(p => {
        if (!text) return true;
        const combined = (p.plateNumber||"")+(p.productName||"")+(p.filmNumber||"")+(p.tension||"")+(p.location||"")+(p.mesh||"");
        return combined.toLowerCase().includes(text);
      });

      // 2. ★ [추가됨] 대시보드 클릭 필터 적용
      if(dashboardFilter === 'active'){
        // 활성 판만 (status가 empty가 아닌 것)
        filtered = filtered.filter(p => p.status !== 'empty');
      } 
      else if(dashboardFilter === 'empty'){
        // 빈 판만
        filtered = filtered.filter(p => p.status === 'empty');
      }
      else if(dashboardFilter === 'warn'){
        // 수명 주의만 (90% 이상)
        filtered = filtered.filter(p => {
           if(p.status === 'empty') return false;
           const r = getPlateUsedRatio(p);
           return r.pct >= 90;
        });
      }

      // 3. 정렬
      const sortOpt = getSortOption();
      filtered.sort((a,b) => {
        if (sortOpt === "name") return (a.productName||"").localeCompare(b.productName||"", "ko");
        if (sortOpt === "number") return (a.plateNumber||"").localeCompare(b.plateNumber||"", "ko"); 
        return (b.updatedAt||0) - (a.updatedAt||0);
      });

      updateCountBar(filtered.length, plates.length, !!text || !!dashboardFilter);
      let toRender = (!text && !dashboardFilter) ? filtered.slice(0, visibleCount) : filtered;

      if (!filtered.length){ 
          emptyText.style.display = "block"; 
          if(dashboardFilter) emptyText.textContent = "해당하는 판이 없어.";
          else emptyText.textContent = "등록된 판이 없어.";
          return; 
      } else { 
          emptyText.style.display = "none"; 
      }

      toRender.forEach((plate) => {
        // ... (이 아래 카드 그리는 코드는 기존과 동일합니다. 그대로 두셔도 되고 복붙하셔도 됩니다) ...
        const card = document.createElement("div"); card.className = "card";
        const isEmpty = (plate.status === 'empty');
        const r = getPlateUsedRatio(plate); 

        const badge = document.createElement("div");
        if(isEmpty) {
             badge.className = "warn-badge ok show"; badge.textContent = "빈 판 (대기)";
             badge.style.background = "#f3f4f6"; badge.style.color = "#374151"; badge.style.border = "1px solid #d1d5db";
        } else {
             const b = getUsageBadgeInfo(plate);
             badge.className = `warn-badge ${b.cls} show`; badge.textContent = `${b.label} · ${Math.round(r.pct)}%`;
        }
        card.appendChild(badge);

        const content = document.createElement("div"); content.className = "card-content";
        let film = null;
        if (!isEmpty) film = films.find(f => f.id === plate.filmId) || films.find(f => f.filmNumber && f.filmNumber === plate.filmNumber);
        
        if (film && film.imageDataUrl) {
          const img = document.createElement("img"); img.src = film.imageDataUrl;
          img.style.width = "70px"; img.style.height = "70px"; img.style.objectFit = "cover"; img.style.borderRadius = "12px"; 
          img.style.flexShrink = "0"; img.style.marginRight="10px"; img.style.cursor = "pointer"; img.style.background = "#eef1ff";
          img.addEventListener("click", () => openImageViewer(film.imageDataUrl));
          card.appendChild(img);
        }
        card.appendChild(content);

        const pn = plate.plateNumber || "(번호 없음)";
        const pd = isEmpty ? "-" : (plate.productName || "제품명 없음");
        
        let html = `<div class="card-row-main">
                      <div style="display:flex;align-items:center;gap:6px">
                        <div class="card-title" style="font-size:17px">${pn}</div>
                        <button class="btn btn-ghost btn-small" style="padding:2px 6px;font-size:10px" onclick="showPlateQR('${pn}')">QR</button>
                      </div>
                      <div class="card-tag">${pd}</div>
                    </div>`;
        html += `<div class="card-row"><span class="label">MESH</span>${plate.mesh||"-"}</div>`;
        
        if(!isEmpty){
            html += `<div class="card-row"><span class="label">필름</span>${plate.filmNumber||"-"}</div>`;
            html += `<div class="card-row"><span class="label">현재작업</span><strong style="color:var(--primary-1)">${(plate.usedQty||0).toLocaleString()}</strong> / ${r.max.toLocaleString()}장</div>`;
            html += `<div class="card-row"><span class="label">텐션</span>${plate.tension||"-"}</div>`;
            html += `<div class="card-row"><span class="label">위치</span>${plate.location||"-"}</div>`;
        } else {
            html += `<div class="card-row"><span class="label">상태</span><span style="color:#9ca3af">대기 중 (작업 가능)</span></div>`;
        }
        content.innerHTML = html;

        const footer = document.createElement("div"); footer.className = "card-footer";
        const totalQty = (plate.totalUsedQty !== undefined) ? plate.totalUsedQty : (plate.usedQty || 0);
        footer.innerHTML = `<div class="last-used" style="color:#6b7280;font-weight:500">총 누적: <span style="color:${currentMode==='night'?'#fff':'#374151'}">${Number(totalQty).toLocaleString()}장</span></div><div class="card-buttons"></div>`;
        content.appendChild(footer);

        const btnWrap = footer.querySelector(".card-buttons");
        // 버튼 로직 (기존과 동일)
        if (currentMode === MODE_PRINTER){
           if(!isEmpty) btnWrap.innerHTML += `<button class="btn btn-primary btn-small" onclick="openPlateUseSheet('${plate.id}')">사용등록</button>`;
           btnWrap.innerHTML += `<button class="btn btn-secondary btn-small" onclick="openPlateHistorySheet('${plate.id}')">히스토리</button>`;
           btnWrap.innerHTML += `<button class="btn btn-ghost btn-small" onclick="openPlateMemoSheet('${plate.id}')">메모</button>`;
        }
        else if (currentMode === MODE_VIEWER){
           btnWrap.innerHTML += `<button class="btn btn-secondary btn-small" onclick="openPlateHistorySheet('${plate.id}')">히스토리</button>`;
           btnWrap.innerHTML += `<button class="btn btn-ghost btn-small" onclick="openPlateMemoSheet('${plate.id}')">메모</button>`;
        }
        else if (currentMode === MODE_ADMIN){
          if(!isEmpty){
              btnWrap.innerHTML += `<button class="btn btn-primary btn-small" onclick="openPlateUseSheet('${plate.id}')">사용</button>`;
              const recBtn = document.createElement("button"); recBtn.className = "btn btn-secondary btn-small";
              recBtn.style.background = "#fef08a"; recBtn.style.color = "#854d0e"; recBtn.innerText = "✨ 탈막";
              recBtn.onclick = () => reclaimPlate(plate);
              btnWrap.appendChild(recBtn);
          }
          btnWrap.innerHTML += `<button class="btn btn-secondary btn-small" onclick="openPlateHistorySheet('${plate.id}')">기록</button>`;
          btnWrap.innerHTML += `<button class="btn btn-ghost btn-small" onclick="openPlateMemoSheet('${plate.id}')">메모</button>`;
          btnWrap.innerHTML += `<button class="btn btn-ghost btn-small" onclick="openPlateFormForEdit('${plate.id}')">수정</button>`;
          const delBtn = document.createElement("button"); delBtn.className = "btn btn-danger btn-small"; delBtn.innerText = "폐기";
          delBtn.onclick = async () => {
            if (!confirm(`[주의] ${plate.plateNumber} 판을 폐기할까?`)) return;
            await db.collection(PLATE_COLLECTION).doc(plate.id).delete();
            addHistory("판 폐기", { plateNumber: plate.plateNumber }, ["영구 삭제"]);
            showToast("폐기됨");
          };
          btnWrap.appendChild(delBtn);
        }
        listEl.appendChild(card);
      });
      applyViewMode();
      updateDashboard();
    }
	/* [추가] 대시보드 업데이트 함수 */
    function updateDashboard(){
      // 관리자나 인쇄기사만 봄
      if(currentMode === MODE_VIEWER) {
        document.getElementById("dashboardSection").style.display = "none";
        return;
      }
      document.getElementById("dashboardSection").style.display = "grid";

      // 1. 활성 판 (제품이 걸려있는 판)
      const activeCount = plates.filter(p => p.status !== 'empty').length;
      
      // 2. 빈 판
      const emptyCount = plates.filter(p => p.status === 'empty').length;
      
      // 3. 수명 주의 (90% 이상 쓴 판)
      const warnCount = plates.filter(p => {
        if(p.status === 'empty') return false;
        const r = getPlateUsedRatio(p);
        return r.pct >= 90;
      }).length;

      document.getElementById("dashActive").textContent = activeCount + "개";
      document.getElementById("dashEmpty").textContent = emptyCount + "개";
      document.getElementById("dashWarn").textContent = warnCount + "개";
    }
    function renderCurrentTab(){
      if (currentTab === "films") renderList(currentSearchText);
      else renderPlatesList(currentSearchText);
    }

    /* ---------- 설정 ---------- */
    function openSettingsCard(){
      if (currentMode !== MODE_ADMIN) return;
      const card = document.getElementById("settingsCard");
      const isOpen = card.style.display === "block";
      closeAllPanels();
      if (!isOpen){
        card.style.display = "block";
        // 현재 값 세팅
        const deviceInput = document.getElementById("deviceNameInput");
        if (deviceInput) deviceInput.value = getDeviceLabel();

        const sortSel = document.getElementById("sortOptionSelect");
        if (sortSel) sortSel.value = getSortOption();

        const themeSel = document.getElementById("themeSelect");
        if (themeSel) themeSel.value = getTheme();

        // 인쇄기사 목록 관리자 UI 갱신
        refreshPrinterManagerUI().catch(()=>{});
      }
    }

    function closeSettingsCard(){
      const card = document.getElementById("settingsCard");
      if (card) card.style.display = "none";
    }

    async function saveSettingsCard(){
      if (currentMode !== MODE_ADMIN) return;

      const deviceInput = document.getElementById("deviceNameInput");
      const sortSel = document.getElementById("sortOptionSelect");
      const themeSel = document.getElementById("themeSelect");

      if (deviceInput) setDeviceLabel(safeStr(deviceInput.value));
      if (sortSel) setSortOption(sortSel.value);
      if (themeSel) setTheme(themeSel.value);

      // 비밀번호 변경
      const adminNew = safeStr(document.getElementById("pwAdminNew")?.value);
      const printerNew = safeStr(document.getElementById("pwPrinterNew")?.value);
      const viewerNew = safeStr(document.getElementById("pwViewerNew")?.value);
      const adminCur = safeStr(document.getElementById("pwAdminCurrent")?.value);

      // 일부만 입력했으면 기존 유지
      const nextAdmin = adminNew || authConfig.adminPw;
      const nextPrinter = printerNew || authConfig.printerPw;
      const nextViewer = viewerNew || authConfig.viewerPw;

      // 비번 변경하려면 현재 관리자 비번 확인
      const wantsPwChange = !!(adminNew || printerNew || viewerNew);
      if (wantsPwChange){
        if (!adminCur || adminCur !== authConfig.adminPw){
          showToast("현재 관리자 비밀번호가 맞지 않아.");
          return;
        }
        try{
          await saveAuthConfig(nextAdmin, nextPrinter, nextViewer);
          showToast("비밀번호 변경됨.");
          document.getElementById("pwAdminNew").value = "";
          document.getElementById("pwPrinterNew").value = "";
          document.getElementById("pwViewerNew").value = "";
          document.getElementById("pwAdminCurrent").value = "";
        } catch(e){
          console.error(e);
          showToast("비밀번호 변경 중 오류.");
          return;
        }
      } else {
        showToast("설정 저장됨.");
      }

      closeSettingsCard();
      renderCurrentTab();
    }

    /* ---------- 인쇄기사 목록 관리 버튼 ---------- */
    async function onAddPrinter(){
      if (currentMode !== MODE_ADMIN) return;
      const input = document.getElementById("printerNameNew");
      const name = safeStr(input.value);
      if (!name){
        showToast("이름을 입력해줘.");
        return;
      }
      try{
        const cur = await loadPrinterList();
        cur.push(name);
        await savePrinterList(cur);
        input.value = "";
        await refreshPrinterManagerUI();
        showToast("목록 추가됨.");
      } catch(e){
        console.error(e);
        showToast("목록 추가 중 오류.");
      }
    }

    /* ---------- 로그인/잠금 ---------- */
    function isUnlocked(){
      // ✅ 1) sessionStorage 기반 유지 (창 끄면 풀림)
      return sessionStorage.getItem(UNLOCK_KEY) === "1" && !!sessionStorage.getItem(UNLOCK_MODE_KEY);
    }

    function lock(){
      sessionStorage.removeItem(UNLOCK_KEY);
      sessionStorage.removeItem(UNLOCK_MODE_KEY);
      currentMode = null;

      document.getElementById("appContainer").style.display = "none";
      document.getElementById("lockScreen").style.display = "flex";
      const pwInput = document.getElementById("passwordInput");
      if (pwInput) pwInput.value = "";
    }

    /* [수정] 잠금 해제 (QR 검색어 유지 기능 추가) */
    function unlock(mode){
      sessionStorage.setItem(UNLOCK_KEY, "1");
      sessionStorage.setItem(UNLOCK_MODE_KEY, mode);

      currentMode = mode;
      document.getElementById("lockScreen").style.display = "none";
      document.getElementById("appContainer").style.display = "block";

      applyModeUI();
      setTheme(getTheme());
      applyViewMode();

      // 리스너 시작
      startFilmsListener();
      startPlatesListener();
      updateDashboard();

      // 기본 탭 설정
      if (currentMode === MODE_PRINTER) currentTab = "plates";
      else currentTab = "films";
      
      // 화면 초기화 (여기서 검색어가 한번 지워짐)
      setActiveTabUI();

      // ★ [추가] QR로 들어온 경우, 지워진 검색어를 다시 복구하고 검색 실행!
      const urlParams = new URLSearchParams(window.location.search);
      const query = urlParams.get('q');
      
      if(query){
          const decoded = decodeURIComponent(query);
          
          // QR은 보통 판(Plate)을 찾으므로 탭을 '판'으로 강제 전환
          currentTab = "plates";
          document.getElementById("tabFilmsBtn").classList.remove("active");
          document.getElementById("tabPlatesBtn").classList.add("active");
          
          // 검색창에 값 다시 넣기
          const si = document.getElementById("searchInput");
          if(si) si.value = decoded;
          currentSearchText = decoded;
          
          // 검색 실행
          renderPlatesList(decoded);
          showToast(`QR 자동 검색: ${decoded}`);
      }
    }

    async function handleLogin(){
      const pw = safeStr(document.getElementById("passwordInput").value);
      if (!pw) return;

      await loadAuthConfig();
      const mode = detectModeByPassword(pw);
      if (!mode){
        showToast("비밀번호가 틀렸어.");
        return;
      }
      unlock(mode);

      // 기기 이름
      const label = getDeviceLabel();
      if (!label){
        // 최초 1회 모달
        const modal = document.getElementById("deviceModal");
        modal.style.display = "flex";
      } else {
        setDeviceLabel(label);
      }
    }

    /* ---------- 내보내기/불러오기 ---------- */
    async function exportData(){
      if (currentMode !== MODE_ADMIN) return;

      try{
        const filmsSnap = await db.collection(FILM_COLLECTION).get();
        const platesSnap = await db.collection(PLATE_COLLECTION).get();
        const historySnap = await db.collection(HISTORY_COLLECTION).orderBy("timestamp","desc").limit(100).get();
        const printers = await loadPrinterList();
        const authSnap = await db.collection(CONFIG_COLLECTION).doc(AUTH_DOC).get();
        const auth = authSnap.exists ? (authSnap.data()||{}) : {};

        const payload = {
          exportedAt: Date.now(),
          films: filmsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          plates: platesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          history: historySnap.docs.map(d => ({ id: d.id, ...d.data() })),
          config: {
            printers,
            auth: {
              adminPw: auth.adminPw || DEFAULT_ADMIN_PW,
              printerPw: auth.printerPw || DEFAULT_PRINTER_PW,
              viewerPw: auth.viewerPw || DEFAULT_VIEWER_PW,
            }
          }
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `film-find-export-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("내보내기 완료.");
      } catch(e){
        console.error(e);
        showToast("내보내기 오류.");
      }
    }

    async function importDataFromFile(file){
      if (currentMode !== MODE_ADMIN) return;
      try{
        const text = await file.text();
        const data = JSON.parse(text);

        if (!confirm("불러오기를 실행할까? (현재 데이터에 덮어쓰기/추가될 수 있어)")) return;

        const filmsArr = Array.isArray(data.films) ? data.films : [];
        const platesArr = Array.isArray(data.plates) ? data.plates : [];
        const historyArr = Array.isArray(data.history) ? data.history : [];
        const printersArr = Array.isArray(data?.config?.printers) ? data.config.printers : null;
        const authObj = data?.config?.auth || null;

        // films upsert
        for (const f of filmsArr){
          const id = safeStr(f.id);
          const copy = { ...f };
          delete copy.id;
          if (id) await db.collection(FILM_COLLECTION).doc(id).set(copy, { merge:true });
        }

        // plates upsert
        for (const p of platesArr){
          const id = safeStr(p.id);
          const copy = { ...p };
          delete copy.id;
          if (id) await db.collection(PLATE_COLLECTION).doc(id).set(copy, { merge:true });
        }

        // history upsert(선택)
        for (const h of historyArr){
          const id = safeStr(h.id);
          const copy = { ...h };
          delete copy.id;
          if (id) await db.collection(HISTORY_COLLECTION).doc(id).set(copy, { merge:true });
        }

        if (printersArr){
          await savePrinterList(printersArr);
        }
        if (authObj){
          await db.collection(CONFIG_COLLECTION).doc(AUTH_DOC).set({
            adminPw: authObj.adminPw || DEFAULT_ADMIN_PW,
            printerPw: authObj.printerPw || DEFAULT_PRINTER_PW,
            viewerPw: authObj.viewerPw || DEFAULT_VIEWER_PW,
            updatedAt: Date.now()
          }, { merge:true });
        }

        showToast("불러오기 완료.");
      } catch(e){
        console.error(e);
        showToast("불러오기 오류.");
      }
    }

    /* ---------- 이벤트 바인딩 ---------- */
    function bindEvents(){
      // 제판 방법(전면/배면, 좌/우, 상/하) 토글 버튼 클릭 이벤트 추가
document.querySelectorAll('.toggle-group .toggle-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    // 같은 그룹 내의 다른 버튼들의 active 클래스를 제거 (라디오 버튼 방식)
    const group = this.closest('.toggle-group');
    group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    
    // 클릭한 버튼에만 active 클래스 추가
    this.classList.add('active');
  });
});
      // 로그인
      document.getElementById("passwordBtn").addEventListener("click", handleLogin);
      document.getElementById("passwordInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleLogin();
      });

      // 기기 모달
      document.getElementById("deviceModalSave").addEventListener("click", () => {
        const v = safeStr(document.getElementById("deviceModalInput").value);
        setDeviceLabel(v);
        document.getElementById("deviceModal").style.display = "none";
      });
      document.getElementById("deviceModalSkip").addEventListener("click", () => {
        setDeviceLabel(getDeviceLabel());
        document.getElementById("deviceModal").style.display = "none";
      });

      // 이미지 뷰어
      document.getElementById("viewerBackdrop").addEventListener("click", closeImageViewer);
      document.getElementById("closeViewerBtn").addEventListener("click", closeImageViewer);

      // 탭
      document.getElementById("tabFilmsBtn").addEventListener("click", () => switchToTab("films"));
      document.getElementById("tabPlatesBtn").addEventListener("click", () => switchToTab("plates"));

      // 검색
      document.getElementById("searchInput").addEventListener("input", (e) => {
        currentSearchText = e.target.value;
        visibleCount = VISIBLE_STEP;
        renderCurrentTab();
      });

      // 보기 전환
      document.getElementById("viewToggleBtn").addEventListener("click", () => {
        setViewMode(currentViewMode === "gallery" ? "list" : "gallery");
      });

      // 새 필름
      document.getElementById("newFilmBtn").addEventListener("click", toggleFormNew);

      // 설정/히스토리
      document.getElementById("settingsBtn").addEventListener("click", openSettingsCard);
      document.getElementById("closeSettingsBtn").addEventListener("click", closeSettingsCard);
      document.getElementById("saveSettingsBtn").addEventListener("click", saveSettingsCard);

      document.getElementById("historyBtn").addEventListener("click", openHistoryCard);
      document.getElementById("closeHistoryBtn").addEventListener("click", closeHistoryCard);

      // 인쇄기사 목록 추가
      const addPrinterBtn = document.getElementById("addPrinterBtn");
      if (addPrinterBtn) addPrinterBtn.addEventListener("click", onAddPrinter);

      // 내보내기/불러오기
     document.getElementById("exportBtn").textContent = "엑셀 저장"; // 버튼 이름도 변경
document.getElementById("exportBtn").onclick = downloadExcelReport;
      document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
      document.getElementById("importFile").addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) importDataFromFile(file);
        e.target.value = "";
      });

      // 필름 폼
      document.getElementById("filmForm").addEventListener("submit", saveFilm);
      document.getElementById("cancelBtn").addEventListener("click", closeForm);
      document.getElementById("setTodayBtn").addEventListener("click", () => {
        document.getElementById("lastUsed").value = new Date().toISOString().slice(0,10);
      });

      // 이미지 미리보기 회전
      document.getElementById("imageInput").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file){
          resetImagePreview();
          return;
        }
        const dataUrl = await readFileAsDataURL(file);
        currentSelectedImageDataUrl = dataUrl;
        currentImageRotation = 0;

        const wrapper = document.getElementById("imagePreviewWrapper");
        const img = document.getElementById("imagePreview");
        if (img) img.src = dataUrl;
        if (wrapper) wrapper.style.display = "flex";
        applyPreviewRotation();
      });
      document.getElementById("rotateLeftBtn").addEventListener("click", () => {
        if (!currentSelectedImageDataUrl) return;
        currentImageRotation = (currentImageRotation - 90) % 360;
        applyPreviewRotation();
      });
      document.getElementById("rotateRightBtn").addEventListener("click", () => {
        if (!currentSelectedImageDataUrl) return;
        currentImageRotation = (currentImageRotation + 90) % 360;
        applyPreviewRotation();
      });

      // 판 폼
      document.getElementById("plateForm").addEventListener("submit", savePlate);
      document.getElementById("plateCancelBtn").addEventListener("click", closePlateForm);

      // 필름 메모
      document.getElementById("memoSheetBackdrop").addEventListener("click", closeMemoSheet);
      document.getElementById("memoSheetCloseBtn").addEventListener("click", closeMemoSheet);
      document.getElementById("memoSheetCancelBtn").addEventListener("click", closeMemoSheet);
      document.getElementById("memoSheetSaveBtn").addEventListener("click", saveMemoSheet);

      // 필름 출력 등록/기록
      document.getElementById("filmPrintBackdrop").addEventListener("click", closeFilmPrintSheet);
      document.getElementById("filmPrintCloseBtn").addEventListener("click", closeFilmPrintSheet);
      document.getElementById("filmPrintCancelBtn").addEventListener("click", closeFilmPrintSheet);
      document.getElementById("filmPrintSaveBtn").addEventListener("click", saveFilmPrintSheet);
      document.getElementById("filmPrintHistoryBackdrop").addEventListener("click", closeFilmPrintHistorySheet);
      document.getElementById("filmPrintHistoryCloseBtn").addEventListener("click", closeFilmPrintHistorySheet);
      document.getElementById("filmPrintHistoryCloseBtn2").addEventListener("click", closeFilmPrintHistorySheet);

      // 판 메모
      document.getElementById("plateMemoBackdrop").addEventListener("click", closePlateMemoSheet);
      document.getElementById("plateMemoCloseBtn").addEventListener("click", closePlateMemoSheet);
      document.getElementById("plateMemoCancelBtn").addEventListener("click", closePlateMemoSheet);
      document.getElementById("plateMemoSaveBtn").addEventListener("click", savePlateMemoSheet);

      // 판 사용등록
      document.getElementById("plateUseBackdrop").addEventListener("click", closePlateUseSheet);
      document.getElementById("plateUseCloseBtn").addEventListener("click", closePlateUseSheet);
      document.getElementById("plateUseCancelBtn").addEventListener("click", closePlateUseSheet);
      document.getElementById("plateUseSaveBtn").addEventListener("click", savePlateUse);

      // 판 히스토리
      document.getElementById("plateHistoryBackdrop").addEventListener("click", closePlateHistorySheet);
      document.getElementById("plateHistoryCloseBtn").addEventListener("click", closePlateHistorySheet);
      document.getElementById("plateHistoryCloseBtn2").addEventListener("click", closePlateHistorySheet);

      // 히스토리 메모 모달
      document.getElementById("historyNoteCancelBtn").addEventListener("click", closeHistoryNoteModal);
      document.getElementById("historyNoteSaveBtn").addEventListener("click", saveHistoryNoteModal);

                  // 스크롤 이벤트 (맨 위로 버튼 + 무한 스크롤 - 강력한 버전)
      const scrollBtn = document.getElementById("scrollTopBtn");
      const spinner = document.getElementById("loadingSpinner");

      window.addEventListener("scroll", () => {
        // 1. 맨 위로 가기 버튼 표시/숨김
        if (scrollBtn) {
          if (window.scrollY > 600) scrollBtn.classList.add("show");
          else scrollBtn.classList.remove("show");
        }

        // 2. 무한 스크롤 (바닥 감지)
        if (loadingMore) return; // 이미 로딩 중이면 실행 안 함

        // [수정] 모바일/PC 모든 브라우저 호환성을 위한 높이 계산
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const windowHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 0;
        const docHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;

        // 바닥에서 100px 정도 남았을 때 미리 로딩 (감도 높임)
        if (scrollTop + windowHeight >= docHeight - 100) {
          
          // 현재 탭에 맞는 전체 데이터 개수 확인
          let totalLen = 0;
          if (currentTab === "films") totalLen = films.length;
          else totalLen = plates.length;

          // 검색 중이 아닐 때, 이미 다 보여줬으면 중단
          if (visibleCount >= totalLen && currentSearchText === "") return;

          loadingMore = true;
          if (spinner) spinner.classList.add("show");

          // 스피너 보여주기 (0.5초 딜레이)
          setTimeout(() => {
            visibleCount += VISIBLE_STEP; // 개수 늘리기
            renderCurrentTab(); // 화면 갱신
            
            if (spinner) spinner.classList.remove("show");
            loadingMore = false;
          }, 500);
        }
      });

      // 맨 위로 가기 버튼 클릭 이벤트
      if (scrollBtn) {
        scrollBtn.addEventListener("click", () => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }



      // ✅ (선택) 페이지가 살아있을 때만 유지 / 창 완전 종료면 sessionStorage 자동 초기화
      // (추가 삭제 없음)
 bindViewerGestures(); 
     }
    /* =========================================
   [추가] 이미지 뷰어 줌/이동(Pan & Zoom) 로직
   ========================================= */

// 1. 상태 변수
let viewerState = {
  scale: 1,       // 현재 배율
  panning: false, // 드래그 중인지 여부
  pointX: 0,      // 현재 X 위치
  pointY: 0,      // 현재 Y 위치
  startX: 0,      // 터치 시작 X 좌표
  startY: 0,      // 터치 시작 Y 좌표
  startDist: 0    // 두 손가락 사이 거리
};

// 2. 화면 업데이트 함수
function updateViewerTransform() {
  const img = document.getElementById("viewerImage");
  const display = document.getElementById("zoomLevelDisplay");
  if (!img) return;
  
  // 위치 이동(X,Y)과 확대(Scale) 적용
  img.style.transform = `translate(${viewerState.pointX}px, ${viewerState.pointY}px) scale(${viewerState.scale})`;
  
  // 화면 하단에 줌 레벨 표시 (예: 150%)
  if (display) display.textContent = Math.round(viewerState.scale * 100) + "%";
}

// 3. 두 손가락 거리 계산 함수
function getDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy); 
}

// 4. 터치 이벤트 연결 함수
function bindViewerGestures() {
  const container = document.getElementById("viewerContainer"); 
  const img = document.getElementById("viewerImage");
  
  if (!container || !img) return;

  // (1) 터치 시작
  container.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      // 두 손가락 -> 줌 시작
      viewerState.panning = false;
      viewerState.startDist = getDistance(e.touches);
    } else if (e.touches.length === 1) {
      // 한 손가락 -> 이동 준비
      viewerState.panning = true;
      viewerState.startX = e.touches[0].clientX - viewerState.pointX;
      viewerState.startY = e.touches[0].clientY - viewerState.pointY;
    }
  }, { passive: false });

  // (2) 터치 이동
  container.addEventListener("touchmove", (e) => {
    e.preventDefault(); // 화면 스크롤 방지

    if (e.touches.length === 2) {
      // 두 손가락 -> 핀치 줌
      const newDist = getDistance(e.touches);
      const ratio = newDist / viewerState.startDist;
      
      // 배율 제한 (0.5배 ~ 5배)
      viewerState.scale = Math.max(0.5, Math.min(5, viewerState.scale * ratio));
      viewerState.startDist = newDist;
      
      updateViewerTransform();

    } else if (e.touches.length === 1 && viewerState.panning) {
      // 한 손가락 -> 이미지 이동
      viewerState.pointX = e.touches[0].clientX - viewerState.startX;
      viewerState.pointY = e.touches[0].clientY - viewerState.startY;
      updateViewerTransform();
    }
  }, { passive: false });

  // (3) 터치 끝
  container.addEventListener("touchend", () => {
    viewerState.panning = false;
  });
}
/* [추가] 대시보드 숫자 계산 함수 */
    function updateDashboard(){
      const dashSection = document.getElementById("dashboardSection");
      if(!dashSection) return;

      // 1. 활성 판
      const activeCount = plates.filter(p => p.status !== 'empty').length;
      
      // 2. 빈 판
      const emptyCount = plates.filter(p => p.status === 'empty').length;
      
      // 3. 수명 주의
      const warnCount = plates.filter(p => {
        if(p.status === 'empty') return false;
        const r = getPlateUsedRatio(p);
        return r.pct >= 90;
      }).length;

      document.getElementById("dashActive").textContent = activeCount + "개";
      document.getElementById("dashEmpty").textContent = emptyCount + "개";
      document.getElementById("dashWarn").textContent = warnCount + "개";
      
      dashSection.style.display = (currentMode === MODE_VIEWER) ? "none" : "grid";
    }
// 👆👆👆 여기까지 붙여넣기 👆👆👆
/* [추가] 엑셀 보고서 다운로드 기능 */
    async function downloadExcelReport() {
      if(!confirm("전체 데이터를 엑셀로 다운로드할까?")) return;

      try {
        const wb = XLSX.utils.book_new();

        // 1. 필름 목록 시트
        const filmData = films.map(f => ({
          "제품명": f.productName,
          "필름번호": f.filmNumber,
          "타입": f.method,
          "MESH": f.mesh,
          "위치": f.location,
          "요청자": f.requestPrinter,
          "마지막사용": f.lastUsed,
          "최근인쇄일": f.lastPrintedDate || "",
          "메모": f.memo
        }));
        const ws1 = XLSX.utils.json_to_sheet(filmData);
        XLSX.utils.book_append_sheet(wb, ws1, "필름 목록");

        // 2. 판 목록 시트
        const plateData = plates.map(p => ({
          "판번호": p.plateNumber,
          "상태": p.status === 'empty' ? '빈 판' : '사용 중',
          "현재제품": p.productName || "-",
          "현재필름": p.filmNumber || "-",
          "MESH": p.mesh,
          "텐션": p.tension,
          "위치": p.location,
          "현재작업량": p.usedQty || 0,
          "총누적수량": p.totalUsedQty || 0
        }));
        const ws2 = XLSX.utils.json_to_sheet(plateData);
        XLSX.utils.book_append_sheet(wb, ws2, "판(Frame) 현황");

        // 3. 필름 출력 기록 시트
        const filmPrintRows = [];
        for (const f of films) {
          const snap = await db.collection(FILM_COLLECTION).doc(f.id)
            .collection(FILM_PRINT_SUB).orderBy("date", "desc").limit(100).get();
          snap.docs.forEach(doc => {
            const d = doc.data() || {};
            filmPrintRows.push({
              "제품명": f.productName || "",
              "필름번호": f.filmNumber || "",
              "출력날짜": d.date || "",
              "등록시간": formatTs(d.timestamp || 0),
              "기기": d.deviceName || "",
              "메모": d.memo || ""
            });
          });
        }
        const wsPrint = XLSX.utils.json_to_sheet(filmPrintRows);
        XLSX.utils.book_append_sheet(wb, wsPrint, "필름 출력 기록");

        // 4. 작업 히스토리 시트 (최근 500개만)
        // (주의: 데이터가 많으면 로딩이 걸릴 수 있어 500개로 제한)
        const histSnap = await db.collection(HISTORY_COLLECTION).orderBy("timestamp","desc").limit(500).get();
        const histData = histSnap.docs.map(doc => {
            const d = doc.data();
            const date = new Date(d.timestamp);
            return {
                "시간": `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`,
                "구분": d.action,
                "기기": d.deviceName,
                "내용": d.filmNumber + " " + (d.productName||""),
                "변경사항": (d.changes || []).join(", "),
                "메모": d.note || ""
            };
        });
        const ws3 = XLSX.utils.json_to_sheet(histData);
        XLSX.utils.book_append_sheet(wb, ws3, "작업 기록");

        // 파일 저장
        const dateStr = new Date().toISOString().slice(0,10);
        XLSX.writeFile(wb, `FILM_FIND_보고서_${dateStr}.xlsx`);
        
        showToast("엑셀 다운로드 완료!");
      } catch(e) {
        console.error(e);
        showToast("엑셀 변환 중 오류 발생");
      }
    }
	/* [추가] 대시보드 클릭 필터 변수 및 함수 */
    let dashboardFilter = null; // 현재 어떤 필터인지 저장 (null이면 전체보기)

    function filterByDash(type){
      // 이미 눌려있는 걸 또 누르면 -> 필터 해제 (토글)
      if(dashboardFilter === type){
        dashboardFilter = null;
      } else {
        dashboardFilter = type; // 필터 설정
      }
      
      // 디자인 업데이트 (선택된 카드만 진하게)
      document.querySelectorAll('.dash-card').forEach(el => el.classList.remove('selected'));
      if(dashboardFilter === 'active') document.getElementById('cardActive').classList.add('selected');
      if(dashboardFilter === 'empty') document.getElementById('cardEmpty').classList.add('selected');
      if(dashboardFilter === 'warn') document.getElementById('cardWarn').classList.add('selected');

      // 리스트 다시 그리기
      renderPlatesList(currentSearchText);
    }
	
	/* [수정] QR코드 생성 (스마트 URL 방식) */
    function showPlateQR(text){
      const modal = document.getElementById("qrModal");
      const canvas = document.getElementById("qrCanvas");
      
      if(!modal || !canvas) { console.error("QR 요소 없음"); return; }

      document.getElementById("qrTitleText").innerText = text;
      canvas.innerHTML = "";
      
      // ★ 여기가 핵심! 내 홈페이지 주소 + 검색어(?q=...) 조합하기
      // 예: https://myapp.com/?q=300mesh-1
      const currentUrl = window.location.href.split('?')[0]; 
      const smartUrl = `${currentUrl}?q=${encodeURIComponent(text)}`;

      new QRCode(canvas, {
        text: smartUrl, // 이제 주소가 들어갑니다!
        width: 128,
        height: 128,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
      });
      
      modal.style.display = "flex";
    }


    /* ---------- 초기화 ---------- */
    async function init(){
      bindEvents();
      setTheme(getTheme());
      applyViewMode();
	  
	  // 👇 [추가] QR로 들어왔을 때 자동 검색 기능
      const urlParams = new URLSearchParams(window.location.search);
      const query = urlParams.get('q'); // 주소창에서 ?q=... 찾기
      
      if(query){
          // 검색어가 있으면 입력창에 넣고 검색 변수 업데이트
          // (데이터 로딩이 끝나면 이 검색어로 리스트가 뜹니다)
          const decoded = decodeURIComponent(query);
          const searchInput = document.getElementById("searchInput");
          if(searchInput) searchInput.value = decoded;
          currentSearchText = decoded;
          showToast(`QR 검색: ${decoded}`);
      }
      // 👆 여기까지 추가

      // mode 복구(세션)
      await loadAuthConfig();

      if (isUnlocked()){
        const mode = sessionStorage.getItem(UNLOCK_MODE_KEY);
        if (mode === MODE_ADMIN || mode === MODE_PRINTER || mode === MODE_VIEWER){
          unlock(mode);
        } else {
          lock();
        }
      } else {
        lock();
      }

      // 기기 배지
      setDeviceLabel(getDeviceLabel());

      // 인쇄기사 목록 관리자 UI는 설정 열 때 갱신됨
    }

    init().catch(console.error);


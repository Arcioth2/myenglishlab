// Popup'tan gelen mesajları dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract_questions") {
    try {
      const data = extractContextAndBlanks();
      if (data) {
        sendResponse({ success: true, data: data });
      } else {
        sendResponse({ success: false, error: "Alıştırma bulunamadı veya desteklenmiyor." });
      }
    } catch (e) {
      console.error(e);
      sendResponse({ success: false, error: e.message });
    }
  } 
  
  else if (request.action === "apply_answers") {
    try {
      const count = applyAnswers(request.answers);
      sendResponse({ success: true, count: count });
    } catch (e) {
      console.error(e);
      sendResponse({ success: false, error: e.message });
    }
  }
});

function extractContextAndBlanks() {
  const container = document.querySelector('.reading-frame') || 
                    document.querySelector('.taskContent') || 
                    document.querySelector('.activity-container') ||
                    document.querySelector('#activityWrapper');

  if (!container) return null;

  // Talimatları bul
  let instructionText = "";
  const taskWrapper = container.closest('.task') || document.querySelector('.task');
  if (taskWrapper) {
      const rubric = taskWrapper.querySelector('.taskRubric');
      if (rubric) instructionText = "INSTRUCTIONS / QUESTION:\n" + rubric.innerText.trim() + "\n\n";
  }

  const clone = container.cloneNode(true);
  const blanks = [];

  // --- TİP 1: Açılır Menüler (Dropdowns) ---
  const selects = clone.querySelectorAll('select.activity-select, select');
  selects.forEach(select => {
    if (select.style.display === 'none' || select.type === 'hidden') return;
    const id = select.id;
    const originalSelect = document.getElementById(id);
    if (!originalSelect) return;
    const options = Array.from(originalSelect.options).filter(opt => opt.value !== "").map(opt => ({ text: opt.textContent.trim() }));
    if (options.length > 0) {
      blanks.push({ id: id, type: 'select', options: options.map(o => o.text) });
      select.parentNode.replaceChild(document.createTextNode(` [[${id}]] `), select);
    }
  });

  // --- TİP 2: Tıklanabilir Gruplar ---
  const underlineGroups = clone.querySelectorAll('.underlineGroup');
  underlineGroups.forEach(group => {
    const id = group.id;
    const originalGroup = document.getElementById(id);
    if (!originalGroup) return;
    const options = Array.from(originalGroup.querySelectorAll('.underlineElement')).map(span => ({ text: span.innerText.trim() }));
    if (options.length > 0) {
      blanks.push({ id: id, type: 'click', options: options.map(o => o.text) });
      group.parentNode.replaceChild(document.createTextNode(` [[${id}]] `), group);
    }
  });

  // --- TİP 3: Metin Kutuları ---
  const inputs = clone.querySelectorAll('input[type="text"], textarea');
  inputs.forEach(input => {
    const id = input.id;
    if (!id || input.type === 'hidden') return;
    blanks.push({ id: id, type: 'text', options: [] });
    input.parentNode.replaceChild(document.createTextNode(` [[${id}]] `), input);
  });

  // --- TİP 4: Sürükle ve Bırak (Drag & Drop) ---
  // Gönderdiğiniz dosyada '.drop' sınıfı kullanılıyor.
  const dropZoneSelectors = ['.drop', '.target', '.drop-zone', '.gap', '.ui-droppable', '[data-droppable="true"]'];
  const draggableSelectors = ['.drag', '.source', '.draggable', '.drag-item'];

  let dropZones = [];
  dropZoneSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => dropZones.push(el));
  });
  // Görünür olanları filtrele ve tekilleştir
  dropZones = [...new Set(dropZones)].filter(el => el.style.display !== 'none');

  // Kaynak kelimeleri topla
  let draggables = [];
  draggableSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => draggables.push(el.innerText.trim()));
  });
  draggables = [...new Set(draggables)].filter(t => t.length > 0);

  if (dropZones.length > 0) {
    dropZones.forEach((zone, index) => {
      let id = zone.id;
      // ID yoksa oluştur
      if (!id) {
         id = `generated_gap_${index}`;
         zone.id = id;
         // Orijinal elemente de ID ver ki sonra bulalım
         const originalZones = [];
         dropZoneSelectors.forEach(sel => { document.querySelectorAll(sel).forEach(el => originalZones.push(el)); });
         const uniqueOriginals = [...new Set(originalZones)].filter(el => el.style.display !== 'none');
         if (uniqueOriginals[index]) uniqueOriginals[index].id = id;
      }
      
      blanks.push({ id: id, type: 'drag_drop', options: draggables });
      zone.parentNode.replaceChild(document.createTextNode(` [[${id}]] `), zone);
    });
  }

  const contentText = "CONTENT:\n" + clone.innerText.replace(/\s+/g, ' ').trim();
  const fullText = instructionText + contentText;

  return { text: fullText, blanks };
}

function applyAnswers(answers) {
  let count = 0;
  
  // Varsa eski paneli kaldır
  const existingPanel = document.getElementById('pearson-solver-panel');
  if (existingPanel) existingPanel.remove();

  // Yeni Cevap Paneli Oluştur (Sağ Alt Köşe)
  const panel = document.createElement('div');
  panel.id = 'pearson-solver-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 320px;
    max-height: 500px;
    overflow-y: auto;
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    z-index: 2147483647;
    border-radius: 12px;
    font-family: 'Segoe UI', sans-serif;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.3s ease-out;
  `;

  // Panel Başlığı
  const header = document.createElement('div');
  header.style.cssText = `
    background: #007bff;
    color: white;
    padding: 12px 15px;
    font-weight: bold;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
  `;
  header.innerHTML = `<span>📝 Çözümler (${Object.keys(answers).length})</span> <span style="cursor:pointer; font-size:18px;" onclick="this.parentElement.parentElement.remove()">×</span>`;
  panel.appendChild(header);

  // Liste Alanı
  const list = document.createElement('div');
  list.style.padding = '10px';
  list.style.background = '#f8f9fa';

  let questionIndex = 1;

  for (const [id, answerText] of Object.entries(answers)) {
    const element = document.getElementById(id);
    if (!element) continue;

    const cleanAnswer = answerText ? answerText.trim() : "";
    if (!cleanAnswer) continue;

    // --- Tip 1: Dropdown & Input (Otomatik Doldurmaya Devam Et) ---
    if (element.tagName === 'SELECT' || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        if (element.tagName === 'SELECT') {
             const options = Array.from(element.options);
             const correctOption = options.find(opt => opt.textContent.trim().toLowerCase() === cleanAnswer.toLowerCase());
             if (correctOption) element.value = correctOption.value;
        } else {
            element.value = cleanAnswer;
        }
        dispatchEvents(element);
        element.style.border = "2px solid #28a745"; // Doğrudan doldurulanları yeşil yap
    }
    
    // --- Tip 2: Drag & Drop (Sadece Numaralandır ve Panele Ekle) ---
    else {
        // İsteğiniz üzerine görsel işaretçiler (kutu kenarlığı, numara) kaldırıldı.
        // Kullanıcı cevapları sadece sağ alttaki panelden görecek.
    }

    // Cevabı Panele Ekle
    const row = document.createElement('div');
    row.style.cssText = `
        padding: 8px; border-bottom: 1px solid #eee; display: flex; align-items: flex-start;
        background: white; margin-bottom: 5px; border-radius: 6px;
    `;
    row.innerHTML = `
        <span style="background:#e9ecef; color:#495057; padding:2px 6px; border-radius:4px; margin-right:8px; font-weight:bold; font-size:12px; min-width:25px; text-align:center;">${questionIndex}</span>
        <span style="color:#212529; font-weight:500; font-size:13px; word-break:break-word;">${cleanAnswer}</span>
    `;
    list.appendChild(row);

    count++;
    questionIndex++;
  }

  panel.appendChild(list);
  document.body.appendChild(panel);

  // Animasyon stili ekle
  const style = document.createElement('style');
  style.innerHTML = `@keyframes slideIn { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`;
  document.head.appendChild(style);

  return count;
}

function dispatchEvents(element) {
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
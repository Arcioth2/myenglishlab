document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelNameInput = document.getElementById('modelName');
  const saveKeyBtn = document.getElementById('saveKey');
  const solveBtn = document.getElementById('solveBtn');
  const statusDiv = document.getElementById('status');

  // Varsayılan model
  const DEFAULT_MODEL = 'gemini-2.5-flash';

  // Kayıtlı ayarları yükle
  chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    // Eğer kayıtlı model yoksa veya eski varsayılan ise yenisini kullan
    if (result.geminiModel) {
      modelNameInput.value = result.geminiModel;
    } else {
      modelNameInput.value = DEFAULT_MODEL;
    }
  });

  // Ayarları Kaydet
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const model = modelNameInput.value.trim() || DEFAULT_MODEL;
    
    if (key) {
      chrome.storage.sync.set({ 
        geminiApiKey: key,
        geminiModel: model
      }, () => {
        showStatus('Ayarlar kaydedildi!', 'success');
      });
    } else {
      showStatus('Lütfen geçerli bir API Anahtarı girin.', 'error');
    }
  });

  // Çöz Butonu Mantığı
  solveBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const model = modelNameInput.value.trim() || DEFAULT_MODEL;

    if (!key) {
      showStatus('API Anahtarı eksik. Lütfen önce kaydedin.', 'error');
      return;
    }

    showStatus('Sayfa analiz ediliyor...', 'loading');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
        showStatus('Aktif sekme bulunamadı.', 'error');
        return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "extract_questions" });
      
      if (!response || !response.success) {
        showStatus(response?.error || 'Bu sayfada soru bulunamadı.', 'error');
        return;
      }

      showStatus(`${model} ile çözülüyor...`, 'loading');

      chrome.runtime.sendMessage({ 
        action: "call_gemini", 
        payload: response.data,
        apiKey: key,
        model: model
      }, (apiResponse) => {
        if (apiResponse && apiResponse.success) {
            showStatus('Cevaplar panele yazılıyor...', 'loading');
            chrome.tabs.sendMessage(tab.id, { 
                action: "apply_answers", 
                answers: apiResponse.answers 
            }, (applyResponse) => {
                if(applyResponse && applyResponse.success) {
                    showStatus(`Tamamlandı! Sağ alttaki panele bakın.`, 'success');
                } else {
                    showStatus('Cevaplar işlenemedi.', 'error');
                }
            });
        } else {
            showStatus('API Hatası: ' + (apiResponse?.error || 'Bilinmeyen Hata'), 'error');
        }
      });

    } catch (err) {
      console.error(err);
      showStatus('Hata: Sayfayı yenileyip tekrar deneyin.', 'error');
    }
  });

  function showStatus(msg, type) {
    statusDiv.textContent = msg;
    statusDiv.className = 'status ' + type;
  }
});
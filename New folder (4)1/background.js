chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "call_gemini") {
    solveWithGemini(request.payload, request.apiKey, request.model)
      .then(answers => sendResponse({ success: true, answers: answers }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; 
  }
});

async function solveWithGemini(payload, apiKey, modelName) {
  const { text, blanks } = payload;
  // Varsayılan olarak 2.5 Flash Preview kullan
  const model = modelName || 'gemini-2.5-flash';

  const prompt = `
    You are a cadet in the Turkish Air Force Academy.
    
    TASK: Fill in the blanks based on the text.
    
    INPUT TEXT:
    """
    ${text}
    """

    BLANKS TO SOLVE (JSON):
    ${JSON.stringify(blanks)}

    OUTPUT INSTRUCTIONS:
    1. Return strictly a valid JSON object.
    2. Format: {"ID": "ANSWER", "ID2": "ANSWER"}
    3. Do NOT use Markdown code blocks (no \`\`\`json).
    4. Escape all quotes and backslashes within strings properly.
    5. If the answer is long (essay), replace actual newlines with \\n.

    JSON OUTPUT:
  `;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `API isteği başarısız: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("Gemini'den yanıt alınamadı.");
    }

    let rawText = data.candidates[0].content.parts[0].text;
    
    // Temizlik
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonStartIndex = rawText.indexOf('{');
    const jsonEndIndex = rawText.lastIndexOf('}');
    
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        rawText = rawText.substring(jsonStartIndex, jsonEndIndex + 1);
    }

    try {
        return JSON.parse(rawText);
    } catch (firstError) {
        console.warn("İlk JSON ayrıştırma başarısız, düzeltme deneniyor...", firstError);
        const fixedText = rawText.replace(/(?<!\\)\n/g, "\\n").replace(/\r/g, ""); 
        try {
            return JSON.parse(fixedText);
        } catch (secondError) {
             throw new Error("Gemini yanıtı işlenemedi (Geçersiz JSON).");
        }
    }

  } catch (error) {
    console.error("Gemini API Hatası:", error);
    throw error;
  }
}
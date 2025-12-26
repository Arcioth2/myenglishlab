<?php
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    require 'db_connect.php';

    // 1. Verify Token
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? '';
    if (!preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Unauthorized']);
        exit;
    }
    $token = $matches[1];

    $stmt = $pdo->prepare("SELECT * FROM users WHERE token = ?");
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid Token']);
        exit;
    }

    // 2. Check Limits
    if ($user['api_requests_left'] <= 0) {
        echo json_encode(['success' => false, 'error' => 'Request limit reached. Upgrade plan.']);
        exit;
    }

    // 3. Select Model
    $input = json_decode(file_get_contents('php://input'), true);
    $requestedModel = $input['model_preference'] ?? 'gemini-2.5-flash-lite-preview-02-05';
    
    $model = 'gemini-2.5-flash-lite-preview-02-05'; // Default for Open/Lite
    if ($user['plan_type'] === 'FLASH') {
        $model = $requestedModel;
    }

    // 4. Get API Key
    // Logic: Flash users get PAID keys first, others get FREE keys
    $keyType = ($user['plan_type'] === 'FLASH') ? 'PAID' : 'FREE';
    
    $keyStmt = $pdo->prepare("SELECT key_value FROM api_keys WHERE type = ? AND is_active = 1 ORDER BY RAND() LIMIT 1");
    $keyStmt->execute([$keyType]);
    $apiKeyRow = $keyStmt->fetch();

    // Fallback if no paid key found, try free
    if (!$apiKeyRow && $keyType === 'PAID') {
        $keyStmt->execute(['FREE']);
        $apiKeyRow = $keyStmt->fetch();
    }

    if (!$apiKeyRow) {
        echo json_encode(['success' => false, 'error' => 'System busy (No API Keys available).']);
        exit;
    }
    $apiKey = $apiKeyRow['key_value'];

    // 5. Call Gemini
    $promptText = $input['text'];
    $blanks = $input['blanks'];

    $geminiPrompt = "
    You are an English language expert.
    TASK: Fill in the blanks based on the text.
    INPUT TEXT: \"\"\"$promptText\"\"\"
    BLANKS TO SOLVE (JSON): " . json_encode($blanks) . "
    OUTPUT INSTRUCTIONS: Return strictly a valid JSON object. Format: {\"ID\": \"ANSWER\"}. No Markdown.
    ";

    $url = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey";
    
    $data = [
        "contents" => [
            ["parts" => [["text" => $geminiPrompt]]]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // 6. Handle Response & Deduct Credit
    if ($httpCode === 200) {
        $responseData = json_decode($response, true);
        
        // Decrement user credit
        $updateStmt = $pdo->prepare("UPDATE users SET api_requests_left = api_requests_left - 1 WHERE id = ?");
        $updateStmt->execute([$user['id']]);
        
        // Parse Gemini Response
        $rawText = $responseData['candidates'][0]['content']['parts'][0]['text'];
        // Clean markdown
        $rawText = preg_replace('/```json|```/', '', $rawText);
        $answers = json_decode($rawText, true);

        echo json_encode([
            'success' => true,
            'answers' => $answers,
            'requests_left' => $user['api_requests_left'] - 1
        ]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Gemini API Error: ' . $response]);
    }
    ?>
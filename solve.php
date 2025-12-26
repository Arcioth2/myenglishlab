<?php
// 1. CORS & Headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require 'db_connect.php';

// 2. Verify Token
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

// 3. Check Limits
if ($user['api_requests_left'] <= 0) {
    echo json_encode(['success' => false, 'error' => 'Limit reached. Upgrade plan.']);
    exit;
}

// 4. Get API Key
$keyType = ($user['plan_type'] === 'FLASH') ? 'PAID' : 'FREE';
$keyStmt = $pdo->prepare("SELECT key_value FROM api_keys WHERE type = ? AND is_active = 1 ORDER BY RAND() LIMIT 1");
$keyStmt->execute([$keyType]);
$apiKeyRow = $keyStmt->fetch();

// Fallback logic
if (!$apiKeyRow && $keyType === 'PAID') {
    $keyStmt->execute(['FREE']);
    $apiKeyRow = $keyStmt->fetch();
}

if (!$apiKeyRow) {
    echo json_encode(['success' => false, 'error' => 'System busy (No API Keys available).']);
    exit;
}

// 5. Decrement Credit & Return Key
// We deduct credit NOW because we are handing over the "value" (the key).
$updateStmt = $pdo->prepare("UPDATE users SET api_requests_left = api_requests_left - 1 WHERE id = ?");
$updateStmt->execute([$user['id']]);

echo json_encode([
    'success' => true,
    'api_key' => $apiKeyRow['key_value'], // Sending key to client!
    'requests_left' => $user['api_requests_left'] - 1
]);
?>
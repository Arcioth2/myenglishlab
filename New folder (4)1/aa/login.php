<?php
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *'); // For development, restrict in production
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type');

    require 'db_connect.php';

    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';

    if (!$username || !$password) {
        echo json_encode(['success' => false, 'message' => 'Missing credentials']);
        exit;
    }

    // Fetch user
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password_hash'])) {
        // Check Expiry
        if ($user['plan_expiry'] && new DateTime($user['plan_expiry']) < new DateTime()) {
            echo json_encode(['success' => false, 'message' => 'Plan expired']);
            exit;
        }

        // Generate Token
        $token = bin2hex(random_bytes(32));
        $update = $pdo->prepare("UPDATE users SET token = ? WHERE id = ?");
        $update->execute([$token, $user['id']]);

        echo json_encode([
            'success' => true,
            'token' => $token,
            'username' => $user['username'],
            'plan' => $user['plan_type'],
            'requests_left' => $user['api_requests_left']
        ]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
    }
    ?>
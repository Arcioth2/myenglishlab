<?php
    // Protect this file or delete after use!
    require 'db_connect.php';
    
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $key = $_POST['key'];
        $type = $_POST['type']; // FREE or PAID
        
        $stmt = $pdo->prepare("INSERT INTO api_keys (key_value, type) VALUES (?, ?)");
        $stmt->execute([$key, $type]);
        echo "Key added!";
    }
    ?>
    <form method="POST">
        API Key: <input type="text" name="key" required><br>
        Type: <select name="type"><option value="FREE">FREE</option><option value="PAID">PAID</option></select><br>
        <button type="submit">Add Key</button>
    </form>
<?php
declare(strict_types=1);

/* Server-local duplicate suppression. No PII, payloads, or credentials are stored.
 * This is not a durable cross-host queue. Unknown outcomes require reconciliation.
 */
function lead_state_path(string $id, ?string $directory = null): string {
    return rtrim($directory ?? sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'osoul-submission-' . hash('sha256', $id) . '.lock';
}

function lead_state_write($handle, array $state): bool {
    $json = json_encode($state, JSON_UNESCAPED_SLASHES);
    if ($json === false || !rewind($handle) || !ftruncate($handle, 0)) return false;
    return fwrite($handle, $json) === strlen($json) && fflush($handle);
}

function lead_state_claim(string $id, string $fingerprint, ?string $directory = null): array {
    $path = lead_state_path($id, $directory);
    $handle = @fopen($path, 'x+');
    $created = $handle !== false;
    if (!$created) $handle = @fopen($path, 'r+');
    if ($handle === false) return ['status' => 'unavailable'];
    @chmod($path, 0600);
    if (!flock($handle, LOCK_EX)) { fclose($handle); return ['status' => 'unavailable']; }
    try {
        $raw = stream_get_contents($handle);
        if ($raw === false) return ['status' => 'unavailable'];
        if ($raw !== '') {
            $state = json_decode($raw, true);
            // Legacy timestamp-only claims and damaged records are never success.
            if (!is_array($state) || !isset($state['fingerprint'], $state['status']) || !is_string($state['fingerprint']) || !is_string($state['status'])) {
                return ['status' => 'review-required'];
            }
            if (!hash_equals($state['fingerprint'], $fingerprint)) return ['status' => 'conflict'];
            if ($state['status'] === 'completed' && is_string($state['receipt'] ?? null) && preg_match('/^[a-f0-9]{16}$/', $state['receipt'])) {
                return ['status' => 'completed', 'receipt' => $state['receipt']];
            }
            // No automatic lock expiry: a timed-out provider may have accepted the request.
            if ($state['status'] === 'processing' && is_int($state['created_at'] ?? null) && $state['created_at'] > time() - 120) {
                return ['status' => 'processing'];
            }
            return ['status' => 'review-required'];
        }
        if (!$created) return ['status' => 'review-required'];
        $state = ['status' => 'processing', 'fingerprint' => $fingerprint,
            'created_at' => time(), 'receipt' => bin2hex(random_bytes(8))];
        if (!lead_state_write($handle, $state)) return ['status' => 'unavailable'];
        return ['status' => 'claimed', 'receipt' => $state['receipt']];
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}

function lead_state_finish(string $id, string $fingerprint, bool $accepted, ?string $directory = null): bool {
    $handle = @fopen(lead_state_path($id, $directory), 'r+');
    if ($handle === false) return false;
    if (!flock($handle, LOCK_EX)) { fclose($handle); return false; }
    try {
        $raw = stream_get_contents($handle);
        $state = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($state) || !isset($state['fingerprint']) || !is_string($state['fingerprint']) || !hash_equals($state['fingerprint'], $fingerprint)
            || ($state['status'] ?? null) !== 'processing') return false;
        $state['status'] = $accepted ? 'completed' : 'review-required';
        $state['finished_at'] = time();
        return lead_state_write($handle, $state);
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}

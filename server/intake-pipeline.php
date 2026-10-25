<?php
declare(strict_types=1);

/** Single-host durable receipt ledger. Adapters are injected by trusted PHP code only.
 * No user payload is persisted. Provider acceptance is not proof of delivery.
 */
function intake_directory(?string $configured = null): ?string {
    $configured = $configured ?? (getenv('OSOOL_INTAKE_STATE_DIR') ?: '');
    if ($configured === '' || is_link($configured)) return null;
    $directory = realpath($configured);
    $webroot = realpath(__DIR__ . '/..');
    if ($directory === false || !is_dir($directory) || !is_writable($directory)
        || $directory === $webroot || str_starts_with($directory, $webroot . DIRECTORY_SEPARATOR)
        || ((fileperms($directory) & 0077) !== 0)) return null;
    return $directory;
}

function intake_save(string $path, array $state): bool {
    $temporary = $path . '.' . bin2hex(random_bytes(8)) . '.new';
    $handle = @fopen($temporary, 'x+b');
    if (!$handle) return false;
    @chmod($temporary, 0600);
    $json = json_encode($state, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $ok = fwrite($handle, $json) === strlen($json) && fflush($handle);
    if ($ok && function_exists('fsync')) $ok = fsync($handle);
    fclose($handle);
    if ($ok) $ok = @rename($temporary, $path);
    if (!$ok) @unlink($temporary);
    return $ok;
}

/** Adapters return accepted|failed|unknown; exceptions/invalid outcomes mean unknown.
 * Receives outcomes so the DB adapter can record CRM/mail results. Never retries.
 */
function intake_process(string $id, string $fingerprint, array $adapters, ?string $directory = null): array {
    if (array_keys($adapters) !== ['crm', 'mail', 'database']) throw new InvalidArgumentException('Three ordered adapters required');
    foreach ($adapters as $adapter) if (!is_callable($adapter)) throw new InvalidArgumentException('Invalid adapter');
    $directory = intake_directory($directory);
    if ($directory === null) return ['status' => 'unavailable'];
    $base = $directory . '/receipt-' . hash('sha256', $id);
    if (is_link($base . '.lock') || is_link($base . '.json')) return ['status' => 'unavailable'];
    $lock = @fopen($base . '.lock', 'c+b');
    if (!$lock) return ['status' => 'unavailable'];
    @chmod($base . '.lock', 0600);
    if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return ['status' => 'processing']; }
    try {
        if (file_exists($base . '.json')) {
            $raw = @file_get_contents($base . '.json');
            $old = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($old) || !is_string($old['fingerprint'] ?? null)
                || !is_array($old['channels'] ?? null) || !is_string($old['receipt'] ?? null)
                || preg_match('/^[a-f0-9]{16}$/', $old['receipt']) !== 1) return ['status' => 'review-required'];
            if (array_keys($old['channels']) !== ['crm', 'mail', 'database']) return ['status' => 'review-required'];
            $allowed = ['pending', 'in_progress', 'accepted', 'failed', 'unknown'];
            foreach ($old['channels'] as $entry) {
                if (!is_array($entry) || !in_array($entry['status'] ?? null, $allowed, true)) return ['status' => 'review-required'];
            }
            if (($old['status'] ?? '') === 'completed') {
                $statuses = array_column($old['channels'], 'status');
                if (!in_array('accepted', $statuses, true) || in_array('pending', $statuses, true)
                    || in_array('in_progress', $statuses, true)) return ['status' => 'review-required'];
                $old['needs_review'] = count(array_filter($statuses, fn ($s) => $s !== 'accepted')) > 0;
            }
            if (!hash_equals($old['fingerprint'], $fingerprint)) return ['status' => 'conflict'];
            if (($old['status'] ?? '') === 'completed') return $old + ['duplicate' => true];
            // A process may have died after a provider accepted. No automatic replay.
            return ['status' => 'review-required', 'receipt' => $old['receipt'], 'channels' => $old['channels']];
        }
        $state = ['version' => 1, 'fingerprint' => $fingerprint, 'receipt' => bin2hex(random_bytes(8)),
            'status' => 'processing', 'created_at' => gmdate('c'),
            'channels' => ['crm' => ['status' => 'pending'], 'mail' => ['status' => 'pending'], 'database' => ['status' => 'pending']]];
        if (!intake_save($base . '.json', $state)) return ['status' => 'unavailable'];
        foreach ($adapters as $channel => $adapter) {
            $state['channels'][$channel] = ['status' => 'in_progress', 'started_at' => gmdate('c'), 'attempts' => 1];
            if (!intake_save($base . '.json', $state)) return ['status' => 'review-required'];
            try { $outcome = $adapter($state['channels']); }
            catch (Throwable $error) { $outcome = 'unknown'; }
            if (!in_array($outcome, ['accepted', 'failed', 'unknown'], true)) $outcome = 'unknown';
            $state['channels'][$channel]['status'] = $outcome;
            $state['channels'][$channel]['finished_at'] = gmdate('c');
            if (!intake_save($base . '.json', $state)) return ['status' => 'review-required'];
        }
        $outcomes = array_column($state['channels'], 'status');
        $state['status'] = in_array('accepted', $outcomes, true) ? 'completed' : 'review-required';
        $state['needs_review'] = count(array_filter($outcomes, fn ($s) => $s !== 'accepted')) > 0;
        $state['finished_at'] = gmdate('c');
        if (!intake_save($base . '.json', $state)) return ['status' => 'review-required'];
        return $state + ['duplicate' => false];
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}

<?php
declare(strict_types=1);
// Offline administrative CLI. Never included by submit.php.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/intake-pipeline.php';

function migrate_intake_claims(string $source, string $destination, bool $apply = false): array {
    if (is_link($source) || !is_dir($source) || !is_readable($source)) throw new RuntimeException('Unsafe legacy directory');
    $source = realpath($source);
    $destination = intake_directory($destination);
    if ($destination === null || $source === $destination) throw new RuntimeException('Unsafe destination');
    $report = ['mode' => $apply ? 'apply' : 'dry-run', 'migrated' => 0, 'planned' => 0, 'existing' => 0, 'errors' => 0, 'files' => []];
    foreach (glob($source . '/osoul-submission-*.lock') ?: [] as $legacy) {
        $name = basename($legacy);
        if (!preg_match('/^osoul-submission-([a-f0-9]{64})\.lock$/', $name, $matches)) continue;
        $result = ['legacy' => $name];
        if (is_link($legacy) || !is_file($legacy)) {
            $result['status'] = 'rejected-symlink-or-nonfile'; $report['errors']++; $report['files'][] = $result; continue;
        }
        $base = $destination . '/receipt-' . $matches[1];
        if (is_link($base . '.json') || is_link($base . '.lock')) {
            $result['status'] = 'rejected-destination-symlink'; $report['errors']++; $report['files'][] = $result; continue;
        }
        // Even corrupt/empty legacy claims must block replay; no original payload retained.
        $raw = @file_get_contents($legacy);
        if ($raw === false) { $result['status'] = 'read-failed'; $report['errors']++; $report['files'][] = $result; continue; }
        $old = json_decode($raw, true);
        $receipt = is_array($old) && is_string($old['receipt'] ?? null) && preg_match('/^[a-f0-9]{16}$/', $old['receipt']) === 1
            ? $old['receipt'] : bin2hex(random_bytes(8));
        // A tombstone has no known fingerprint when the old record is malformed/timestamp-only.
        // A fixed value intentionally conflicts with real payloads, preventing all automatic replay.
        $fingerprint = is_array($old) && is_string($old['fingerprint'] ?? null) ? $old['fingerprint'] : 'legacy-unknown-fingerprint';
        $state = ['version'=>1, 'fingerprint'=>$fingerprint, 'receipt'=>$receipt, 'status'=>'review-required',
            'created_at'=>gmdate('c'), 'needs_review'=>true, 'migration'=>'legacy-claim-tombstone',
            'channels'=>['crm'=>['status'=>'unknown'], 'mail'=>['status'=>'unknown'], 'database'=>['status'=>'unknown']]];
        if (!$apply) {
            $status = file_exists($base . '.json') ? 'existing' : 'planned';
            $report[$status]++; $result['status']=$status; $report['files'][]=$result; continue;
        }
        $lock = @fopen($base . '.lock', 'c+b');
        if (!$lock) { $report['errors']++; $result['status']='lock-unavailable'; $report['files'][]=$result; continue; }
        @chmod($base . '.lock',0600);
        if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); $report['errors']++; $result['status']='busy'; $report['files'][]=$result; continue; }
        try {
            if (file_exists($base . '.json') || is_link($base . '.json')) { $report['existing']++; $result['status']='existing'; }
            elseif (intake_save($base . '.json', $state)) { $report['migrated']++; $result['status']='migrated'; }
            else { $report['errors']++; $result['status']='write-failed'; }
        } finally { flock($lock, LOCK_UN); fclose($lock); }
        $report['files'][]=$result;
    }
    return $report;
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $options = getopt('', ['source:', 'destination:', 'apply']);
    if (!isset($options['source'], $options['destination'])) { fwrite(STDERR, "Usage: php migrate-intake-claims.php --source=/private/legacy --destination=/private/receipts [--apply]\n"); exit(2); }
    try {
        $report = migrate_intake_claims($options['source'], $options['destination'], array_key_exists('apply', $options));
        echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
        exit($report['errors'] > 0 ? 1 : 0);
    } catch (Throwable $error) { fwrite(STDERR, $error->getMessage() . "\n"); exit(2); }
}

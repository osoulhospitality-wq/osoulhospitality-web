<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, max-age=0');
header('X-Osool-Lead-Intake: v2');

const SUPABASE_URL = 'https://fdkfxlvsluiqrgedokdm.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hX1nbly1AzEtBhCUWoyrgw_9EU2Bxwr';
const HUBSPOT_PORTAL_ID = '149059794';
const HUBSPOT_FORM_ID = 'd176a175-114f-48c9-a2f8-48d4f8418625';
const PRIVACY_NOTICE_VERSION = '3.0-2026-10-22';
const MAX_REQUEST_BYTES = 32768;
const RATE_LIMIT_WINDOW_SECONDS = 900;
const RATE_LIMIT_MAX_REQUESTS = 5;

function redirect_to(string $path): never {
    header('Location: ' . $path, true, 303);
    exit;
}

function clean_text(string $value, int $max = 300): string {
    $value = trim(str_replace(["\r", "\n", "\0"], '', $value));
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max, 'UTF-8');
    }
    return substr($value, 0, $max);
}

function post_value(string $key, int $max = 300): string {
    $value = $_POST[$key] ?? '';
    return is_string($value) ? clean_text($value, $max) : '';
}

function uuid_v4(): string {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
        . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
}

function rate_limit_exceeded(string $clientAddress): bool {
    $key = hash('sha256', $clientAddress !== '' ? $clientAddress : 'unknown');
    $path = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'osoul-lead-' . $key . '.json';
    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        error_log('Osool website rate-limit store unavailable.');
        return false;
    }
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return false;
    }
    $raw = stream_get_contents($handle);
    $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    $now = time();
    $timestamps = is_array($decoded)
        ? array_values(array_filter($decoded, static fn ($item): bool => is_int($item) && $item > $now - RATE_LIMIT_WINDOW_SECONDS))
        : [];
    $exceeded = count($timestamps) >= RATE_LIMIT_MAX_REQUESTS;
    if (!$exceeded) {
        $timestamps[] = $now;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, (string) json_encode($timestamps));
        fflush($handle);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    return $exceeded;
}

function persist_lead(array $payload): bool {
    $url = SUPABASE_URL . '/rest/v1/website_leads';
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    $headers = [
        'apikey: ' . SUPABASE_PUBLISHABLE_KEY,
        'Authorization: Bearer ' . SUPABASE_PUBLISHABLE_KEY,
        'Content-Type: application/json',
        'Prefer: return=minimal',
    ];

    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => 8,
        ]);
        curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);
        return $status >= 200 && $status < 300;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $json,
            'timeout' => 8,
            'ignore_errors' => true,
        ],
    ]);
    $result = @file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    return $result !== false && preg_match('/\s2\d\d\s/', $statusLine) === 1;
}

function submit_to_hubspot(array $fields, string $pageUri, string $pageName): bool {
    $url = 'https://api.hsforms.com/submissions/v3/integration/submit/'
        . HUBSPOT_PORTAL_ID . '/' . HUBSPOT_FORM_ID;
    $payload = [
        'submittedAt' => (string) round(microtime(true) * 1000),
        'fields' => [],
        'context' => [
            'pageUri' => $pageUri,
            'pageName' => $pageName,
        ],
    ];

    foreach ($fields as $name => $value) {
        if ($value !== '') {
            $payload['fields'][] = ['name' => $name, 'value' => $value];
        }
    }

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }

    $headers = ['Content-Type: application/json'];
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => 10,
        ]);
        curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);
        return $status >= 200 && $status < 300;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $json,
            'timeout' => 10,
            'ignore_errors' => true,
        ],
    ]);
    $result = @file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    return $result !== false && preg_match('/\s2\d\d\s/', $statusLine) === 1;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method Not Allowed');
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength <= 0 || $contentLength > MAX_REQUEST_BYTES) {
    http_response_code(413);
    exit('Request size rejected');
}

$language = post_value('language', 2);
$isEnglish = $language === 'en';
$contactPath = $isEnglish ? '/en/contact/' : '/contact/';
$thankYouPath = $isEnglish ? '/en/thank-you/' : '/thank-you/';

$currentHost = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$referer = $_SERVER['HTTP_REFERER'] ?? '';
foreach ([$origin, $referer] as $source) {
    if ($source === '') {
        continue;
    }
    $sourceHost = strtolower((string) parse_url($source, PHP_URL_HOST));
    if ($sourceHost !== '' && $currentHost !== '' && $sourceHost !== $currentHost) {
        redirect_to($contactPath . '?status=security#project-brief');
    }
}

if (post_value('website', 200) !== '') {
    redirect_to($thankYouPath);
}

$startedAt = (int) post_value('started_at', 20);
$elapsedMilliseconds = (int) round(microtime(true) * 1000) - $startedAt;
if ($startedAt <= 0 || $elapsedMilliseconds < 3000 || $elapsedMilliseconds > 86400000) {
    redirect_to($contactPath . '?status=security#project-brief');
}

if (rate_limit_exceeded((string) ($_SERVER['REMOTE_ADDR'] ?? ''))) {
    http_response_code(429);
    header('Retry-After: ' . RATE_LIMIT_WINDOW_SECONDS);
    redirect_to($contactPath . '?status=rate-limit#project-brief');
}

$formName = post_value('form_name', 80);
$consent = post_value('consent', 10);
$assetType = post_value('asset_type', 120);
$city = post_value('city', 120);
$stage = post_value('stage', 160);
$opening = post_value('opening_target', 160);
$units = post_value('units', 40);
$primaryGap = post_value('primary_gap', 220);
$urgency = post_value('urgency', 120);
$documents = post_value('documents', 160);
$support = post_value('requested_support', 180);
$description = post_value('description', 2000);
$name = post_value('name', 120);
$organization = post_value('organization', 180);
$email = post_value('email', 180);
$phone = post_value('phone', 60);

$required = [$formName, $assetType, $city, $stage, $opening, $units, $primaryGap, $urgency, $documents, $support, $name, $organization];
if (in_array('', $required, true) || $formName !== 'hospitality_readiness_brief' || $consent !== 'yes') {
    redirect_to($contactPath . '?status=incomplete#project-brief');
}

if ($email === '') {
    redirect_to($contactPath . '?status=email-required#project-brief');
}

if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    redirect_to($contactPath . '?status=email#project-brief');
}

if ($phone !== '' && !preg_match('/^[0-9+\s()\-]{7,30}$/u', $phone)) {
    redirect_to($contactPath . '?status=phone#project-brief');
}

$subjectPlain = 'موجز جاهزية جديد - ' . $organization . ' - ' . $assetType;
$subject = function_exists('mb_encode_mimeheader')
    ? mb_encode_mimeheader($subjectPlain, 'UTF-8', 'B', "\r\n")
    : $subjectPlain;

$body = implode("\n", [
    'موجز مشروع جديد من موقع أصول الضيافة',
    '=====================================',
    '',
    'الاسم: ' . $name,
    'الجهة: ' . $organization,
    'البريد: ' . ($email !== '' ? $email : 'غير مدخل'),
    'الهاتف: ' . ($phone !== '' ? $phone : 'غير مدخل'),
    '',
    'نوع الأصل: ' . $assetType,
    'المدينة: ' . $city,
    'المرحلة: ' . $stage,
    'الموعد المستهدف: ' . $opening,
    'عدد الغرف أو الوحدات: ' . $units,
    '',
    'الفجوة الرئيسية: ' . $primaryGap,
    'مدى الاستعجال: ' . $urgency,
    'مشاركة المستندات: ' . $documents,
    'الدعم المطلوب: ' . $support,
    'سياق إضافي: ' . ($description !== '' ? $description : 'غير مدخل'),
    '',
    'الموافقة على سياسة الخصوصية: نعم',
    'وقت الاستلام: ' . gmdate('Y-m-d H:i:s') . ' UTC',
]);

$submissionId = uuid_v4();
$leadPayload = [
    'submission_id' => $submissionId,
    'form_name' => $formName,
    'language' => $isEnglish ? 'en' : 'ar',
    'name' => $name,
    'organization' => $organization,
    'email' => $email !== '' ? $email : null,
    'phone' => $phone !== '' ? $phone : null,
    'asset_type' => $assetType,
    'city' => $city,
    'stage' => $stage,
    'opening_target' => $opening,
    'units' => $units,
    'primary_gap' => $primaryGap,
    'urgency' => $urgency,
    'documents' => $documents,
    'requested_support' => $support,
    'description' => $description !== '' ? $description : null,
    'consent' => true,
    'consent_recorded_at' => gmdate('c'),
    'privacy_notice_version' => PRIVACY_NOTICE_VERSION,
    'source' => 'website',
    'status' => 'new',
];

$hubspotSubmitted = false;
if ($email !== '') {
    $nameParts = preg_split('/\s+/u', trim($name), 2);
    $firstName = $nameParts[0] ?? $name;
    $lastName = $nameParts[1] ?? '';
    $hubspotMessage = implode("\n", [
        'الجهة: ' . $organization,
        'نوع الأصل: ' . $assetType,
        'المدينة: ' . $city,
        'المرحلة: ' . $stage,
        'الموعد المستهدف: ' . $opening,
        'عدد الغرف أو الوحدات: ' . $units,
        'الفجوة الرئيسية: ' . $primaryGap,
        'مدى الاستعجال: ' . $urgency,
        'مشاركة المستندات: ' . $documents,
        'الدعم المطلوب: ' . $support,
        'سياق إضافي: ' . ($description !== '' ? $description : 'غير مدخل'),
        'الموافقة على سياسة الخصوصية: نعم',
    ]);
    $hubspotSubmitted = submit_to_hubspot([
        'firstname' => $firstName,
        'lastname' => $lastName,
        'email' => $email,
        'phone' => $phone,
        'message' => $hubspotMessage,
    ], 'https://' . $currentHost . $contactPath, 'Osool Hospitality Website Contact');
}

if ($email !== '' && !$hubspotSubmitted) {
    error_log('Osool website HubSpot form submission failed; fallback channels remain active.');
}

$serverUser = preg_replace('/[^a-zA-Z0-9._-]/', '', get_current_user());
$serverHost = strtolower((string) gethostname());
$serverSender = $serverUser !== '' ? $serverUser . '@' . $serverHost : '';
if (filter_var($serverSender, FILTER_VALIDATE_EMAIL) === false) {
    $serverSender = '';
}

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: Osool-Hospitality-Website',
];
if ($serverSender !== '') {
    $headers[] = 'From: Osool Website <' . $serverSender . '>';
}
if ($email !== '') {
    $headers[] = 'Reply-To: ' . $email;
} else {
    $headers[] = 'Reply-To: info@osoulhospitality.com';
}

$sent = @mail(
    'info@osoulhospitality.com',
    $subject,
    $body,
    implode("\r\n", $headers)
);

$leadPayload['hubspot_status'] = $hubspotSubmitted ? 'submitted' : 'failed';
$leadPayload['email_status'] = $sent ? 'sent' : 'failed';
$leadPayload['last_attempt_at'] = gmdate('c');
$leadPayload['processing_error'] = (!$hubspotSubmitted || !$sent)
    ? implode('; ', array_filter([
        !$hubspotSubmitted ? 'hubspot_submission_failed' : '',
        !$sent ? 'email_delivery_failed' : '',
    ]))
    : null;
$leadPersisted = persist_lead($leadPayload);

if (!$leadPersisted) {
    error_log('Osool website lead persistence failed for submission ' . $submissionId . '.');
}

if (!$sent && !$hubspotSubmitted && !$leadPersisted) {
    redirect_to($contactPath . '?status=send-error#project-brief');
}

if (!$sent) {
    error_log('Osool website lead email delivery failed; Supabase persistence succeeded.');
}

redirect_to($thankYouPath);

<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, max-age=0');

function redirect_to(string $path): never {
    header('Location: ' . $path, true, 303);
    exit;
}

function clean_text(string $value, int $max = 300): string {
    $value = trim(str_replace(["\r", "\0"], '', $value));
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max, 'UTF-8');
    }
    return substr($value, 0, $max);
}

function post_value(string $key, int $max = 300): string {
    $value = $_POST[$key] ?? '';
    return is_string($value) ? clean_text($value, $max) : '';
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method Not Allowed');
}

$currentHost = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? ''));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$referer = $_SERVER['HTTP_REFERER'] ?? '';
foreach ([$origin, $referer] as $source) {
    if ($source === '') {
        continue;
    }
    $sourceHost = strtolower((string) parse_url($source, PHP_URL_HOST));
    if ($sourceHost !== '' && $currentHost !== '' && $sourceHost !== $currentHost) {
        redirect_to('/contact/?status=security#project-brief');
    }
}

if (post_value('website', 200) !== '') {
    redirect_to('/thank-you/');
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
$name = post_value('name', 120);
$organization = post_value('organization', 180);
$email = post_value('email', 180);
$phone = post_value('phone', 60);

$required = [$formName, $assetType, $city, $stage, $opening, $units, $primaryGap, $urgency, $documents, $support, $name, $organization];
if (in_array('', $required, true) || $formName !== 'hospitality_readiness_brief' || $consent !== 'yes') {
    redirect_to('/contact/?status=incomplete#project-brief');
}

if ($email === '' && $phone === '') {
    redirect_to('/contact/?status=contact#project-brief');
}

if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    redirect_to('/contact/?status=email#project-brief');
}

if ($phone !== '' && !preg_match('/^[0-9+\s()\-]{7,30}$/u', $phone)) {
    redirect_to('/contact/?status=phone#project-brief');
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
    '',
    'الموافقة على سياسة الخصوصية: نعم',
    'وقت الاستلام: ' . gmdate('Y-m-d H:i:s') . ' UTC',
]);

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'From: Osool Website <info@osoulhospitality.com>',
    'X-Mailer: Osool-Hospitality-Website',
];
if ($email !== '') {
    $headers[] = 'Reply-To: ' . $email;
}

$sent = @mail(
    'info@osoulhospitality.com',
    $subject,
    $body,
    implode("\r\n", $headers)
);

if (!$sent) {
    redirect_to('/contact/?status=send-error#project-brief');
}

redirect_to('/thank-you/');

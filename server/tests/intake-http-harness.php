<?php
// CLI ONLY. Test harness is not included by production; all providers are stubs.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$GLOBALS['calls'] = [];
$GLOBALS['modes'] = json_decode(getenv('TEST_MODES') ?: '{}', true);
foreach (['CURLOPT_POST','CURLOPT_POSTFIELDS','CURLOPT_HTTPHEADER','CURLOPT_RETURNTRANSFER','CURLOPT_CONNECTTIMEOUT','CURLOPT_TIMEOUT','CURLINFO_HTTP_CODE'] as $i => $constant) define($constant, $i+1);
function curl_init($url) { return str_contains($url, 'hsforms') ? 'crm' : 'database'; }
function curl_setopt_array($handle, $options) { return true; }
function curl_exec($channel) { $GLOBALS['calls'][] = $channel; return ''; }
function curl_getinfo($channel, $option) { return ($GLOBALS['modes'][$channel] ?? 'accepted') === 'accepted' ? 201 : 0; }
function curl_close($handle) {}
$_POST = json_decode(getenv('TEST_POST'), true);
$_SERVER = ['REQUEST_METHOD'=>'POST','CONTENT_LENGTH'=>1000,'HTTP_HOST'=>'osoulhospitality.com','HTTP_ORIGIN'=>'https://osoulhospitality.com','REMOTE_ADDR'=>bin2hex(random_bytes(16))];
$source = file_get_contents(__DIR__ . '/../../submit.php');
$source = str_replace(['<?php', 'declare(strict_types=1);', '__DIR__'], ['', '', var_export(realpath(__DIR__ . '/../..'), true)], $source);
$prefix = <<<'STUBS'
namespace IntakeHarness;
function header($value, $replace = true, $code = 0) { if (str_starts_with($value, 'Location:')) echo json_encode(['location'=>$value, 'calls'=>$GLOBALS['calls']]); }
function header_remove($name) {}
function mail(...$arguments) { $GLOBALS['calls'][]='mail'; return ($GLOBALS['modes']['mail'] ?? 'accepted') === 'accepted'; }
STUBS;
eval($prefix . $source);

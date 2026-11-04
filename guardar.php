<?php
/* ============================================================
   GUARDADO DEL MODO EDICIÓN (va en la carpeta principal de la web, junto a index.html)
   - Comprueba usuario y contraseña y abre una sesión.
   - Guarda los datos en data/datos.txt (copia de la versión anterior en data/copias/, las últimas 30).
   - Recibe las fotos y las guarda en img/<proyectos|artefactos>/<id>/.
   Lo usa shared/admin.js. No hay que configurar nada más: se sube por SFTP con el resto de la web.
   ============================================================ */

/* Acceso TEMPORAL: gallende / 123.
   Aquí solo está la huella SHA-256 de "usuario:contraseña". Para cambiarlos, calcula la huella nueva
   (por ejemplo en https://emn178.github.io/online-tools/sha256.html escribiendo  usuario:contraseña ) y pégala aquí. */
const CLAVE_SHA256 = 'd0fe146553e254c15a9bb3904e0fb2499145e7a740b3bf30610468a45cd89351';

const HORAS_SESION = 8;
const MAX_DATOS    = 2 * 1024 * 1024;   // 2 MB
const MAX_IMAGEN   = 20 * 1024 * 1024;  // 20 MB (o menos, si el servidor admite menos)
const COPIAS_MAX   = 30;
const EXT          = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

$RAIZ   = __DIR__;
$DATOS  = $RAIZ . '/data/datos.txt';
$COPIAS = $RAIZ . '/data/copias';
$IMG    = $RAIZ . '/img';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function responder($code, $datos) {
  http_response_code($code);
  echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function error_($code, $msg) { responder($code, ['error' => $msg]); }

/* tamaño máximo de foto que deja subir este servidor */
function bytes_ini($v) {
  $v = trim((string)$v); if ($v === '') return 0;
  $n = (float)$v; $u = strtolower(substr($v, -1));
  if ($u === 'g') $n *= 1024 * 1024 * 1024; elseif ($u === 'm') $n *= 1024 * 1024; elseif ($u === 'k') $n *= 1024;
  return (int)$n;
}
function max_imagen() {
  $post = bytes_ini(ini_get('post_max_size'));
  $max = MAX_IMAGEN;
  if ($post > 0) $max = min($max, $post - 64 * 1024);
  return max($max, 512 * 1024);
}

/* ---------- sesión ---------- */
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('allende_sesion');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
function autorizado() { return !empty($_SESSION['ok']) && ($_SESSION['hasta'] ?? 0) > time(); }

$accion = $_GET['accion'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Las escrituras exigen esta cabecera: un formulario de otra web no puede enviarla.
if ($metodo !== 'GET' && ($_SERVER['HTTP_X_ALLENDE'] ?? '') !== '1') error_(403, 'Petición no permitida');

/* ---------- acciones sin sesión ---------- */
if ($accion === 'sesion') {
  responder(200, ['ok' => autorizado(), 'maxImagen' => max_imagen()]);
}

if ($accion === 'login' && $metodo === 'POST') {
  // tras 5 intentos fallidos desde la misma conexión, 1 minuto de espera
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  $ficheroFallos = rtrim(sys_get_temp_dir(), '/\\') . '/allende-fallos-' . md5($ip) . '.json';
  $f = is_file($ficheroFallos) ? json_decode((string)@file_get_contents($ficheroFallos), true) : null;
  if (!is_array($f)) $f = ['n' => 0, 'hasta' => 0];
  if ($f['hasta'] > time()) error_(429, 'Demasiados intentos. Espera un minuto.');

  $b = json_decode((string)file_get_contents('php://input'), true);
  $usuario = is_array($b) && is_string($b['usuario'] ?? null) ? trim($b['usuario']) : '';
  $clave   = is_array($b) && is_string($b['clave'] ?? null) ? $b['clave'] : '';
  if (hash_equals(CLAVE_SHA256, hash('sha256', $usuario . ':' . $clave))) {
    @unlink($ficheroFallos);
    session_regenerate_id(true);
    $_SESSION['ok'] = true;
    $_SESSION['hasta'] = time() + HORAS_SESION * 3600;
    responder(200, ['ok' => true, 'maxImagen' => max_imagen()]);
  }
  $f['n']++;
  $f['hasta'] = $f['n'] >= 5 ? time() + 60 : 0;
  if ($f['n'] >= 5) $f['n'] = 0;
  @file_put_contents($ficheroFallos, json_encode($f));
  error_(401, 'Usuario o contraseña incorrectos');
}

if ($accion === 'salir' && $metodo === 'POST') {
  $_SESSION = [];
  session_destroy();
  responder(200, ['ok' => true]);
}

/* ---------- a partir de aquí hace falta sesión ---------- */
if (!autorizado()) error_(401, 'La sesión ha caducado. Vuelve a acceder.');

/* ---------- validación de los datos ---------- */
function txt($v, $max = 300) {
  if (!is_string($v)) return '';
  return function_exists('mb_substr') ? mb_substr($v, 0, $max, 'UTF-8') : substr($v, 0, $max);
}
function lista_imgs($l) {
  if (!is_array($l)) throw new Exception('Lista de imágenes no válida');
  $out = [];
  foreach (array_values($l) as $im) {
    $src = is_array($im) ? ($im['src'] ?? '') : '';
    if (!is_string($src) || !preg_match('#^(proyectos|artefactos)/[A-Za-z0-9._\-/]+$#', $src) || strpos($src, '..') !== false) {
      throw new Exception('Ruta de imagen no válida');
    }
    $out[] = ['src' => $src, 'alt' => txt($im['alt'] ?? '', 300)];
  }
  return $out;
}
/* Texto con formato: solo se dejan estas etiquetas; de atributos, el enlace (href) y la alineación.
   (Las mismas reglas que limpiarHtml en shared/datos.js.) */
const HTML_OK      = ['p', 'br', 'strong', 'em', 'u', 's', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote'];
const HTML_RENOMB  = ['b' => 'strong', 'i' => 'em', 'strike' => 's', 'del' => 's', 'ins' => 'u', 'h1' => 'h3', 'h2' => 'h3', 'h5' => 'h4', 'h6' => 'h4', 'div' => 'p'];
const HTML_FUERA   = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'noscript', 'head', 'title', 'meta', 'link', 'form', 'input', 'button', 'textarea', 'select', 'img', 'video', 'audio'];
function copiar_html($de, $a, $doc) {
  foreach ($de->childNodes as $n) {
    if ($n->nodeType === XML_TEXT_NODE) { $a->appendChild($doc->createTextNode($n->nodeValue)); continue; }
    if ($n->nodeType !== XML_ELEMENT_NODE) continue;
    $t = strtolower($n->nodeName);
    if (isset(HTML_RENOMB[$t])) $t = HTML_RENOMB[$t];
    if (in_array($t, HTML_FUERA, true)) continue;
    if (!in_array($t, HTML_OK, true)) { copiar_html($n, $a, $doc); continue; }
    $e = $doc->createElement($t);
    if ($t === 'a') {
      $h = trim($n->getAttribute('href'));
      if (preg_match('#^(https?:|mailto:|tel:|/|\#|\.\.?/)#i', $h)) {
        $e->setAttribute('href', $h);
        if (preg_match('#^https?:#i', $h)) { $e->setAttribute('target', '_blank'); $e->setAttribute('rel', 'noopener'); }
      }
    }
    if (in_array($t, ['p', 'h3', 'h4', 'li'], true) && preg_match('/text-align\s*:\s*(left|center|right|justify)/i', $n->getAttribute('style'), $m)) {
      $e->setAttribute('style', 'text-align:' . strtolower($m[1]));
    }
    copiar_html($n, $e, $doc);
    $a->appendChild($e);
  }
}
function limpiar_html($html) {
  $html = txt($html, 60000);
  if (trim(strip_tags($html)) === '') return '';
  if (!class_exists('DOMDocument')) {
    // sin la extensión DOM: etiquetas permitidas y ningún atributo
    $s = strip_tags($html, '<p><br><strong><em><u><s><h3><h4><ul><ol><li><blockquote>');
    return preg_replace('#<(/?)([a-z0-9]+)[^>]*>#i', '<$1$2>', $s);
  }
  $prev = libxml_use_internal_errors(true);
  $in = new DOMDocument();
  $in->loadHTML('<?xml encoding="UTF-8"?><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
  libxml_clear_errors(); libxml_use_internal_errors($prev);
  $raizIn = $in->getElementsByTagName('div')->item(0);
  $out = new DOMDocument('1.0', 'UTF-8');
  $raiz = $out->createElement('div');
  $out->appendChild($raiz);
  if ($raizIn) copiar_html($raizIn, $raiz, $out);
  $s = '';
  foreach ($raiz->childNodes as $c) $s .= $out->saveHTML($c);
  return $s;
}

function validar($d) {
  if (!is_array($d) || !is_array($d['proyectos'] ?? null) || !is_array($d['artefactos'] ?? null)) {
    throw new Exception('Formato de datos no válido');
  }
  $usados = [];
  $id = function ($x) use (&$usados) {
    $i = is_array($x) ? ($x['id'] ?? '') : '';
    if (!is_string($i) || !preg_match('/^[a-z0-9][a-z0-9-]{0,60}$/', $i) || isset($usados[$i])) {
      throw new Exception('Identificador no válido: ' . (is_string($i) ? $i : ''));
    }
    $usados[$i] = 1;
    return $i;
  };
  $nombre = function ($x) {
    $n = trim(txt($x['nombre'] ?? '', 200));
    if ($n === '') throw new Exception('Falta el nombre');
    return $n;
  };
  $proyectos = [];
  foreach (array_values($d['proyectos']) as $p) {
    $o = ['id' => $id($p), 'nombre' => $nombre($p)];
    foreach (['anio', 'area', 'loc', 'status', 'tipo', 'premio', 'tema'] as $k) $o[$k] = txt($p[$k] ?? '', 200);
    $o['texto'] = [];
    if (is_array($p['texto'] ?? null)) {
      foreach ($p['texto'] as $t) { $t = trim(txt($t, 8000)); if ($t !== '') $o['texto'][] = $t; }
    }
    $o['html'] = limpiar_html($p['html'] ?? '');
    $o['imgs'] = lista_imgs($p['imgs'] ?? null);
    $portada = $p['portada'] ?? '';
    $o['portada'] = '';
    foreach ($o['imgs'] as $im) if ($im['src'] === $portada) $o['portada'] = $portada;
    $proyectos[] = $o;
  }
  $artefactos = [];
  foreach (array_values($d['artefactos']) as $a) {
    $artefactos[] = ['id' => $id($a), 'nombre' => $nombre($a), 'frase' => txt($a['frase'] ?? '', 600), 'imgs' => lista_imgs($a['imgs'] ?? null)];
  }
  return ['proyectos' => $proyectos, 'artefactos' => $artefactos];
}

/* ---------- guardar los datos ---------- */
if ($accion === 'guardar' && $metodo === 'POST') {
  $cuerpo = file_get_contents('php://input');
  if (strlen($cuerpo) > MAX_DATOS) error_(413, 'Los datos son demasiado grandes');
  try { $d = validar(json_decode($cuerpo, true)); }
  catch (Exception $e) { error_(400, $e->getMessage()); }

  $dirDatos = dirname($DATOS);
  if (!is_dir($dirDatos) || !is_writable($dirDatos)) {
    error_(500, 'El servidor no puede escribir en la carpeta data/. Dale permisos de escritura (775) por SFTP.');
  }
  $json = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";

  // un guardado detrás de otro
  $bloqueo = fopen($dirDatos . '/.bloqueo', 'c');
  if ($bloqueo) flock($bloqueo, LOCK_EX);

  // copia de la versión anterior
  if (is_file($DATOS) && file_get_contents($DATOS) !== $json) {
    if (!is_dir($COPIAS)) {
      @mkdir($COPIAS, 0755, true);
      // que las copias no se puedan abrir desde el navegador (servidores Apache)
      @file_put_contents($COPIAS . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    }
    $sello = date('Y-m-d\TH-i-s') . '-' . substr((string)microtime(), 2, 3);
    @copy($DATOS, $COPIAS . '/datos-' . $sello . '.txt');
    $copias = glob($COPIAS . '/datos-*.txt') ?: [];
    sort($copias);
    foreach (array_slice($copias, 0, max(0, count($copias) - COPIAS_MAX)) as $viejo) @unlink($viejo);
  }

  // escritura segura: primero un temporal y luego se cambia por el archivo de verdad
  $tmp = $DATOS . '.tmp';
  $ok = file_put_contents($tmp, $json) !== false && rename($tmp, $DATOS);
  if ($bloqueo) { flock($bloqueo, LOCK_UN); fclose($bloqueo); }
  if (!$ok) { @unlink($tmp); error_(500, 'No se ha podido escribir data/datos.txt en el servidor.'); }
  @chmod($DATOS, 0644);
  responder(200, $d);
}

/* ---------- subir una foto ---------- */
if ($accion === 'imagen' && $metodo === 'POST') {
  // proyectos: img/proyectos/<año>/<nombre>/   (año de 4 cifras o "sin-anio")
  // artefactos: img/artefactos/<id>/
  $tipo    = $_GET['tipo'] ?? '';
  $carpeta = (string)($_GET['carpeta'] ?? '');
  $valida  = $tipo === 'proyectos'  ? preg_match('#^(\d{4}|sin-anio)/[a-z0-9][a-z0-9-]{0,59}$#', $carpeta)
          : ($tipo === 'artefactos' ? preg_match('/^[a-z0-9][a-z0-9-]{0,60}$/', $carpeta) : 0);
  if (!$valida) error_(400, 'Destino no válido');
  $id = $carpeta;

  // nombre limpio: minúsculas, sin acentos ni espacios
  $nombre = strtolower(basename((string)($_GET['nombre'] ?? 'imagen.jpg')));
  if (function_exists('iconv')) { $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $nombre); if ($t !== false) $nombre = strtolower($t); }
  $nombre = preg_replace('/[^a-z0-9._-]+/', '-', $nombre);
  $nombre = ltrim($nombre, '-.');
  $ext = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
  if (!in_array($ext, EXT, true)) error_(400, 'Formato no admitido (usa jpg, png, webp o gif)');
  $base = pathinfo($nombre, PATHINFO_FILENAME);
  if ($base === '') $base = 'imagen';

  $largo = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
  if ($largo > max_imagen()) error_(413, 'La foto pesa más de lo que admite el servidor (' . round(max_imagen() / 1048576, 1) . ' MB)');
  $buf = file_get_contents('php://input');
  if ($buf === '' || $buf === false) error_(413, 'La foto no ha llegado al servidor (puede que pese demasiado)');
  $info = @getimagesizefromstring($buf);
  if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) error_(400, 'El archivo no es una imagen');

  $dir = $IMG . '/' . $tipo . '/' . $id;
  if (!is_dir($dir) && !@mkdir($dir, 0755, true)) error_(500, 'El servidor no puede crear carpetas en img/. Dale permisos de escritura (775) por SFTP.');
  $nombre = $base . '.' . $ext;
  for ($n = 2; file_exists($dir . '/' . $nombre); $n++) $nombre = $base . '-' . $n . '.' . $ext;
  if (file_put_contents($dir . '/' . $nombre, $buf, LOCK_EX) === false) error_(500, 'No se ha podido guardar la foto en el servidor.');
  @chmod($dir . '/' . $nombre, 0644);
  responder(200, ['src' => $tipo . '/' . $id . '/' . $nombre]);
}

error_(404, 'Acción no encontrada');

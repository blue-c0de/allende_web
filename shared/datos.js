/* ============================================================
   DATOS DE LA WEB
   Los proyectos y artefactos están en data/datos.txt.
   Se editan desde la propia web en modo edición (pie de página → "acceder"),
   o a mano en ese archivo.
   ============================================================ */
var IMG_BASE = '../../img/';                 // las rutas de imagen del .txt empiezan aquí
var DATOS_URL = '../../data/datos.txt';
var DATOS = null;                            // se rellena al cargar

function cargarDatos(){
  return fetch(DATOS_URL, {cache:'no-store'})
    .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function(t){ DATOS = JSON.parse(t); return DATOS; });
}
/* Abriendo los archivos con doble clic (file://) el navegador no deja leer el .txt.
   En el servidor, o con «Abrir en navegador» del editor, sí. */
function avisoSinServidor(el){
  el.innerHTML = '<p class="aviso-datos">No se han podido leer los datos (data/datos.txt). '+
    'Abre la web desde el servidor o con «Abrir en navegador» de tu editor; abriendo el archivo con doble clic el navegador no deja leerlos.</p>';
}

/* ---------- Texto con formato (negrita, listas, enlaces...) ----------
   El texto de los proyectos se guarda como HTML. Antes de mostrarlo se limpia: solo se dejan estas etiquetas,
   y de atributos solo el enlace (href) y la alineación. Así nadie puede colar código en la página.
   guardar.php aplica las mismas reglas en el servidor. */
var TEXTO_ETIQUETAS = ['p','br','strong','em','u','s','h3','h4','ul','ol','li','a','blockquote'];
var TEXTO_RENOMBRAR = {b:'strong', i:'em', strike:'s', del:'s', ins:'u', h1:'h3', h2:'h3', h5:'h4', h6:'h4', div:'p'};
var TEXTO_FUERA = ['script','style','iframe','object','embed','template','svg','math','noscript','head','title','meta','link','form','input','button','textarea','select','img','video','audio'];
var TEXTO_BLOQUES = ['p','h3','h4','ul','ol','blockquote'];
function limpiarHtml(html){
  var origen = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html').body.firstChild;
  var destino = document.createElement('div');
  function copiar(de, a){
    [].forEach.call(de.childNodes, function(n){
      if (n.nodeType === 3){ a.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var t = n.nodeName.toLowerCase(); t = TEXTO_RENOMBRAR[t] || t;
      if (TEXTO_FUERA.indexOf(t) >= 0) return;
      if (TEXTO_ETIQUETAS.indexOf(t) < 0){ copiar(n, a); return; }      // span, font... → solo su contenido
      var e = document.createElement(t);
      if (t === 'a'){
        var h = (n.getAttribute('href') || '').trim();
        if (/^(https?:|mailto:|tel:|\/|#|\.\.?\/)/i.test(h)){
          e.setAttribute('href', h);
          if (/^https?:/i.test(h)){ e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener'); }
        }
      }
      var al = /text-align\s*:\s*(left|center|right|justify)/i.exec(n.getAttribute('style') || '');
      if (al && ['p','h3','h4','li'].indexOf(t) >= 0) e.setAttribute('style', 'text-align:' + al[1].toLowerCase());
      copiar(n, e);
      a.appendChild(e);
    });
  }
  copiar(origen, destino);
  // texto suelto (fuera de párrafos) → dentro de un párrafo
  var res = document.createElement('div'), suelto = null;
  [].slice.call(destino.childNodes).forEach(function(n){
    var bloque = n.nodeType === 1 && TEXTO_BLOQUES.indexOf(n.nodeName.toLowerCase()) >= 0;
    if (bloque){ suelto = null; res.appendChild(n); return; }
    if (n.nodeType === 3 && !n.nodeValue.trim() && !suelto) return;
    if (!suelto){ suelto = document.createElement('p'); res.appendChild(suelto); }
    suelto.appendChild(n);
  });
  // bloques vacíos (sin texto, o solo con saltos de línea) fuera
  [].slice.call(res.querySelectorAll('p,h3,h4,li,blockquote,ul,ol')).reverse().forEach(function(b){
    if (!b.textContent.trim()) b.remove();
  });
  return res.innerHTML;
}
/* El texto del proyecto en HTML: el formato nuevo (html) o los párrafos antiguos (texto). */
function textoProyecto(p){
  if (p.html) return limpiarHtml(p.html);
  return (p.texto || []).map(function(t){ return '<p>' + esc(t) + '</p>'; }).join('');
}

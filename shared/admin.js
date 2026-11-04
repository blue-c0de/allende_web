/* ============================================================
   MODO EDICIÓN
   - "acceder" en el pie → ventana "Configurar" con usuario y contraseña (los comprueba el servidor).
   - Con la sesión abierta:
       Arquitectos / Artefactos: botón "Nuevo", y en cada fila: subir, bajar, editar, eliminar.
       Detalle de proyecto: editar y eliminar.
   - El formulario permite cambiar textos, subir fotos, ordenarlas (arrastrando o con flechas),
     escribir su descripción y elegir la portada del proyecto.
   - Los cambios se envían a guardar.php (en la carpeta principal de la web), que los escribe en el servidor:
     data/datos.txt (con copia de la versión anterior en data/copias/) y las fotos en img/.
   ============================================================ */
(function(){
  var activo = false, ultimo = null; // ultimo: {tipo, id} de lo último que pintó la página
  var GUARDAR = '../../guardar.php';
  var EXT = ['jpg','jpeg','png','webp','gif'];
  var maxImagen = 8 * 1024 * 1024;   // tamaño máximo de foto que acepta el servidor (lo dice guardar.php)

  /* ---------- llamadas a guardar.php ---------- */
  function api(accion, cuerpo, tipo, extra){
    var h = {'X-Allende':'1'}; if (tipo) h['Content-Type'] = tipo;
    var get = accion === 'sesion';
    return fetch(GUARDAR + '?accion=' + accion + (extra || ''), {
      method: get ? 'GET' : 'POST', headers: h, body: get ? undefined : cuerpo, credentials: 'same-origin', cache: 'no-store'
    }).then(function(r){
      return r.text().then(function(t){
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!j) throw new Error(r.status === 404 ? 'No se encuentra guardar.php en el servidor.'
                                                : 'El servidor no ha respondido bien (¿está subido guardar.php y PHP activo?).');
        if (!r.ok){ var e = new Error(j.error || ('Error ' + r.status)); e.status = r.status; throw e; }
        if (j.maxImagen) maxImagen = j.maxImagen;
        return j;
      });
    });
  }

  /* Los guardados van en fila, uno detrás de otro (si se pulsa "Bajar" varias veces seguidas
     llegan al servidor en orden). Cada uno envía el estado más reciente. */
  var cola = Promise.resolve();
  function enCola(fn){ var p = cola.then(fn, fn); cola = p.catch(function(){}); return p; }

  /* Comprueba lo básico antes de enviar (el servidor lo vuelve a comprobar). */
  function validar(d){
    var ids = {};
    ['proyectos','artefactos'].forEach(function(k){
      if (!Array.isArray(d[k])) throw new Error('Formato de datos no válido');
      d[k].forEach(function(x){
        if (!x.id || ids[x.id]) throw new Error('Identificador repetido: ' + x.id);
        if (!String(x.nombre || '').trim()) throw new Error('Falta el nombre');
        ids[x.id] = 1;
      });
    });
  }
  function guardarDatos(){
    try { validar(DATOS); } catch (e) { return Promise.reject(e); }
    return enCola(function(){ return api('guardar', JSON.stringify(DATOS), 'application/json'); }).then(function(){ return DATOS; });
  }

  /* Lee la foto elegida nada más elegirla (si el archivo cambia mientras tanto, p. ej. OneDrive, se avisa). */
  function leerFoto(file){
    return file.arrayBuffer().then(function(buf){
      return {name:file.name, type:file.type, blob:new Blob([buf], {type:file.type})};
    }, function(){
      throw new Error(file.name + ': no se ha podido leer. Si está en OneDrive u otra nube, cópiala antes a una carpeta del ordenador.');
    });
  }
  /* Si la foto pesa más de lo que admite el servidor, se reduce en el navegador (JPG, lado mayor 3000 px o menos). */
  function ajustarFoto(foto){
    if (foto.blob.size <= maxImagen) return Promise.resolve(foto);
    if (!window.createImageBitmap) return Promise.reject(new Error(foto.name + ': pesa demasiado para el servidor.'));
    return createImageBitmap(foto.blob).then(function(bmp){
      var lado = 3000, calidad = 0.88;
      function intento(){
        var k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
        var c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        return new Promise(function(ok){ c.toBlob(ok, 'image/jpeg', calidad); }).then(function(b){
          if (b && b.size <= maxImagen) return {name: foto.name.replace(/\.[^.]+$/, '') + '.jpg', type:'image/jpeg', blob:b};
          if (lado <= 1200) throw new Error(foto.name + ': pesa demasiado para el servidor.');
          lado = Math.round(lado * 0.8); calidad = Math.max(0.7, calidad - 0.05);
          return intento();
        });
      }
      return intento();
    });
  }
  /* Nombre de carpeta: minúsculas, sin acentos ni espacios ("Casa en el Campo" → "casa-en-el-campo") */
  function slug(t){
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  }
  /* Carpeta de las fotos de un proyecto: <año>/<nombre>, p. ej. "2026/casa-en-el-campo".
     Si el año no tiene 4 cifras, "sin-anio/<nombre>". */
  function carpetaProyecto(anio, nombre){
    var a = (String(anio || '').match(/\d{4}/) || ['sin-anio'])[0];
    var n = slug(nombre);
    if (!n) throw new Error('Escribe el nombre del proyecto antes de subir fotos: con él (y el año) se crea su carpeta.');
    return a + '/' + n;
  }
  /* Sube una foto a img/<tipo>/<carpeta>/ en el servidor y devuelve su ruta para el .txt
     (proyectos: carpeta = año/nombre; artefactos: carpeta = id) */
  function subirImagen(tipo, carpeta, foto){
    var ext = (foto.name.split('.').pop() || '').toLowerCase();
    if (EXT.indexOf(ext) < 0 || !/^image\//.test(foto.type)) return Promise.reject(new Error(foto.name + ': formato no admitido (usa jpg, png, webp o gif)'));
    return ajustarFoto(foto).then(function(f){
      return api('imagen', f.blob, f.type, '&tipo=' + tipo + '&carpeta=' + encodeURIComponent(carpeta) + '&nombre=' + encodeURIComponent(f.name));
    }).then(function(j){ return j.src; });
  }

  function mensaje(e){ return (e && e.message) || 'No se ha podido guardar'; }
  function fallo(e){
    aviso(mensaje(e), true);
    if (e && e.status === 401) desactivar();
    // vuelve a leer el archivo para no mostrar cambios que no se guardaron
    cargarDatos().then(function(){ if (window.pintar) pintar(); }).catch(function(){});
  }

  /* ---------- aviso breve ---------- */
  var toast = document.createElement('div'); toast.className = 'adm-toast'; toast.setAttribute('role','status'); toast.hidden = true;
  document.body.appendChild(toast);
  var toastT;
  function aviso(t, error){
    toast.textContent = t; toast.classList.toggle('is-error', !!error); toast.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function(){ toast.hidden = true; }, error ? 5000 : 2200);
  }

  /* ---------- ventana (modal) genérica ---------- */
  function ventana(titulo, ancho){
    var m = document.createElement('div');
    m.className = 'adm-modal';
    m.innerHTML = '<div class="adm-card'+(ancho?' is-wide':'')+'" role="dialog" aria-modal="true" aria-labelledby="adm-t">'+
      '<header class="adm-head"><h2 id="adm-t">'+esc(titulo)+'</h2><button type="button" class="adm-x" aria-label="Cerrar">&times;</button></header>'+
      '<div class="adm-body"></div></div>';
    document.body.appendChild(m);
    document.documentElement.classList.add('adm-lock');
    var antes = document.activeElement, v = {el:m, body:m.querySelector('.adm-body'), sucio:false};
    v.cerrar = function(forzar){
      if (v.sucio && !forzar && !confirm('Hay cambios sin guardar. ¿Cerrar igualmente?')) return;
      m.remove(); document.documentElement.classList.remove('adm-lock');
      document.removeEventListener('keydown', tecla);
      if (antes && antes.focus) antes.focus();
    };
    function tecla(e){
      if (e.key === 'Escape'){ e.preventDefault(); v.cerrar(); }
      else if (e.key === 'Tab'){ // el foco no sale de la ventana
        var f = [].filter.call(m.querySelectorAll('button,input,textarea,select,[tabindex],[contenteditable]'), function(x){ return !x.disabled && x.offsetParent; });
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0){ e.preventDefault(); f[f.length-1].focus(); }
        else if (!e.shiftKey && i === f.length-1){ e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener('keydown', tecla);
    m.querySelector('.adm-x').addEventListener('click', function(){ v.cerrar(); });
    m.addEventListener('mousedown', function(e){ if (e.target === m) v.cerrar(); });
    m.addEventListener('input', function(){ v.sucio = true; });
    return v;
  }

  /* ---------- acceso ---------- */
  function acceder(){
    var v = ventana('Configurar');
    v.body.innerHTML =
      '<form class="adm-form adm-login" novalidate>'+
        '<label>Usuario<input name="usuario" autocomplete="username" required></label>'+
        '<label>Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>'+
        '<p class="adm-err" role="alert"></p>'+
        '<div class="adm-actions"><button type="submit" class="adm-btn is-main">Acceder</button></div>'+
      '</form>';
    var form = v.body.querySelector('form'), err = v.body.querySelector('.adm-err');
    form.usuario.focus();
    form.addEventListener('submit', function(e){
      e.preventDefault();
      err.textContent = '';
      var b = form.querySelector('button'); b.disabled = true;
      api('login', JSON.stringify({usuario:form.usuario.value.trim(), clave:form.clave.value}), 'application/json')
        .then(function(){ v.cerrar(true); activar(); aviso('Modo edición activado'); })
        .catch(function(e){ err.textContent = e.message; form.clave.select(); })
        .then(function(){ b.disabled = false; });
    });
  }
  function salir(){
    api('salir').catch(function(){}).then(function(){ desactivar(); aviso('Has salido del modo edición'); });
  }
  document.addEventListener('click', function(e){
    if (!e.target.closest('[data-acceder]')) return;
    if (activo) salir(); else acceder();
  });

  function activar(){
    activo = true;
    document.documentElement.classList.add('adm-on');
    document.querySelectorAll('[data-acceder]').forEach(function(b){ b.textContent = 'salir'; });
    if (!document.querySelector('.adm-bar')){
      var bar = document.createElement('div'); bar.className = 'adm-bar';
      bar.innerHTML = '<span><i></i>Modo edición</span><button type="button" class="adm-link">Salir</button>';
      bar.querySelector('button').addEventListener('click', salir);
      document.body.appendChild(bar);
    }
    if (ultimo) decorar();
  }
  function desactivar(){
    activo = false;
    document.documentElement.classList.remove('adm-on');
    document.querySelectorAll('[data-acceder]').forEach(function(b){ b.textContent = 'acceder'; });
    document.querySelectorAll('.adm-bar,.adm-tools,.adm-new,.adm-det').forEach(function(x){ x.remove(); });
  }

  /* ---------- botones sobre la página ---------- */
  document.addEventListener('pintado', function(e){ ultimo = e.detail; if (activo) decorar(); });

  function lista(tipo){ return tipo === 'artefactos' ? DATOS.artefactos : DATOS.proyectos; }
  function nombreTipo(tipo){ return tipo === 'artefactos' ? 'artefacto' : 'proyecto'; }

  function decorar(){
    var t = ultimo.tipo;
    if (t === 'proyecto') return decorarDetalle(ultimo.id);
    var cont = document.getElementById(t === 'proyectos' ? 'prj-list' : 'art-list');
    var head = cont.parentNode.querySelector('.sec-h');
    if (!head.querySelector('.adm-new')){
      var nb = document.createElement('button');
      nb.type = 'button'; nb.className = 'adm-btn is-main adm-new';
      nb.textContent = '+ Nuevo ' + nombreTipo(t);
      nb.addEventListener('click', function(){ formulario(t, null); });
      head.appendChild(nb);
    }
    var L = lista(t);
    cont.querySelectorAll('[data-id]').forEach(function(row){
      var i = L.map(function(x){ return x.id; }).indexOf(row.dataset.id);
      var tools = document.createElement('div');
      tools.className = 'adm-tools';
      tools.innerHTML =
        '<button type="button" data-acc="subir"'+(i===0?' disabled':'')+' aria-label="Subir '+esc(L[i].nombre)+'">↑ Subir</button>'+
        '<button type="button" data-acc="bajar"'+(i===L.length-1?' disabled':'')+' aria-label="Bajar '+esc(L[i].nombre)+'">↓ Bajar</button>'+
        '<button type="button" data-acc="editar">Editar</button>'+
        '<button type="button" data-acc="borrar" class="is-danger">Eliminar</button>'+
        '<span class="adm-tools-n">'+esc(L[i].nombre)+'</span>';
      tools.addEventListener('click', function(e){
        var b = e.target.closest('[data-acc]'); if (!b) return;
        accion(t, row.dataset.id, b.dataset.acc);
      });
      row.parentNode.insertBefore(tools, row);
    });
  }
  function decorarDetalle(id){
    var det = document.getElementById('det');
    if (det.querySelector('.adm-det')) return;
    var box = document.createElement('div'); box.className = 'adm-det';
    box.innerHTML = '<button type="button" class="adm-btn is-main" data-acc="editar">Editar proyecto</button>'+
                    '<button type="button" class="adm-btn is-danger" data-acc="borrar">Eliminar</button>';
    box.addEventListener('click', function(e){
      var b = e.target.closest('[data-acc]'); if (b) accion('proyectos', id, b.dataset.acc);
    });
    det.insertBefore(box, det.querySelector('h1'));
  }

  function accion(tipo, id, acc){
    var L = lista(tipo), i = L.map(function(x){ return x.id; }).indexOf(id);
    if (i < 0) return;
    if (acc === 'editar') return formulario(tipo, L[i]);
    if (acc === 'subir' || acc === 'bajar'){
      var j = acc === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= L.length) return;
      var x = L[i]; L[i] = L[j]; L[j] = x;
      pintar();
      guardarDatos().then(function(){ aviso('Orden guardado'); }).catch(fallo);
      return;
    }
    if (acc === 'borrar'){
      if (!confirm('¿Eliminar «' + L[i].nombre + '»? Se quitará de la web (las fotos se quedan en la carpeta img).')) return;
      L.splice(i, 1);
      guardarDatos().then(function(){
        aviso('Eliminado');
        if (ultimo.tipo === 'proyecto') location.href = '../arquitectos/arquitectos.html';
        else pintar();
      }).catch(fallo);
    }
  }

  /* ---------- formulario de nuevo / editar ---------- */
  var CAMPOS = {
    proyectos: [
      ['nombre','Nombre',1], ['anio','Año'], ['loc','Localización'], ['status','Status'],
      ['tipo','Tipología'], ['premio','Premio'], ['tema','Tema'], ['area','Área']
    ],
    artefactos: [ ['nombre','Nombre',1] ]
  };

  /* ---------- editor de texto con formato ----------
     Negrita, cursiva, subrayado, tachado, títulos, listas, cita, alineación, enlaces, quitar formato, deshacer.
     Usa la edición del propio navegador; al guardar, el HTML se limpia (limpiarHtml, en datos.js). */
  var ICO = {
    izq:'<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/></svg>',
    cen:'<svg viewBox="0 0 16 16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/></svg>',
    der:'<svg viewBox="0 0 16 16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/></svg>',
    jus:'<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12"/></svg>',
    ul:'<svg viewBox="0 0 16 16"><path d="M6 4h8M6 8h8M6 12h8"/><circle cx="2.6" cy="4" r="1"/><circle cx="2.6" cy="8" r="1"/><circle cx="2.6" cy="12" r="1"/></svg>',
    ol:'<svg viewBox="0 0 16 16"><path d="M6 4h8M6 8h8M6 12h8"/><text x="0.6" y="5.6">1</text><text x="0.6" y="9.6">2</text><text x="0.6" y="13.6">3</text></svg>',
    enl:'<svg viewBox="0 0 16 16"><path d="M6.5 9.5l3-3M7 4.5l1.3-1.3a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.3 1.3a2.5 2.5 0 01-3.5-3.5L5.5 8"/></svg>',
    sin:'<svg viewBox="0 0 16 16"><path d="M6.5 9.5l3-3M7 4.5l1.3-1.3a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.3 1.3a2.5 2.5 0 01-3.5-3.5L5.5 8M2 2l12 12"/></svg>',
    lim:'<svg viewBox="0 0 16 16"><path d="M3 3h8M7 3l-2 10M9 9l5 5M14 9l-5 5"/></svg>',
    des:'<svg viewBox="0 0 16 16"><path d="M4 6h6.5a3.5 3.5 0 010 7H7M4 6l3-3M4 6l3 3"/></svg>',
    reh:'<svg viewBox="0 0 16 16"><path d="M12 6H5.5a3.5 3.5 0 000 7H9M12 6L9 3M12 6L9 9"/></svg>'
  };
  function editorTexto(caja, html){
    var b = function(cmd, titulo, cont, estado){
      return '<button type="button" data-cmd="'+cmd+'"'+(estado?' data-estado':'')+' title="'+titulo+'" aria-label="'+titulo+'">'+cont+'</button>';
    };
    caja.innerHTML =
      '<div class="adm-rte-bar" role="toolbar" aria-label="Formato del texto">'+
        '<select data-bloque aria-label="Estilo de párrafo"><option value="p">Párrafo</option><option value="h3">Título</option><option value="h4">Subtítulo</option><option value="blockquote">Cita</option></select>'+
        '<span class="adm-rte-sep"></span>'+
        b('bold','Negrita (Ctrl+B)','<b>B</b>',1)+b('italic','Cursiva (Ctrl+I)','<i>I</i>',1)+
        b('underline','Subrayado (Ctrl+U)','<u>U</u>',1)+b('strikeThrough','Tachado','<s>S</s>',1)+
        '<span class="adm-rte-sep"></span>'+
        b('insertUnorderedList','Lista con viñetas',ICO.ul,1)+b('insertOrderedList','Lista numerada',ICO.ol,1)+
        '<span class="adm-rte-sep"></span>'+
        b('justifyLeft','Alinear a la izquierda',ICO.izq,1)+b('justifyCenter','Centrar',ICO.cen,1)+
        b('justifyRight','Alinear a la derecha',ICO.der,1)+b('justifyFull','Justificar',ICO.jus,1)+
        '<span class="adm-rte-sep"></span>'+
        b('createLink','Añadir enlace',ICO.enl)+b('unlink','Quitar enlace',ICO.sin)+b('removeFormat','Quitar formato',ICO.lim)+
        '<span class="adm-rte-sep"></span>'+
        b('undo','Deshacer (Ctrl+Z)',ICO.des)+b('redo','Rehacer (Ctrl+Y)',ICO.reh)+
      '</div>'+
      '<div class="adm-rte" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texto del proyecto"></div>';
    var ed = caja.querySelector('.adm-rte'), bar = caja.querySelector('.adm-rte-bar'), sel = bar.querySelector('[data-bloque]');
    ed.innerHTML = html || '<p><br></p>';
    function cmd(c, v){
      ed.focus();
      try { document.execCommand('styleWithCSS', false, false); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
      document.execCommand(c, false, v);
      ed.dispatchEvent(new Event('input', {bubbles:true}));
      estado();
    }
    function dentro(){ var s = getSelection(); return s.rangeCount && ed.contains(s.getRangeAt(0).commonAncestorContainer); }
    function estado(){
      if (!dentro()) return;
      bar.querySelectorAll('[data-estado]').forEach(function(x){
        var on = false; try { on = document.queryCommandState(x.dataset.cmd); } catch (e) {}
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var blq = ''; try { blq = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) {}
      sel.value = ['h3','h4','blockquote'].indexOf(blq) >= 0 ? blq : 'p';
    }
    bar.addEventListener('mousedown', function(e){ if (e.target.closest('button')) e.preventDefault(); }); // no perder la selección
    bar.addEventListener('click', function(e){
      var x = e.target.closest('[data-cmd]'); if (!x) return;
      var c = x.dataset.cmd;
      if (c === 'createLink'){
        if (!dentro() || getSelection().isCollapsed){ aviso('Selecciona primero el texto del enlace', true); return; }
        var r = getSelection().getRangeAt(0);
        var url = prompt('Dirección del enlace (por ejemplo https://…)', 'https://');
        if (!url || url === 'https://') return;
        url = url.trim();
        if (!/^(https?:|mailto:|tel:|\/|#)/i.test(url)) url = 'https://' + url;
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        return cmd('createLink', url);
      }
      if (c === 'removeFormat'){ cmd('removeFormat'); cmd('unlink'); return cmd('formatBlock', '<p>'); }
      cmd(c);
    });
    sel.addEventListener('change', function(){ cmd('formatBlock', '<' + sel.value + '>'); });
    // pegar desde Word, una web...: se queda solo el formato permitido
    ed.addEventListener('paste', function(e){
      var cd = e.clipboardData; if (!cd) return;
      e.preventDefault();
      var h = cd.getData('text/html');
      if (h) cmd('insertHTML', limpiarHtml(h.replace(/<!--[\s\S]*?-->/g, '')));
      else cmd('insertText', cd.getData('text/plain'));
    });
    ed.addEventListener('drop', function(e){ e.preventDefault(); }); // nada de soltar imágenes dentro del texto
    document.addEventListener('selectionchange', estado);
    ed.addEventListener('keyup', estado);
    return {
      html: function(){ return limpiarHtml(ed.innerHTML); },
      quitar: function(){ document.removeEventListener('selectionchange', estado); }
    };
  }

  function formulario(tipo, original){
    var nuevo = !original;
    var d = original ? JSON.parse(JSON.stringify(original)) : {
      id: (tipo === 'proyectos' ? 'p-' : 'a-') + Date.now().toString(36),
      nombre:'', imgs:[]
    };
    if (tipo === 'proyectos'){ d.texto = d.texto || []; d.html = d.html || ''; d.portada = d.portada || ''; }
    else d.frase = d.frase || '';

    var v = ventana((nuevo ? 'Nuevo ' : 'Editar ') + nombreTipo(tipo), true);
    var campos = CAMPOS[tipo].map(function(c){
      return '<label'+(c[0]==='nombre'?' class="is-full"':'')+'>'+c[1]+(c[2]?' *':'')+
        '<input name="'+c[0]+'" value="'+esc(d[c[0]]||'')+'"'+(c[2]?' required':'')+'></label>';
    }).join('');
    var textos = tipo === 'proyectos'
      ? '<div class="is-full adm-rte-campo"><span class="adm-rte-label">Texto del proyecto <small>Selecciona texto y usa la barra para darle formato. El primer párrafo se ve más grande.</small></span>'+
          '<div class="adm-rte-caja"></div></div>'
      : '<label class="is-full">Frase <small>Aparece bajo el nombre, en el primer cuadro de la fila.</small>'+
          '<textarea name="frase" rows="2">'+esc(d.frase)+'</textarea></label>';
    v.body.innerHTML =
      '<form class="adm-form" novalidate>'+
        '<div class="adm-grid">'+campos+textos+'</div>'+
        '<fieldset class="adm-imgs"><legend>Imágenes</legend>'+
          '<p class="adm-help">Arrastra las fotos (o usa las flechas) para cambiar el orden. '+
            (tipo === 'proyectos' ? 'El orden es el de la fila en la lista; la <b>portada</b> es la foto grande del detalle.' : 'El orden es el de la fila.')+'</p>'+
          '<ol class="adm-thumbs"></ol>'+
          '<label class="adm-btn adm-upload">+ Añadir imágenes<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden></label>'+
          '<span class="adm-progress" role="status"></span>'+
        '</fieldset>'+
        '<p class="adm-err" role="alert"></p>'+
        '<div class="adm-actions">'+
          '<button type="button" class="adm-btn" data-cancel>Cancelar</button>'+
          '<button type="submit" class="adm-btn is-main">'+(nuevo ? 'Crear' : 'Guardar cambios')+'</button>'+
        '</div>'+
      '</form>';
    var form = v.body.querySelector('form'), ol = form.querySelector('.adm-thumbs'), err = form.querySelector('.adm-err');
    var rte = tipo === 'proyectos' ? editorTexto(form.querySelector('.adm-rte-caja'), textoProyecto(d)) : null;
    if (rte){ var cerrarAntes = v.cerrar; v.cerrar = function(f){ cerrarAntes(f); if (!document.body.contains(v.el)) rte.quitar(); }; }
    form.nombre.focus();
    form.querySelector('[data-cancel]').addEventListener('click', function(){ v.cerrar(); });

    /* --- miniaturas --- */
    function portadaActual(){
      return d.imgs.some(function(im){ return im.src === d.portada; }) ? d.portada : (d.imgs[0] && d.imgs[0].src);
    }
    function pintarFotos(){
      var pa = tipo === 'proyectos' && portadaActual(), n = d.imgs.length;
      ol.innerHTML = n ? d.imgs.map(function(im,i){
        return '<li class="adm-thumb" draggable="true" data-i="'+i+'">'+
          '<span class="adm-thumb-n">'+(i+1)+'</span>'+
          '<img src="'+IMG_BASE+im.src+'" alt="">'+
          '<input class="adm-alt" data-i="'+i+'" value="'+esc(im.alt)+'" placeholder="Descripción de la foto" aria-label="Descripción de la foto '+(i+1)+'">'+
          '<span class="adm-thumb-bar">'+
            '<button type="button" data-mv="-1" data-i="'+i+'"'+(i===0?' disabled':'')+' aria-label="Mover antes">←</button>'+
            '<button type="button" data-mv="1" data-i="'+i+'"'+(i===n-1?' disabled':'')+' aria-label="Mover después">→</button>'+
            (tipo === 'proyectos' ? '<label class="adm-cover"><input type="radio" name="portada" value="'+esc(im.src)+'"'+(im.src===pa?' checked':'')+'>Portada</label>' : '')+
            '<button type="button" data-rm="'+i+'" class="is-danger" aria-label="Quitar foto '+(i+1)+'">✕</button>'+
          '</span></li>';
      }).join('') : '<li class="adm-empty">Todavía no hay imágenes.</li>';
    }
    function mover(de, a){
      if (a < 0 || a >= d.imgs.length || de === a) return;
      var x = d.imgs.splice(de, 1)[0]; d.imgs.splice(a, 0, x);
      v.sucio = true; pintarFotos();
    }
    pintarFotos();
    ol.addEventListener('input', function(e){
      if (e.target.classList.contains('adm-alt')) d.imgs[+e.target.dataset.i].alt = e.target.value;
    });
    ol.addEventListener('change', function(e){
      if (e.target.name === 'portada'){ d.portada = e.target.value; v.sucio = true; }
    });
    ol.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mv){ var i = +b.dataset.i, j = i + (+b.dataset.mv); mover(i, j);
        var nb = ol.querySelector('[data-i="'+j+'"][data-mv="'+b.dataset.mv+'"]') || ol.querySelector('.adm-thumb[data-i="'+j+'"] button');
        if (nb && !nb.disabled) nb.focus(); }
      if (b.dataset.rm){
        var k = +b.dataset.rm;
        if (d.imgs[k].src === d.portada) d.portada = '';
        d.imgs.splice(k, 1); v.sucio = true; pintarFotos();
      }
    });
    // arrastrar y soltar
    var arrastrando = null;
    ol.addEventListener('dragstart', function(e){
      var li = e.target.closest('.adm-thumb'); if (!li) return;
      arrastrando = +li.dataset.i; li.classList.add('is-drag');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.i);
    });
    ol.addEventListener('dragover', function(e){
      if (arrastrando === null) return;
      e.preventDefault();
      ol.querySelectorAll('.is-over').forEach(function(x){ x.classList.remove('is-over'); });
      var li = e.target.closest('.adm-thumb'); if (li) li.classList.add('is-over');
    });
    ol.addEventListener('drop', function(e){
      e.preventDefault();
      var li = e.target.closest('.adm-thumb');
      if (li && arrastrando !== null) mover(arrastrando, +li.dataset.i);
    });
    ol.addEventListener('dragend', function(){ arrastrando = null; pintarFotos(); });

    /* --- subir fotos --- */
    var file = form.querySelector('input[type=file]'), prog = form.querySelector('.adm-progress'), subiendo = 0;
    file.addEventListener('change', function(){
      var fs = [].slice.call(file.files); file.value = '';
      if (!fs.length) return;
      // proyectos: las fotos van a img/proyectos/<año>/<nombre>/ según lo escrito ahora en el formulario
      var carpeta;
      try { carpeta = tipo === 'proyectos' ? carpetaProyecto(form.anio.value, form.nombre.value) : d.id; }
      catch (e0) { err.textContent = e0.message; form.nombre.focus(); return; }
      err.textContent = '';
      subiendo++; var hechas = 0;
      prog.textContent = 'Subiendo 1 de ' + fs.length + '…';
      // se leen todas nada más elegirlas (antes de que nada pueda cambiar los archivos)
      var leidas = fs.map(function(f){ return leerFoto(f); });
      leidas.forEach(function(p){ p.catch(function(){}); });
      fs.reduce(function(p, f, k){
        return p.then(function(){
          return leidas[k].then(function(foto){ return subirImagen(tipo, carpeta, foto); })
            .then(function(src){
              d.imgs.push({src:src, alt:''}); v.sucio = true; hechas++;
              prog.textContent = hechas < fs.length ? 'Subiendo ' + (hechas+1) + ' de ' + fs.length + '…' : '';
              pintarFotos();
            })
            .catch(function(e){ err.textContent = e.message; });
        });
      }, Promise.resolve()).then(function(){ subiendo--; if (!subiendo) prog.textContent = ''; });
    });

    /* --- guardar --- */
    form.addEventListener('submit', function(e){
      e.preventDefault();
      err.textContent = '';
      if (subiendo){ err.textContent = 'Espera a que terminen de subirse las fotos.'; return; }
      CAMPOS[tipo].forEach(function(c){ d[c[0]] = form[c[0]].value.trim(); });
      if (!d.nombre){ err.textContent = 'El nombre es obligatorio.'; form.nombre.focus(); return; }
      if (tipo === 'proyectos'){
        d.html = rte.html();
        // también en texto plano (para leer el .txt a mano y como respaldo)
        var tmp = document.createElement('div'); tmp.innerHTML = d.html;
        d.texto = [].map.call(tmp.children, function(x){ return x.textContent.trim(); }).filter(Boolean);
        if (!d.texto.length) d.html = '';
        d.portada = d.imgs.length && portadaActual() !== d.imgs[0].src ? portadaActual() : '';
      } else d.frase = form.frase.value.trim();

      var L = lista(tipo), copia = L.slice();
      if (nuevo) L.unshift(d);  // lo nuevo aparece el primero; luego se puede mover
      else L[L.map(function(x){ return x.id; }).indexOf(d.id)] = d;
      var b = form.querySelector('[type=submit]'); b.disabled = true;
      guardarDatos().then(function(){
        v.cerrar(true); pintar();
        aviso(nuevo ? 'Creado' : 'Cambios guardados');
      }).catch(function(e2){
        if (tipo === 'artefactos') DATOS.artefactos = copia; else DATOS.proyectos = copia;
        err.textContent = mensaje(e2); b.disabled = false;
      });
    });
  }

  /* ---------- al cargar: ¿ya había sesión abierta? ---------- */
  api('sesion').then(function(j){ if (j.ok) activar(); }).catch(function(){ /* sin guardar.php (p. ej. abierto en local): no hay modo edición */ });
})();

(function(){
  /* ---------- Artefactos: filas (datos en data/datos.txt) ---------- */
  var artList = document.getElementById('art-list');
  if (!artList) return;
  function pintar(){
    var A = DATOS.artefactos;
    artList.innerHTML = A.length ? A.map(function(a,i){
      var imgs = a.imgs.map(function(im,j){
        return '<button type="button" class="art-zoom" data-a="'+i+'" data-j="'+j+'" aria-label="Ampliar imagen: '+esc(im.alt||a.nombre)+'">'+
          '<img src="'+IMG_BASE+im.src+'" alt="'+esc(im.alt)+'" loading="lazy"></button>';
      }).join('');
      return '<div class="prj art" data-id="'+esc(a.id)+'">'+
        '<span class="prj-imgs"><span class="art-txt"><b>'+esc(a.nombre)+'</b><i>'+esc(a.frase)+'</i></span>'+imgs+'</span>'+
        '<span class="prj-meta"><b>'+esc(a.nombre)+'</b><span>'+esc(a.frase)+'</span></span></div>';
    }).join('') : '<p class="aviso-datos">Todavía no hay artefactos.</p>';
    document.dispatchEvent(new CustomEvent('pintado', {detail:{tipo:'artefactos'}}));
  }
  window.pintar = pintar; // el modo edición la usa para volver a dibujar tras un cambio
  cargarDatos().then(pintar).catch(function(){ avisoSinServidor(artList); });

  /* ---------- Visor: imagen a pantalla completa con zoom ----------
     Clic en una foto: se abre en grande. Clic en la foto ampliada: zoom x2.5 en ese punto (mover el ratón para recorrerla).
     Flechas: foto anterior/siguiente del mismo artefacto. Esc o clic fuera: cerrar. */
  var ZOOM = 2.5;
  var box = document.createElement('div');
  box.className = 'lb'; box.hidden = true;
  box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true'); box.setAttribute('aria-label','Imagen ampliada');
  box.innerHTML =
    '<div class="lb-stage"><img class="lb-img" alt=""></div>'+
    '<p class="lb-cap"><b></b><span></span></p>'+
    '<button type="button" class="lb-btn lb-close" aria-label="Cerrar">&times;</button>'+
    '<button type="button" class="lb-btn lb-prev" aria-label="Imagen anterior">&#8249;</button>'+
    '<button type="button" class="lb-btn lb-next" aria-label="Imagen siguiente">&#8250;</button>';
  document.body.appendChild(box);
  var img = box.querySelector('.lb-img'), stage = box.querySelector('.lb-stage');
  var capName = box.querySelector('.lb-cap b'), capCount = box.querySelector('.lb-cap span');
  var cur = {a:0, j:0}, zoomed = false, opener = null;

  function setZoom(on, e){
    zoomed = on;
    box.classList.toggle('is-zoomed', on);
    if (on && e) pan(e); else img.style.transformOrigin = '50% 50%';
    img.style.transform = on ? 'scale('+ZOOM+')' : '';
  }
  function pan(e){
    var r = stage.getBoundingClientRect();
    var x = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100));
    var y = Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100));
    img.style.transformOrigin = x+'% '+y+'%';
  }
  function show(a, j){
    var art = DATOS.artefactos[a], n = art.imgs.length;
    j = (j + n) % n; cur = {a:a, j:j};
    setZoom(false);
    img.src = IMG_BASE + art.imgs[j].src;
    img.alt = art.imgs[j].alt || '';
    capName.textContent = art.nombre;
    capCount.textContent = (j+1) + ' / ' + n;
    box.querySelector('.lb-prev').hidden = box.querySelector('.lb-next').hidden = n < 2;
  }
  function open(a, j, from){
    opener = from; show(a, j);
    box.hidden = false; document.documentElement.classList.add('lb-open');
    box.querySelector('.lb-close').focus();
  }
  function close(){
    box.hidden = true; document.documentElement.classList.remove('lb-open');
    setZoom(false);
    if (opener) opener.focus();
  }

  artList.addEventListener('click', function(e){
    var b = e.target.closest('.art-zoom'); if (!b) return;
    open(+b.dataset.a, +b.dataset.j, b);
  });
  box.addEventListener('click', function(e){
    if (e.target === img){ setZoom(!zoomed, e); return; }
    if (e.target.closest('.lb-close')) return close();
    if (e.target.closest('.lb-prev')) return show(cur.a, cur.j - 1);
    if (e.target.closest('.lb-next')) return show(cur.a, cur.j + 1);
    if (!e.target.closest('.lb-cap')) close(); // clic en el fondo
  });
  stage.addEventListener('pointermove', function(e){ if (zoomed) pan(e); });
  document.addEventListener('keydown', function(e){
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(cur.a, cur.j - 1);
    else if (e.key === 'ArrowRight') show(cur.a, cur.j + 1);
    else if (e.key === 'Tab'){ // mantener el foco dentro del visor
      var f = [].filter.call(box.querySelectorAll('button'), function(x){ return !x.hidden; });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
})();

(function(){
  /* ---------- Proyectos: filas + etiqueta que sigue al cursor (datos en data/datos.txt) ---------- */
  var list = document.getElementById('prj-list');
  if (!list) return;

  function pintar(){
    var P = DATOS.proyectos;
    list.innerHTML = P.length ? P.map(function(p,i){
      var imgs = p.imgs.map(function(im){ return '<img src="'+IMG_BASE+im.src+'" alt="" loading="lazy">'; }).join('');
      return '<a class="prj" href="../proyecto/proyecto.html?id='+encodeURIComponent(p.id)+'" data-i="'+i+'" data-id="'+esc(p.id)+'" aria-label="'+esc(p.nombre)+', '+esc(p.anio)+'. Ver proyecto">'+
        '<span class="prj-imgs">'+imgs+'</span><span class="prj-meta"><b>'+esc(p.nombre)+'</b><span>'+esc(p.anio)+'</span></span></a>';
    }).join('') : '<p class="aviso-datos">Todavía no hay proyectos.</p>';
    document.dispatchEvent(new CustomEvent('pintado', {detail:{tipo:'proyectos'}}));
  }
  window.pintar = pintar; // el modo edición la usa para volver a dibujar tras un cambio

  var tip = document.createElement('div'); tip.className = 'prj-tip'; tip.setAttribute('aria-hidden','true');
  document.body.appendChild(tip);
  var fillTip = function(i){ var p = DATOS.proyectos[i]; tip.innerHTML = '<b>'+esc(p.nombre)+'</b><span>'+esc(p.anio)+'</span>'; };
  list.addEventListener('pointermove', function(e){
    var r = e.target.closest('.prj'); if(!r || e.pointerType !== 'mouse'){ tip.classList.remove('on'); return; }
    if (tip.dataset.i !== r.dataset.i){ fillTip(+r.dataset.i); tip.dataset.i = r.dataset.i; }
    var x = Math.min(e.clientX + 18, innerWidth - tip.offsetWidth - 8);
    tip.style.transform = 'translate('+x+'px,'+(e.clientY + 18)+'px)';
    tip.classList.add('on');
  });
  list.addEventListener('pointerleave', function(){ tip.classList.remove('on'); });
  list.addEventListener('focusin', function(e){
    var r = e.target.closest('.prj'); if(!r) return;
    fillTip(+r.dataset.i); var b = r.getBoundingClientRect();
    tip.style.transform = 'translate('+Math.min(b.right + 12, innerWidth - tip.offsetWidth - 8)+'px,'+(b.top + 8)+'px)';
    tip.classList.add('on');
  });
  list.addEventListener('focusout', function(){ tip.classList.remove('on'); });
  window.addEventListener('scroll', function(){ tip.classList.remove('on'); }, {passive:true});
  window.addEventListener('pagehide', function(){ tip.classList.remove('on'); });
  document.addEventListener('pintado', function(){ tip.classList.remove('on'); delete tip.dataset.i; });

  cargarDatos().then(pintar).catch(function(){ avisoSinServidor(list); });
})();

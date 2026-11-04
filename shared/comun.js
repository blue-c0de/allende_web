/* Común a todas las páginas: logotipo, pie, enlaces de sección */
/* esc(): escapa texto antes de meterlo en HTML. La usan los demás archivos. */
function esc(t){ return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

(function(){
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Símbolo (Manual: cuadrado 4x, astas 1/5x) ---------- */
  function sym(kind, neg){
    var cls = 'sym' + (kind==='art' ? ' art' : '') + (neg ? ' neg' : '');
    var inset = (neg || kind==='art') ? 0.8 : 0;
    var bar = '<rect class="bar" x="0" y="7" width="30" height="2"/>';
    return '<svg class="'+cls+'" viewBox="0 0 50 40" aria-hidden="true" focusable="false">'+
      '<rect class="sq" x="'+(10+inset)+'" y="'+inset+'" width="'+(40-2*inset)+'" height="'+(40-2*inset)+'"/>'+
      bar+'<rect class="tick" x="40" y="31" width="2" height="9"/></svg>';
  }
  document.querySelectorAll('span[data-sym]').forEach(function(el){
    el.outerHTML = sym(el.dataset.sym, false);
  });

  /* ---------- Footer ---------- */
  var ICONS = {
    Facebook:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path d="M13.3 19.5v-6.2h2.1l.3-2.5h-2.4V9.3c0-.7.2-1.2 1.2-1.2h1.3V5.9c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.8H8.6v2.5h2.1v6.2z" fill="#fff"/></svg>',
    Instagram:'<svg viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset="1" stop-color="#962FBF"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig)"/><rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="2.9" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="15.6" cy="8.4" r=".9" fill="#fff"/></svg>',
    YouTube:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#FF0000"/><path d="M10 8.6v6.8l5.6-3.4z" fill="#fff"/></svg>',
    X:'<svg viewBox="0 0 24 24"><path d="M5 5h3.6l3.9 5.3L17 5h1.6l-5.4 6.2L19.2 19h-3.6l-4.2-5.6L6.6 19H5l5.7-6.5z" fill="#fff"/></svg>',
    LinkedIn:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#0A66C2"/><rect x="7" y="10" width="2.2" height="7" fill="#fff"/><circle cx="8.1" cy="7.6" r="1.3" fill="#fff"/><path d="M11 10h2.1v1c.4-.7 1.3-1.2 2.4-1.2 2 0 2.5 1.3 2.5 3.1V17h-2.2v-3.7c0-.9-.2-1.6-1.1-1.6s-1.5.6-1.5 1.7V17H11z" fill="#fff"/></svg>',
    TikTok:'<svg viewBox="0 0 24 24"><path d="M14.2 4h2.4c.2 1.7 1.3 3 3 3.2v2.4c-1.1 0-2.2-.4-3-1v5.6a4.8 4.8 0 1 1-4.8-4.8c.3 0 .5 0 .8.1v2.5a2.3 2.3 0 1 0 1.6 2.2z" fill="#fff"/></svg>'
  };
  var year = new Date().getFullYear();
  document.querySelectorAll('footer[data-footer]').forEach(function(f){
    var name = f.dataset.footer, kind = f.dataset.sym;
    var social = ['Instagram','LinkedIn'].map(function(k){
      return '<a href="#" aria-label="'+name+' en '+k+'" data-social>'+ICONS[k].replace(/ig\b/g,'ig-'+kind)+'</a>';
    }).join('');
    f.className = 'foot';
    f.innerHTML =
      '<div class="foot-in">'+
        '<div class="foot-brand">'+
          // Siempre "allende ▪ arquitectos — © año", también en las páginas de artefactos
          '<p class="foot-copy"><span class="wm"><span class="w1">allende</span>'+sym('arq',false)+'<span class="w2">arquitectos</span></span> — © '+year+'</p>'+
          '<button type="button" class="foot-acc" data-acceder>acceder</button>'+
        '</div>'+
        '<address class="foot-contact">Ruíz de Alarcón 14, 28014 Madrid<br>'+
          '<a href="tel:+34913596040">+34 913 596 040</a><br>'+
          '<a href="mailto:allende@allendearquitectos.com">allende@allendearquitectos.com</a></address>'+
        '<nav class="foot-social" aria-label="Redes sociales">'+social+'</nav>'+
      '</div>';
  });
  document.addEventListener('click', function(e){
    var s = e.target.closest('[data-social]');
    if (s && s.getAttribute('href') === '#') e.preventDefault(); // pon aquí las URLs reales
  });

  /* ---------- Enlaces de sección: si la sección está en esta misma página, desplazamiento suave ---------- */
  document.addEventListener('click', function(e){
    var a = e.target.closest('[data-scroll]'); if(!a) return;
    var t = document.getElementById(a.dataset.scroll);
    if (!t) return; // está en otra página: el enlace normal la abre
    e.preventDefault();
    t.scrollIntoView({behavior: reduced ? 'auto' : 'smooth'});
  });
  /* ---------- Filas de imágenes: barra de desplazamiento fina encima de las fotos ----------
     Solo se crea en las filas con más fotos de las que caben. Se puede arrastrar. */
  function colocarBarra(sc, bar){
    var t = bar.firstChild, sobra = sc.scrollWidth - sc.clientWidth;
    bar.style.left = sc.offsetLeft + 'px';
    bar.style.width = sc.clientWidth + 'px';
    bar.style.top = (sc.offsetTop + sc.clientHeight - bar.offsetHeight) + 'px';
    var w = Math.max(40, sc.clientWidth * sc.clientWidth / sc.scrollWidth);
    t.style.width = w + 'px';
    t.style.transform = 'translateX(' + (sobra > 0 ? sc.scrollLeft / sobra * (sc.clientWidth - w) : 0) + 'px)';
  }
  function crearBarra(sc){
    var bar = document.createElement('span'); bar.className = 'prj-bar'; bar.setAttribute('aria-hidden','true');
    bar.innerHTML = '<span class="prj-thumb"></span>';
    sc.parentElement.appendChild(bar);
    var t = bar.firstChild, x0 = 0, s0 = 0;
    sc.addEventListener('scroll', function(){ colocarBarra(sc, bar); }, {passive:true});
    t.addEventListener('pointerdown', function(e){
      e.preventDefault(); e.stopPropagation();
      x0 = e.clientX; s0 = sc.scrollLeft;
      t.setPointerCapture(e.pointerId); bar.classList.add('drag');
    });
    t.addEventListener('pointermove', function(e){
      if (!t.hasPointerCapture(e.pointerId)) return;
      var w = t.offsetWidth, sobra = sc.scrollWidth - sc.clientWidth;
      sc.scrollLeft = s0 + (e.clientX - x0) * sobra / Math.max(1, sc.clientWidth - w);
    });
    var soltar = function(){ bar.classList.remove('drag'); };
    t.addEventListener('pointerup', soltar); t.addEventListener('pointercancel', soltar);
    // Que al soltar la barra no se abra el proyecto
    t.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); });
    return bar;
  }
  function barras(){
    document.querySelectorAll('.prj-imgs').forEach(function(sc){
      var bar = sc.parentElement.querySelector(':scope > .prj-bar');
      if (sc.scrollWidth - sc.clientWidth <= 1){ if (bar) bar.remove(); return; }
      colocarBarra(sc, bar || crearBarra(sc));
    });
  }
  document.addEventListener('pintado', function(){ requestAnimationFrame(barras); });
  window.addEventListener('resize', barras);
  window.addEventListener('load', barras);
})();

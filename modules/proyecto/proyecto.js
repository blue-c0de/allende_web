(function(){
  /* ---------- Detalle de proyecto: proyecto.html?id=<id del proyecto> ---------- */
  var det = document.getElementById('det');
  if (!det) return;

  function pintar(){
    var id = new URLSearchParams(location.search).get('id');
    var p = DATOS.proyectos.filter(function(x){ return x.id === id; })[0];
    if (!p){ location.replace('../arquitectos/arquitectos.html'); return; }
    det.dataset.id = p.id;
    var meta = [['Localización',p.loc],['Año',p.anio],['Status',p.status],['Tipología',p.tipo],['Premio',p.premio],['Tema',p.tema]]
      .filter(function(m){ return m[1]; })
      .map(function(m){ return '<div><dt>'+m[0]+'</dt><dd>'+esc(m[1])+'</dd></div>'; }).join('');
    var cover = p.imgs.filter(function(im){ return im.src === p.portada; })[0] || p.imgs[0];
    var rest = p.imgs.filter(function(im){ return im !== cover; });
    var gal = rest.map(function(im,j){
      var wide = (rest.length % 2 === 1 && j === 0) ? ' class="wide"' : '';
      return '<figure'+wide+'><img src="'+IMG_BASE+im.src+'" alt="'+esc(im.alt)+'" loading="lazy"></figure>';
    }).join('');
    det.innerHTML =
      '<nav aria-label="Ruta"><p class="det-crumb"><a href="../arquitectos/arquitectos.html#arq-proyectos">Proyectos</a><span aria-hidden="true">/</span><span>'+esc(p.anio)+'</span><span aria-hidden="true">/</span><span aria-current="page">'+esc(p.nombre)+'</span></p></nav>'+
      '<h1>'+esc(p.nombre)+'</h1>'+
      '<div class="det-top"><dl class="det-meta">'+meta+'</dl>'+
        (cover ? '<figure class="det-hero"><img src="'+IMG_BASE+cover.src+'" alt="'+esc(cover.alt)+'"></figure>' : '')+'</div>'+
      (function(){ var t = textoProyecto(p); return t ? '<div class="det-text">'+t+'</div>' : ''; })()+
      (gal ? '<div class="det-gal">'+gal+'</div>' : '');
    document.dispatchEvent(new CustomEvent('pintado', {detail:{tipo:'proyecto', id:p.id}}));
  }
  window.pintar = pintar; // el modo edición la usa para volver a dibujar tras un cambio

  cargarDatos().then(pintar).catch(function(){ avisoSinServidor(det); });
})();

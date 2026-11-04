(function(){
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Inicio: animación del logo y transición al entrar ---------- */
  var intro = document.getElementById('v-inicio');
  if (intro){
    intro.classList.add('play');
    document.getElementById('intro-link').addEventListener('click', function(e){
      if (reduced) return;
      e.preventDefault();
      var href = this.getAttribute('href');
      intro.classList.remove('play'); intro.classList.add('leaving');
      setTimeout(function(){ location.href = href; }, 480);
    });
    // Al volver con "atrás", el navegador puede mostrar la página tal como quedó a mitad de la salida
    window.addEventListener('pageshow', function(e){
      if (e.persisted){ intro.classList.remove('leaving'); void intro.offsetWidth; intro.classList.add('play'); }
    });
  }
})();

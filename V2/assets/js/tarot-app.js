/* /assets/js/tarot-app.js — État “nickel” : grille 22 dos + bande résultats centrée */
(function(){
  "use strict";

  // ---------- Données ----------
  var BACK_SRC  = "/assets/img/tarot/verso.webp";
  var FACE_BASE = "/assets/img/tarot/majors";

  var TAROT_FACES = [
    { n:0,  slug:"00-le-mat.webp",                 label:"Le Mat" },
    { n:1,  slug:"01-le-bateleur.webp",            label:"Le Bateleur" },
    { n:2,  slug:"02-la-papesse.webp",             label:"La Papesse" },
    { n:3,  slug:"03-limperatrice.webp",           label:"L’Impératrice" },
    { n:4,  slug:"04-lempereur.webp",              label:"L’Empereur" },
    { n:5,  slug:"05-le-pape.webp",                label:"Le Pape" },
    { n:6,  slug:"06-lamoureux.webp",              label:"L’Amoureux" },
    { n:7,  slug:"07-le-chariot.webp",             label:"Le Chariot" },
    { n:8,  slug:"08-la-justice.webp",             label:"La Justice" },
    { n:9,  slug:"09-lhermite.webp",               label:"L’Hermite" },
    { n:10, slug:"10-la-roue-de-fortune.webp",     label:"La Roue de Fortune" },
    { n:11, slug:"11-la-force.webp",               label:"La Force" },
    { n:12, slug:"12-le-pendu.webp",               label:"Le Pendu" },
    { n:13, slug:"13-larcane-sans-nom.webp",       label:"Arcane sans nom" },
    { n:14, slug:"14-temperance.webp",             label:"Tempérance" },
    { n:15, slug:"15-le-diable.webp",              label:"Le Diable" },
    { n:16, slug:"16-la-maison-dieu.webp",         label:"La Maison Dieu" },
    { n:17, slug:"17-letoile.webp",                label:"L’Étoile" },
    { n:18, slug:"18-la-lune.webp",                label:"La Lune" },
    { n:19, slug:"19-le-soleil.webp",              label:"Le Soleil" },
    { n:20, slug:"20-le-jugement.webp",            label:"Le Jugement" },
    { n:21, slug:"21-le-monde.webp",               label:"Le Monde" }
  ];

  // 3 mots-clés / arcane
  var KW = {
    0:["liberté","spontanéité","aventure"],1:["début","potentiel","action"],2:["intuition","secret","patience"],
    3:["créativité","expression","fertilité"],4:["stabilité","structure","autorité"],5:["guidance","tradition","enseignement"],
    6:["choix","union","valeurs"],7:["volonté","victoire","déplacement"],8:["équilibre","vérité","responsabilité"],
    9:["recherche","introspection","prudence"],10:["changement","cycle","opportunité"],11:["courage","maîtrise","compassion"],
    12:["lâcher-prise","perspective","pause"],13:["transformation","fin","renaissance"],14:["harmonie","modération","alchimie"],
    15:["attachement","tentation","énergie brute"],16:["révélation","rupture","libération"],
    17:["espoir","inspiration","guérison"],18:["émotions","illusion","subconscient"],19:["succès","vitalité","clarté"],
    20:["appel","éveil","bilan"],21:["accomplissement","intégration","ouverture"]
  };

  // ---------- État ----------
  var S = { mode:null, limit:0, flips:0, selected:[] };

  // ---------- Helpers ----------
  function $(sel, root){ return (root||document).querySelector(sel); }
  function shuffle(a){ for (var i=a.length-1;i>0;i--){ var j=(Math.random()*(i+1))|0; var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function debounce(fn, wait){ var t; return function(){ clearTimeout(t); t=setTimeout(fn, wait); }; }
  function numFor(card){ if(card&&typeof card.n==='number') return card.n; if(card&&card.slug){var m=card.slug.match(/^(\d+)/); if(m) return +m[1];} return null; }

  // ---------- Grille dos ----------
  function buildGrid(){
  var grid = document.querySelector('#tarot-grid');

    grid.innerHTML = "";

    var order = shuffle(TAROT_FACES.map(function(_,i){return i;}));
    order.forEach(function(idx, pos){
      var c = TAROT_FACES[idx];

      var btn  = document.createElement("button");
      btn.className = "tarot-card";
      btn.type = "button";
      btn.setAttribute("role","listitem");
      btn.setAttribute("aria-label","Carte face cachée "+(pos+1));

      var flip = document.createElement("div");
      flip.className = "flip";

      var back = document.createElement("div");
      back.className = "side back";
      var backImg = new Image();
      backImg.alt = "Dos de carte";
      backImg.addEventListener('load', syncPickWidth, { once:true });
      backImg.src = BACK_SRC;
      back.appendChild(backImg);

      var front = document.createElement("div");
      front.className = "side front";
      var face = new Image();
      face.alt = c.label;
      face.addEventListener('load', syncPickWidth, { once:true });
      face.src = FACE_BASE + "/" + c.slug;
      front.appendChild(face);

      flip.appendChild(back); flip.appendChild(front);
      btn.appendChild(flip);

      btn.addEventListener("click", function(){
        if (!S.mode){
          document.querySelectorAll(".modes .mode").forEach(function(m){
            m.animate([{transform:"scale(1)"},{transform:"scale(1.05)"},{transform:"scale(1)"}],{duration:220});
          });
          return;
        }
        if (btn.dataset.flipped === "1") return;
        if (S.flips >= S.limit){
          btn.classList.add("over-limit");
          setTimeout(function(){ btn.classList.remove("over-limit"); }, 650);
          return;
        }

        btn.dataset.flipped = "1";
        btn.setAttribute("aria-label", c.n + " — " + c.label);
        S.flips++;
        S.selected.push(c);
        renderPicks();
      });

      grid.appendChild(btn);
    });

    grid.classList.add("disabled");
  }

  // ---------- Modes (3 / 5) ----------
  function setupModes(){
  var buttons = document.querySelectorAll("#tirage-ia .modes .mode");
  var grid = $("#tarot-grid");

    function setMode(val){
      S.mode = parseInt(val,10);
      S.limit = S.mode;
      S.flips = 0;
      S.selected = [];

      document.querySelectorAll(".tarot-card").forEach(function(card){
        card.removeAttribute("data-flipped");
        card.classList.remove("over-limit");
      });

      if (grid) grid.classList.remove("disabled");
      renderPicks();    // reset la bande résultats (vide)
      syncPickWidth();  // ajuste la largeur
    }
    buttons.forEach(function(b){
      b.addEventListener("click", function(){ setMode(b.dataset.mode); });
    });
  }

  // ---------- Bande des résultats sous le cadre ----------
  function renderPicks(){
    var host = document.getElementById("api-picks");
    if (!host) return;

    host.innerHTML = "";

    (S.selected || []).forEach(function(c, i){
      var wrap = document.createElement("div");
      wrap.className = "result-card";

      // Étiquette au-dessus
      var tag = document.createElement("div");
      tag.className = "pick-tag";
      tag.textContent = "Tirage " + (i+1);

      // Image
      var inner = document.createElement("div");
      inner.className = "result-card-inner";
      var img = new Image();
      img.src = FACE_BASE + "/" + c.slug;
      img.alt = c.label || "";
      img.loading = "lazy";
      img.decoding = "async";
      inner.appendChild(img);

      // Mots-clés (1 par ligne)
      var kw = document.createElement("div");
      kw.className = "pick-kw";
      (KW[numFor(c)] || []).forEach(function(w){
        var sp = document.createElement("span");
        sp.textContent = w;
        kw.appendChild(sp);
      });

      wrap.appendChild(tag);
      wrap.appendChild(inner);
      wrap.appendChild(kw);
      host.appendChild(wrap);
    });

    syncPickWidth(); // largeur des vignettes = largeur d’une carte de la grille
  }

  // ---------- Sizing (aligne la largeur des résultats sur la grille) ----------
  function syncPickWidthNow(){
    var tile = document.querySelector('#tarot-grid .tarot-card .flip')
       || document.querySelector('#tarot-grid .tarot-card');
var host = document.getElementById('api-picks');

    if (!tile || !host) return;
    var w = Math.round(tile.getBoundingClientRect().width);
    if (!(w > 0)) return;

    host.style.setProperty('--pick-w', w + 'px');
    host.querySelectorAll('.result-card').forEach(function(p){
      p.style.width = w + 'px';
      p.style.flexBasis = w + 'px';
    });
  }
  function debounceFn(fn, wait){ var t; return function(){ clearTimeout(t); t=setTimeout(fn, wait); }; }
  var syncPickWidth = (function(){
    var raf;
    return function(){
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function(){ setTimeout(syncPickWidthNow, 0); });
    };
  })();
  var _gridObs;
  function observeGrid(){
  var grid = document.querySelector('#tarot-grid');

    if (!grid || !window.ResizeObserver) return;
    if (_gridObs) _gridObs.disconnect();
    _gridObs = new ResizeObserver(syncPickWidth);
    _gridObs.observe(grid);
  }
  window.addEventListener('resize', debounceFn(syncPickWidth, 150));

  // ---------- Boot ----------
 function start(){
  function tryInit(){
    if (document.querySelector('#tarot-grid')) {
      buildGrid();
      setupModes();
      observeGrid();
      syncPickWidth();
      return true;
    }
    return false;
  }
  if (!tryInit()){
    var tries = 0, maxTries = 20;
    var timer = setInterval(function(){
      if (tryInit() || ++tries >= maxTries) clearInterval(timer);
    }, 150);
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();



 // --- Expose aux autres scripts ---
window.KW = KW;
window.numFor = numFor;

// Si TAROT_APP existait déjà, on complète, sinon on crée
window.TAROT_APP = Object.assign({}, window.TAROT_APP, {
  state: S,
  rebuild: buildGrid,
  renderPicks: renderPicks,
  KW: KW,           // 👈 on expose ici aussi
  numFor: numFor    // 👈 idem
});
})();




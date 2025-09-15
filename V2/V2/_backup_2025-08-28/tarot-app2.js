/* /assets/js/tarot-app.js — propre, ES5+, sélection + flip 3D + galerie dos/faces */
(function(){
  "use strict";

  /* Expose très tôt pour éviter typeof undefined en cas d'erreur ultérieure */
  window.TAROT_APP = window.TAROT_APP || {};
  window.TAROT_APP_VERSION = 'v126';

  /* ===================== CONFIG ===================== */
  var CONFIG = window.TAROT_APP_CONFIG || {
    DICT_URL: "/assets/js/tarot_marseille_dictionnaire_fr_v1.json?v=1",
    containerId: "tarot-app",
    renderId: "out",
    majorsOnlyDefault: true,
    reversedDefault: false,
    spreadDefault: "3",          // "3" ou "croix"
    showFacesGallery: false,     // true pour afficher la galerie des 22 faces
    fallbackStyles: false        // 🔧 ne pas injecter de CSS de secours
  };
  window.TAROT_APP_CONFIG = CONFIG;

  // Détermine l’URL API par défaut si non fournie
  if (!CONFIG.API_URL) {
    CONFIG.API_URL =
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:3000/api/tarot/summarize'   // DEV
        : '/api/tarot/summarize';                       // PROD (reverse proxy)
  }
  // // PROD en dur si besoin :
  // CONFIG.API_URL = '/api/tarot/summarize';

  async function summarizeWithAI(question, drawn) {
    var cards = drawn.map(function(d){
      return {
        position: d.position,
        name:     d.card.name,
        number:   d.card.number,
        reversed: !!d.reversed,
        upright:     (d.card.upright  || []).slice(0, 3),
        reversed_kw: (d.card.reversed || []).slice(0, 3)
      };
    });

    var res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ question: question || '', cards: cards })
    });

    var data = null;
    try { data = await res.json(); } catch(_) {}

    if (!res.ok) {
      var msg = (data && (data.detail || data.error)) || res.statusText;
      throw new Error(("HTTP " + res.status + " " + (msg || "")).trim());
    }
    return data; // { ok:true, text:"..." }
  }

  /* ===================== HELPERS IMAGES ===================== */
  CONFIG.imageBase  = CONFIG.imageBase  || "/assets/img/tarot";
  CONFIG.imageExt   = CONFIG.imageExt   || "webp";
  CONFIG.imgVersion = CONFIG.imgVersion || "2025-08-24-1";

  function withV(u){
    return CONFIG.imgVersion ? u + (u.indexOf("?")>-1 ? "&" : "?") + "v=" + CONFIG.imgVersion : u;
  }
  function slug(s){
    s = (s || "").toLowerCase();
    try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g,""); } catch(_){}
    s = s.replace(/[’'"]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
    return s;
  }
  function pad2(n){ n = parseInt(n,10); return (n<10?"0":"")+n; }
  function fileNameFor(card){ return "majors/" + pad2(card.number) + "-" + slug(card.name) + "." + CONFIG.imageExt; }
  function imageUrlFor(card){ return withV(CONFIG.imageBase + "/" + fileNameFor(card)); }
  function fallbackUrlFor(card){ return withV(CONFIG.imageBase + "/majors/" + pad2(card.number) + "." + CONFIG.imageExt); }
  CONFIG.defaultBack = withV(CONFIG.imageBase + "/verso." + CONFIG.imageExt);
  function backUrlFor(){ return CONFIG.defaultBack; }

  /* ===================== DONNÉES ===================== */
  var SPREADS = {
    "3": ["Passé", "Présent", "Futur"],
    "croix": ["Pour", "Contre", "Synthèse", "Évolution", "Issue"]
  };
  var state = { deck:null, majors:[], all:[] };

  window.TAROT_STATE = state;  // debug global


  /* ===================== UTILS ===================== */
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, attrs, html){
    var n=document.createElement(tag),k; if(attrs){for(k in attrs) if(Object.prototype.hasOwnProperty.call(attrs,k)) n.setAttribute(k,attrs[k]);}
    if(html) n.innerHTML=html; return n;
  }
  function rand(n){ return Math.floor(Math.random()*n); }
  function sampleUnique(arr,k){ var c=arr.slice(), out=[], i; for(i=0;i<k&&c.length;i++) out.push(c.splice(rand(c.length),1)[0]); return out; }
  function esc(s){ s=(s==null?"—":String(s)); return s.replace(/[<>&]/g,function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c];}); }
  function pickKeywords(card, reversed, n){ n=n||3; var pool=reversed?(card.reversed||[]):(card.upright||[]); return pool.slice(0,n).join(", "); }
  
  function buildMajorsIndex(){
  state._majorsIndex = {};
  for (var i = 0; i < (state.majors || []).length; i++){
    var n = parseInt(state.majors[i].number, 10);
    if (!isNaN(n)) state._majorsIndex[n] = state.majors[i];
  }
}


  /* ===================== FLIP 3D HELPERS ===================== */
  function findFlipInner(node){
    var n=node; while(n && n.nodeType===1){ if(/\bflip3d-inner\b/.test(n.className)) return n; n=n.parentNode; }
    return null;
  }
  function findTile(node){
    var n=node; while(n && n.nodeType===1){ if(/\btile\b/.test(n.className)) return n; n=n.parentNode; }
    return null;
  }
  function shuffleInPlace(a){
    for (var i=a.length-1; i>0; i--){
      var j = Math.floor(Math.random()*(i+1));
      var t = a[i]; a[i]=a[j]; a[j]=t;
    }
    return a;
  }

  /* ===================== SÉLECTION MANUELLE ===================== */
  // état sélection : numéros + objets complets
var selectState = { nums: [], items: [] };


  function getSpreadLimit(){
    var c = document.getElementById(CONFIG.containerId) || document;
    var input = c.querySelector('input[name="spread"]:checked');
    return (input && input.value === "croix") ? 5 : 3;
  }
  function updateDeckCounter(){
    var limit = getSpreadLimit();
    var elc = document.getElementById("dos-count");
    if (elc) elc.textContent = selectState.nums.length + " / " + limit + " sélectionnée" + (limit>1?"s":"");
  }
  function clearSelection(){
  // 1) Reset état logique
  selectState.nums  = [];
  selectState.items = [];

  // 2) Nettoyage visuel : sélection
  var tiles = document.querySelectorAll('#dos .tile.selected');
  for (var i = 0; i < tiles.length; i++){
    tiles[i].classList.remove('selected');
  }

  // 3) Remettre les cartes en dos (flip 3D)
  var inners = document.querySelectorAll('#dos .flip3d-inner.is-flipped');
  for (var j = 0; j < inners.length; j++){
    inners[j].classList.remove('is-flipped');
  }

  // 4) Fallback ancien mode (images avec data-state)
  var imgs = document.querySelectorAll('#dos img.flip[data-state="front"]');
  for (var k = 0; k < imgs.length; k++){
    // si tu as encore revealCard(), on l'utilise pour rebasculer proprement
    if (typeof window.revealCard === 'function'){
      revealCard(imgs[k]);
    } else {
      // fallback très basique
      imgs[k].src = imgs[k].getAttribute('data-back') || imgs[k].src;
      imgs[k].setAttribute('data-state','back');
      var altFront = imgs[k].getAttribute('data-alt-front') || '';
      imgs[k].alt = 'Dos - ' + altFront;
    }
  }

  // 5) UI dérivée : compteur / barres / état disabled
  if (typeof updateDeckCounter === 'function')        updateDeckCounter();
  if (typeof updateSelectionBar === 'function')       updateSelectionBar();
  if (typeof updateDeckDisabledState === 'function')  updateDeckDisabledState();
}

  function updateDeckDisabledState(){
    var limit = getSpreadLimit();
    var atMax = (selectState.nums.length >= limit);
    var tiles = document.querySelectorAll('#dos .tile');
    for (var i = 0; i < tiles.length; i++){
      var t = tiles[i];
      if (t.classList.contains('selected')){
        t.classList.remove('disabled');
      } else if (atMax) {
        t.classList.add('disabled');
      } else {
        t.classList.remove('disabled');
      }
    }
  }
  function findMajorByNumber(n){
    var num = (typeof n === 'number') ? n : parseInt(n, 10);
    var arr = state.majors || [];
    for (var i = 0; i < arr.length; i++){
      if (parseInt(arr[i].number, 10) === num) return arr[i];
    }
    return null;
  }

  // flip (3D si possible, sinon échange src)
  window.revealCard = function(node){
    var inner = findFlipInner(node);
    if (inner){ inner.classList.toggle("is-flipped"); return; }
    var img = node;
    var st = img.getAttribute("data-state") || "back";
    if (st === "back"){
      img.src = img.getAttribute("data-front"); img.setAttribute("data-state","front");
      img.alt = img.getAttribute("data-alt-front") || img.alt;
    } else {
      img.src = img.getAttribute("data-back"); img.setAttribute("data-state","back");
      img.alt = "Dos - " + (img.getAttribute("data-alt-front") || "");
    }
  };

 // Sélection stricte d'une carte depuis le deck des dos
function toggleSelectFromImg(img, num){
  num = parseInt(num, 10);
  var limit = getSpreadLimit();

  var tile  = (typeof findTile === 'function') ? findTile(img) : (img && img.closest('.tile'));
  var inner = (typeof findFlipInner === 'function') ? findFlipInner(img) : null;

  // Si déjà sélectionnée -> on s'assure quand même que la face est visible
  if (selectState.nums.indexOf(num) !== -1){
    if (inner && !inner.classList.contains('is-flipped')){
      inner.classList.add('is-flipped');   // ← flip forcé
    }
    if (tile){ tile.style.outline='2px solid var(--accent)'; setTimeout(function(){ tile.style.outline=''; },220); }
    return;
  }

  if (selectState.nums.length >= limit){
    if (tile){ tile.style.outline='3px solid #d33'; setTimeout(function(){ tile.style.outline=''; },200); }
    return;
  }

  // Nouvelle sélection
  selectState.nums.push(num);
  var cardObj = state._majorsIndex ? state._majorsIndex[num] : findMajorByNumber(num);
  if (cardObj) selectState.items.push({ num:num, card:cardObj });

  if (tile) tile.classList.add('selected');

  // ✅ Flip immédiat
  if (inner && !inner.classList.contains('is-flipped')){
    inner.classList.add('is-flipped');
  }

  if (typeof updateDeckCounter === 'function') updateDeckCounter();
  if (typeof updateDeckDisabledState === 'function') updateDeckDisabledState();
}


  window.toggleSelectFromImg = toggleSelectFromImg;

  /* ===================== SYNTHÈSE ===================== */
  function buildSummary(spreadKey, question, drawn){
    var name = (spreadKey==="3") ? "3 cartes" : "Tirage en croix";
    var q = esc(question);
    var need = (spreadKey==="croix") ? 5 : 3;
    if (!drawn || drawn.length < need){
      return "<p><strong>Question :</strong> " + q + "</p>" +
             "<p style='color:#666'>Sélection incomplète : complète le tirage (" +
             (drawn?drawn.length:0) + "/" + need + ").</p>";
    }
    if (spreadKey==="3"){
      var p=drawn[0], pr=drawn[1], f=drawn[2];
      var tPast=pickKeywords(p.card,p.reversed), tNow=pickKeywords(pr.card,pr.reversed), tFut=pickKeywords(f.card,f.reversed);
      var lead=(tNow.split(", ")[0]||""), fut=(tFut.split(", ")[0]||"");
      var html="";
      html+="<p><strong>Question :</strong> "+q+"</p>";
      html+="<p><strong>Lecture :</strong> "+name+". Le passé met en lumière <em>"+tPast+"</em>. ";
      html+="Au présent, l’énergie dominante est <em>"+tNow+"</em>. ";
      html+="La tendance à venir indique <em>"+tFut+"</em>.</p>";
      html+="<p>Conseil : appuie-toi sur « "+lead+" » et oriente tes actions vers « "+fut+" ».</p>";
      html+='<p style="font-size:.9em;color:#666">Guidance non prédictive : libre arbitre, pas de conseil médical/juridique/financier.</p>';
      return html;
    } else {
      var tPour  = pickKeywords(drawn[0].card, drawn[0].reversed);
      var tContre= pickKeywords(drawn[1].card, drawn[1].reversed);
      var tSynth = pickKeywords(drawn[2].card, drawn[2].reversed);
      var tEvol  = pickKeywords(drawn[3].card, drawn[3].reversed);
      var tIssue = pickKeywords(drawn[4].card, drawn[4].reversed);
      var html2="";
      html2+="<p><strong>Question :</strong> "+q+"</p>";
      html2+="<p><strong>Lecture :</strong> "+name+"."+
             "<br><strong>Forces :</strong> <em>"+tPour+"</em>."+
             "<br><strong>Freins :</strong> <em>"+tContre+"</em>."+
             "<br><strong>Cœur du sujet :</strong> <em>"+tSynth+"</em>."+
             "<br><strong>Évolution :</strong> <em>"+tEvol+"</em>."+
             "<br><strong>Issue / conseil :</strong> <em>"+tIssue+"</em>.</p>";
      html2+='<p style="font-size:.9em;color:#666">Guidance non prédictive : libre arbitre, pas de conseil médical/juridique/financier.</p>';
      return html2;
    }
  }

 

  function renderCardsStrip(drawn, spreadKey){
    var positions = SPREADS[spreadKey] || [];
    var html = ['<ol class="draw-strip">'];
    for (var i = 0; i < drawn.length; i++){
      var d = drawn[i] || {};
      var card = d.card || {};
      var posLabel = positions[i] || d.position || ('Carte ' + (i+1));
      var rev = d.reversed ? ' (renversée)' : '';
      var rotate = d.reversed ? 'transform:rotate(180deg);' : '';
      var primary  = imageUrlFor(card);
      var fallback = fallbackUrlFor(card);
      html.push(
        '<li>',
          '<img src="', primary, '" alt="', esc(card.name||''), '" ',
                'loading="lazy" decoding="async" width="110" height="168" ',
                'style="', rotate, '" ',
                'onerror="this.onerror=null; this.src=\'', fallback, '\';">',
          '<div>',
            '<div><strong>', esc(posLabel), ' :</strong> ', esc(card.name||''), rev, '</div>'
      );
      if (CONFIG.showKeywordsInStrip){
        var kwords = pickKeywords(card, !!d.reversed, 3);
        html.push('<div class="kwords">', esc(kwords), '</div>');
      }
      html.push('</div>','</li>');
    }
    html.push('</ol>');
    return html.join('');
  }

  function render(drawn, spreadKey, question){
  try {
    var out = document.getElementById(CONFIG.renderId) || createRenderZone();

    // Injection : uniquement le bloc IA, pas de draw-strip
    out.innerHTML = [
      '<div class="ai-box is-loading">',
        '<div class="ai-head">',
          '<span class="ai-badge"><span class="ai-spinner"></span> IA</span>',
          '<span id="ai-status">Analyse en cours…</span>',
        '</div>',
        '<div id="ai-text"></div>',
      '</div>'
    ].join('');

    // --- Appel IA ---
    (function runAI(){
      var st  = document.getElementById('ai-status');
      var tx  = document.getElementById('ai-text');
      var box = out.querySelector('.ai-box');
      if (st)  st.textContent = 'Analyse en cours…';
      if (box) { box.classList.add('is-loading'); box.classList.remove('is-error','is-ready'); }

      summarizeWithAI(question, drawn)
        .then(function(data){
          if (tx)  tx.textContent = (data && data.text) ? data.text : '(pas de texte)';
          if (st)  st.textContent = 'Analyse prête';
          if (box) { box.classList.remove('is-loading'); box.classList.add('is-ready'); }
        })
        .catch(function(e){
          if (st)  st.textContent = 'Erreur IA : ' + e.message;
          if (box) { box.classList.remove('is-loading'); box.classList.add('is-error'); }
        });
    })();

  } catch(e){
    console.error('render() failed', e);
    var out2 = document.getElementById(CONFIG.renderId) || createRenderZone();
    out2.innerHTML = "<p style='color:#b00'>Erreur d’affichage du tirage.</p>";
  }
}


  /* ===================== TIRAGE ALÉATOIRE ===================== */
  function draw(spreadKey, allowReversed, majorsOnly){
    var count = (spreadKey==="3") ? 3 : 5;
    var pool = majorsOnly ? state.majors : state.all;
    var cards = sampleUnique(pool, count);
    var positions = SPREADS[spreadKey], i, arr=[];
    for(i=0;i<cards.length;i++){
      arr.push({ position: positions[i], card: cards[i], reversed: allowReversed ? Math.random()<0.5 : false });
    }
    return arr;
  }

  /* ===================== UI : CONTENEUR / PLACEMENT ===================== */
  function ensureContainer(){
    var container = $("#"+CONFIG.containerId);
    if(!container){
      container = el("div",{id:CONFIG.containerId,style:"max-width:720px;margin:1rem auto;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif"});
      document.body.appendChild(container);
    }
    // Anti-doublons : on ne déplace pas #controls si déjà existant ailleurs
    (function(){
      var outs = document.querySelectorAll("#"+CONFIG.renderId);
      if (outs.length){
        var container = document.getElementById(CONFIG.containerId);
        if (container && !container.contains(outs[0])) container.appendChild(outs[0]);
        for (var j=1;j<outs.length;j++){ if (outs[j].parentNode) outs[j].parentNode.removeChild(outs[j]); }
      }
    })();
    if(!$("#"+CONFIG.renderId,container)){
      container.appendChild(el("div",{id:CONFIG.renderId,style:"margin-top:1rem"}));
    }
    if(!$("#controls",container)){
      var chk3=(CONFIG.spreadDefault==="3")?" checked":""; var chkC=(CONFIG.spreadDefault==="croix")?" checked":"";
      var chkR=CONFIG.reversedDefault?" checked":""; var chkM=CONFIG.majorsOnlyDefault?" checked":"";
      var html="";
      html+='<div id="controls">';
      
      html+='<label style="display:block;margin:.4rem 0 .2rem">Question :</label>';
      html+='<input id="q" type="text" placeholder="Ex : Changer de travail d\'ici 6 mois ?" style="width:100%;padding:.6rem;margin:0 0 .4rem;border:1px solid #ccc;border-radius:8px">';
      html+='<div style="display:flex;gap:.8rem;flex-wrap:wrap;margin:.4rem 0">';
      html+='<label><input type="radio" name="spread" value="3"'+chk3+'> 3 cartes</label>';
      html+='<label><input type="radio" name="spread" value="croix"'+chkC+'> Tirage en croix (5 cartes)</label>';
      html+='<label><input id="rev" type="checkbox"'+chkR+'> Renversées possibles</label>';
      html+='<label><input id="maj" type="checkbox"'+chkM+'> Majeurs uniquement</label>';
      html+='</div>';
      html+='<button id="draw" style="padding:.6rem 1rem;border:1px solid #ccc;border-radius:8px;cursor:pointer">Tirer et synthétiser</button>';
      html+='</div>';
      container.insertAdjacentHTML("afterbegin", html);
    }
    return container;
  }

  function placeUnderAvis(container){
  function findAvis(){
    return document.querySelector('#avis, [data-section="avis"], .avis, #reviews, .reviews, #testimonials, .testimonials');
  }
  function doPlace(anchor){
    var section = document.getElementById('tirage');
    if (!section) { section = document.createElement('section'); section.id = 'tirage'; section.className = 'container'; document.body.appendChild(section); }
    if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(section, anchor.nextSibling); }
    var card = section.querySelector('.tarot-card') || section.querySelector('.card');
    if (!card) { card = document.createElement('div'); card.className = 'card tarot-card'; section.appendChild(card); }
    var head = card.querySelector('.card__head'); if (head && head.parentNode) head.parentNode.removeChild(head);
    if (!card.contains(container)) card.appendChild(container);
  }
  var anchor = findAvis();
  if (anchor) doPlace(anchor);
  else {
    var mo = new MutationObserver(function(){
      var a = findAvis();
      if (a) { doPlace(a); mo.disconnect(); }
    });
    mo.observe(document.body, { childList:true, subtree:true });
  }
}

function createRenderZone(){ ensureContainer(); return $("#"+CONFIG.renderId); }

function mountControlsUnderDosHero(){
  var controls = document.getElementById("controls");
  var drawBtn  = document.getElementById("draw");
  var dosCard  = document.querySelector("#dos .tarot-backs");
  var hero     = document.querySelector("#dos .tg-hero");
  var grid     = document.querySelector("#dos .tg-grid");
  if (!controls || !dosCard || !hero || !grid) return;

  // --- zone "haut" : Question + options ---
  var topSlot = document.getElementById("dos-controls-slot");
  if (!topSlot){
    topSlot = document.createElement("div");
    topSlot.id = "dos-controls-slot";
    topSlot.className = "dos-controls";
  }
  if (grid.parentNode) dosCard.insertBefore(topSlot, grid);
  if (!topSlot.contains(controls)) topSlot.appendChild(controls);

  // --- zone "bas" : bouton sous la grille ---
  var actions = document.getElementById("dos-actions");
  if (!actions){
    actions = document.createElement("div");
    actions.id = "dos-actions";
    actions.className = "dos-actions";
  }
  if (grid.parentNode && grid.nextSibling){
    dosCard.insertBefore(actions, grid.nextSibling);
  } else {
    dosCard.appendChild(actions);
  }
  if (drawBtn && !actions.contains(drawBtn)) actions.appendChild(drawBtn);

  // crée la zone résultats (sous le bouton) si absente
  ensureDosResultZone();

  // (ré)attache les listeners
  attach();
}

function ensureDosResultZone(){
  var dosCard  = document.querySelector("#dos .tarot-backs");
  if (!dosCard) return null;

  var actions = document.getElementById("dos-actions");
  if (!actions){
    actions = document.createElement("div");
    actions.id = "dos-actions";
    actions.className = "dos-actions";
    dosCard.appendChild(actions);
  }

  // zone résultats juste après le bouton
  var result = document.getElementById("dos-result");
  if (!result){
    result = document.createElement("div");
    result.id = "dos-result";
    result.className = "dos-result";
    if (actions.nextSibling) dosCard.insertBefore(result, actions.nextSibling);
    else dosCard.appendChild(result);
  }
  return result;
}

// strip compact (côte à côte) pour les cartes tirées
function renderDrawnStripInDos(drawn, spreadKey){
  var host = ensureDosResultZone();
  if (!host || !drawn || !drawn.length) return;

  var positions = (typeof SPREADS !== 'undefined' && SPREADS[spreadKey]) ? SPREADS[spreadKey] : [];
  var html = ['<ol class="draw-strip drawn-strip">'];

  for (var i=0;i<drawn.length;i++){
    var d = drawn[i] || {};
    var c = d.card || {};
    var label = positions[i] || d.position || ('Carte ' + (i+1));
    var rotate = d.reversed ? 'transform:rotate(180deg);' : '';
    var src = (typeof imageUrlFor === 'function') ? imageUrlFor(c) : '';
    var fb  = (typeof fallbackUrlFor === 'function') ? fallbackUrlFor(c) : src;

    html.push(
      '<li>',
        '<img src="', src, '" alt="', esc(c.name||''), '" loading="lazy" decoding="async" width="160" height="244" ',
        'style="', rotate, '" onerror="this.onerror=null; this.src=\'', fb, '\';">',
        '<div class="meta">',
          '<div class="pos">', esc(label), d.reversed?' (renversée)':'', '</div>',
          '<div class="name">', esc(c.name||''), '</div>',
        '</div>',
      '</li>'
    );
  }

  html.push('</ol>');
  host.innerHTML = html.join('');
}


function enforceDosHeroStyle(){
  var t = document.querySelector('#dos .tg-title');
  var s = document.querySelector('#dos .tg-sub');
  if (t){
    t.style.setProperty('color', '#fff', 'important');
    t.style.setProperty('-webkit-text-fill-color', '#fff', 'important'); // Safari
    t.style.fontFamily = 'Fraunces,Georgia,serif';
    t.style.fontWeight = '800';
    t.style.letterSpacing = '.02em';
    t.style.textShadow = '0 2px 10px rgba(0,0,0,.25)';
  }
  if (s){
    s.style.setProperty('color', '#fff', 'important');
    s.style.setProperty('-webkit-text-fill-color', '#fff', 'important');
    s.style.fontFamily = 'Inter,system-ui,Arial,sans-serif';
    s.style.fontWeight = '500';
  }
}



  /* ===================== DOS (SELECTION + FLIP 3D) ===================== */
  function renderBacksDeck(){
  var majors = (state.majors || []).slice();
  if (!majors.length) return;

  // ordre aléatoire
  for (var i = majors.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = majors[i]; majors[i] = majors[j]; majors[j] = t;
  }

  // ancre
  var after   = document.getElementById('tirage') || document.body;
  var section = document.getElementById('dos');
  if (!section) {
    section = document.createElement('section');
    section.id = 'dos';
    section.className = 'container';
  }
  if (!section.parentNode) {
    if (after && after.parentNode) after.parentNode.insertBefore(section, after.nextSibling);
    else document.body.appendChild(section);
  }

  // carte conteneur
  var card = section.querySelector('.card.tarot-backs');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card tarot-backs';
    section.appendChild(card);
  }

  // CSS de secours (inclut les règles flip3d manquantes)
  if (CONFIG.fallbackStyles !== false && !document.getElementById('tarot-backs-css')) {
    var css = document.createElement('style'); css.id = 'tarot-backs-css';
    css.textContent =
      '#dos .tarot-backs{background:rgba(10,30,60,.65);border:1px solid rgba(255,255,255,.25);box-shadow:0 10px 24px rgba(0,0,0,.25);padding:20px;margin:20px auto;border-radius:18px}'
      + '#dos .tg-hero{text-align:center;margin:0 0 12px;padding:6px 0}'
      + '#dos .tg-title{margin:0;font:800 clamp(28px,4vw,42px)/1.1 Fraunces,Georgia,serif;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.25)}'
      + '#dos .tg-sub{margin:6px 0 0;font:500 14px/1.4 Inter,system-ui,Arial;color:#fff;opacity:.95}'
      + '#dos .tg-grid{display:grid;grid-template-columns:repeat(auto-fill,110px);justify-content:center;gap:8px}'
      + '#dos figure{margin:0;padding:0;background:transparent}'
      + '#dos .tile{width:110px;aspect-ratio:21/32;border-radius:8px;overflow:hidden;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;position:relative}'
      + '#dos .tile:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.08)}'
      + '.tile.flip3d{perspective:800px}'
      + '.flip3d-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .5s ease}'
      + '.flip3d-inner.is-flipped{transform:rotateY(180deg)}'
      + '.flip3d .face{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;backface-visibility:hidden}'
      + '.flip3d .face.front{transform:rotateY(180deg)}'
      + '#dos .tile.selected{outline:3px solid var(--accent);box-shadow:0 0 0 4px rgba(163,77,87,.2)}'
      + '#dos .tile.disabled{filter:grayscale(.25) saturate(.6);opacity:.55;cursor:not-allowed}';
    document.head.appendChild(css);
  }

  // HTML
  var html = '';
  html += '<div class="tg-head tg-hero">';
html +=   '<h2 class="tg-title" style="color:#fff!important;font:800 clamp(28px,4vw,42px)/1.1 Fraunces,Georgia,serif!important;letter-spacing:.02em;text-shadow:0 2px 10px rgba(0,0,0,.25)">TIRAGE IA</h2>';
html +=   '<p class="tg-sub" style="color:#fff!important;opacity:.95;font:500 14px/1.4 Inter,system-ui,Arial!important">Amusez-vous à découvrir les cartes grâce à l’IA</p>';
html += '</div>';


  html += '<div class="tg-grid" style="display:grid;grid-template-columns:repeat(auto-fill,110px);justify-content:center;gap:8px">';
  for (var k = 0; k < majors.length; k++){
    var c = majors[k];
    var face = imageUrlFor(c);
    var back = backUrlFor(c);
    html += ''
    + '<figure data-num="'+c.number+'" style="margin:0;padding:0;background:transparent">'
      + '<div class="tile flip3d"'
           + ' style="width:110px;aspect-ratio:21/32;border-radius:8px;overflow:hidden;cursor:pointer;'
           + '        transition:transform .12s ease,box-shadow .12s ease;position:relative;perspective:800px">'
        + '<div class="flip3d-inner"'
             + ' style="position:relative;width:100%;height:100%;transform-style:preserve-3d;'
             + '        transition:transform .5s ease"'
             + ' onclick="toggleSelectFromImg(this.querySelector(\'.face.front\'),'+c.number+')">'
          + '<img class="face back" src="'+back+'" alt="Dos - '+esc(c.name)+'" loading="lazy" decoding="async"'
               + ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
               + '        backface-visibility:hidden;display:block;">'
          + '<img class="face front" src="'+face+'" alt="'+esc(c.name)+'" loading="lazy" decoding="async"'
               + ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
               + '        backface-visibility:hidden;display:block;transform:rotateY(180deg);">'
        + '</div>'
      + '</div>'
    + '</figure>';
}
  html += '</div>';

  card.innerHTML = html;
  
  enforceDosHeroStyle();


  // repositionne les contrôles + état
  if (typeof mountControlsUnderDosHero === 'function') mountControlsUnderDosHero();
  if (typeof updateDeckDisabledState === 'function') updateDeckDisabledState();
}

var inj = document.getElementById('tarot-backs-css');
if (inj) inj.remove();

  function placeDosAboveTirage(){
    var dos    = document.getElementById('dos');
    var tirage = document.getElementById('tirage');
    if (dos && tirage && tirage.parentNode){
      tirage.parentNode.insertBefore(dos, tirage);
    }
  }

  /* ===================== GALERIE FACES (optionnelle) ===================== */
  function renderMajorsGallery(){
    if (!CONFIG.showFacesGallery) return;
    var majors = (state.majors && state.majors.length) ? state.majors.slice() : [];
    if (!majors.length) return;

    function findAvis(){
      return document.querySelector("#avis, [data-section='avis'], .avis, #reviews, .reviews, #testimonials, .testimonials");
    }
    var afterNode = document.getElementById("tirage") || findAvis();

    var section = document.getElementById("galerie");
    if (!section) { section = document.createElement("section"); section.id="galerie"; section.className="container"; }
    if (afterNode && afterNode.parentNode) {
      if (section.previousSibling !== afterNode) afterNode.parentNode.insertBefore(section, afterNode.nextSibling);
    } else if (!section.parentNode) {
      document.body.appendChild(section);
    }

    var card = section.querySelector(".card.tarot-gallery");
    if (!card) { card = document.createElement("div"); card.className="card tarot-gallery"; section.appendChild(card); }

    if (!document.getElementById("tarot-gallery-css")){
      var css = document.createElement("style"); css.id="tarot-gallery-css";
      css.textContent =
        "#galerie .tarot-gallery{margin-top:24px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px}"+
        "#galerie .tg-head{margin:0 0 12px}"+
        "#galerie .tg-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}"+
        "@media (max-width:1100px){#galerie .tg-grid{grid-template-columns:repeat(4,1fr)}}" +
        "@media (max-width:720px){#galerie .tg-grid{grid-template-columns:repeat(3,1fr)}}" +
        "#galerie figure{margin:0;padding:0;border:0;background:transparent}"+
        "#galerie .tile{position:relative;aspect-ratio:21/32;border-radius:8px;overflow:hidden}"+
        "#galerie .tile>img{width:100%;height:100%;display:block;object-fit:cover}";
      document.head.appendChild(css);
    }

    majors.sort(function(a,b){ return a.number - b.number; });
    var html = '';
    html += '<div class="tg-head"><h3 style="margin:0">Arcanes majeurs</h3></div>';
    html += '<div class="tg-grid">';
    for (var i=0;i<majors.length;i++){
      var c = majors[i];
      var url = imageUrlFor(c);
      html += '<figure><div class="tile"><img src="'+url+'" alt="'+esc(c.name)+'" loading="lazy" decoding="async" onclick="zoomCard(\''+url+'\')"></div></figure>';
    }
    html += '</div>';
    card.innerHTML = html;
  }
  
  function getCardByNumber(num){
  num = parseInt(num,10);
  // dictionnaire rapide par numéro
  if (!state._numIndex){
    state._numIndex = {};
    var src = (state.majors && state.majors.length) ? state.majors : state.all;
    for (var i=0;i<src.length;i++){
      var n = parseInt(src[i].number,10);
      if (!isNaN(n)) state._numIndex[n] = src[i];
    }
  }
  return state._numIndex[num] || null;
}


  /* ===================== ATTACH (événements) ===================== */
  function attach(){
  var btn = document.getElementById("draw");
  if (!btn) return;
  btn.disabled = false;

  btn.addEventListener("click", function (){
    var qEl = document.getElementById("q");
    var q = qEl && qEl.value ? qEl.value.trim() : "";

    var spreadInput   = document.querySelector('input[name="spread"]:checked');
    var spreadKey     = (spreadInput && spreadInput.value) ? spreadInput.value : "3";
    var allowReversed = !!document.getElementById("rev") && document.getElementById("rev").checked;
    var mjEl          = document.getElementById("maj");
    var majorsOnly    = (mjEl && typeof mjEl.checked !== "undefined") ? mjEl.checked : CONFIG.majorsOnlyDefault;

    var limit = (spreadKey === "croix") ? 5 : 3;
    var drawn = null;

    // 1) Tirage strict à partir des cartes VRAIMENT sélectionnées (ordre de clic)
    if (selectState.items && selectState.items.length){
      if (selectState.items.length !== limit){
        alert("Sélectionne exactement " + limit + " carte" + (limit>1?"s":"") +
              " (actuellement : " + selectState.items.length + ").");
        return;
      }
      var positions = SPREADS[spreadKey];
      drawn = [];
      for (var i = 0; i < selectState.items.length; i++){
        drawn.push({
          position: positions[i],
          card:     selectState.items[i].card,
          reversed: allowReversed ? Math.random() < 0.5 : false
        });
      }
    }

    // 2) Sinon tirage aléatoire
    if (!drawn || !drawn.length){
      drawn = draw(spreadKey, allowReversed, majorsOnly);
    }

    // 3) Rendus
    render(drawn, spreadKey, q);
    if (typeof renderDrawnStripInDos === "function") renderDrawnStripInDos(drawn, spreadKey);

    // 4) Reset
    if (typeof clearSelection === "function") clearSelection();
    if (typeof updateDeckDisabledState === "function") updateDeckDisabledState();
  });

  // changer de tirage → reset sélection + compteur
  var radios = document.querySelectorAll('input[name="spread"]');
  for (var r=0; r<radios.length; r++){
    radios[r].addEventListener("change", function(){
      clearSelection();
      updateDeckCounter();
    });
  }
}


  /* ===================== LOAD DECK ===================== */
  function loadDeck(){
  var out = createRenderZone();
  return fetch(CONFIG.DICT_URL, { cache: "no-store" })
    .then(function(res){ if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
    .then(function(txt){
      var deck;
      try { deck = JSON.parse(txt); }
      catch(e){ console.error("JSON parse failed ❌", e.message, "\nFirst 300:", txt.slice(0,300)); throw e; }
      if (!deck || !Array.isArray(deck.cards)) throw new Error("Structure inattendue: deck.cards absent");
      return deck;
    })
    .then(function(deck){
      state.deck   = deck;
      state.all    = deck.cards;
      state.majors = state.all.filter(function(c){ return c.arcana === "majeur"; });
      buildMajorsIndex();
      window.TAROT_DECK = deck;
      console.info("Deck OK ✅", { total: state.all.length, majors: state.majors.length });
        // 🔎 export debug
  window.TAROT_STATE = state;

      // 🔵 construit l’index des majeurs pour les sélections
      

      try {
        if (!window._dosRendered) { renderBacksDeck(); window._dosRendered = true; }
        placeDosAboveTirage();
        if (CONFIG.showFacesGallery && typeof renderMajorsGallery === "function") { renderMajorsGallery(); }
        
      } catch (uiErr) {
        console.error("[UI] init failed ❌", uiErr && (uiErr.stack || uiErr));
        out.insertAdjacentHTML("beforeend","<p style='color:#b00'>Erreur d’interface (le dictionnaire est bien chargé).</p>");
      }
      return true;
    })
    .catch(function(e){
      console.error("Deck load failed ❌", e && (e.stack || e));
      out.insertAdjacentHTML("beforeend","<p style='color:#b00'>Erreur de chargement du dictionnaire.</p>");
      return false;
    });
}


  // --- Exports publics (UNE SEULE FOIS) ---
  window.TAROT_APP = window.TAROT_APP || {};
  if (typeof renderBacksDeck === 'function' && !window.TAROT_APP.renderBacksDeck) window.TAROT_APP.renderBacksDeck = renderBacksDeck;
  if (typeof placeDosAboveTirage === 'function' && !window.TAROT_APP.placeDosAboveTirage) window.TAROT_APP.placeDosAboveTirage = placeDosAboveTirage;
  if (typeof clearSelection === 'function' && !window.TAROT_APP.clearSelection) window.TAROT_APP.clearSelection = clearSelection;
  window.renderBacksDeck = window.TAROT_APP.renderBacksDeck;
  window.placeDosAboveTirage = window.TAROT_APP.placeDosAboveTirage;

  /* ===================== BOOTSTRAP ===================== */
  function bootstrap(){
    var container = ensureContainer();
    placeUnderAvis(container);
    attach();
    loadDeck();

    // Lightbox (zoom) minimal
    if (!document.getElementById("tarot-zoom-dialog")){
      var dlg=document.createElement("dialog"); dlg.id="tarot-zoom-dialog";
      dlg.style.cssText="padding:0;border:none;background:transparent";
      dlg.innerHTML='<img id="tarot-zoom-img" style="max-width:90vw;max-height:90vh;border-radius:12px;display:block">';
      dlg.addEventListener("click",function(){ dlg.close(); });
      document.body.appendChild(dlg);
      window.zoomCard = function(src){ $("#tarot-zoom-img").src=src; dlg.showModal(); };
    }
  }
  if (document.readyState === "loading"){ document.addEventListener("DOMContentLoaded", bootstrap); }
  else { bootstrap(); }

  /* ===================== CONSOLE API (optionnel) ===================== */
  window.TAROT_APP = window.TAROT_APP || {};
  TAROT_APP.setImageBase = function(v){ CONFIG.imageBase=v; console.info("imageBase =",v); };
  TAROT_APP.setImageExt  = function(v){ CONFIG.imageExt=v;  console.info("imageExt  =",v); };
  TAROT_APP.urlFor       = function(n){
    var c=(state.majors||[]).find(function(x){return +x.number===+n;});
    return c ? imageUrlFor(c) : null;
  };
  TAROT_APP.draw = function(){ var b=document.getElementById("draw"); if(b) b.click(); };

})();

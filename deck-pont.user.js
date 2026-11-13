// ==UserScript==
// @name         DECK 2 — pont
// @namespace    deck2.local
// @version      1.5.0
// @updateURL    https://raw.githubusercontent.com/Shinsudo/dreadcast-scripts/main/deck-pont.meta.js
// @downloadURL  https://raw.githubusercontent.com/Shinsudo/dreadcast-scripts/main/deck-pont.user.js
// @description  Lit ce que TU ouvres dans Dreadcast et le transmet à DECK 2 ; panneau « Aujourd’hui » et recherche dans DECK. Aucun clic, aucun envoi, aucune requête.
// @match        https://www.dreadcast.net/*
// @match        https://dreadcast.net/*
// @match        https://www.dreadcast.eu/*
// @match        https://dreadcast.eu/*
// @match        file:///*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// ==/UserScript==
/* Contrat : deck/docs/PROTOCOLE-PONT.md (version 2). Règles (CGU Dreadcast) : le script ne clique jamais, n'envoie
   rien au serveur, ne fait aucune requête et n'appelle aucune fonction du jeu. Il LIT ce qui est affiché quand un
   événement le justifie (réponse du jeu, fenêtre ouverte, nouvelle ligne du chat) ; au repos, aucun lecteur ne tourne.
   Sections : 1 stockage · 2 relais DECK (file://) · 3 outils · 4 lecteurs · 5 captures et diagnostic ·
   6 déclencheurs · 7 passerelle DC Confort · 8 rappels et scène · 9 panneau · 10 démarrage. */
(function () {
  "use strict";
  var VERSION = "1.5.0";
  var W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  /* ================= 1. Stockage GM (clés d2.*) ================= */
  var G = {
    get: function (k, d) { var v = GM_getValue(k); return v === undefined ? d : v; },
    set: function (k, v) { GM_setValue(k, v); },
    del: function (k) { GM_deleteValue(k); },
    cles: function () { return GM_listValues(); },
    ecoute: function (k, fn) { GM_addValueChangeListener(k, fn); }
  };
  // Signal interne au script : écrit après chaque capture ou geste, écouté par le relais (on ne peut pas écouter « d2.c.* »)
  var SIGNAL = "d2.signal";
  function alea() { return Math.random().toString(36).slice(2, 8); }

  /* ================= 2. Relais côté DECK (page file:// avec <meta name="deck-app" content="2">) ================= */
  var meta = document.querySelector('meta[name="deck-app"]');
  if (meta) { if (meta.getAttribute("content") === "2") relais(); return; } // une autre version de DECK : rien
  if (location.protocol === "file:" && !W.D2_BANC) return; // un autre fichier local : rien

  function relais() {
    var minuterie = null;
    function poster(m) { window.postMessage(m, "*"); }
    function envoyer() {
      clearTimeout(minuterie);
      minuterie = setTimeout(function () {
        var c = [], a = [];
        G.cles().forEach(function (k) {
          if (k.indexOf("d2.c.") === 0) { var v = G.get(k); if (v) c.push(v); }
          else if (k.indexOf("d2.a.") === 0) { var w = G.get(k); if (w) a.push(w); }
        });
        if (c.length) poster({ deck2: "captures", liste: c });
        if (a.length) poster({ deck2: "actions", liste: a });
      }, 150);
    }
    window.addEventListener("message", function (e) {
      if (e.source !== W && e.source !== window) return; // seulement la page DECK elle-même
      var m = e.data; if (!m || typeof m !== "object" || typeof m.deck2 !== "string") return;
      if (m.deck2 === "recu" && Array.isArray(m.ids)) {
        // Effacement seulement de ce que DECK a reçu : une capture déposée entre-temps reste dans sa propre clé
        m.ids.forEach(function (id) { id = String(id); if (/^c_/.test(id)) G.del("d2.c." + id); else if (/^a_/.test(id)) G.del("d2.a." + id); });
        // Le bilan de chaque capture (pris, ce que DECK en a tiré) : le panneau en jeu le montre, preuve que DECK l'a bien
        if (Array.isArray(m.bilans) && m.bilans.length) {
          var now = Date.now(), neufs = m.bilans.filter(function (b) { return b && typeof b.id === "string"; }).map(function (b) {
            return { id: b.id.slice(0, 40), type: String(b.type || "").slice(0, 20), at: +b.at || 0, ok: b.ok !== false, texte: String(b.texte || "").slice(0, 120), recu: now };
          });
          var vieux = (G.get("d2.recus", null) || {}).liste || [];
          G.set("d2.recus", { v: 1, liste: neufs.reverse().concat(vieux).slice(0, 40) });
        }
      } else if (m.deck2 === "plan" || m.deck2 === "annuaire" || m.deck2 === "vie" || m.deck2 === "secteur" || m.deck2 === "guide") {
        if (m.donnees && typeof m.donnees === "object") G.set("d2." + m.deck2, m.donnees);
      } else if (m.deck2 === "ping") {
        poster({ deck2: "bonjour", version: VERSION, diag: G.get("d2.diag", null) });
        envoyer();
      }
    });
    G.ecoute(SIGNAL, envoyer);
    setInterval(envoyer, 15000); // secours si un signal s'est perdu (onglet DECK endormi)
    window.addEventListener("pagehide", function () { var v = G.get("d2.vie", null); if (v) { v.at = 0; G.set("d2.vie", v); } });
    // DECK a peut-être déjà envoyé son « ping » avant que le script ne tourne : on se présente de soi-même
    poster({ deck2: "bonjour", version: VERSION, diag: G.get("d2.diag", null) });
    envoyer();
  }

  /* ================= 3. Outils ================= */
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function net(s) { return String(s == null ? "" : s).replace(/[\s  ]+/g, " ").trim(); }
  function tx(el) { return el ? net(el.textContent) : ""; }
  function visible(el) { return !!(el && el.isConnected && el.getClientRects().length); }
  function chemin() { return (W.D2_BANC && W.D2_BANC.chemin) || location.pathname; }
  function surMain() { return /^\/Main/i.test(chemin()) || !!(W.D2_BANC && W.D2_BANC.main); }
  function surForum() { return /^\/Forum/i.test(chemin()); }
  // Une erreur explicite : le lecteur est « en panne » (le repère attendu manque), pas « rien à lire »
  function exiger(v, quoi) { if (!v) throw new Error("repère manquant : " + quoi); return v; }
  function param(url, k) { var m = String(url || "").match(new RegExp("[?&]" + k + "=([^&]*)")); return m ? decodeURIComponent(m[1]) : ""; }
  // Nombre affiché par le jeu : point des milliers, virgule décimale (« 1.234.567 Cr » → 1234567, « 12,5 % » → 12.5)
  function nombre(s) {
    var t = String(s == null ? "" : s).replace(/[\s  .]/g, "").replace(/[^\d,\-]/g, "");
    if (!/\d/.test(t)) return null; var v = parseFloat(t.replace(",", ".")); return isFinite(v) ? v : null;
  }
  // Texte avec ses retours à la ligne : <br> → \n, blocs séparés (sert aussi au XML de ReadMessage, sans innerText)
  function texteSauts(n) {
    var out = "";
    (function marche(x) {
      for (var c = x.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3 || c.nodeType === 4) out += c.nodeValue;
        else if (c.nodeType === 1) {
          var t = c.nodeName.toUpperCase();
          if (t === "BR") { out += "\n"; continue; }
          if (t === "SCRIPT" || t === "STYLE" || t === "TEXTAREA") continue;
          var bloc = /^(DIV|P|LI|UL|OL|BLOCKQUOTE|H[1-6]|TR|TABLE)$/.test(t);
          if (bloc && out && out.slice(-1) !== "\n") out += "\n";
          marche(c);
          if (bloc && out.slice(-1) !== "\n") out += "\n";
        }
      }
    })(n);
    return out.replace(/<br\s*\/?>/gi, "\n").replace(/[ \t  ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function domDe(html) { return new DOMParser().parseFromString(String(html || ""), "text/html"); } // document inerte
  function xmlDe(t) { var d = new DOMParser().parseFromString(String(t || ""), "text/xml"); return d.querySelector("parsererror") ? null : d; }
  function signature(o) { var t = JSON.stringify(o), h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return t.length + ":" + h; }
  function plier(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }

  /* --- Heure du serveur (en-tête Date des réponses du jeu) --- */
  var ecart = 0;
  function maintenant() { return Date.now() + ecart; }
  var fmtHeure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  var fmtJour = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  function isoParis(ms) { return fmtJour.format(new Date(ms)); }
  function minutesParis(ms) { var p = fmtHeure.format(new Date(ms)).split(":"); return +p[0] * 60 + +p[1]; }
  function ilYa(ms) {
    var m = Math.round((maintenant() - ms) / 60000);
    return m < 1 ? "à l’instant" : m < 60 ? "il y a " + m + " min" : m < 1440 ? "il y a " + Math.round(m / 60) + " h" : "il y a " + Math.round(m / 1440) + " j";
  }
  function versionJeu() { var s = $$("script[src]").map(function (x) { return x.getAttribute("src"); }).filter(function (u) { return /ingame[^/]*\.js/i.test(u); })[0] || ""; return (s.match(/(\d+\.\d+(?:\.\d+)?)/) || [])[1] || ""; }

  /* --- Portrait : recopié depuis l'image affichée (même origine, aucune requête), 96 px au plus --- */
  function portrait(img) {
    if (!img || !img.complete || !img.naturalWidth || /\/default\.png/i.test(img.getAttribute("src") || "")) return "";
    var k = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    try { c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/png"); }
    catch (e) { console.warn("DECK 2 › portrait illisible (autre origine)", e); return ""; }
  }

  /* ================= 4. Lecteurs =================
     { nom, verifie: "AAAA-MM-JJ"|null, quand: [motifs d'URL ajax], present: sélecteur, lire() }
     « verifie » : date du dernier relevé du DOM réel (DOM-JEU.md ou relevé en jeu) ; null = à vérifier en jeu.
     observer : nœuds dont une mutation relance ce seul lecteur ; fenetre : relu quand une fenêtre s'ouvre ;
     page : "main" (/Main) ou "forum". lire() rend null s'il n'y a rien à lire, jette une erreur si un repère manque. */
  var memoire = { cristaux: null, entreprise: null, oi: {}, lu: {}, chatVus: new Set(), chatOrdre: [], chatLu: false };

  // --- Chat ---
  // Ligne : div.msg > span.c<Nom>.link.linkable[alt=id] « : » span.white (parole) ; div.msg > em.c<Nom> (action) ;
  // adressée : div.couleur4.msg, nom « Auteur@Cible », texte en span.couleur4 ; voix basse .couleur5, cri .couleur_rouge ;
  // pas de classe HRP (DOM-JEU §4) : le hors-jeu est une parenthèse en tête ; un dé : « X lance N dé(s) de M et fait R ».
  var RE_DES = /^(.+?) lance (\d+) dés? de (\d+) et fait (\d+)/;
  var CLASSES_JEU = /^(couleur\d*|couleur_\w+|link|linkable|semi_transparent|dcc-\S*|fkTip\d*)$/;
  function nomClasse(el) { // class="cUn inconnu" → « Un inconnu » (le nom passe tel quel dans la classe)
    var c = String(el.className || "").split(/\s+/).filter(function (x) { return x && !CLASSES_JEU.test(x); }).join(" ");
    return /^c./.test(c) ? c.slice(1) : "";
  }
  function conteneurChat() {
    var a = $("#chat_preview .chatContent"), b = $("#chatContent");
    return a && a.querySelector(":scope > div.msg") ? a : b && b.querySelector(":scope > div.msg") ? b : a || b;
  }
  function ligneChat(m) {
    var cl = " " + (m.className || "") + " ", mo = $(".moment", m), hm = /(\d{1,2}):(\d{2})/.exec(tx(mo));
    var heure = hm ? ("0" + hm[1]).slice(-2) + ":" + hm[2] : "";
    var lien = m.querySelector(":scope > .linkable"), em = m.querySelector(":scope > em"); // un lien d'objet dans le texte n'est pas l'auteur
    var corps = $("span.white", m) || $(":scope > span.couleur4:not(.linkable)", m);
    var sansHeure = function (s) { return mo ? s.replace("[" + tx(mo) + "]", "").replace(tx(mo), "").trim() : s; };
    var qui = "", texte = "", genre;
    var brutEm = em ? sansHeure(tx(em)) : "", de = RE_DES.exec(brutEm);
    if (de) return { heure: heure, qui: de[1], a: "", texte: "lance " + de[2] + " dé" + (+de[2] > 1 ? "s" : "") + " de " + de[3] + " et fait " + de[4], genre: "des", pid: "" };
    if (lien) { qui = tx(lien); texte = corps ? tx(corps) : sansHeure(tx(m)).slice(qui.length).replace(/^\s*:\s*/, ""); genre = "parole"; }
    else if (em) {
      qui = nomClasse(em); texte = brutEm; genre = "action";
      if (qui && texte.toLowerCase().indexOf(qui.toLowerCase()) === 0) texte = texte.slice(qui.length).trim();
    } else { texte = sansHeure(tx(m)); genre = "jeu"; }
    if (/^\(/.test(texte)) genre = "horsjeu";
    if (/ couleur5 /.test(cl)) genre = "murmure"; else if (/ couleur_rouge /.test(cl)) genre = "cri"; // la voix l'emporte
    var at = qui.indexOf("@"), a = "";
    if (at > 0) { a = qui.slice(at + 1).trim(); qui = qui.slice(0, at).trim(); }
    return { heure: heure, qui: qui, a: a, texte: texte, genre: genre, pid: lien ? lien.getAttribute("alt") || "" : "" };
  }
  function salon() { var li = $("#onglets_chat li.selected"); return li ? tx(li).slice(0, 40) : ""; }
  function nomLieu() { return tx($("#lieu_actuel .titre1")) || net(String(($("#lieu_actuel") || {}).textContent || "").split("\n")[0]); }
  // Nouvelles lignes seulement, identité (minute, auteur, texte, rang) ; à la première lecture, les 20 dernières minutes
  function chatNeuves(lignes) {
    var rang = {}, premiere = !memoire.chatLu, now = maintenant(), mnow = minutesParis(now), out = [];
    memoire.chatLu = true;
    lignes.forEach(function (l) {
      var base = l.heure + "|" + l.qui + "|" + l.texte; rang[base] = (rang[base] || 0) + 1;
      var k = base + "|" + rang[base]; if (memoire.chatVus.has(k)) return;
      memoire.chatVus.add(k); memoire.chatOrdre.push(k);
      if (memoire.chatOrdre.length > 2000) memoire.chatVus.delete(memoire.chatOrdre.shift());
      if (premiere) { if (!l.heure) return; var p = l.heure.split(":"), d = (mnow - (+p[0] * 60 + +p[1]) + 1440) % 1440; if (d > 20) return; }
      l.ms = now; out.push(l);
    });
    return out;
  }

  // --- Message ouvert ---
  function lireBoite(box, idMsg, texteForce) {
    var fil = $$('.zone_conversation div.conversation[id^="convers_"]', box).map(function (c) {
      return { id: c.id.replace(/^convers_/, ""), quand: tx($(".ligne1", c)), auteur: tx($(".ligne2", c)).replace(/^.*Message de\s*/i, ""), choisi: /\bselected\b/.test(c.className) };
    });
    var cur = (idMsg && fil.filter(function (x) { return x.id === String(idMsg); })[0]) || fil.filter(function (x) { return x.choisi; })[0] || fil[0] || {};
    if (idMsg && cur.id !== String(idMsg)) return null;
    var texte = texteForce != null ? texteForce : texteSauts(exiger($(".contenu .texte", box), "#db_message_ .contenu .texte"));
    var part = net(tx($(".zone_conversation p", box))).split(/\s*,\s*/).map(function (x) { return x.replace(/^.*?:\s*/, "").trim(); }).filter(function (x) { return x && x.length < 40; });
    if (!texte && !fil.length) return null;
    return { conv: box.id.replace(/^db_message_/, ""), titre: tx($(".head .title", box)), auteur: cur.auteur || "", quand: cur.quand || "",
      texte: texte.slice(0, 20000), participants: part.slice(0, 12), fil: fil.slice(0, 400).map(function (x) { return { id: x.id, quand: x.quand, auteur: x.auteur, choisi: x === cur }; }) };
  }
  function boiteMessage() {
    var l = $$('[id^="db_message_"]').filter(function (b) { return /^db_message_\d+$/.test(b.id) && !$(".message_nouveau", b) && $(".zone_conversation", b); });
    return l.filter(visible).pop() || l.pop() || null;
  }

  // --- Forum ---
  function slug() { return decodeURIComponent(chemin().split("/").filter(Boolean).pop() || "").replace(/^\d+-\d+-?/, "").replace(/-/g, " ").trim(); }
  function debbcode(t) {
    var x = String(t || "").replace(/\r/g, ""), avant;
    do { avant = x; x = x.replace(/\[(quote|citation)(?:=([^\]]*))?\]([\s\S]*?)\[\/\1\]/gi, function (m, b, qui, c) { return "\n" + (qui ? "« " + qui.replace(/^["']|["']$/g, "") + " a écrit : »\n" : "") + c.trim().split("\n").map(function (l) { return "> " + l; }).join("\n") + "\n\n"; }); } while (x !== avant);
    return x.replace(/\[img(?:=[^\]]*)?\][^\[]*\[\/img\]|\[img=[^\]]*\]/gi, "[image]")
      .replace(/\[\/?(?:b|i|u|s|center|centrer|right|left|titre|code|size|color|couleur|font|url|lien|spoiler|youtube)(?:=[^\]]*)?\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  // --- Relevés DAI ---
  var RE_CUVE = /^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\]\s*\S/;
  var RE_TP = /^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\]\s+(?:Paye|Pas de paye|Prime|Achat|Bilan|Frais|Don|Transfert|Prisonnier|Licenciement|Embauche|Démission|Gestion Prison)\b/;
  var RE_DATE_CERCLE = /^(\d{2}\/\d{2}\/\d{4}) - (?:.* - Commenter|\d+ commentaires? - .+)$/;
  // Entrées coupées aux <br> ; une entrée qui contient un .orange est une alerte du jeu
  // Les lignes de l'historique des cristaux. Une ligne du jeu est un .entreprise_historique_ligne, coupé après le « : »
  // (« … met en cuve 1 Caps: » puis « Gain de 100 CF, gagne 150 Cr. ») : on la lit d'un seul tenant. Sans ces repères, le
  // premier bloc de #entreprise_historique qui n'est pas une barre ajoutée (DC Confort pose la sienne devant les lignes, le
  // 05/11 : c'est elle que le pont lisait), et les morceaux sans date sont recollés à la ligne d'avant.
  function lignesCuve(h) {
    var hl = $$(".entreprise_historique_ligne", h);
    if (hl.length) return hl.map(function (x) { return { l: net(texteSauts(x).replace(/\n+/g, " ").replace(/\[ALERTE\]/g, " ")), a: !!$(".orange", x) || /\[ALERTE\]/.test(x.textContent || "") }; }).filter(function (x) { return x.l; });
    var bloc = exiger(Array.prototype.filter.call(h.children, function (c) { return !/(^|\s)dcc-/.test(c.className || "") && !/^(INPUT|BUTTON|LABEL)$/.test(c.tagName); })[0], "#entreprise_historique > bloc des lignes");
    return entreesHistorique(bloc).reduce(function (out, x) {
      if (!/^\[\d{2}\//.test(x.l) && out.length) { var p = out[out.length - 1]; p.l = net(p.l + " " + x.l); p.a = p.a || x.a; } else out.push(x);
      return out;
    }, []);
  }
  function entreesHistorique(bloc) {
    var out = [], cur = "", orange = false;
    var fin = function () { var l = net(cur); if (l) out.push({ l: l, a: orange }); cur = ""; orange = false; };
    (function marche(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) cur += c.nodeValue;
        else if (c.nodeType === 1) {
          if (c.tagName === "BR") { fin(); continue; }
          if (/\borange\b/.test(c.className || "")) orange = true;
          if (/^(DIV|P|LI)$/.test(c.tagName)) { fin(); marche(c); fin(); } else marche(c);
        }
      }
    })(bloc);
    fin(); return out;
  }
  function postesDans(texte) {
    var l = String(texte || "").split("\n").map(net).filter(Boolean), out = [];
    for (var i = 0; i < l.length; i++) {
      var c = l[i].match(/^nomposte\s+(.+)$/i); if (!c) continue;
      for (var j = i + 1; j < Math.min(l.length, i + 3); j++) {
        if (/^nomposte\s/i.test(l[j])) break;
        var r = l[j].match(/^(.+?) est (.+) chez (.+?)\.?$/);
        if (r && r[1].toLowerCase() === c[1].trim().toLowerCase()) { out.push({ nom: r[1], poste: r[2], employeur: r[3] }); break; }
      }
    }
    return out;
  }

  var LECTEURS = [
    { nom: "chat", verifie: "2026-09-25", page: "main", quand: [], present: "#chat_preview .chatContent, #chatContent",
      observer: [{ sel: "#chat_preview .chatContent", opts: { childList: true } }, { sel: "#chatContent", opts: { childList: true } }],
      lire: function () {
        var c = exiger(conteneurChat(), "conteneur du chat");
        var l = $$(":scope > div.msg", c).map(ligneChat).filter(function (x) { return x.texte; });
        return l.length ? { lieu: nomLieu(), salon: salon(), lignes: l.slice(-120) } : null;
      } },
    { nom: "presents", verifie: "2026-11-04", page: "main", quand: [], present: "#zone_chat .connectes, .personnages",
      observer: [{ sel: "#zone_chat .connectes", opts: { childList: true, subtree: true } }, { sel: "#carte_cases .personnages", opts: { childList: true } }],
      lire: function () {
        var moi = plier(tx($("#txt_pseudo"))), vus = {}, noms = [];
        var poser = function (n) { n = net(n); var k = plier(n); if (!n || n.length > 40 || /^personne$/i.test(n) || /^\d+$/.test(n) || k === moi || vus[k]) return; vus[k] = 1; noms.push(n); };
        $$("#zone_chat .connectes span.perso").forEach(function (s) { poser(s.textContent); }); // ni #nb_co_chat ni « Personne »
        $$(".personnages .icon_perso .info_a_afficher").forEach(function (info) { // noms séparés par <br>
          var cur = ""; for (var c = info.firstChild; c; c = c.nextSibling) { if (c.nodeName === "BR") { poser(cur); cur = ""; } else cur += c.textContent; } poser(cur);
        });
        noms.sort(function (a, b) { return a.localeCompare(b, "fr"); });
        return { lieu: nomLieu(), noms: noms.slice(0, 80) };
      } },
    { nom: "message", verifie: "2026-09-25", page: "main", fenetre: true, quand: [/\/Menu\/Messaging\/action=OpenMessage/i], present: '[id^="db_message_"] .zone_conversation',
      lire: function () { var b = boiteMessage(); return b ? lireBoite(b) : null; } },
    { nom: "courrier", verifie: "2026-09-25", page: "main", quand: [/\/Menu\/Messaging/i], present: '#liste_messages li.message[id^="message_"]',
      lire: function () {
        var l = $$('#liste_messages li.message[id^="message_"]'); if (!l.length) return null;
        var c = $("#current_folder"), dossier = c && c.getAttribute("data-id") != null ? { id: String(c.getAttribute("data-id")), nom: tx(c).slice(0, 40) } : null;
        return { dossier: dossier, messages: l.slice(0, 80).map(function (li) {
          var id = li.id.replace(/^message_/, "");
          var dt = $(".message_date", li); // « HH:MM<br>JJ/MM/AA »
          return { id: id, conv: id, titre: tx($(".message_titre", li)).slice(0, 160), auteur: tx($(".message_auteur", li)).slice(0, 60), quand: dt ? net(texteSauts(dt).replace(/\n+/g, " ")) : "", nouveau: /\bnew\b/.test(li.className) };
        }) };
      } },
    { nom: "contact", verifie: "2026-11-03", page: "main", quand: [/\/Menu\/Book\/GetEntry/i], present: "#entree_contact",
      observer: [{ sel: "#entree_contact", opts: { attributes: true, attributeFilter: ["style", "class"] } }],
      lire: function () {
        var box = $("#entree_contact"); if (!visible(box)) return null;
        var bloc = function (sens) { var b = exiger($(".confiance." + sens, box), ".confiance." + sens); return { libelle: tx($(".name", b)), points: nombre(tx($(".points", b))) }; };
        var nom = tx($("h3.nom", box)) || tx($(".contact_nom", box)); exiger(nom, "#entree_contact h3.nom");
        var row = $$('#liste_contacts li.contact[id^="contact_"]').filter(function (li) { return plier(tx($(".contact_nom", li))) === plier(nom); })[0];
        if (row) nom = tx($(".contact_nom", row)) || nom; // h3.nom est en capitales (CSS) : l'orthographe exacte vient du carnet
        var o = { nom: nom, jeuId: row ? row.getAttribute("data-id") || row.id.replace(/^contact_/, "") : "", donnee: bloc("donnee"), recue: bloc("recue"), commentaire: (($("textarea.commentaire", box) || {}).value || "").trim() };
        // L'img affichée (fiche, sinon ligne du carnet), jamais un nom de fichier deviné : Rekkan s'affiche avec Kharnys.png
        var img = $('img[src*="/images/avatars/"]', box) || (row && $("img", row)), p = portrait(img); if (p) o.portrait = p;
        return o;
      } },
    { nom: "adresse", verifie: null, page: "main", quand: [/\/Menu\/Book\/GetEntry/i], present: "#entree_adresse",
      observer: [{ sel: "#entree_adresse", opts: { attributes: true, attributeFilter: ["style", "class", "data-id"] } }],
      lire: function () {
        var box = $("#entree_adresse"); if (!visible(box)) return null;
        var nom = tx($("h3.nom span", box)), titre = ((($("h3.nom input", box)) || {}).value || "").trim(), ta = $("textarea.commentaire", box);
        var com = ta && !ta.disabled ? (ta.value || "").trim() : ""; // « Chargement... » tant que le jeu n'a pas répondu
        exiger(nom || titre, "#entree_adresse h3.nom");
        return { id: box.getAttribute("data-id") || "", nom: nom.slice(0, 80), titre: titre.slice(0, 80), commentaire: com.slice(0, 2000) };
      } },
    { nom: "carnet", verifie: "2026-09-25", page: "main", quand: [/\/Menu\/Book/i], present: '#liste_contacts li.contact[id^="contact_"]',
      lire: function () {
        var l = $$('#liste_contacts li.contact[id^="contact_"]').map(function (li) { return { nom: tx($(".contact_nom", li)).slice(0, 60), jeuId: li.getAttribute("data-id") || li.id.replace(/^contact_/, "") }; }).filter(function (x) { return x.nom; });
        return l.length ? { contacts: l.slice(0, 400) } : null;
      } },
    { nom: "aitl", verifie: "2026-10-27", page: "main", fenetre: true, quand: [/aitl/i], present: '[id^="db_aitl_"] table',
      lire: function () {
        var box = $$('[id^="db_aitl_"]').filter(visible).pop(); if (!box) return null;
        var t = $$("table", box).filter(function (x) { var h = tx(x.rows && x.rows[0]); return /nom/i.test(h) && /(chiffre|employ|effectif)/i.test(h); }).pop();
        if (!t) return null; // une autre page de l'AITL
        var head = $$("th,td", t.rows[0]).map(tx), col = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
        var iR = col(/class|rang|^#/i), iN = col(/nom/i), iC = col(/chiffre|c\.?a\.?/i), iK = col(/capital/i), iE = col(/employ|effectif/i);
        exiger(iN > -1 && iC > -1, "colonnes Nom et Chiffre de l'AITL");
        var lignes = Array.prototype.slice.call(t.rows, 1).map(function (r) {
          var c = $$("td,th", r).map(tx), v = function (i) { return i > -1 ? nombre(c[i]) : null; };
          return { rang: v(iR), nom: c[iN] || "", ca: v(iC), capital: v(iK), eff: v(iE) };
        }).filter(function (x) { return x.nom; });
        return lignes.length ? { canal: "Corporations", lignes: lignes } : null;
      } },
    { nom: "lieu", verifie: "2026-09-25", page: "main", quand: [], present: "#lieu_actuel",
      observer: [{ sel: "#lieu_actuel", opts: { childList: true, subtree: true, characterData: true } }],
      lire: function () {
        var l = nomLieu(); if (!l) return null; var f = $("#carte_fond"), u = f ? (f.getAttribute("src") || "") + " " + (f.style.backgroundImage || "") : "";
        return { lieu: l, adresse: tx($("#lieu_actuel .titre2")), batiment: (u.match(/_(\d+)\.(?:png|jpe?g|gif|webp)/i) || [])[1] || "" };
      } },
    { nom: "perso", verifie: "2026-09-25", page: "main", quand: [], present: "#txt_pseudo",
      observer: [{ sel: "#txt_credits", opts: { childList: true, subtree: true, characterData: true } }, { sel: "#txt_niveau", opts: { childList: true, subtree: true, characterData: true } }],
      lire: function () {
        var n = tx($("#txt_pseudo")); if (!n) return null; var nl = $("#zone_messagerie .nbrmessage");
        return { pseudo: n, palier: tx($("#txt_niveau")), credits: nombre(tx($("#txt_credits"))), poste: tx($("#poste_infos")).slice(0, 200), nonLus: nl ? nombre(tx(nl)) || 0 : null };
      } },
    { nom: "forum", verifie: "2026-10-04", page: "forum", quand: [/\/Forum/i], present: "a.sujet[data-id]",
      lire: function () {
        var l = $$("#liste_sujets a.sujet[data-id]"); if (!l.length) l = $$("a.sujet[data-id]"); if (!l.length) return null;
        var s = slug();
        return { section: s ? s.charAt(0).toUpperCase() + s.slice(1) : "Forum", sectionId: (chemin().match(/\/Forum\/1-(\d+)/) || [])[1] || "", sujets: l.slice(0, 100).map(function (a) {
          return { id: a.getAttribute("data-id"), titre: (tx($(".nom_sujet", a)) || tx(a)).slice(0, 160), nb: nombre(tx($(".info_nb_messages", a))), maj: tx($(".info_last_modification", a)).slice(0, 80), vu: /\bvu\b/.test(a.className) };
        }) };
      } },
    { nom: "sujet", verifie: "2026-10-23", page: "forum", quand: [/\/Forum/i], present: '.bandeau[id^="bandeau_"]',
      lire: function () {
        var bands = $$('.bandeau[id^="bandeau_"]'); if (!bands.length) return null;
        var h1 = $("#nom_sujet"), titre = h1 ? net(Array.prototype.map.call(h1.childNodes, function (n) { return n.nodeType === 3 ? n.nodeValue : n.id === "pin" || n.id === "lock" ? "" : n.textContent; }).join("")) : tx($("h1"));
        var ariane = $$("#header_sujet h1").filter(function (h) { return h !== h1; })[0];
        return { id: (chemin().match(/\/Forum\/2-(\d+)/) || [])[1] || "", titre: titre.slice(0, 160), section: ariane ? tx(ariane).slice(0, 80) : "", posts: bands.slice(0, 60).map(function (b) {
          var id = b.id.replace(/^bandeau_/, ""), m = tx($(".description", b)).match(/Posté le (.+?)(?: à (\d{1,2}[:h]\d{2})|$)/);
          var brut = $("#message_" + id + "_texte_brut"), aff = $("#message_" + id + "_texte");
          var texte = brut && brut.value ? debbcode(brut.value) : aff ? texteSauts(aff) : "";
          return { auteur: tx($("#message_" + id + "_auteur")).slice(0, 60), quand: m ? (m[1] + (m[2] ? " " + m[2].replace("h", ":") : "")).trim() : "", texte: texte.slice(0, 8000) };
        }) };
      } },
    // Terminal portable › Données impériales, bloc énergie (repères de DECK 1 et des scripts communautaires, à vérifier) :
    // trois .type2 dans l'ordre énergie actuelle, consommation du jour, restant à consommer (en CF). Les libellés, quand
    // ils sont là, l'emportent sur l'ordre.
    { nom: "energie", verifie: null, page: "main", fenetre: true, quand: [/ImperialData/i, /Portable/i], present: "#imperial_data .infos_energy",
      lire: function () {
        var b = $$("#imperial_data .infos_energy").filter(visible)[0]; if (!b) return null;
        var t2 = $$(".type2", b); if (!t2.length) return null;
        var lib = t2.map(function (x) { var r = x.closest("tr") || x.parentElement, t = r ? r.textContent || "" : ""; return net(t.replace(x.textContent || "", " ")).replace(/[:\s]+$/, "").slice(0, 60); });
        var val = t2.map(function (x) { return nombre(tx(x)); }), out = { actuelle: null, conso: null, restant: null };
        lib.forEach(function (l, i) {
          if (val[i] == null) return;
          if (/restant|reste/i.test(l)) out.restant = val[i]; else if (/consomm/i.test(l)) out.conso = val[i]; else if (/actuel|stock|disponible/i.test(l)) out.actuelle = val[i];
        });
        ["actuelle", "conso", "restant"].forEach(function (k, i) { if (out[k] == null && !lib.some(function (l) { return /restant|reste|consomm|actuel|stock|disponible/i.test(l); }) && val[i] != null) out[k] = val[i]; });
        if (out.actuelle == null && out.conso == null && out.restant == null) return null;
        // le jour du jeu bascule à 00h10 : une lecture de 00h05 compte encore pour la veille
        out.jour = isoParis(maintenant() - 10 * 60000); out.libelles = lib; out.valeurs = t2.map(function (x) { return tx(x); }).slice(0, 6);
        return out;
      } },
    { nom: "cuve", verifie: null, page: "main", fenetre: true, quand: [/CrystalHistory/i], present: "#db_historique_cristaux #entreprise_historique",
      lire: function () {
        var f = $("#db_historique_cristaux"); if (!visible(f)) return null;
        var e = lignesCuve(exiger($("#entreprise_historique", f), "#entreprise_historique")).filter(function (x) { return RE_CUVE.test(x.l) && !RE_TP.test(x.l); }); // doublons GARDÉS (même dépôt, même minute)
        if (!e.length) return null;
        var j = memoire.cristaux && maintenant() - memoire.cristaux.at < 30 * 60000 ? memoire.cristaux.iso : isoParis(maintenant());
        return { jour: j, lignes: e.map(function (x) { return x.l; }).slice(-3000), alertes: e.filter(function (x) { return x.a; }).map(function (x) { return x.l; }).slice(0, 200) };
      } },
    { nom: "journal", verifie: null, page: "main", fenetre: true, quand: [/CompanyHistory/i, /Cercle|Circle/i], present: '#zone_dataBox [id^="db_"]',
      lire: function () {
        var fen = $$('#zone_dataBox > [id^="db_"]').filter(function (b) { return visible(b) && !/^db_(historique_cristaux|message_|aitl_|deck_)/.test(b.id) && /Commenter|commentaire|\]\s*(?:Paye|Prime|Achat|Don|Frais|Bilan)/.test(b.textContent || ""); }).pop();
        if (!fen) return null;
        var titre = tx($(".head .title", fen)), lignes = [];
        var ent = memoire.entreprise && maintenant() - memoire.entreprise.at < 10 * 60000 ? memoire.oi[memoire.entreprise.id] || "" : "";
        var hl = $$(".entreprise_historique_ligne", fen);
        if (hl.length) hl.forEach(function (h) { var x = tx(h), m = RE_TP.exec(x); if (m) lignes.push({ brut: x, quand: m[1], commentaires: [] }); });
        if (lignes.length) return { source: "terminal", entreprise: ent || titre, lignes: lignes.slice(-3000) };
        var l = texteSauts(fen).split("\n").map(net).filter(Boolean);
        l.forEach(function (x, i) {
          var tp = RE_TP.exec(x); if (tp) { lignes.push({ brut: x, quand: tp[1], commentaires: [] }); return; }
          var d = RE_DATE_CERCLE.exec(x); if (!d || i === 0 || RE_DATE_CERCLE.test(l[i - 1])) return;
          var nb = +((x.match(/ - (\d+) commentaires? - /) || [])[1] || 0), suite = [];
          if (nb) { var j = i + 1; while (j < l.length && !RE_DATE_CERCLE.test(l[j]) && !RE_TP.test(l[j])) suite.push(l[j++]); if (j < l.length) suite.pop(); else suite = suite.slice(0, nb * 2); }
          lignes.push({ brut: l[i - 1], quand: d[1], commentaires: suite.slice(0, 40) });
        });
        if (!lignes.length) return null;
        return { source: lignes.some(function (x) { return x.commentaires.length || !RE_TP.test(x.brut); }) ? "cercle" : "terminal", entreprise: ent || titre, lignes: lignes.slice(-3000) };
      } },
    { nom: "poste", verifie: "2026-10-27", page: "main", quand: [/\/Command|Deck/i], present: '[id^="db_deck_"] .zone_ecrit',
      observer: [{ sel: '[id^="db_deck_"] .zone_ecrit', opts: { childList: true } }],
      lire: function () {
        var l = [], vus = {};
        $$('[id^="db_deck_"] .zone_ecrit').forEach(function (z) {
          var t = Array.prototype.map.call(z.children, function (c) {
            if (/\bligne_ecrite_fixed\b/.test(c.className)) { var i = $("input.texte", c); return tx($(".contexte", c)) + "\n" + (i ? i.value : ""); }
            return /\bcustom_command\b/.test(c.className) ? "" : texteSauts(c);
          }).join("\n");
          postesDans(t).forEach(function (p) { var k = p.nom.toLowerCase(); if (!vus[k]) { vus[k] = 1; l.push(p); } });
        });
        return l.length ? { postes: l.slice(-200) } : null;
      } }
  ];
  var PAR_NOM = {}; LECTEURS.forEach(function (L) { PAR_NOM[L.nom] = L; });

  /* ================= 5. Captures, gestes et diagnostic ================= */
  var reglages = Object.assign({ pos: null, ouvert: false, touche: { alt: true, ctrl: false, shift: false, key: "d", code: "KeyD" }, sceneFin: 0, auto: true, accordEnvoi: true, sonnes: [], perso: "" }, G.get("d2.reglages", {}));
  function sauverReglages() { G.set("d2.reglages", reglages); }
  var stats = { captures: 0, derniere: null, lus: {} };
  var NOMS_LUS = { aitl: "AITL", energie: "énergie (TP)", cuve: "cuve", journal: "journal", poste: "nomposte", carnet: "carnet", contact: "contact" };

  function capture(type, donnees, auto) {
    var at = maintenant(), id = "c_" + at + "_" + alea(), perso = tx($("#txt_pseudo")) || reglages.perso || "";
    G.set("d2.c." + id, { id: id, type: type, at: at, perso: perso, url: chemin(), auto: !!auto, donnees: donnees }); // une clé par capture
    G.set(SIGNAL, at);
    stats.captures++; stats.derniere = { type: type, at: at };
    if (NOMS_LUS[type]) { stats.lus[type] = at; if (typeof majPied === "function") majPied(); }
    noterLecture(type, donnees, at);
    return id;
  }
  // Envoie seulement ce qui a changé (le chat ne garde que ses lignes nouvelles)
  function transmettre(L, d, auto) {
    if (L.nom === "chat") { var n = chatNeuves(d.lignes); if (!n.length) return false; d = { lieu: d.lieu, salon: d.salon, lignes: n }; }
    else { var s = signature(d); if (memoire.lu[L.nom] === s) return false; memoire.lu[L.nom] = s; }
    capture(L.nom, d, auto); return true;
  }
  function diagGM() { var d = G.get("d2.diag", null); return d && d.lecteurs ? d : { lecteurs: {}, versionJeu: "", at: 0 }; }
  function panne(nom, e) {
    var d = diagGM(), x = d.lecteurs[nom] || { ok: true, erreurs: 0, derniere: 0, message: "", signale: 0 }, now = maintenant();
    x.ok = false; x.erreurs++; x.derniere = now; x.message = String((e && e.message) || e).slice(0, 200);
    var signaler = now - (x.signale || 0) > 3600e3; if (signaler) x.signale = now; // une fois par lecteur et par heure
    d.lecteurs[nom] = x; d.versionJeu = versionJeu(); d.at = now; G.set("d2.diag", d);
    console.warn("DECK 2 › lecteur « " + nom + " » en panne", e);
    if (signaler) capture("diag", { lecteur: nom, message: x.message, versionJeu: d.versionJeu }, true);
    if (typeof majPied === "function") majPied();
  }
  function retabli(nom) { var d = diagGM(), x = d.lecteurs[nom]; if (x && !x.ok) { x.ok = true; d.at = maintenant(); G.set("d2.diag", d); if (typeof majPied === "function") majPied(); } }
  function lancer(L, auto) {
    if (L.page === "main" && !surMain()) return false;
    if (L.page === "forum" && !surForum()) return false;
    if (L.present && !$(L.present)) return false;
    var d; try { d = L.lire(); } catch (e) { panne(L.nom, e); return false; }
    retabli(L.nom);
    return d ? transmettre(L, d, auto) : false;
  }
  function geste(genre, tache, texte) {
    var at = maintenant(), id = "a_" + at + "_" + alea(), plan = G.get("d2.plan", null);
    var a = { id: id, genre: genre, tache: tache, quand: (plan && plan.jour) || isoParis(at), at: at }; if (texte) a.texte = texte;
    G.set("d2.a." + id, a); G.set(SIGNAL, at); return id;
  }

  /* ================= 6. Déclencheurs ================= */
  var attente = new Set(), prevu = null, nbLectures = 0; // prevu : { image } ou { minuterie }
  function vider() {
    prevu = null; var l = Array.from(attente); attente.clear();
    l.forEach(function (n) { nbLectures++; lancer(PAR_NOM[n], true); });
  }
  // Regroupé par image (requestAnimationFrame) ; onglet caché, où les images ne viennent pas : une minuterie d'1 s
  function planifier(noms, delai) {
    if (!reglages.auto) return;
    var go = function () {
      noms.forEach(function (n) { attente.add(n); });
      if (!prevu) prevu = document.hidden ? { minuterie: setTimeout(vider, 1000) } : { image: requestAnimationFrame(vider) };
    };
    if (delai) setTimeout(go, delai); else go();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && prevu && prevu.image) { cancelAnimationFrame(prevu.image); prevu = { minuterie: setTimeout(vider, 1000) }; }
  });
  // Un seul MutationObserver, posé sur quelques nœuds précis (jamais sur tout le body) ; le panneau n'y est pas
  var cibles = [], obs = new MutationObserver(function (muts) {
    var noms = new Set(), deplacer = false;
    muts.forEach(function (m) {
      for (var i = 0; i < cibles.length; i++) {
        var c = cibles[i]; if (c.el !== m.target && !c.el.contains(m.target)) continue;
        if (c.fenetres) {
          if (m.target === c.el) { deplacer = true; if (Array.prototype.some.call(m.addedNodes, function (n) { return n.nodeType === 1 && /^db_/.test(n.id || ""); })) LECTEURS.forEach(function (L) { if (L.fenetre) noms.add(L.nom); }); }
          else contenuChange(); // le jeu remplit une fenêtre déjà ouverte (AITL › Corporations, terminal portable)
        }
        else c.noms.forEach(function (n) { noms.add(n); if (n === "contact") deplacer = true; });
      }
    });
    if (deplacer) placer(); // une fenêtre du jeu ou la fiche contact vient d'apparaître : le panneau ne la couvre pas
    if (noms.size) planifier(Array.from(noms));
  });
  function suivre(el, opts, noms, fenetres) {
    if (!el || cibles.some(function (c) { return c.el === el && c.cle === JSON.stringify(opts); })) return;
    cibles = cibles.filter(function (c) { return c.el.isConnected; });
    cibles.push({ el: el, cle: JSON.stringify(opts), noms: noms, fenetres: !!fenetres }); obs.observe(el, opts);
  }
  // Contenu d'une fenêtre changé : une seule relance 400 ms après le dernier changement, des lecteurs de fenêtre présents
  var contenuT = 0;
  function contenuChange() {
    clearTimeout(contenuT);
    contenuT = setTimeout(function () { planifier(LECTEURS.filter(function (L) { return L.fenetre && (!L.present || $(L.present)); }).map(function (L) { return L.nom; })); }, 400);
  }
  function attacher() {
    if (!reglages.auto) return;
    suivre($("#zone_dataBox"), { childList: true, subtree: true }, [], true);
    LECTEURS.forEach(function (L) { (L.observer || []).forEach(function (o) { suivre($(o.sel), o.opts, [L.nom]); }); });
  }

  // Écoute des réponses que le jeu reçoit déjà (jQuery ajaxComplete) : rien n'est demandé, rien n'est modifié
  var ecoute = { ok: false, raison: "", reponses: 0 }, vusNouveau = {};
  function surReponse(xhr, opt) {
    ecoute.reponses++;
    var url = String((opt && opt.url) || ""), texte = xhr && typeof xhr.responseText === "string" ? xhr.responseText : "";
    var hd = xhr && xhr.getResponseHeader && xhr.getResponseHeader("Date"), ts = hd ? Date.parse(hd) : 0;
    // L'en-tête Date est à la seconde près (tronqué) : moins de 2 s d'écart n'est que cet arrondi, pas une horloge décalée
    if (ts) { var e = ts - Date.now(); ecart = Math.abs(e) > 2000 ? e + 500 : 0; }
    if (/\/Check/i.test(url)) return lireCheck(texte);
    if (/CompanyHistory/i.test(url) && param(url, "company")) memoire.entreprise = { id: param(url, "company"), at: maintenant() };
    if (/CrystalHistory/i.test(url)) { var dt = +param(url, "date"); memoire.cristaux = { iso: isoParis(dt ? dt * 1000 + 3600e3 : maintenant()), at: maintenant() }; }
    if (/SeeImperialData/i.test(url)) $$(".infos_oi h3", domDe(texte)).forEach(function (h) {
      var l = $(".link", h), id = ((l && l.getAttribute("onclick")) || "").match(/company=(\d+)/); if (id) memoire.oi[id[1]] = net(h.textContent.replace(/Historique/i, ""));
    });
    if (/action=ReadMessage/i.test(url)) lireReadMessage(url, texte);
    if (/\/NewMessage/i.test(url)) lireEnvoi(texte, opt);
    attacher(); // un conteneur a pu naître avec cette réponse
    var noms = LECTEURS.filter(function (L) { return L.quand.some(function (re) { return re.test(url); }); }).map(function (L) { return L.nom; });
    if (noms.length) planifier(noms, 250); // la fenêtre s'affiche juste après la réponse
  }
  function lireReadMessage(url, texte) {
    var idm = param(url, "id_message"), conv = param(url, "id_conversation"), x = xmlDe(texte), m = x && x.querySelector("message");
    if (!idm || !conv || !m) return;
    var box = $("#db_message_" + conv); if (!box || $(".message_nouveau", box)) return;
    var d; try { d = lireBoite(box, idm, texteSauts(m)); } catch (e) { return panne("message", e); }
    if (d && d.auteur) capture("message", d, true); // le lecteur DOM garde sa propre empreinte (fenêtre affichée)
  }
  function lireEnvoi(texte, opt) {
    if (!reglages.accordEnvoi) return; // seulement avec l'accord de la joueuse (⚙)
    var x = xmlDe(texte), r = x && x.querySelector("resultat"); if (!r || r.getAttribute("value") !== "true") return;
    var p = {}; String((opt && opt.data) || "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); });
    var t = String(p.nm_texte || "").trim(); if (!t) return;
    capture("envoi", { conv: p.nm_idConvers || "", cible: String(p.nm_cible || "").split(/\s*[,;]\s*/).filter(Boolean).slice(0, 12), titre: String(p.nm_titre || p.nm_sujet || "").slice(0, 160), texte: t.slice(0, 20000) }, true);
  }
  function nouveauMessage(conv, dossier, nb) {
    if (!conv) return; // un événement sans conversation est fabriqué par un autre script (Com'Count)
    var k = conv + "|" + nb, now = maintenant(); if (vusNouveau[k] && now - vusNouveau[k] < 60000) return; vusNouveau[k] = now;
    capture("nouveauMessage", { conv: String(conv), dossier: dossier == null ? "" : String(dossier), nombre: +nb || 1 }, true);
  }
  function lireCheck(texte) {
    if (!texte || texte.length > 400000) return;
    var re = /<evenement\s+type="nouveau_message">[\s\S]*?<folder_(-?\d+)\s+quantite="(\d+)"\s+id_conversation="(\d+)"/g, m;
    while ((m = re.exec(texte))) nouveauMessage(m[3], m[1], m[2]);
  }
  function ecouter() {
    var jq = W.jQuery;
    if (!jq || !jq.fn) { ecoute.raison = "jQuery du jeu introuvable"; if ((ecouter.n = (ecouter.n || 0) + 1) < 10) setTimeout(ecouter, 3000); return; }
    jq(W.document).on("ajaxComplete", function (ev, xhr, opt) {
      if (!reglages.auto) return;
      setTimeout(function () { try { surReponse(xhr, opt); } catch (e) { panne("ecoute", e); } }, 0); // le jeu reprend la main tout de suite
    });
    jq(W.document).on("nouveauMessage", "#zone_messagerie", function (ev) {
      if (!reglages.auto) return; var e = ev || {};
      setTimeout(function () { try { nouveauMessage(e.id_conversation, e.folder_id, e.quantity); } catch (x) { panne("nouveauMessage", x); } }, 0);
    });
    ecoute.ok = true; ecoute.raison = "";
  }
  // Une lecture complète de l'écran (au chargement, au retour de l'onglet, ou à la demande)
  function toutLire(auto) { var n = 0; LECTEURS.forEach(function (L) { if (lancer(L, auto)) n++; }); return n; }

  /* ================= 7. Passerelle DC Confort (protocole 1, confort/passerelle.js) ================= */
  var PASS = (function () {
    var PROTOCOLE = 1, EVT = "dcc-passerelle", MAX = 65536, DEBIT = 60, fenetre = [], pair = null, ecoutes = {};
    var SCH = { "bonjour": { version: "chaine:20", capacites: ["liste", 20, "chaine:30"] }, "bonjour-retour": { version: "chaine:20", capacites: ["liste", 20, "chaine:30"] },
      "combat": { actif: "bool" }, "theme": { livree: "enum:neon|imperial", mouvement: "enum:aucun|discret|expressif", immersion: "enum:sobre|equilibree|maximale" },
      "contacts": { liste: ["liste", 500, { id: "chaine:20", nom: "chaine:60", relation: "chaine:30", camp: "chaine:30" }] },
      "taches": { retard: "entier", liste: ["liste", 30, { titre: "chaine:120", heure: "chaine:5", etat: "enum:retard|a-faire|fait" }] },
      // v1.1.0 : la santé du Secteur (bandeau de DC Confort) ; la fiche DECK d'un nom, demandée par DC Confort
      "secteur": { couverture: "entier", jour: "chaine:10", conso: "entier", alerte: "chaine:140", alertes: "entier", depassements: "entier" },
      "fiche-demande": { nom: "chaine:60" },
      "fiche": { nom: "chaine:60", trouve: "bool", poste: "chaine:80", employeur: "chaine:60", relation: "chaine:30", dernier: "chaine:10", lieu: "chaine:80" },
      // v1.5.0 : un rappel vient de s'afficher ; DC Confort le fait sonner (le pont ne joue aucun son lui-même)
      "rappel": { titre: "chaine:140" } };
    function valider(s, v) {
      if (typeof s === "string") {
        var p = s.split(":");
        if (p[0] === "chaine") return typeof v === "string" && v.length <= +p[1] && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v) ? { ok: v } : null;
        if (p[0] === "entier") return Number.isInteger(v) && Math.abs(v) < 1e9 ? { ok: v } : null;
        if (p[0] === "bool") return typeof v === "boolean" ? { ok: v } : null;
        return p[0] === "enum" && p[1].split("|").indexOf(v) >= 0 ? { ok: v } : null;
      }
      if (Array.isArray(s)) { if (!Array.isArray(v) || v.length > s[1]) return null; var o = []; for (var i = 0; i < v.length; i++) { var r = valider(s[2], v[i]); if (!r) return null; o.push(r.ok); } return { ok: o }; }
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      var x = {}; for (var k in s) { if (!Object.prototype.hasOwnProperty.call(s, k) || v[k] === undefined) continue; var rr = valider(s[k], v[k]); if (!rr) return null; x[k] = rr.ok; } return { ok: x };
    }
    function envoyer(type, donnees) {
      if (SCH[type] && !valider(SCH[type], donnees)) { console.warn("DECK 2 › passerelle : « " + type + " » hors schéma, non envoyé"); return false; }
      var m = JSON.stringify({ v: PROTOCOLE, de: "pont", type: type, donnees: donnees || {} }); // « pont » : seul nom reconnu par passerelle.js
      if (m.length > MAX) { console.warn("DECK 2 › passerelle : message trop gros (" + type + ")"); return false; }
      document.dispatchEvent(new CustomEvent(EVT, { detail: m })); return true;
    }
    document.addEventListener(EVT, function (e) {
      var t = Date.now(); fenetre = fenetre.filter(function (x) { return t - x < 1000; }); if (fenetre.length >= DEBIT) return; fenetre.push(t);
      if (typeof e.detail !== "string" || e.detail.length > MAX) return;
      var m; try { m = JSON.parse(e.detail); } catch (x) { console.warn("DECK 2 › passerelle : JSON invalide", x); return; }
      if (!m || m.v !== PROTOCOLE || m.de !== "confort" || !SCH[m.type]) return; // son propre écho et les inconnus
      var r = valider(SCH[m.type], m.donnees === undefined ? {} : m.donnees); if (!r) return;
      if (m.type === "bonjour" || m.type === "bonjour-retour") { pair = r.ok; if (m.type === "bonjour") envoyer("bonjour-retour", { version: VERSION, capacites: ["contacts", "taches", "secteur", "fiche", "rappel"] }); }
      (ecoutes[m.type] || []).forEach(function (f) { f(r.ok); });
    });
    document.documentElement.setAttribute("data-dcc-pont", VERSION);
    document.documentElement.setAttribute("data-dcc-protocole", String(PROTOCOLE));
    return { envoyer: envoyer, valider: valider, ecouter: function (t, f) { (ecoutes[t] = ecoutes[t] || []).push(f); }, pair: function () { return pair; } };
  })();
  var propre = function (s, n) { return net(String(s || "").replace(/[\u0000-\u001f]/g, " ")).slice(0, n); };
  function envoyerContacts() {
    var a = G.get("d2.annuaire", null); if (!a || !Array.isArray(a.fiches)) return;
    PASS.envoyer("contacts", { liste: a.fiches.filter(function (f) { return f && f.nom; }).slice(0, 500).map(function (f) { return { id: propre(f.id, 20), nom: propre(f.nom, 60), relation: propre(f.relation, 30) }; }) });
  }
  function envoyerTaches() {
    var p = G.get("d2.plan", null); if (!p || !Array.isArray(p.items)) return;
    var l = p.items.slice().sort(function (a, b) { return (b.retard && !b.fait) - (a.retard && !a.fait); });
    PASS.envoyer("taches", { retard: l.filter(function (x) { return x.retard && !x.fait; }).length, liste: l.slice(0, 30).map(function (x) {
      return { titre: propre(x.titre, 120), heure: propre(x.heure, 5), etat: x.fait ? "fait" : x.retard ? "retard" : "a-faire" };
    }) });
  }
  // La santé du Secteur publiée par DECK (d2.secteur), relayée telle quelle, bornée au schéma
  function envoyerSecteur() {
    var s = G.get("d2.secteur", null); if (!s || typeof s !== "object") return;
    var ent = function (v) { return Number.isInteger(v) && Math.abs(v) < 1e9 ? v : undefined; };
    PASS.envoyer("secteur", { couverture: s.couverture == null ? -1 : ent(Math.round(s.couverture)), jour: propre(s.jour, 10) || undefined, conso: ent(s.conso),
      alerte: propre(s.alerte, 140) || undefined, alertes: ent(s.alertes) || 0, depassements: ent(s.depassements) || 0 });
  }
  // Une fiche demandée par DC Confort : seulement un nom identique (sans accents ni casse) à une fiche de l'annuaire ;
  // jamais un voisin approché, pour ne pas montrer la fiche de quelqu'un d'autre
  function ficheExacte(nom) {
    var a = G.get("d2.annuaire", null), k = plier(nom);
    return k ? (((a && a.fiches) || []).filter(function (f) { return f && [f.nom].concat(f.alias || []).some(function (n) { return plier(n) === k; }); })[0] || null) : null;
  }
  PASS.ecouter("fiche-demande", function (d) {
    var f = ficheExacte(d.nom);
    PASS.envoyer("fiche", f ? { nom: propre(d.nom, 60), trouve: true, poste: propre(f.poste, 80), employeur: propre(f.employeur, 60), relation: propre(f.relation, 30),
      dernier: f.dernier ? new Date(f.dernier).toISOString().slice(0, 10) : undefined, lieu: propre(f.lieu, 80) } : { nom: propre(d.nom, 60), trouve: false });
  });
  var enCombat = false;
  PASS.ecouter("bonjour", function () { envoyerContacts(); envoyerTaches(); envoyerSecteur(); });
  PASS.ecouter("bonjour-retour", function () { envoyerContacts(); envoyerTaches(); envoyerSecteur(); });
  PASS.ecouter("combat", function (d) { enCombat = !!d.actif; if (enCombat) ouvrir(false); montrerBanniere(); }); // en combat, seule la pastille reste

  /* ================= 8. Rappels et mode « en scène » ================= */
  var minuteries = [], retenus = [], banniere = null, sceneT = null;
  function enScene() { return (reglages.sceneFin || 0) > maintenant(); }
  function planifierRappels() {
    minuteries.forEach(clearTimeout); minuteries = [];
    var p = G.get("d2.plan", null), g = guide();
    var rappels = ((p && p.rappels) || []).concat(g ? g.ouvrir.filter(function (x) { return x.rappel && !guideFaits[x.id]; }).map(function (x) { return { id: x.id, ms: x.de, titre: "À ouvrir en jeu : " + x.titre }; }) : []);
    rappels.forEach(function (r) {
      var d = r.ms - maintenant(), cle = r.id + "@" + r.ms;
      if (reglages.sonnes.indexOf(cle) > -1) return;
      if (d > 0 && d < 24 * 3600e3) minuteries.push(setTimeout(function () { sonner(r); }, d));
      else if (d <= 0 && d > -15 * 60000) sonner(r); // manqué de peu (onglet rechargé)
    });
  }
  function sonner(r) {
    var cle = r.id + "@" + r.ms; if (reglages.sonnes.indexOf(cle) > -1 || guideFaits[r.id]) return;
    reglages.sonnes = reglages.sonnes.concat([cle]).slice(-60); sauverReglages();
    if (enScene()) { retenus.push(r); majPastille(); return; } // en scène, le rappel attend
    banniere = { titre: r.titre, heure: fmtHeure.format(new Date(r.ms)) }; montrerBanniere(); signalerRappel(r.titre);
  }
  // v1.5.0 : DC Confort fait sonner le rappel, s’il est là (sinon rien : le bandeau suffit)
  function signalerRappel(titre) { PASS.envoyer("rappel", { titre: propre(titre, 140) }); }
  function scene(minutes) {
    reglages.sceneFin = minutes ? maintenant() + minutes * 60000 : 0; sauverReglages(); planifierScene(); majPastille(); rendre();
  }
  function planifierScene() {
    clearTimeout(sceneT);
    var reste = (reglages.sceneFin || 0) - maintenant();
    if (reste > 0) { sceneT = setTimeout(planifierScene, Math.min(reste + 500, 2147483000)); return; }
    if (retenus.length) {
      banniere = { titre: retenus.length + " rappel" + (retenus.length > 1 ? "s" : "") + " pendant la scène : " + retenus.map(function (r) { return r.titre; }).join(" · "), heure: "" };
      retenus = []; montrerBanniere(); majPastille(); signalerRappel(banniere.titre);
    }
  }

  /* ================= 8 bis. Le guide (niveau 2) : ce qu'il faut ouvrir en jeu, et la file nomposte =================
     DECK publie « d2.guide » : ce qu'il lui manque, avec une fenêtre horaire. Le pont l'affiche, le coche dès qu'un de ses
     lecteurs a lu la page (même DECK fermé), et rappelle au début d'une fenêtre. Pour l'annuaire, il propose la commande
     « nomposte <nom> » à COPIER : Rose la colle dans son deck en jeu et l'envoie elle-même ; la réponse est lue comme avant.
     Rien n'est ouvert, tapé ni envoyé par le script. */
  var guideFaits = G.get("d2.guideFaits", {}), nompFaits = G.get("d2.nomposteFaits", {});
  function guide() { var g = G.get("d2.guide", null); return g && Array.isArray(g.ouvrir) ? g : null; }
  function aOuvrir() { var g = guide(), now = maintenant(); return g ? g.ouvrir.filter(function (x) { return now >= x.de && now < x.a && !(guideFaits && guideFaits[x.id]); }) : []; }
  function noterLecture(type, d, at) {
    if (!guideFaits) return;
    var g = guide(), ch = false;
    if (g) g.ouvrir.forEach(function (x) {
      if (guideFaits[x.id] || x.lecteur !== type || at < x.de || at >= x.a) return;
      // le titre de la fenêtre d'activité peut entourer le nom de l'entreprise (« Historique · Technopôle A ») : l'un contient l'autre
      var e1 = plier((d && d.entreprise) || ""), e2 = plier(x.cle || "");
      if (x.cle && !(e1 && (e1 === e2 || e1.indexOf(e2) >= 0 || e2.indexOf(e1) >= 0))) return;
      guideFaits[x.id] = at; ch = true;
    });
    if (type === "poste" && d && Array.isArray(d.postes)) d.postes.forEach(function (p) { if (p && p.nom) { nompFaits[plier(p.nom)] = at; ch = true; } });
    if (ch) sauverGuide();
  }
  function sauverGuide() {
    var vieux = maintenant() - 3 * 864e5, mois = maintenant() - 30 * 864e5;
    Object.keys(guideFaits).forEach(function (k) { if (guideFaits[k] < vieux) delete guideFaits[k]; });
    Object.keys(nompFaits).forEach(function (k) { if (Math.abs(nompFaits[k]) < mois) delete nompFaits[k]; });
    G.set("d2.guideFaits", guideFaits); G.set("d2.nomposteFaits", nompFaits);
    if (typeof rendre === "function") rendre();
  }
  function fileNomposte() { var g = guide(), l = g && g.nomposte && Array.isArray(g.nomposte.noms) ? g.nomposte.noms.filter(function (n) { return !nompFaits[plier(n)]; }) : []; return l; }

  /* ================= 9. Panneau en jeu (Shadow DOM, sans innerHTML) ================= */
  if (document.getElementById("d2-pont")) return; // une seule instance
  var host = document.createElement("div"); host.id = "d2-pont";
  var sh = host.attachShadow({ mode: "open" });
  function el(tag, props, enfants) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k]; if (v == null || v === false) return;
      if (k === "class") e.className = v; else if (k === "texte") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    });
    (enfants || []).forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  // replaceChildren écrirait « null » en texte : les éléments absents sont écartés
  function remplir(e, l) { e.replaceChildren.apply(e, l.filter(function (x) { return x != null && x !== false; })); }
  var SVG = "http://www.w3.org/2000/svg";
  function icone(d) { var s = document.createElementNS(SVG, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ic"); d.forEach(function (x) { var p = document.createElementNS(SVG, "path"); p.setAttribute("d", x); s.appendChild(p); }); return s; }
  var IC = { reglages: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"],
    fermer: ["M18 6 6 18", "m6 6 12 12"], ouvrir: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"] };

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;margin:0}",
    "[hidden]{display:none!important}",
    ".r{--fd:rgb(var(--dcc-panneau-rvb,10 15 26)/.97);--case:var(--dcc-ardoise-3,#141e31);--survol:var(--dcc-ardoise-4,#18233a);--filet:rgb(var(--dcc-filet-rvb,140 170 210)/.16);",
    "--filet2:rgb(var(--dcc-filet-rvb,140 170 210)/.3);--t1:var(--dcc-ardoise-12,#e6ecf5);--t2:var(--dcc-ardoise-11,#c9d4e3);--t3:var(--dcc-ardoise-10,#a9b6c9);--t4:var(--dcc-ardoise-9,#7d8ca3);",
    "--acc:var(--dcc-acc,#5cc2ff);--alerte:var(--dcc-alerte,#f0a83a);--ok:var(--dcc-ok,#4fc1a6);--or:var(--dcc-or-texte,#e6c98a);--encre:var(--dcc-encre,#04121f);",
    "--hs:var(--dcc-h-s,28px);--hm:var(--dcc-h-m,36px);--coin:7px;font:400 13px/1.45 'Segoe UI',system-ui,Arial,sans-serif;color:var(--t2)}",
    ".pastille{position:fixed;right:14px;bottom:14px;z-index:2147483600;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;cursor:pointer;",
    "background:var(--fd);border:1px solid var(--filet2);color:var(--t1);font:600 12px/1 Bahnschrift,'Segoe UI',sans-serif;letter-spacing:.06em;padding:0}",
    ".pastille:hover{border-color:var(--acc)}.pastille .n{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;display:grid;place-items:center;",
    "background:var(--alerte);color:var(--encre);font:600 11px/1 'Segoe UI',sans-serif;letter-spacing:0}.pastille.scene{border-color:var(--alerte)}",
    ".pastille{transition:border-color .2s,box-shadow .2s}.pastille.recu{border-color:var(--ok);box-shadow:0 0 0 3px rgb(79 193 166/.28)}.pastille.refus{border-color:var(--alerte);box-shadow:0 0 0 3px rgb(240 168 58/.28)}",
    ".panneau{position:fixed;z-index:2147483600;width:360px;max-width:calc(100vw - 16px);max-height:min(70vh,560px);display:flex;flex-direction:column;background:var(--fd);",
    "border:1px solid var(--filet);clip-path:polygon(var(--coin) 0,100% 0,100% calc(100% - var(--coin)),calc(100% - var(--coin)) 100%,0 100%,0 var(--coin));box-shadow:inset 0 1px 0 rgb(255 255 255/.045)}",
    ".panneau:focus{outline:none}",
    ".tete{display:flex;align-items:center;gap:6px;min-height:var(--hm);padding:0 6px 0 12px;border-bottom:1px solid var(--filet);cursor:grab;touch-action:none}",
    ".tete .titre{flex:1;min-width:0;font:600 11px/1 Bahnschrift,'Segoe UI',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--t4)}",
    ".tete .pti{color:var(--or);letter-spacing:.04em;text-transform:none;margin-left:8px;font-size:12px}",
    "button{font:inherit;color:inherit}",
    ".b{min-width:var(--hs);height:var(--hs);display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:0 8px;background:none;border:1px solid var(--filet2);color:var(--t2);cursor:pointer;font-size:12px;border-radius:4px}",
    ".b:hover{border-color:var(--acc);color:var(--t1)}.b.seul{padding:0;width:var(--hs)}.b[aria-pressed=true],.b[aria-checked=true]{border-color:var(--acc);color:var(--t1)}",
    ".ic{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    ":focus-visible{outline:2px solid var(--acc);outline-offset:2px}",
    ".cherche{padding:10px 12px 6px}.cherche input{width:100%;height:var(--hm);padding:0 10px;background:var(--case);border:1px solid var(--filet2);border-radius:4px;color:var(--t1);font:inherit;font-size:14px}",
    ".cherche input::placeholder{color:var(--t4)}",
    ".corps{flex:1;min-height:60px;overflow:auto;padding:4px 0 8px;scrollbar-width:thin;scrollbar-color:var(--filet2) transparent}",
    ".etiq{padding:10px 12px 4px;font:600 11px/1 Bahnschrift,'Segoe UI',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--t4)}",
    ".etiq.retard{color:var(--alerte)}",
    ".ligne{display:grid;grid-template-columns:24px 1fr auto;align-items:center;gap:8px;min-height:var(--hm);padding:2px 12px}",
    ".ligne:hover{background:var(--survol)}.ligne .t{min-width:0;color:var(--t1);font-size:13.5px}.ligne .h{font:12px Bahnschrift,'Segoe UI',sans-serif;color:var(--t3);font-variant-numeric:tabular-nums}",
    ".ligne.retard .h{color:var(--alerte)}.ligne.fait .t{color:var(--t4);text-decoration:line-through}",
    ".losange{width:24px;height:24px;display:grid;place-items:center;cursor:pointer}",
    ".losange input{appearance:none;width:14px;height:14px;margin:0;border:1.5px solid var(--dcc-ardoise-8,#4a5f86);border-radius:2px;transform:rotate(45deg);background:transparent;cursor:pointer}",
    ".losange input:checked{background:var(--ok);border-color:var(--ok)}.ligne.retard .losange input:not(:checked){border-color:var(--alerte)}",
    ".ech{display:flex;gap:8px;padding:3px 12px;font-size:12px;color:var(--t3)}.ech b{font-weight:400;color:var(--t4);font-family:Bahnschrift,'Segoe UI',sans-serif}",
    ".fiche{padding:8px 12px;border-bottom:1px solid var(--filet)}.fiche .nom{font:600 15px/1.25 'Bahnschrift SemiCondensed',Bahnschrift,'Segoe UI',sans-serif;color:var(--t1)}",
    ".fiche .poste{font-size:12px;color:var(--t3)}.fiche .rel{display:inline-block;margin-top:3px;font-size:11px;letter-spacing:.06em;color:var(--or)}",
    ".fiche .res{margin-top:3px;font-size:13px;color:var(--t2)}.fiche .der{margin-top:2px;font-size:11px;color:var(--t4)}",
    ".vide{padding:14px 12px;color:var(--t4);font-size:13px}",
    ".bandeau{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:8px 12px 0;padding:8px 10px;border:1px solid var(--filet2);border-left:2px solid var(--acc);background:var(--case);font-size:13px;color:var(--t1)}",
    ".bandeau span{flex:1 1 180px;min-width:0;overflow-wrap:anywhere}.bandeau.alerte{border-left-color:var(--alerte)}",
    ".rappel{position:fixed;right:58px;bottom:14px;z-index:2147483600;max-width:min(360px,calc(100vw - 72px));display:flex;align-items:center;gap:8px;min-height:var(--hm);padding:4px 6px 4px 12px;",
    "background:var(--fd);border:1px solid var(--filet2);border-left:2px solid var(--acc);color:var(--t1);font:13px/1.35 'Segoe UI',sans-serif}",
    ".rappel b{font:600 12px Bahnschrift,'Segoe UI',sans-serif;color:var(--or)}",
    ".pied{display:flex;gap:10px;align-items:center;min-height:var(--hs);padding:0 12px;border-top:1px solid var(--filet);font-size:11px;color:var(--t4)}.pied .panne{color:var(--alerte)}.pied .ok{color:var(--ok)}.pied .attente{color:var(--or)}.pied .lus{margin-left:auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}",
    ".rg{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:var(--hm);padding:4px 12px;border-bottom:1px solid var(--filet)}",
    ".rg small{display:block;font-size:11px;color:var(--t4)}.groupe{display:flex;gap:4px;flex-wrap:wrap}",
    ".etiq.guide{color:var(--acc)}.ligne.ouvrir .pt{width:24px;height:24px;display:grid;place-items:center}.ligne.ouvrir .pt::before{content:'';width:9px;height:9px;transform:rotate(45deg);border:1.5px solid var(--acc)}",
    ".np{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 12px 8px}.np code{flex:1 1 160px;min-width:0;padding:6px 8px;background:var(--case);border:1px solid var(--filet2);border-radius:4px;",
    "font:13px 'Cascadia Mono',Consolas,monospace;color:var(--t1);user-select:all;overflow-wrap:anywhere}.np small{flex-basis:100%;font-size:11px;color:var(--t4)}"
  ].join("");

  var racine = el("div", { class: "r" });
  var pastille = el("button", { class: "pastille", type: "button", "aria-expanded": "false", title: "DECK (Alt+D)", "aria-label": "Ouvrir le panneau DECK" }, ["D", el("span", { class: "n", hidden: true })]);
  var champ = el("input", { type: "search", placeholder: "Chercher dans DECK", "aria-label": "Chercher dans DECK (nom ou alias)", spellcheck: "false" });
  var corps = el("div", { class: "corps" }), bandeau = el("div", { "aria-live": "polite" }), pied = el("div", { class: "pied" });
  var ptiEl = el("span", { class: "pti" });
  var btReg = el("button", { class: "b seul", type: "button", title: "Réglages", "aria-label": "Réglages", "aria-pressed": "false" }, [icone(IC.reglages)]);
  var tete = el("div", { class: "tete" }, [el("span", { class: "titre" }, ["DECK", ptiEl]),
    el("button", { class: "b", type: "button", title: "Ouvrir DECK dans un onglet", onclick: function () { ouvrirDeck(); } }, [icone(IC.ouvrir), "DECK"]), btReg,
    el("button", { class: "b seul", type: "button", title: "Fermer (Échap)", "aria-label": "Fermer le panneau", onclick: function () { ouvrir(false); pastille.focus(); } }, [icone(IC.fermer)])]);
  var panneau = el("section", { class: "panneau", hidden: true, tabindex: "-1", role: "dialog", "aria-label": "DECK" }, [tete, el("div", { class: "cherche" }, [champ]), bandeau, corps, pied]);
  var rappelEl = el("div", { class: "rappel", hidden: true, role: "status" });
  racine.appendChild(pastille); racine.appendChild(panneau); racine.appendChild(rappelEl);
  sh.appendChild(el("style", { texte: CSS })); sh.appendChild(racine);

  var vueReglages = false, coches = {}; // coches : état local d'une case en attente de DECK (reflété tout de suite)

  // --- Recherche dans l'annuaire : nom + alias, sans accents, préfixe, une faute tolérée ---
  function uneFaute(a, b) { // distance d'édition ≤ 1
    if (a === b) return true; var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, f = 0;
    while (i < la && j < lb) { if (a[i] === b[j]) { i++; j++; continue; } if (++f > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
    return f + (la - i) + (lb - j) <= 1;
  }
  function chercher(q) {
    var a = G.get("d2.annuaire", null), fiches = (a && a.fiches) || []; q = plier(q); if (!q) return [];
    var res = [];
    fiches.forEach(function (f) {
      var noms = [f.nom].concat(f.alias || []).map(plier).filter(Boolean), score = 9;
      noms.forEach(function (n) {
        var mots = [n].concat(n.split(" "));
        mots.forEach(function (m) {
          if (m.indexOf(q) === 0) score = Math.min(score, m === n ? 0 : 1);
          else if (q.length >= 3 && [q.length - 1, q.length, q.length + 1].some(function (k) { return uneFaute(q, m.slice(0, k)); })) score = Math.min(score, 2);
        });
      });
      if (score < 9) res.push({ f: f, s: score });
    });
    return res.sort(function (x, y) { return x.s - y.s || String(x.f.nom).localeCompare(y.f.nom, "fr"); }).slice(0, 8).map(function (x) { return x.f; });
  }
  function carteFiche(f) {
    var poste = [f.poste, f.employeur].filter(Boolean).join(" chez ");
    return el("div", { class: "fiche" }, [el("div", { class: "nom", texte: f.nom }), poste ? el("div", { class: "poste", texte: poste }) : null,
      f.relation ? el("span", { class: "rel", texte: f.relation }) : null, f.resume ? el("div", { class: "res", texte: f.resume }) : null,
      el("div", { class: "der", texte: f.dernier ? "dernier échange " + ilYa(f.dernier) : "aucun échange noté" })]);
  }

  // --- Aujourd’hui ---
  function ligneTache(x, plan) {
    var fait = x.id in coches ? coches[x.id] : !!x.fait;
    var c = el("input", { type: "checkbox", "aria-label": (fait ? "Faite : " : "Cocher : ") + x.titre });
    c.checked = fait;
    c.addEventListener("change", function () { basculer(x, c.checked); });
    var reporter = x.retard && !fait ? el("button", { class: "b", type: "button", texte: "Reporter", title: "Reporter à demain", onclick: function () { geste("reporter", x.id); reportes[x.id] = 1; rendre(); envoyerTaches(); flash("Reporté à demain — DECK l’appliquera à son ouverture."); } }) : el("span", { class: "h", texte: x.heure || "" });
    return el("div", { class: "ligne" + (x.retard && !fait ? " retard" : "") + (fait ? " fait" : "") }, [el("label", { class: "losange" }, [c]), el("span", { class: "t", texte: x.titre }), reporter]);
  }
  var enAttente = {}, reportes = {};
  function basculer(x, oui) {
    coches[x.id] = oui;
    var k = enAttente[x.id];
    if (!oui && k && G.get(k, null)) { G.del(k); delete enAttente[x.id]; } // coche pas encore reçue par DECK : simplement retirée
    else { var id = geste(oui ? "fait" : "defait", x.id); enAttente[x.id] = "d2.a." + id; }
    rendre(); envoyerTaches();
  }
  // Le guide en tête du panneau : ce qu'il faut ouvrir maintenant, puis le prochain nomposte à copier
  function guideVue() {
    var out = [], ao = aOuvrir(), np = fileNomposte();
    if (ao.length) {
      out.push(el("div", { class: "etiq guide", texte: "À ouvrir en jeu · " + ao.length }));
      ao.forEach(function (x) { out.push(el("div", { class: "ligne ouvrir", title: "Se coche dès que le pont a lu la page" }, [el("span", { class: "pt", "aria-hidden": "true" }), el("span", { class: "t", texte: x.titre }), el("span", { class: "h", texte: x.quand || "" })])); });
    }
    if (np.length) {
      var cmd = "nomposte " + np[0];
      out.push(el("div", { class: "etiq guide", texte: "Annuaire · " + np.length + " à demander" }));
      out.push(el("div", { class: "np" }, [el("code", { texte: cmd }),
        el("button", { class: "b", type: "button", texte: "Copier", onclick: function () {
          navigator.clipboard.writeText(cmd).then(function () { flash("Copié. Dans ton deck en jeu : Ctrl+V puis Entrée. La réponse sera lue, puis le nom suivant viendra."); },
            function (e) { console.warn("DECK 2 › copie", e); flash("Copie refusée : sélectionne la commande et copie-la à la main.", true, []); });
        } }),
        el("button", { class: "b", type: "button", texte: "Passer", title: "Ne plus proposer ce nom pendant 30 jours", onclick: function () { nompFaits[plier(np[0])] = -maintenant(); sauverGuide(); } }),
        el("small", { texte: "Les plus gros déposants d’abord. Tu tapes, le pont lit la réponse : jamais d’envoi à ta place." })]));
    }
    return out;
  }
  function cycleVue(plan) {
    if (!plan || !Array.isArray(plan.items)) return guideVue().concat([el("p", { class: "vide", texte: "DECK n’a pas encore publié la journée. Ouvre DECK une fois." })]);
    var items = plan.items.filter(function (x) { return !reportes[x.id]; }), out = guideVue();
    var retards = items.filter(function (x) { return x.retard && !(x.id in coches ? coches[x.id] : x.fait); });
    var autres = items.filter(function (x) { return retards.indexOf(x) < 0; }).sort(function (a, b) { return (a.heure || "99") < (b.heure || "99") ? -1 : 1; });
    if (retards.length) { out.push(el("div", { class: "etiq retard", texte: "En retard" })); retards.forEach(function (x) { out.push(ligneTache(x, plan)); }); }
    out.push(el("div", { class: "etiq", texte: "Aujourd’hui" }));
    if (autres.length) autres.forEach(function (x) { out.push(ligneTache(x, plan)); }); else out.push(el("p", { class: "vide", texte: "Rien d’autre aujourd’hui." }));
    var ech = (plan.echeances || []).slice(0, 5);
    if (ech.length) { out.push(el("div", { class: "etiq", texte: "Échéances" })); ech.forEach(function (e) { out.push(el("div", { class: "ech" }, [el("b", { texte: e.pti || e.jour || "" }), el("span", { texte: e.titre })])); }); }
    return out;
  }

  // --- Réglages ---
  function interrupteur(nom, aide, on, fn) {
    return el("div", { class: "rg" }, [el("span", {}, [nom, aide ? el("small", { texte: aide }) : null]),
      el("button", { class: "b", type: "button", role: "switch", "aria-checked": String(!!on), texte: on ? "activé" : "arrêté", onclick: fn })]);
  }
  function toucheLabel() { var t = reglages.touche; return !t || t.off ? "désactivé" : (t.ctrl ? "Ctrl+" : "") + (t.alt ? "Alt+" : "") + (t.shift ? "Maj+" : "") + String(t.key || "").toUpperCase(); }
  function reglagesVue() {
    var reste = Math.max(0, Math.round(((reglages.sceneFin || 0) - maintenant()) / 60000));
    var choix = reste ? [30, 60, 120].filter(function (m) { return m >= reste; })[0] || 120 : 0;
    var btTouche = el("button", { class: "b", type: "button", texte: toucheLabel() });
    btTouche.addEventListener("click", function () { capturerTouche(btTouche); });
    return [
      el("div", { class: "rg" }, [el("span", {}, ["Mode en scène", el("small", { texte: "les rappels attendent la fin de la scène" })]),
        el("span", { class: "groupe", role: "group", "aria-label": "Mode en scène" }, [[0, "arrêt"], [30, "30 min"], [60, "1 h"], [120, "2 h"]].map(function (o) {
          return el("button", { class: "b", type: "button", "aria-pressed": String(o[0] === choix), texte: o[1], onclick: function () { scene(o[0]); } }); }))]),
      el("div", { class: "rg" }, [el("span", {}, ["Raccourci", el("small", { texte: "ignoré pendant une saisie ; Suppr le désactive" })]), btTouche]),
      interrupteur("Lecture automatique", "relit ce que tu ouvres ; jamais de clic ni de requête", reglages.auto, function () { reglages.auto = !reglages.auto; sauverReglages(); if (reglages.auto) { attacher(); toutLire(true); } else { obs.disconnect(); cibles = []; } rendre(); }),
      interrupteur("Garder mes messages envoyés", "lit le texte d’un message au moment où TU l’envoies, pour l’archive de DECK", reglages.accordEnvoi, function () { reglages.accordEnvoi = !reglages.accordEnvoi; sauverReglages(); rendre(); }),
      el("div", { class: "rg" }, [el("span", { texte: "Lire l’écran maintenant" }), el("button", { class: "b", type: "button", texte: "Lire", onclick: function () { var n = toutLire(false); flash(n ? n + " lecture(s) envoyée(s) à DECK." : "Rien de nouveau à lire ici."); } })]),
      el("div", { class: "rg" }, [el("span", { texte: "Position du panneau" }), el("button", { class: "b", type: "button", texte: "réinitialiser", onclick: function () { reglages.pos = null; sauverReglages(); placer(true); flash("Position réinitialisée."); } })]),
      el("p", { class: "vide", texte: "Pont DECK 2 v" + VERSION + " · aucun clic en jeu, aucune requête. " + (ecoute.ok ? "Écoute du jeu active." : "Écoute du jeu inactive (" + (ecoute.raison || "?") + ").") })
    ];
  }
  function capturerTouche(bt) {
    bt.textContent = "appuie…";
    var fin = function () { removeEventListener("keydown", onk, true); rendre(); };
    var onk = function (e) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") return fin();
      if (e.key === "Delete" || e.key === "Backspace") { reglages.touche = { off: true }; sauverReglages(); return fin(); }
      if (["Alt", "Control", "Shift", "Meta"].indexOf(e.key) > -1) return;
      if (!e.altKey && !e.ctrlKey) { bt.textContent = "avec Alt ou Ctrl"; return; }
      reglages.touche = { alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, key: String(e.key || "").toLowerCase(), code: e.code }; sauverReglages(); fin();
    };
    addEventListener("keydown", onk, true);
  }

  // --- Dessin ---
  var flashT = null;
  function flash(m, alerte, extra) {
    clearTimeout(flashT);
    bandeau.replaceChildren(m ? el("div", { class: "bandeau" + (alerte ? " alerte" : "") }, [el("span", { texte: m })].concat(extra || [])) : document.createTextNode(""));
    if (m && !extra) flashT = setTimeout(function () { bandeau.replaceChildren(); }, 5000);
  }
  function rendre() {
    majPastille();
    if (panneau.hidden) return;
    var plan = G.get("d2.plan", null);
    ptiEl.textContent = plan && plan.pti ? plan.pti : "";
    btReg.setAttribute("aria-pressed", String(vueReglages));
    var haut = corps.scrollTop;
    if (vueReglages) corps.replaceChildren.apply(corps, reglagesVue());
    else if (champ.value.trim()) { var r = chercher(champ.value); corps.replaceChildren.apply(corps, r.length ? r.map(carteFiche) : [el("p", { class: "vide", texte: G.get("d2.annuaire", null) ? "Personne de ce nom dans DECK." : "DECK n’a pas encore publié son annuaire. Ouvre DECK une fois." })]); }
    else corps.replaceChildren.apply(corps, cycleVue(plan));
    corps.scrollTop = haut;
    majPied();
  }
  // « Lu : AITL 2 min, énergie (TP) 5 min » : la preuve que le pont lit, sans ouvrir DECK
  // ✓ : DECK a pris la dernière lecture de ce type ; … : elle attend que DECK s'ouvre
  function recus() { var r = G.get("d2.recus", null); return r && Array.isArray(r.liste) ? r.liste : []; }
  function lecturesEnAttente() { return G.cles().filter(function (k) { return k.indexOf("d2.c.") === 0; }).length; }
  function prisParDeck(type, at) { return recus().some(function (x) { return x.type === type && x.at >= at && x.ok; }); }
  function derniersLus() {
    var l = Object.keys(stats.lus).sort(function (a, b) { return stats.lus[b] - stats.lus[a]; }).slice(0, 2);
    return l.length ? el("span", { class: "lus", title: "Lu par le pont depuis l’ouverture de cette page. ✓ : pris par DECK ; … : en attente de DECK",
      texte: "Lu : " + l.map(function (k) { return NOMS_LUS[k] + (prisParDeck(k, stats.lus[k]) ? " ✓ " : " … ") + ilYa(stats.lus[k]).replace("il y a ", ""); }).join(", ") }) : null;
  }
  // L'état de l'envoi vers DECK, en tête du pied : en attente, à jour (avec les derniers bilans au survol), ou refusé
  function etatDeck(v) {
    var n = lecturesEnAttente(), ouvert = !!(v && v.at && maintenant() - v.at < 90000), r = recus(), der = r[0];
    if (n) return el("span", { class: "attente", title: "Ces lectures restent gardées ici jusqu’à ce que DECK les prenne : rien n’est perdu.", texte: n + " en attente" + (ouvert ? " · envoi…" : " · ouvre DECK") });
    if (der && !der.ok) return el("span", { class: "panne", title: der.texte, texte: "DECK n’a pas pris « " + (NOMS_LUS[der.type] || der.type) + " »" });
    if (der) return el("span", { class: "ok", title: "Derniers envois pris par DECK :\n" + r.slice(0, 8).map(function (x) { return (x.ok ? "✓ " : "✗ ") + (NOMS_LUS[x.type] || x.type) + (x.texte ? " · " + x.texte : "") + " — " + ilYa(x.recu); }).join("\n"),
      texte: "✓ DECK à jour" });
    return el("span", { texte: !v ? "DECK jamais vu" : v.at ? "DECK vu " + ilYa(v.at) : "DECK fermé" });
  }
  // Quand DECK accuse réception d'une lecture qui compte : un mot dans le bandeau (panneau ouvert), un halo sur la pastille
  var recuT = 0;
  function surRecus(k, ancien, nouveau) {
    var vus = {}; ((ancien && ancien.liste) || []).forEach(function (x) { vus[x.id] = 1; });
    var neufs = ((nouveau && nouveau.liste) || []).filter(function (x) { return !vus[x.id] && NOMS_LUS[x.type]; });
    if (neufs.length) {
      var x = neufs[0];
      if (!panneau.hidden && !champ.value) flash((x.ok ? "Pris par DECK : " : "DECK n’a pas pris : ") + NOMS_LUS[x.type] + (x.texte ? " · " + x.texte : "") + (neufs.length > 1 ? " (et " + (neufs.length - 1) + " autre" + (neufs.length > 2 ? "s" : "") + ")" : ""), !x.ok);
      pastille.classList.toggle("recu", x.ok); pastille.classList.toggle("refus", !x.ok);
      clearTimeout(recuT); recuT = setTimeout(function () { pastille.classList.remove("recu", "refus"); }, 2500);
    }
    majPied(); majPastille();
  }
  function majPied() {
    if (panneau.hidden) return;
    var v = G.get("d2.vie", null), d = diagGM(), pannes = Object.keys(d.lecteurs).filter(function (k) { return !d.lecteurs[k].ok && d.lecteurs[k].erreurs > 0; });
    remplir(pied, [etatDeck(v),
      pannes.length ? el("span", { class: "panne", title: pannes.join(", "), texte: pannes.length + " lecteur" + (pannes.length > 1 ? "s" : "") + " en panne" }) : null,
      enScene() ? el("span", { class: "panne", texte: "en scène" }) : null, derniersLus()]);
  }
  function majPastille() {
    var p = G.get("d2.plan", null), n = ((p && p.items) || []).filter(function (x) { return x.retard && !(x.id in coches ? coches[x.id] : x.fait) && !reportes[x.id]; }).length + retenus.length + aOuvrir().length;
    var b = pastille.querySelector(".n"); b.hidden = !n; b.textContent = n ? String(n) : "";
    pastille.classList.toggle("scene", enScene());
    var att = lecturesEnAttente();
    pastille.title = "DECK" + (n ? " · " + n + " en retard ou en attente" : "") + (att ? " · " + att + " lecture" + (att > 1 ? "s" : "") + " en attente de DECK" : recus().length ? " · DECK à jour" : "") + (toucheLabel() !== "désactivé" ? " (" + toucheLabel() + ")" : "");
  }
  function montrerBanniere() {
    if (!banniere) { rappelEl.hidden = true; return; }
    remplir(rappelEl, [banniere.heure ? el("b", { texte: banniere.heure }) : null, el("span", { texte: banniere.titre }),
      el("button", { class: "b", type: "button", texte: "vu", "aria-label": "Rappel vu", onclick: function () { banniere = null; montrerBanniere(); } })]);
    rappelEl.hidden = enCombat ? true : false;
  }

  // --- Ouverture, position (jamais sur #entree_contact ni sur une fenêtre du jeu), déplacement ---
  function ouvrir(oui, parToi) {
    if (oui && enCombat && !parToi) return;
    panneau.hidden = !oui; pastille.setAttribute("aria-expanded", String(!!oui));
    if (reglages.ouvert !== !!oui) { reglages.ouvert = !!oui; sauverReglages(); }
    if (oui) { rendre(); placer(true); if (parToi) panneau.focus({ preventScroll: true }); horloge(); }
  }
  function obstacles() {
    return $$("#entree_contact, #zone_dataBox > .dataBox, #zone_dataBox > [id^='db_']").filter(visible).map(function (e) { return e.getBoundingClientRect(); });
  }
  function recouvre(r, obs2) { return obs2.reduce(function (s, o) { var w = Math.min(r.r, o.right) - Math.max(r.l, o.left), h = Math.min(r.b, o.bottom) - Math.max(r.t, o.top); return s + (w > 0 && h > 0 ? w * h : 0); }, 0); }
  function placer(force) {
    if (panneau.hidden) return;
    var w = panneau.offsetWidth || 360, h = panneau.offsetHeight || 300, vw = innerWidth, vh = innerHeight, m = 14;
    var cands = [];
    if (reglages.pos) cands.push({ x: reglages.pos.x, y: reglages.pos.y });
    cands.push({ x: vw - w - m, y: vh - h - 58 }, { x: m, y: vh - h - 58 }, { x: vw - w - m, y: m }, { x: m, y: m });
    var obs2 = obstacles(), meilleur = null;
    cands.forEach(function (c) {
      c.x = Math.max(0, Math.min(c.x, vw - w)); c.y = Math.max(0, Math.min(c.y, vh - h));
      c.s = recouvre({ l: c.x, t: c.y, r: c.x + w, b: c.y + h }, obs2); if (!meilleur || c.s < meilleur.s) meilleur = c;
    });
    if (!force && meilleur.s > 0) { ouvrir(false); return; } // une fenêtre du jeu est arrivée dessous : le panneau lui cède la place
    panneau.style.left = meilleur.x + "px"; panneau.style.top = meilleur.y + "px";
  }
  tete.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button")) return;
    var r = panneau.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; tete.setPointerCapture(e.pointerId);
    var bouge = function (ev) { panneau.style.left = Math.max(0, Math.min(ev.clientX - dx, innerWidth - r.width)) + "px"; panneau.style.top = Math.max(0, Math.min(ev.clientY - dy, innerHeight - 40)) + "px"; };
    var fin = function () { tete.removeEventListener("pointermove", bouge); tete.removeEventListener("pointerup", fin); tete.removeEventListener("pointercancel", fin); reglages.pos = { x: parseInt(panneau.style.left, 10) || 0, y: parseInt(panneau.style.top, 10) || 0 }; sauverReglages(); };
    tete.addEventListener("pointermove", bouge); tete.addEventListener("pointerup", fin); tete.addEventListener("pointercancel", fin);
  });
  var horlogeT = null;
  // chaque minute : le pied, et la liste « À ouvrir » dont les fenêtres s'ouvrent et se ferment avec l'heure
  function horloge() { clearTimeout(horlogeT); if (document.hidden) return; horlogeT = setTimeout(function () { if (!panneau.hidden && !champ.value && !vueReglages) rendre(); else { majPied(); majPastille(); } horloge(); }, 60000 - (Date.now() % 60000) + 200); }

  // --- Ouvrir DECK : GM_openInTab, puis bandeau si aucun battement d2.vie dans les 8 s ---
  var ouvertureT = null;
  function ouvrirDeck() {
    var v = G.get("d2.vie", null), url = v && v.url;
    if (!url) return flash("Adresse de DECK inconnue : ouvre deck/index.html une fois dans ce navigateur.", true, []);
    var avant = v.at || 0;
    try { GM_openInTab(url, { active: true, insert: true }); } catch (e) { console.warn("DECK 2 › GM_openInTab", e); }
    flash("Ouverture de DECK…");
    clearTimeout(ouvertureT);
    ouvertureT = setTimeout(function () {
      var v2 = G.get("d2.vie", null); if (v2 && v2.at > avant && v2.at > maintenant() - 20000) return flash("DECK est ouvert.");
      flash("DECK n’a pas répondu : Tampermonkey refuse souvent d’ouvrir un fichier local. Copie l’adresse et colle-la dans un nouvel onglet. " + url, true,
        [el("button", { class: "b", type: "button", texte: "Copier l’adresse", onclick: function () { navigator.clipboard.writeText(url).then(function () { flash("Adresse copiée : Ctrl+T puis Ctrl+V."); }, function (e) { console.warn("DECK 2 › copie", e); flash("Copie refusée : sélectionne l’adresse ci-dessus.", true, []); }); } }),
         el("button", { class: "b", type: "button", texte: "Fermer", onclick: function () { flash(""); } })]);
    }, 8000);
  }

  // --- Événements du panneau ---
  pastille.addEventListener("click", function () { ouvrir(panneau.hidden, true); });
  btReg.addEventListener("click", function () { vueReglages = !vueReglages; rendre(); });
  champ.addEventListener("input", function () { vueReglages = false; rendre(); });
  champ.addEventListener("keydown", function (e) { if (e.key !== "Escape") e.stopPropagation(); }); // ce qu'on tape ne part pas vers le jeu
  sh.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || panneau.hidden) return;
    e.stopPropagation();
    if (champ.value && sh.activeElement === champ) { champ.value = ""; rendre(); return; }
    if (vueReglages) { vueReglages = false; rendre(); return; }
    ouvrir(false); pastille.focus();
  });
  addEventListener("keydown", function (e) {
    var t = reglages.touche; if (!t || t.off || !e.key) return;
    if (!!t.alt !== e.altKey || !!t.ctrl !== e.ctrlKey || !!t.shift !== e.shiftKey) return;
    if (e.key.toLowerCase() !== t.key && e.code !== t.code) return;
    var a = document.activeElement; if (a === host) a = sh.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return; // jamais pendant une saisie
    e.preventDefault(); ouvrir(panneau.hidden, true); if (panneau.hidden) pastille.focus();
  });

  /* ================= 10. Démarrage ================= */
  document.body.appendChild(host);
  G.ecoute("d2.plan", function () { coches = {}; reportes = {}; enAttente = {}; planifierRappels(); rendre(); envoyerTaches(); });
  G.ecoute("d2.annuaire", function () { if (champ.value) rendre(); envoyerContacts(); });
  G.ecoute("d2.secteur", envoyerSecteur);
  G.ecoute("d2.guide", function () { planifierRappels(); rendre(); });
  G.ecoute("d2.vie", function () { majPied(); });
  G.ecoute("d2.recus", surRecus);
  G.ecoute("d2.reglages", function (k, o, n, distant) { if (distant && n) { reglages = Object.assign(reglages, n); planifierScene(); majPastille(); } });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { clearTimeout(horlogeT); return; }
    planifierRappels(); planifierScene(); rendre(); horloge();
  });
  addEventListener("resize", function () { placer(true); });
  if (surMain() && tx($("#txt_pseudo")) && reglages.perso !== tx($("#txt_pseudo"))) { reglages.perso = tx($("#txt_pseudo")); sauverReglages(); }
  if (reglages.ouvert && !enCombat) ouvrir(true); else rendre();
  planifierRappels(); planifierScene(); horloge();
  PASS.envoyer("bonjour", { version: VERSION, capacites: ["contacts", "taches", "secteur", "fiche"] });
  ecouter();
  // Le jeu construit son écran après le chargement : lecture initiale à 1,5 s, puis on attache les observateurs
  // (nouvelle tentative pendant 30 s au plus pour les conteneurs qui naissent plus tard). Ensuite, plus rien au repos.
  setTimeout(function () { attacher(); toutLire(true); }, 1500);
  for (var i = 1; i <= 15; i++) setTimeout(attacher, 1500 + i * 2000);

  if (W.D2_BANC) W.D2_BANC.pont = { VERSION: VERSION, LECTEURS: LECTEURS, lecteur: function (n) { return PAR_NOM[n]; }, lancer: function (n) { return lancer(PAR_NOM[n], false); },
    toutLire: toutLire, attacher: attacher, surReponse: surReponse, capture: capture, geste: geste, chercher: chercher, ligneChat: ligneChat, nombre: nombre, texteSauts: texteSauts,
    ouvrir: ouvrir, rendre: rendre, scene: scene, planifierRappels: planifierRappels, reglages: function () { return reglages; }, racine: sh, memoire: memoire,
    ecart: function (v) { if (v != null) ecart = v; return ecart; }, stats: function () { return { captures: stats.captures, lectures: nbLectures, ecoute: ecoute, combat: enCombat, pair: PASS.pair() }; } };
})();

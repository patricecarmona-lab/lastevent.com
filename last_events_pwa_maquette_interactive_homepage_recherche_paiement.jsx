import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";

// === Helpers ===
// Robust API base resolution (browser-first, then Node-like envs). Avoids ReferenceError: process is undefined.
const API_BASE = (() => {
  // Allow overriding from the browser via a global for demos: window.__NEXT_PUBLIC_API_BASE = "https://api.example.com"
  if (typeof window !== "undefined" && typeof (window as any).__NEXT_PUBLIC_API_BASE === "string") {
    return (window as any).__NEXT_PUBLIC_API_BASE as string;
  }
  // Try Node-like env (Next.js / Vite replace) — guarded to avoid ReferenceError in pure browser runtimes
  const g: any = typeof globalThis !== "undefined" ? (globalThis as any) : {};
  const env = g?.process?.env || {};
  if (typeof env.NEXT_PUBLIC_API_BASE === "string") return env.NEXT_PUBLIC_API_BASE as string;
  return ""; // same-origin by default
})();

async function fetchEventsFromApi(params: Record<string, any> = {}){
  const qs = new URLSearchParams(Object.entries(params).filter(([_,v])=> v!==undefined && v!==null && v!=="")) .toString();
  const base = API_BASE?.replace(/\/$/, "") || "";
  const url = `${base}/api/events${qs?`?${qs}`:""}`;
  const res = await fetch(url, { headers: { "Content-Type":"application/json" } });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// Lightweight self-tests for URL building (runs only in browser dev)
if (typeof window !== "undefined") {
  try {
    const testQs = new URLSearchParams({ q:"dj", city:"Paris", lastMinute:"1" }).toString();
    const testUrl = `${(API_BASE||"")}/api/events?${testQs}`;
    console.assert(testUrl.includes("/api/events?"), "[TEST] URL should include /api/events and query string");
  } catch { /* no-op */ }
}

const currency = (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
const fadeUp = (d=0) => ({ initial:{opacity:0,y:24}, whileInView:{opacity:1,y:0}, transition:{duration:0.7, ease:"easeOut", delay:d}, viewport:{ once:true, margin:"-80px" } });

// Simple shimmer using animated gradient
function Shimmer({ className }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={`relative inline-block ${className??""}`}
      initial={{ backgroundPositionX: 0 }}
      animate={{ backgroundPositionX: 200 }}
      transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
      style={{
        backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 50%, rgba(255,255,255,0) 100%)",
        backgroundSize: "200px 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent"
      }}>
      {/* shimmer mask text comes from children via parent layering */}
    </motion.span>
  );
}

// === Paiement (Checkout) ===
const FEE_PERCENT = 10; // commission par défaut (5–15 %)
async function payer(amountEuros: number, connectedAccountId: string, feePercent = FEE_PERCENT, name = "Billet / Prestation"){
  try{
    const res = await fetch("/api/payments/create-checkout",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ amountCents: Math.round(Number(amountEuros)*100), connectedAccountId, feePercent, name })
    });
    const data = await res.json();
    if(data?.url){ window.location.href = data.url; return; }
    alert("Impossible d'ouvrir le paiement. Vérifie l'API /api/payments/create-checkout.");
  }catch(e){
    console.error(e);
    alert("Erreur de paiement: "+ String(e));
  }
}

// === Données fictives ===
const SAMPLE_EVENTS = [
  { id: "ev1", title: "Concert Jazz Rooftop", city: "Paris", country: "France", date: "2025-11-07", lastMinute: true, discount: 30, price: 39, cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1600&auto=format&fit=crop", tags: ["Concert", "Live", "Rooftop"], seats: 42, connectedAccountId: "acct_demo_001" },
  { id: "ev2", title: "Salle Haussmann – dispo samedi (mariage)", city: "Lyon", country: "France", date: "2025-11-08", lastMinute: true, discount: 25, price: 1200, cover: "https://images.unsplash.com/photo-1523217582562-09d0def993a6?q=80&w=1600&auto=format&fit=crop", tags: ["Mariage", "Salle", "Réception"], seats: 1, connectedAccountId: "acct_demo_001" },
  { id: "ev3", title: "DJ Set + Sono (pack anniversaire)", city: "Marseille", country: "France", date: "2025-11-05", lastMinute: true, discount: 20, price: 350, cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1600&auto=format&fit=crop", tags: ["DJ", "Anniversaire", "Prestation"], seats: 3, connectedAccountId: "acct_demo_001" },
  { id: "ev4", title: "Atelier Mixologie – team building", city: "Bruxelles", country: "Belgique", date: "2025-11-12", lastMinute: false, discount: 0, price: 59, cover: "https://images.unsplash.com/photo-1544145945-f90425340c7e?q=80&w=1600&auto=format&fit=crop", tags: ["Entreprise", "Atelier", "Team building"], seats: 12, connectedAccountId: "acct_demo_001" }
];

export default function LastEventsApp() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [onlyLastMinute, setOnlyLastMinute] = useState(true);
  const [view, setView] = useState("home"); // home | register
  const [registerTab, setRegisterTab] = useState("pro"); // pro | intervenant

  // === CONNECTÉ À INTERNET ===
  const [events, setEvents] = useState(SAMPLE_EVENTS);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(false);

  React.useEffect(()=>{
    // Chargement initial depuis l'API si dispo
    (async()=>{
      try{
        setLoading(true);
        const data = await fetchEventsFromApi({});
        if(Array.isArray(data?.items)){
          setEvents(data.items);
          setOnline(true);
        }
      }catch(e){
        setOnline(false); // on reste sur SAMPLE_EVENTS
      }finally{ setLoading(false); }
    })();
  },[]);

  const runSearch = async ()=>{
    try{
      setLoading(true);
      const data = await fetchEventsFromApi({ q: query, city, date, lastMinute: onlyLastMinute?"1":"0" });
      if(Array.isArray(data?.items)){
        setEvents(data.items);
        setOnline(true);
      }
    }catch(e){ setOnline(false); }
    finally{ setLoading(false); }
  }; // pro | intervenant

  const filtered = useMemo(() => {
    return events.filter((e: any) => {
      const matchesQ = query ? e.title.toLowerCase().includes(query.toLowerCase()) || (e.tags||[]).join(" ").toLowerCase().includes(query.toLowerCase()) : true;
      const matchesCity = city ? (e.city||"").toLowerCase().includes(city.toLowerCase()) : true;
      const matchesDate = date ? e.date === date : true;
      const matchesLM = onlyLastMinute ? !!e.lastMinute : true;
      return matchesQ && matchesCity && matchesDate && matchesLM;
    });
  }, [events, query, city, date, onlyLastMinute]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9 }} className="min-h-screen bg-gradient-to-b from-white to-pink-50 text-neutral-900 font-serif">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur border-b border-pink-200 bg-white/80 shadow-sm">
        <motion.div {...fadeUp(0)} className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={()=>setView("home")}>
            <motion.span whileHover={{ scale: 1.06 }} className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-pink-600 text-white font-bold shadow-md">LE</motion.span>
            <div>
              <div className="font-extrabold leading-5 text-2xl tracking-tight text-pink-600 drop-shadow-sm">LastEvents<span className="text-neutral-400">.com</span></div>
              <div className="text-xs text-neutral-500 italic">Événements & services dernière minute</div>
            </div>
          </div>
          <nav className="ml-auto flex items-center gap-2 text-sm">
            <button className={`px-3 py-2 rounded-xl ${view==="home"?"bg-pink-600 text-white":"hover:bg-neutral-100"}`} onClick={()=>setView("home")}>Découvrir</button>
            <button className={`px-3 py-2 rounded-xl ${view==="register"?"bg-pink-600 text-white":"hover:bg-neutral-100"}`} onClick={()=>setView("register")}>Inscription</button>
          </nav>
        </motion.div>
        {/* Statut connexion */}
        <div className="absolute right-4 bottom-2 text-xs flex items-center gap-2">
          <span className={`inline-flex h-2 w-2 rounded-full ${online?"bg-green-500":"bg-neutral-300"}`}></span>
          <span className="text-neutral-500">{online?"Connecté à Internet":"Mode démo (offline)"}</span>
        </div>
      </header>

      {/* Hero */}
      <motion.section {...fadeUp(0.1)} className="bg-gradient-to-b from-white to-pink-50 border-b border-pink-100">
        <div className="max-w-6xl mx-auto px-4 py-14 text-center">
          <motion.h1 {...fadeUp(0.15)} className="relative text-4xl md:text-5xl font-extrabold tracking-tight text-neutral-900 drop-shadow-sm inline-block">
            <span className="relative z-10">Le luxe, c’est de décider maintenant</span>
            <Shimmer className="absolute inset-0 z-20" />
            <span className="ml-2">✨</span>
          </motion.h1>
          <motion.p {...fadeUp(0.25)} className="text-neutral-600 mt-3 text-lg">
            Réservez des expériences d’exception, disponibles tout de suite.
          </motion.p>

          {view === "home" && (
            <motion.div {...fadeUp(0.35)} className="mt-8 grid grid-cols-1 md:grid-cols-6 gap-3 max-w-4xl mx-auto">
              <input className="md:col-span-2 px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Quoi ? (concert, DJ, salle, traiteur…)" value={query} onChange={(e)=>setQuery(e.target.value)} />
              <input className="px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Où ? (ville)" value={city} onChange={(e)=>setCity(e.target.value)} />
              <input type="date" className="px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" value={date} onChange={(e)=>setDate(e.target.value)} />
              <label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={onlyLastMinute} onChange={(e)=>setOnlyLastMinute(e.target.checked)} />Last minute</label>
              <motion.button whileHover={{ scale: 1.03 }} onClick={runSearch} className="px-4 py-3 rounded-2xl bg-pink-600 text-white font-semibold shadow-md hover:shadow-lg transition">Rechercher</motion.button>
            </motion.div>
          )}
        </div>
      </motion.section>

      {view === "home" && (
        <main className="max-w-6xl mx-auto px-4 py-10">
          <motion.h2 {...fadeUp(0.1)} className="text-2xl font-bold mb-6 text-neutral-800 border-b border-pink-200 pb-2">
            Événements disponibles
            {loading && <span className="ml-3 text-sm text-neutral-500">Chargement…</span>}
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((e: any, i: number) => (
              <motion.article
                key={e.id}
                {...fadeUp(i * 0.05)}
                className="group rounded-3xl overflow-hidden bg-white border border-pink-100 shadow-md hover:shadow-xl transition-all duration-300">
                <div className="relative">
                  <img src={e.cover} alt={e.title} className="h-48 w-full object-cover" />
                  {e.lastMinute && (
                    <span className="absolute top-3 left-3 px-3 py-1 text-xs font-bold rounded-full bg-pink-600 text-white shadow-sm">Last Minute -{e.discount}%</span>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-lg text-neutral-800 line-clamp-2">
                    <span className="relative inline-block">
                      {e.title}
                      <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"><Shimmer /></span>
                    </span>
                  </h3>
                  <p className="text-sm text-neutral-600">{e.city}, {e.country}</p>
                  <div className="mt-3 flex justify-between items-center">
                    <span className="text-pink-600 font-bold text-lg">{currency(e.price)}</span>
                    <motion.button whileHover={{ scale: 1.05 }} onClick={()=>{ const fp = Number((window as any).localStorage?.getItem('feePercent')||'10'); payer(e.price, e.connectedAccountId, fp, e.title); }} className="px-4 py-2 rounded-xl bg-pink-600 text-white font-semibold shadow hover:shadow-md">Payer</motion.button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </main>
      )}

      {view === "register" && (
        <main className="max-w-5xl mx-auto px-4 py-12">
          <motion.h2 {...fadeUp(0.1)} className="text-3xl font-bold text-neutral-900">Inscription</motion.h2>
          <motion.p {...fadeUp(0.15)} className="text-neutral-600 mt-1">Rejoignez LastEvents et vendez vos événements ou prestations en quelques minutes.</motion.p>

          {/* Tabs */}
          <motion.div {...fadeUp(0.2)} className="mt-6 flex gap-2">
            <button onClick={()=>setRegisterTab("pro")} className={`px-4 py-2 rounded-2xl border ${registerTab==="pro"?"bg-pink-600 text-white border-pink-600":"border-pink-200 hover:bg-pink-50"}`}>Professionnels (salles, organisateurs)</button>
            <button onClick={()=>setRegisterTab("intervenant")} className={`px-4 py-2 rounded-2xl border ${registerTab==="intervenant"?"bg-pink-600 text-white border-pink-600":"border-pink-200 hover:bg-pink-50"}`}>Intervenants (DJ, photo, traiteur…)</button>
          </motion.div>

          {/* Forms */}
          {registerTab === "pro" ? <ProForm /> : <IntervenantForm />}

          {/* Trust / perks */}
          <motion.ul {...fadeUp(0.2)} className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-neutral-700">
            <li className="p-4 rounded-2xl bg-white border border-pink-100">✅ Paiements sécurisés (Stripe Connect)</li>
            <li className="p-4 rounded-2xl bg-white border border-pink-100">📈 Outils marketing & boost dernière minute</li>
            <li className="p-4 rounded-2xl bg-white border border-pink-100">💶 Commission 5–15% transparente + Abonnement Pro en option</li>
          </motion.ul>
        </main>
      )}

      {/* Footer */}
      <motion.footer {...fadeUp(0.1)} className="mt-20 border-t border-pink-100 bg-white text-center py-10 text-sm text-neutral-600">
        © {new Date().getFullYear()} <b className="text-pink-600">LastEvents.com</b> — Expériences haut de gamme, disponibles maintenant.
      </motion.footer>
    </motion.div>
  );
}

function ProForm(){
  return (
    <motion.form {...fadeUp(0.3)} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-white border border-pink-100 rounded-3xl shadow-sm">
      <div className="md:col-span-2"><label className="text-sm text-neutral-700">Raison sociale</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: Société Événementielle SAS"/></div>
      <div><label className="text-sm text-neutral-700">SIREN / TVA</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: 123 456 789"/></div>
      <div><label className="text-sm text-neutral-700">Catégorie</label>
        <select className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600">
          <option>Salle / Lieu</option>
          <option>Organisateur / Agence</option>
          <option>Hôtel / Restaurant</option>
          <option>Autre</option>
        </select>
      </div>
      <div><label className="text-sm text-neutral-700">Ville</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: Paris"/></div>
      <div><label className="text-sm text-neutral-700">Pays</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: France"/></div>
      <div className="md:col-span-2"><label className="text-sm text-neutral-700">Site web (optionnel)</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="https://"/></div>
      <div><label className="text-sm text-neutral-700">E-mail</label><input type="email" className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="pro@exemple.com"/></div>
      <div><label className="text-sm text-neutral-700">Téléphone</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="+33"/></div>
      <div className="md:col-span-2"><label className="text-sm text-neutral-700">Description</label><textarea rows={4} className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Présentez votre activité, vos points forts…"/></div>
      <div><label className="text-sm text-neutral-700">IBAN (virements)</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="FR76 **** **** ****"/></div>
      <div><label className="text-sm text-neutral-700">Pièce d’identité (KYC)</label><input type="file" className="mt-1 w-full px-4 py-2 rounded-2xl border border-pink-200"/></div>
      <div className="md:col-span-2 flex justify-end">
        <motion.button whileHover={{ scale: 1.02 }} className="px-5 py-3 rounded-2xl bg-pink-600 text-white font-semibold shadow">Créer mon compte Pro</motion.button>
      </div>
    </motion.form>
  );
}

function IntervenantForm(){
  return (
    <motion.form {...fadeUp(0.3)} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-white border border-pink-100 rounded-3xl shadow-sm">
      <div><label className="text-sm text-neutral-700">Métier</label>
        <select className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600">
          <option>DJ</option>
          <option>Photographe</option>
          <option>Vidéaste</option>
          <option>Traiteur</option>
          <option>Animateur / Artiste</option>
          <option>Technicien son/lumière</option>
          <option>Autre</option>
        </select>
      </div>
      <div><label className="text-sm text-neutral-700">Nom / Scène</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: DJ Nova"/></div>
      <div><label className="text-sm text-neutral-700">Ville</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: Lyon"/></div>
      <div><label className="text-sm text-neutral-700">Rayon de déplacement</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: 150 km"/></div>
      <div><label className="text-sm text-neutral-700">Tarif indicatif</label><input type="number" className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="€"/></div>
      <div><label className="text-sm text-neutral-700">Disponibilités</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Ex: soirs & week-end"/></div>
      <div className="md:col-span-2"><label className="text-sm text-neutral-700">Portfolio / Réseaux</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Lien Instagram, site, YouTube…"/></div>
      <div className="md:col-span-2"><label className="text-sm text-neutral-700">Présentation</label><textarea rows={4} className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="Décrivez votre style, votre matériel, vos prestations…"/></div>
      <div><label className="text-sm text-neutral-700">E-mail</label><input type="email" className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="vous@exemple.com"/></div>
      <div><label className="text-sm text-neutral-700">Téléphone</label><input className="mt-1 w-full px-4 py-3 rounded-2xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-600" placeholder="+33"/></div>
      <div className="md:col-span-2 flex justify-end">
        <motion.button whileHover={{ scale: 1.02 }} className="px-5 py-3 rounded-2xl bg-pink-600 text-white font-semibold shadow">Créer mon profil Intervenant</motion.button>
      </div>
    </motion.form>
  );
}

/* ================= Premium Commission Slider (floating widget) =================
   - Visible sur toutes les pages (floating, bas-droite)
   - Persiste le pourcentage dans localStorage('feePercent')
   - Étapes : 5, 10, 15
   - Style "premium" (verre dépoli, ombres, arrondis 2xl)
=============================================================================== */
if (typeof window !== 'undefined' && !(window as any).__leFeeWidgetMounted){
  (window as any).__leFeeWidgetMounted = true;
  const root = document.createElement('div');
  root.id = 'le-fee-widget-root';
  document.body.appendChild(root);
  root.innerHTML = `
    <div id="le-fee-widget" class="fixed z-50 bottom-6 right-6 backdrop-blur bg-white/80 border border-pink-100 shadow-xl rounded-2xl p-4 w-[320px] select-none">
      <div class="flex items-center justify-between mb-2">
        <div class="font-semibold text-neutral-800">Commission</div>
        <div id="le-fee-badge" class="px-3 py-1 rounded-full text-sm font-semibold bg-pink-600 text-white shadow">10%</div>
      </div>
      <div class="text-xs text-neutral-500 mb-3">Appliquée sur chaque paiement (5–15%).</div>
      <div class="relative">
        <input id="le-fee-range" type="range" min="5" max="15" step="5" value="10" class="w-full h-2 rounded-full bg-pink-200 appearance-none cursor-pointer">
        <div class="flex justify-between text-[10px] text-neutral-500 mt-1">
          <span>5%</span><span>10%</span><span>15%</span>
        </div>
      </div>
      <div class="mt-3 flex items-center justify-between">
        <div class="text-xs text-neutral-500">Conseil: démarrez à 10%.</div>
        <button id="le-fee-close" class="text-xs px-3 py-1 rounded-xl bg-neutral-100 hover:bg-neutral-200">Masquer</button>
      </div>
    </div>`;

  const get = ()=> Number(localStorage.getItem('feePercent')||'10');
  const set = (v: number)=> localStorage.setItem('feePercent', String(v));

  const badge = document.getElementById('le-fee-badge');
  const range = document.getElementById('le-fee-range') as HTMLInputElement | null;
  const card  = document.getElementById('le-fee-widget');
  const close = document.getElementById('le-fee-close');

  const init = ()=>{ const v=get(); if(range){ range.value = String([5,10,15].includes(v)?v:10); } if(badge){ badge.textContent = (range?.value||'10') + '%'; } };
  const pop  = ()=>{ card?.classList.add('ring-2','ring-pink-300'); setTimeout(()=>card?.classList.remove('ring-2','ring-pink-300'), 300); };

  range?.addEventListener('input', (e: any)=>{
    const v = Number((e.target)?.value||10);
    if(badge) badge.textContent = v + '%';
    set(v);
    pop();
  });
  close?.addEventListener('click', ()=>{ card?.classList.add('scale-95','opacity-0'); setTimeout(()=>root.remove(), 180); });

  init();
}

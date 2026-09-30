/* Jauge — service worker
   Règle : ce qui décide de l'identité de l'application (le manifeste, la page)
   passe par le réseau en priorité. Seuls les fichiers inertes, les icônes, sont
   servis depuis le cache. Servir un manifeste périmé empêche Chrome de voir un
   changement d'identité et bloque l'installation. */
const CACHE = "jauge-v9";
const SHELL = [
  "./", "./index.html", "./app.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"
];

self.addEventListener("install", e=>{
  e.waitUntil(
    caches.open(CACHE)
      // addAll échoue en bloc si un seul fichier manque : on tolère les absences
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(()=>{}))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

/* Permet à la page de forcer la mise à jour ou de tout effacer */
self.addEventListener("message", e=>{
  if(!e.data) return;
  if(e.data === "skipWaiting") self.skipWaiting();
  if(e.data === "purge") e.waitUntil(caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))));
});

function networkFirst(req){
  return fetch(req).then(r=>{
    if(r && r.status === 200){
      const copy = r.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
    }
    return r;
  }).catch(()=>caches.match(req));
}

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  // Jamais de cache pour les API externes (Open Food Facts, fournisseur IA)
  if(url.origin !== self.location.origin) return;

  // Le manifeste porte l'identité de l'app : toujours la version du serveur
  if(url.pathname.endsWith(".webmanifest") || req.destination === "manifest"){
    e.respondWith(networkFirst(req));
    return;
  }

  // La page : réseau d'abord, cache en secours (mode avion)
  if(req.mode === "navigate"){
    e.respondWith(
      fetch(req).then(r=>{
        const copy = r.clone();
        caches.open(CACHE).then(c=>c.put("./index.html", copy));
        return r;
      }).catch(()=>caches.match("./index.html").then(hit=>hit||caches.match("./")))
    );
    return;
  }

  // Icônes et autres fichiers inertes : cache d'abord
  e.respondWith(
    caches.match(req).then(hit=> hit || fetch(req).then(r=>{
      if(r && r.status === 200 && r.type === "basic"){
        const copy = r.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
      }
      return r;
    }).catch(()=>hit))
  );
});

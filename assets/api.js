/* Shared helpers for every page: data loading, caching, images, inventory and the nav bar.

   Data sources (all loaded live in the browser):
   - Project Amber / Yatta (gi.yatta.moe): characters, weapons, artifact sets, materials,
     the daily domain schedule and where to gather each material.
   - paimon.moe's open-source repo (MIT): current banners, recommended builds, artifact-set domains. */

const YATTA = 'https://gi.yatta.moe/api/v2/en';
const ASSET = 'https://gi.yatta.moe/assets/UI';
const PAIMON = 'https://raw.githubusercontent.com/MadeBaruna/paimon-moe/main/src/data';
const JSON5_URL = 'https://cdnjs.cloudflare.com/ajax/libs/json5/2.2.3/index.min.js';
// The site's root folder, worked out from where this script lives, so links work from any page.
const ROOT = document.currentScript.src.replace(/assets\/api\.js.*$/, '');
const CACHE_HOURS = 12;

const ELEMENT = { Wind: 'Anemo', Rock: 'Geo', Electric: 'Electro', Grass: 'Dendro', Water: 'Hydro', Fire: 'Pyro', Ice: 'Cryo' };
const ELEMENTS = ['Anemo', 'Geo', 'Electro', 'Dendro', 'Hydro', 'Pyro', 'Cryo'];
const WEAPON = { WEAPON_SWORD_ONE_HAND: 'Sword', WEAPON_CLAYMORE: 'Claymore', WEAPON_POLE: 'Polearm', WEAPON_BOW: 'Bow', WEAPON_CATALYST: 'Catalyst' };
const REGION = {
  MONDSTADT: 'Mondstadt', LIYUE: 'Liyue', INAZUMA: 'Inazuma', SUMERU: 'Sumeru', FONTAINE: 'Fontaine',
  NATLAN: 'Natlan', NODKRAI: 'Nod-Krai', NODKRAI_ZIBAI: 'Nod-Krai', SNEZHNAYA: 'Snezhnaya',
  SNEZHNAYA_STAR: 'Snezhnaya', FATUI: 'Snezhnaya', MAINACTOR: 'Traveler',
};
const CITY = { 1: 'Mondstadt', 2: 'Liyue', 3: 'Inazuma', 4: 'Sumeru', 5: 'Fontaine', 6: 'Natlan', 7: 'Nod-Krai' };
const NATION_ORDER = ['Mondstadt', 'Liyue', 'Inazuma', 'Sumeru', 'Fontaine', 'Natlan', 'Nod-Krai', 'Snezhnaya', 'Traveler', 'Other'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAP_URL = 'https://act.hoyolab.com/ys/app/interactive-map/index.html?lang=en-us';
const SLOTS = ['flower', 'plume', 'sands', 'goblet', 'circlet'];
const SLOT_LABEL = { flower: 'Flower', plume: 'Plume', sands: 'Sands', goblet: 'Goblet', circlet: 'Circlet' };

/* ---------- loading + caching ---------- */

function readCache(key, hours = CACHE_HOURS) {
  try {
    const c = JSON.parse(localStorage.getItem('gi2:' + key));
    if (c && Date.now() - c.t < hours * 3600e3) return c.d;
  } catch (e) { /* storage unavailable: just refetch */ }
  return null;
}
function writeCache(key, d) {
  try { localStorage.setItem('gi2:' + key, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* too big or blocked */ }
}
// Run fn once and cache what it returns. Concurrent callers share one request.
const inflight = {};
function cached(key, fn, hours) {
  const hit = readCache(key, hours);
  if (hit) return Promise.resolve(hit);
  if (!inflight[key]) {
    inflight[key] = fn().then(d => { writeCache(key, d); delete inflight[key]; return d; },
      e => { delete inflight[key]; throw e; });
  }
  return inflight[key];
}

// At most a few requests at once, retrying briefly: the API drops requests that arrive in a burst.
const MAX_PARALLEL = 5;
let active = 0;
const waiting = [];
async function politeFetch(url) {
  if (active >= MAX_PARALLEL) await new Promise(res => waiting.push(res));
  active++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(url);
        if (r.ok || r.status === 404 || attempt >= 2) return r;
      } catch (e) { if (attempt >= 2) throw e; }
      await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
    }
  } finally {
    active--;
    if (waiting.length) waiting.shift()();
  }
}

// One Yatta endpoint, e.g. yatta('avatar/10000125'). Returns the response's data.
function yatta(path) {
  return cached('y:' + path, async () => {
    const r = await politeFetch(`${YATTA}/${path}`);
    if (!r.ok) throw new Error(`Couldn't load ${path} (HTTP ${r.status})`);
    return (await r.json()).data;
  });
}

// paimon.moe keeps its data as JavaScript files ("export const x = {...}"); JSON5 reads them safely.
let json5Loading = null;
function loadJSON5() {
  if (window.JSON5) return Promise.resolve();
  return json5Loading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = JSON5_URL; s.onload = res; s.onerror = () => rej(new Error('Could not load the JSON5 parser'));
    document.head.append(s);
  });
}
function paimon(file, hours = CACHE_HOURS) {
  return cached('p:' + file, async () => {
    const r = await fetch(`${PAIMON}/${file}`);
    if (!r.ok) throw new Error(`Couldn't load paimon.moe ${file} (HTTP ${r.status})`);
    const text = await r.text();
    if (file.endsWith('.json')) return JSON.parse(text);
    await loadJSON5();
    return JSON5.parse(text.replace(/^[\s\S]*?export const \w+\s*=\s*/, '').replace(/;\s*$/, ''));
  }, hours);
}

/* ---------- small utilities ---------- */

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const titleize = s => String(s).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);
// Game text has color tags, link markers and escaped newlines; turn it into plain text.
const gameText = s => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\{LINK#[^}]*\}|\{\/LINK\}/g, '').replace(/\\n/g, '\n');
const fmt = n => Number(n).toLocaleString();

// The game's day rolls over at 4 AM, so before 4 AM it still counts as yesterday.
function gameDay() {
  const d = new Date();
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return DAY_NAMES[d.getDay()];
}
const availableOn = (days, day) => day === 'Sunday' || days.includes(day);
const nationRank = n => { const i = NATION_ORDER.indexOf(n); return i < 0 ? 99 : i; };

/* ---------- images ---------- */

const asset = icon => `${ASSET}/${icon}.png`;
// Artifact-set icons live in their own folder on the image server.
const relicIcon = icon => `${ASSET}/reliquary/${icon}.png`;
const itemIcon = id => `${ASSET}/UI_ItemIcon_${id}.png`;
const splashOf = icon => asset(String(icon).replace('UI_AvatarIcon_', 'UI_Gacha_AvatarImg_'));

// <img> that falls back to other images, then to a lettered tile, if one is missing.
function imgTag(src, alt, cls = '', fallbacks = []) {
  const fb = esc(JSON.stringify(fallbacks));
  return `<img src="${esc(src)}" alt="${esc(alt)}" class="${cls}" loading="lazy" data-fb="${fb}" onerror="imgFail(this)">`;
}
function imgFail(el) {
  const list = JSON.parse(el.dataset.fb || '[]');
  if (list.length) { el.dataset.fb = JSON.stringify(list.slice(1)); el.src = list[0]; return; }
  const ph = document.createElement('div');
  ph.className = el.className + ' img-missing';
  ph.textContent = (el.alt || '?').trim().charAt(0);
  el.replaceWith(ph);
}

/* ---------- characters, weapons, artifact sets ---------- */

// Every playable character as a small record. Travelers get one entry per element.
function getCharacters() {
  return cached('chars-v1', async () => {
    const list = await yatta('avatar');
    return Object.values(list.items)
      .filter(a => a.element && !String(a.id).startsWith('10000007'))
      .map(a => {
        const element = ELEMENT[a.element] || a.element;
        const traveler = a.region === 'MAINACTOR';
        return {
          id: String(a.id), name: traveler ? `Traveler (${element})` : a.name, baseName: a.name,
          rarity: a.rank, element, weapon: WEAPON[a.weaponType] || a.weaponType,
          nation: REGION[a.region] || 'Other', icon: a.icon, release: a.release || 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}
async function charLookup() {
  const chars = await getCharacters();
  const byId = Object.fromEntries(chars.map(c => [c.id, c]));
  const byName = Object.fromEntries(chars.map(c => [norm(c.name), c]));
  // The Traveler without an element (and the twin) map onto the matching entry.
  chars.forEach(c => { if (c.nation !== 'Traveler') byName[norm(c.baseName)] ||= c; });
  return { chars, byId, byName };
}

function getWeapons() {
  return cached('weapons-v1', async () => {
    const list = await yatta('weapon');
    return Object.values(list.items).map(w => ({
      id: String(w.id), name: w.name, rarity: w.rank, type: WEAPON[w.type] || w.type, icon: w.icon,
    })).sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
  });
}

// Which domain drops each artifact set, from genshin-db: { "Golden Troupe": "Denouement of Sin (Fontaine)" }
function getArtifactDomains() {
  return cached('artifact-domains-v1', async () => {
    const r = await politeFetch('https://genshin-db-api.vercel.app/api/v5/domains?query=UI_ABYSSUS_RELIC&matchCategories=true&verboseCategories=true&dumpResults=true');
    if (!r.ok) throw new Error('genshin-db domains');
    const map = {};
    for (const d of await r.json()) {
      for (const x of d.rewardPreview || []) {
        if (x.id >= 400000 && x.rarity >= 4) map[norm(x.name)] ||= `${d.entranceName} (${d.regionName})`;
      }
    }
    return map;
  }, 24 * 7);
}

// Artifact sets: Yatta for names, icons and bonuses; genshin-db for the domain; paimon.moe's ids to match builds.
function getArtifactSets() {
  return cached('sets-v2', async () => {
    const [list, pm, domains] = await Promise.all([
      yatta('reliquary'), paimon('artifacts/en.json').catch(() => ({})), getArtifactDomains().catch(() => ({})),
    ]);
    const pmByName = Object.fromEntries(Object.values(pm).map(s => [norm(s.name), s]));
    return Object.values(list.items).map(s => {
      const p = pmByName[norm(s.name)] || {};
      const bonuses = Object.values(s.affixList || {}).map(gameText);
      const maxRarity = Math.max(...(s.levelList || [1]));
      return {
        id: String(s.id), key: p.id || norm(s.name), name: s.name, icon: s.icon, maxRarity, bonuses,
        domain: domains[norm(s.name)] || (p.domain ? titleize(p.domain) : (maxRarity === 5 ? 'Boss drops (no domain)' : '')),
      };
    }).sort((a, b) => b.maxRarity - a.maxRarity || a.name.localeCompare(b.name));
  });
}

/* ---------- daily domains ---------- */

/* Talent-book and weapon-material domains, grouped by the item series they drop:
   { kind: 'talent'|'weapon', key, name, days: [...], city, nation, topId, rewardIds } */
async function getDomainGroups() {
  const hit = readCache('domain-groups-v2');
  if (hit) return hit;
  const result = await buildDomainGroups();
  // Only remember a complete schedule, so one failed request doesn't hide a book for 12 hours.
  if (!result.incomplete) writeCache('domain-groups-v2', result.groups);
  return result.groups;
}
function buildDomainGroups() {
  return (async () => {
    const dd = await yatta('dailyDungeon');
    const groupsByKey = {};
    for (const [day, domains] of Object.entries(dd)) {
      const dayName = titleize(day);
      for (const d of Object.values(domains)) {
        const isTalent = /Mastery/.test(d.name), isWeapon = /Forgery/.test(d.name);
        if (!isTalent && !isWeapon) continue;
        const ids = (d.reward || []).filter(id => isTalent ? (id > 104300 && id < 104999 && id !== 104319) : (id > 114000 && id < 114999));
        if (!ids.length) continue;
        const key = Math.min(...ids);
        const g = groupsByKey[key] ||= { kind: isTalent ? 'talent' : 'weapon', key, domain: d.name.replace(/^Domain of (Mastery|Forgery): /, ''), city: d.city, days: [], rewardIds: ids, topId: Math.max(...ids) };
        if (!g.days.includes(dayName)) g.days.push(dayName);
      }
    }
    const { byId } = await charLookup();
    const list = Object.values(groupsByKey);
    const tops = await Promise.all(list.map(g => yatta(`material/${g.topId}`).catch(() => null)));
    const out = [];
    for (const [i, g] of list.entries()) {
      const top = tops[i];
      if (!top) continue;
      const req = top.additions?.requiredBy || {};
      const users = (g.kind === 'talent' ? req.avatar : req.weapon) || [];
      const counts = {};
      users.forEach(u => { const c = byId[String(u.id)]; if (c && NATION_ORDER.indexOf(c.nation) < 7) counts[c.nation] = (counts[c.nation] || 0) + 1; });
      const nation = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || CITY[g.city] || 'Other';
      out.push({
        ...g, days: g.days.filter(d => d !== 'Sunday').concat('Sunday'),
        name: g.kind === 'talent' ? top.name.replace(/^Philosophies of /, '') : top.name,
        topName: top.name, nation,
        users: [...new Set(users.map(u => String(u.id)))],
      });
    }
    const dayRank = days => ['Monday', 'Tuesday', 'Wednesday'].findIndex(d => days.includes(d));
    out.sort((a, b) => dayRank(a.days) - dayRank(b.days) || nationRank(a.nation) - nationRank(b.nation) || a.key - b.key);
    return { groups: out, incomplete: tops.some(t => !t) };
  })();
}

/* ---------- materials ---------- */

// Where a material comes from, cleaned up: [{ text, days }]
async function materialInfo(id) {
  const m = await yatta(`material/${id}`).catch(() => null);
  if (!m) return null;
  const sources = (m.source || [])
    .filter(s => s.name && !/placeholder|\{0\}|^go to collect$/i.test(s.name))
    .map(s => ({ text: s.name.replace(/^Recommendation: /, ''), days: (s.days || []).map(titleize) }));
  return { id, name: m.name, type: m.type || '', rank: m.rank, sources, hasMap: !!(m.mapMark && m.mapMark.length) };
}

/* ---------- banners + builds (paimon.moe) ---------- */

// Banners running right now. Times are server-local, so they're close but not exact for every region.
async function currentBanners() {
  const all = await paimon('banners.js', 6);
  const now = Date.now();
  const parse = s => new Date(String(s).replace(' ', 'T')).getTime();
  const live = [];
  for (const type of ['characters', 'weapons', 'chronicled']) {
    for (const b of all[type] || []) {
      if (parse(b.start) <= now && now <= parse(b.end)) live.push({ ...b, type, endsAt: parse(b.end) });
    }
  }
  return live;
}

// Recommended builds keyed by normalized character name.
async function getBuilds() {
  const b = await paimon('build.js').catch(() => ({}));
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [norm(k), v]));
}
// The build to use for a character: the role marked recommended, else the first one.
function mainRole(build) {
  if (!build || !build.roles) return null;
  const roles = Object.entries(build.roles);
  const [name, role] = roles.find(([, r]) => r.recommended) || roles[0] || [];
  return role ? { name, ...role } : null;
}
// paimon.moe set keys like '+18%_atk_set' are wildcards ("any 18% ATK set").
const SPECIAL_SETS = { '+18%_atk_set': '18% ATK set', '+80_em': '80 EM set', '+20%_er': '20% ER set', '+20%_energy_recharge': '20% ER set', '+25%_physical_dmg': '25% Physical DMG set', '+15%_healing_bonus_set': '15% Healing set', '+20%_hp': '20% HP set', '+30%_def': '30% DEF set', '+15%_anemo_dmg': '15% Anemo DMG set', '+15%_geo_dmg': '15% Geo DMG set', '+15%_hydro_dmg': '15% Hydro DMG set', '+15%_pyro_dmg': '15% Pyro DMG set', '+15%_cryo_dmg': '15% Cryo DMG set', '+15%_electro_dmg': '15% Electro DMG set', '+15%_dendro_dmg': '15% Dendro DMG set' };
// Tidy the build data's typos for display.
const fixStat = s => String(s).replace(/Cirt/g, 'Crit').replace(/\*$/, '');
const setLabel = key => SPECIAL_SETS[key] || (key.startsWith('+') ? key.replace(/^\+/, '').replace(/_/g, ' ') : titleize(key));

/* ---------- inventory (stored in this browser) ---------- */

const INV_KEY = 'gi-inventory-v1';
function emptyInv() { return { characters: {}, weapons: [], artifacts: [], materials: {}, updated: null }; }
function getInv() {
  try { return { ...emptyInv(), ...JSON.parse(localStorage.getItem(INV_KEY) || '{}') }; } catch (e) { return emptyInv(); }
}
function saveInv(inv) {
  inv.updated = new Date().toISOString();
  try { localStorage.setItem(INV_KEY, JSON.stringify(inv)); return true; } catch (e) { alert("Couldn't save: your browser blocked storage for this page."); return false; }
}
const newUid = () => Math.random().toString(36).slice(2, 10);

/* Import a GOOD file (the format inventory scanners like Inventory Kamera export).
   Returns { inv, report } without saving, so the page can confirm first. */
async function importGOOD(good) {
  if (!good || good.format !== 'GOOD') throw new Error("This isn't a GOOD file (it needs \"format\": \"GOOD\").");
  const [{ chars, byName }, weapons, sets] = await Promise.all([charLookup(), getWeapons(), getArtifactSets()]);
  const wByName = Object.fromEntries(weapons.map(w => [norm(w.name), w]));
  const sByName = Object.fromEntries(sets.map(s => [norm(s.name), s]));
  // GOOD keys are names without spaces ("KamisatoAyaka", "TravelerAnemo"); a bare "Traveler" picks the first one.
  const charKey = k => byName[norm(k)] || (norm(k) === 'traveler' ? chars.find(c => c.nation === 'Traveler') : null);
  const inv = emptyInv();
  const missed = { characters: [], weapons: [], artifacts: [] };

  for (const c of good.characters || []) {
    const m = charKey(c.key);
    if (!m) { missed.characters.push(c.key); continue; }
    inv.characters[m.id] = { level: c.level || 1, constellation: c.constellation || 0, ascension: c.ascension || 0, talent: { auto: c.talent?.auto || 1, skill: c.talent?.skill || 1, burst: c.talent?.burst || 1 } };
  }
  for (const w of good.weapons || []) {
    const m = wByName[norm(w.key)];
    if (!m) { missed.weapons.push(w.key); continue; }
    const owner = w.location ? charKey(w.location) : null;
    inv.weapons.push({ uid: newUid(), id: m.id, level: w.level || 1, refinement: w.refinement || 1, location: owner ? owner.id : '' });
  }
  for (const a of good.artifacts || []) {
    const m = sByName[norm(a.setKey)];
    if (!m) { missed.artifacts.push(a.setKey); continue; }
    const owner = a.location ? charKey(a.location) : null;
    inv.artifacts.push({
      uid: newUid(), set: m.id, slot: a.slotKey, rarity: a.rarity || 5, level: a.level || 0,
      mainStat: a.mainStatKey || '', location: owner ? owner.id : '',
      substats: (a.substats || []).filter(s => s.key).map(s => ({ key: s.key, value: s.value })),
    });
  }
  for (const [k, v] of Object.entries(good.materials || {})) inv.materials[norm(k)] = v;
  const report = {
    characters: Object.keys(inv.characters).length, weapons: inv.weapons.length,
    artifacts: inv.artifacts.length, materials: Object.keys(inv.materials).length, missed,
  };
  return { inv, report };
}

// GOOD stat keys → readable labels.
const STAT_LABEL = {
  hp: 'HP', hp_: 'HP%', atk: 'ATK', atk_: 'ATK%', def: 'DEF', def_: 'DEF%', eleMas: 'Elemental Mastery',
  enerRech_: 'Energy Recharge', critRate_: 'CRIT Rate', critDMG_: 'CRIT DMG', heal_: 'Healing Bonus',
  physical_dmg_: 'Physical DMG', anemo_dmg_: 'Anemo DMG', geo_dmg_: 'Geo DMG', electro_dmg_: 'Electro DMG',
  dendro_dmg_: 'Dendro DMG', hydro_dmg_: 'Hydro DMG', pyro_dmg_: 'Pyro DMG', cryo_dmg_: 'Cryo DMG',
};
const MAIN_STATS = {
  flower: ['hp'], plume: ['atk'],
  sands: ['hp_', 'atk_', 'def_', 'eleMas', 'enerRech_'],
  goblet: ['hp_', 'atk_', 'def_', 'eleMas', 'physical_dmg_', 'anemo_dmg_', 'geo_dmg_', 'electro_dmg_', 'dendro_dmg_', 'hydro_dmg_', 'pyro_dmg_', 'cryo_dmg_'],
  circlet: ['hp_', 'atk_', 'def_', 'eleMas', 'critRate_', 'critDMG_', 'heal_'],
};
// Does a stored main stat match a build's wording ("ATK%", "Crit DMG", "Pyro DMG")?
// Build data spells stats loosely ("Cirt Rate", "Electro Damage", "Healing Bonus%", plain "DMG").
const cleanStat = s => norm(s).replace('cirt', 'crit').replace('damage', 'dmg');
const statMatches = (key, label) => {
  const want = cleanStat(label);
  if (want === 'dmg') return /_dmg_$/.test(key);
  return cleanStat(STAT_LABEL[key] || key) === want;
};

/* ---------- farming plan ---------- */

/* For every owned character: their recommended set and which slots they still need.
   Then rank artifact domains by how many characters they help. */
async function farmingPlan(inv) {
  const [{ byId }, builds, sets] = await Promise.all([charLookup(), getBuilds(), getArtifactSets()]);
  const setByKey = Object.fromEntries(sets.map(s => [s.key, s]));
  const setByNorm = Object.fromEntries(sets.map(s => [norm(s.key), s]));
  const plans = [];
  for (const [id, owned] of Object.entries(inv.characters)) {
    const c = byId[id];
    if (!c) continue;
    const role = mainRole(builds[norm(c.baseName)]);
    if (!role) { plans.push({ c, owned, role: null }); continue; }
    const option = (role.artifacts || [])[0] || [];
    const realSets = option.map(k => setByKey[k] || setByNorm[norm(k)]).filter(Boolean);
    const main = realSets[0] || null;
    // Pieces of the main set you own (equipped on this character, or unequipped).
    const pieces = main ? inv.artifacts.filter(a => a.set === main.id && (!a.location || a.location === id)) : [];
    const want = role.mainStats || {};
    const slots = SLOTS.map(slot => {
      const mine = pieces.filter(p => p.slot === slot);
      const good = mine.filter(p => !want[slot] || want[slot].some(l => statMatches(p.mainStat, l)));
      return { slot, have: mine.length, good: good.length, want: want[slot] || [] };
    });
    plans.push({ c, owned, role, option, main, sets: realSets, slots, missing: slots.filter(s => !s.good).length });
  }
  const domains = {};
  for (const p of plans) {
    for (const s of p.sets || []) {
      if (!s.domain) continue;
      const d = domains[s.domain] ||= { name: s.domain, sets: new Set(), chars: [] };
      d.sets.add(s.name);
      if (!d.chars.includes(p.c)) d.chars.push(p.c);
    }
  }
  const ranked = Object.values(domains).map(d => ({ ...d, sets: [...d.sets] }))
    .sort((a, b) => b.chars.length - a.chars.length || a.name.localeCompare(b.name));
  plans.sort((a, b) => (!!b.role - !!a.role) || (b.owned.level || 0) - (a.owned.level || 0) || a.c.name.localeCompare(b.c.name));
  return { plans, domains: ranked };
}

/* ---------- shared UI ---------- */

function renderNav(active) {
  const link = (href, label, key) => `<a href="${ROOT}${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  const nav = document.createElement('header');
  nav.className = 'topbar';
  nav.innerHTML = `
    <a class="brand" href="${ROOT}index.html"><span class="brand-mark" aria-hidden="true"></span>Teyvat Codex</a>
    <nav>
      ${link('index.html', 'Today', 'home')}
      ${link('characters/index.html', 'Characters', 'characters')}
      ${link('weapons/index.html', 'Weapons', 'weapons')}
      ${link('artifacts/index.html', 'Artifacts', 'artifacts')}
      ${link('materials/index.html', 'Domains', 'materials')}
      ${link('inventory/index.html', 'My Inventory', 'inventory')}
    </nav>`;
  document.body.prepend(nav);
  // Falling petals and the mascot in the page's header.
  const hero = document.querySelector('.hero');
  if (hero && !hero.querySelector('.petals')) hero.insertAdjacentHTML('afterbegin', petals() + mascot());
  const foot = document.createElement('footer');
  foot.className = 'footer';
  foot.innerHTML = `Game data from <a href="https://gi.yatta.moe" target="_blank" rel="noopener">Project Amber</a>. Banners and builds from <a href="https://github.com/MadeBaruna/paimon-moe" target="_blank" rel="noopener">paimon.moe</a> (MIT). Artifact domains from <a href="https://github.com/theBowja/genshin-db" target="_blank" rel="noopener">genshin-db</a>. Fan project, not affiliated with HoYoverse.`;
  document.body.append(foot);
}

function showError(where, err) {
  where.innerHTML = `<div class="error">Couldn't load data. ${esc(err.message || err)}<br>Check your internet connection and refresh.</div>`;
  console.error(err);
}

const elemClass = el => 'el-' + norm(el);
function characterCard(c, extra = '', owned = null) {
  const own = owned ? `<span class="owned-badge" title="In your inventory">C${owned.constellation || 0}</span>` : '';
  return `<a class="card ${elemClass(c.element)} r${c.rarity} ${owned ? 'is-owned' : ''}" href="${ROOT}characters/character.html?id=${encodeURIComponent(c.id)}">
    <div class="card-art">${imgTag(asset(c.icon), c.name, 'card-img')}
      <span class="elem-dot" title="${esc(c.element)}"></span>${own}
    </div>
    <div class="card-name">${esc(c.name)}</div>${extra}
  </a>`;
}

const dayChips = (days, today) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  .filter(d => days.includes(d))
  .map(d => `<span class="chip ${d === today ? 'chip-today' : ''}">${d.slice(0, 3)}</span>`).join('');

function timeLeft(ms) {
  const d = Math.floor(ms / 86400e3), h = Math.floor(ms % 86400e3 / 3600e3);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

/* ---------- cute bits ---------- */

// Original mascot: a little mochi with a sakura on its head.
function mascot(cls = 'mascot') {
  const petal = r => `<ellipse rx="5" ry="8" cy="-7" transform="rotate(${r})"/>`;
  return `<svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="108" rx="34" ry="6" fill="#80001f" opacity=".12"/>
    <path d="M16 80C16 46 37 32 60 32s44 14 44 48c0 20-19 26-44 26S16 100 16 80Z" fill="#fff7f2" stroke="#80001f" stroke-width="3"/>
    <path d="M28 60c4-10 12-16 22-18" fill="none" stroke="#f2e4d3" stroke-width="5" stroke-linecap="round"/>
    <path d="M41 72q6-7 12 0M67 72q6-7 12 0" fill="none" stroke="#80001f" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M55 81q5 5 10 0" fill="none" stroke="#80001f" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="38" cy="82" rx="7" ry="4.5" fill="#d45263" opacity=".45"/>
    <ellipse cx="82" cy="82" rx="7" ry="4.5" fill="#d45263" opacity=".45"/>
    <g transform="translate(80 34) rotate(12)" fill="#d45263">${[0, 72, 144, 216, 288].map(petal).join('')}<circle r="4" fill="#f2e4d3"/></g>
    <path d="M70 38q-6-6-12-4q4 7 12 4Z" fill="#7fb83a"/>
  </svg>`;
}
const petals = () => '<div class="petals" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';

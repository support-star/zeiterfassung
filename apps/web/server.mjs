import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = 5173;

// ── MIME Types ─────────────────────────────────────

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

// ── In-Memory Datenbank ────────────────────────────

const users = [
  { id: 'u1', email: 'admin@zeiterfassung.local', pw: 'Admin1234!', firstName: 'Stefan', lastName: 'Berger', role: 'ADMIN', isActive: true },
  { id: 'u2', email: 'dispo@zeiterfassung.local', pw: 'Dispo1234!', firstName: 'Lisa', lastName: 'Weber', role: 'DISPO', isActive: true },
  { id: 'u3', email: 'max.mustermann@zeiterfassung.local', pw: 'Worker1234!', firstName: 'Max', lastName: 'Mustermann', role: 'WORKER', isActive: true },
  { id: 'u4', email: 'anna.schmidt@zeiterfassung.local', pw: 'Worker1234!', firstName: 'Anna', lastName: 'Schmidt', role: 'WORKER', isActive: true },
];

const customers = [
  { id: 'c1', name: 'Müller Bau GmbH', addressLine1: 'Industriestr. 15', zip: '60311', city: 'Frankfurt', contactName: 'Hans Müller', contactPhone: '069-12345', contactEmail: 'info@mueller-bau.de', isActive: true },
  { id: 'c2', name: 'Schmidt Elektrotechnik', addressLine1: 'Mainzer Landstr. 42', zip: '65929', city: 'Frankfurt', contactName: 'Peter Schmidt', contactPhone: '069-54321', contactEmail: 'info@schmidt-elektro.de', isActive: true },
];

const projects = [
  { id: 'p1', customerId: 'c1', name: 'Neubau Bürokomplex Ost', siteAddressLine1: 'Hanauer Landstr. 100', siteZip: '60314', siteCity: 'Frankfurt', costCenter: 'MB-2024-001', hourlyRateCents: 6500, isActive: true },
  { id: 'p2', customerId: 'c1', name: 'Sanierung Altbau West', siteAddressLine1: 'Bockenheimer Warte 3', siteZip: '60325', siteCity: 'Frankfurt', costCenter: 'MB-2024-002', hourlyRateCents: 5800, isActive: true },
  { id: 'p3', customerId: 'c2', name: 'Elektroinstallation Schule', siteAddressLine1: 'Schulstr. 5', siteZip: '60594', siteCity: 'Frankfurt', costCenter: 'SE-2024-001', hourlyRateCents: 7200, isActive: true },
];

const timeEntries = [];
const devices = [];
let pairingTokens = [];

// Seed
(function seedEntries() {
  const today = new Date();
  for (let d = 5; d >= 1; d--) {
    const day = new Date(today); day.setDate(day.getDate() - d);
    const s1 = new Date(day); s1.setHours(7,0,0,0);
    const e1 = new Date(day); e1.setHours(16,0,0,0);
    const bs = new Date(day); bs.setHours(12,0,0,0);
    const be = new Date(day); be.setHours(12,30,0,0);
    timeEntries.push({
      id: `te-max-${d}`, userId: 'u3', customerId: 'c1', projectId: 'p1',
      entryType: 'WORK', startAt: s1.toISOString(), endAt: e1.toISOString(),
      status: d > 3 ? 'APPROVED' : d > 1 ? 'SUBMITTED' : 'DRAFT',
      rapport: 'Betonarbeiten Erdgeschoss', createdVia: 'WEB',
      breaks: [{ id: `br-${d}`, timeEntryId: `te-max-${d}`, breakType: 'DEFAULT', startAt: bs.toISOString(), endAt: be.toISOString() }],
    });
    const s2 = new Date(day); s2.setHours(8,0,0,0);
    const e2 = new Date(day); e2.setHours(17,0,0,0);
    timeEntries.push({
      id: `te-anna-${d}`, userId: 'u4', customerId: 'c2', projectId: 'p3',
      entryType: 'WORK', startAt: s2.toISOString(), endAt: e2.toISOString(),
      status: d > 3 ? 'APPROVED' : 'SUBMITTED',
      rapport: 'Kabelverlegung 2. OG', createdVia: 'MOBILE', breaks: [],
    });
  }
})();

function genId() { return crypto.randomUUID(); }
function genToken() { return crypto.randomBytes(32).toString('hex'); }

function makeJwt(user) {
  const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p = Buffer.from(JSON.stringify({sub:user.id,email:user.email,role:user.role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const s = crypto.createHmac('sha256','mock').update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

function getUser(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1],'base64').toString());
    return users.find(u => u.id === p.sub);
  } catch { return null; }
}

function enrich(e) {
  const u = users.find(x => x.id === e.userId);
  const c = customers.find(x => x.id === e.customerId);
  const p = projects.find(x => x.id === e.projectId);
  return { ...e, user: u ? {id:u.id,firstName:u.firstName,lastName:u.lastName} : null,
    customer: c ? {id:c.id,name:c.name} : null,
    project: p ? {id:p.id,name:p.name} : null };
}

// ── Server ─────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ── API Routen ──────────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    const apiPath = url.pathname.slice(4); // Remove /api
    const method = req.method;

    const authH = req.headers.authorization || '';
    const token = authH.replace('Bearer ','');
    const cu = token ? getUser(token) : null;

    let body = {};
    if (['POST','PATCH','PUT'].includes(method)) {
      body = await new Promise(r => {
        let d = ''; req.on('data', c => d += c);
        req.on('end', () => { try { r(JSON.parse(d)); } catch { r({}); } });
      });
    }

    const json = (data, status=200) => { res.writeHead(status, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); };
    const noContent = () => { res.writeHead(204, {'Access-Control-Allow-Origin':'*'}); res.end(); };

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Refresh-Token',
      });
      return res.end();
    }

    // AUTH
    if (apiPath === '/auth/login' && method === 'POST') {
      const u = users.find(x => x.email === body.email && x.pw === body.password);
      if (!u) return json({message:'Ungültige Anmeldedaten'}, 401);
      const at = makeJwt(u); const rt = `rt_${u.id}_${genToken()}`;
      res.setHeader('Set-Cookie', `refreshToken=${rt}; Path=/api/auth; HttpOnly; SameSite=Lax`);
      return json({accessToken:at, refreshToken:rt, expiresIn:3600});
    }
    if (apiPath === '/auth/refresh' && method === 'POST') {
      const cookies = (req.headers.cookie||'').match(/refreshToken=([^;]+)/)?.[1];
      const hrt = req.headers['x-refresh-token'];
      const rt = cookies || hrt;
      if (!rt) return json({message:'Kein Refresh Token'},401);
      const m = rt.match(/^rt_([^_]+)_/);
      const u = users.find(x => x.id === m?.[1]) || users[0];
      const at = makeJwt(u); const nrt = `rt_${u.id}_${genToken()}`;
      res.setHeader('Set-Cookie', `refreshToken=${nrt}; Path=/api/auth; HttpOnly; SameSite=Lax`);
      return json({accessToken:at, refreshToken:nrt, expiresIn:3600});
    }
    if (apiPath === '/auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie','refreshToken=; Path=/api/auth; HttpOnly; Max-Age=0');
      return noContent();
    }
    if (apiPath === '/auth/pairing-token' && method === 'POST') {
      const t = genToken().slice(0,12); const exp = new Date(Date.now()+60000).toISOString();
      pairingTokens.push({token:t,userId:cu?.id,expiresAt:exp});
      return json({token:t,expiresAt:exp},201);
    }
    if (apiPath === '/auth/pair' && method === 'POST') {
      const pt = pairingTokens.find(p => p.token === body.token && new Date(p.expiresAt)>new Date());
      if (!pt) return json({message:'Token ungültig oder abgelaufen'},400);
      const u = users.find(x => x.id === pt.userId);
      if (!u) return json({message:'Benutzer nicht gefunden'},400);
      devices.push({id:genId(),userId:u.id,deviceName:body.deviceName,platform:body.platform,lastSeenAt:new Date().toISOString(),revokedAt:null,createdAt:new Date().toISOString()});
      pairingTokens = pairingTokens.filter(p => p.token !== body.token);
      return json({accessToken:makeJwt(u),refreshToken:`rt_${u.id}_${genToken()}`,expiresIn:3600});
    }
    if (apiPath === '/auth/revoke-device' && method === 'POST') {
      const d = devices.find(x => x.id === body.deviceId);
      if (d) d.revokedAt = new Date().toISOString();
      return noContent();
    }

    // Auth-Check
    if (!cu) return json({message:'Nicht autorisiert'},401);

    // USERS
    if (apiPath === '/users/me' && method === 'GET') {
      const {pw,...safe} = cu; return json(safe);
    }
    if (apiPath === '/users' && method === 'GET') return json(users.map(({pw,...u})=>u));
    if (apiPath === '/users' && method === 'POST') {
      const nu = {id:genId(),email:body.email,pw:body.password,firstName:body.firstName,lastName:body.lastName,role:body.role||'WORKER',isActive:true};
      users.push(nu); const {pw,...s}=nu; return json(s,201);
    }
    let m;
    if ((m = apiPath.match(/^\/users\/([^/]+)$/)) && method === 'PATCH') {
      const u = users.find(x=>x.id===m[1]); if(!u) return json({message:'Nicht gefunden'},404);
      Object.assign(u,body); const{pw,...s}=u; return json(s);
    }
    if ((m = apiPath.match(/^\/users\/([^/]+)\/deactivate$/)) && method === 'POST') {
      const u = users.find(x=>x.id===m[1]); if(u) u.isActive=false; return noContent();
    }
    if ((m = apiPath.match(/^\/users\/([^/]+)\/devices$/)) && method === 'GET') {
      return json(devices.filter(d=>d.userId===m[1]));
    }

    // CUSTOMERS
    if (apiPath === '/customers' && method === 'GET') return json(customers);
    if (apiPath === '/customers' && method === 'POST') {
      const c = {id:genId(),...body,isActive:true}; customers.push(c); return json(c,201);
    }
    if ((m = apiPath.match(/^\/customers\/([^/]+)$/)) && method === 'PATCH') {
      const c = customers.find(x=>x.id===m[1]); if(!c) return json({message:'Nicht gefunden'},404);
      Object.assign(c,body); return json(c);
    }

    // PROJECTS
    if (apiPath === '/projects' && method === 'GET') {
      const qc = url.searchParams.get('customerId');
      let r = projects.map(p=>({...p,customer:customers.find(c=>c.id===p.customerId)||null}));
      if (qc) r = r.filter(p=>p.customerId===qc);
      return json(r);
    }
    if (apiPath === '/projects' && method === 'POST') {
      const p = {id:genId(),...body,isActive:true}; projects.push(p);
      return json({...p,customer:customers.find(c=>c.id===p.customerId)},201);
    }
    if ((m = apiPath.match(/^\/projects\/([^/]+)$/)) && method === 'PATCH') {
      const p = projects.find(x=>x.id===m[1]); if(!p) return json({message:'Nicht gefunden'},404);
      Object.assign(p,body); return json({...p,customer:customers.find(c=>c.id===p.customerId)});
    }

    // TIME ENTRIES
    if (apiPath === '/time-entries' && method === 'GET') {
      let r = [...timeEntries];
      if (cu.role === 'WORKER') r = r.filter(e=>e.userId===cu.id);
      const qF=url.searchParams.get('from'), qT=url.searchParams.get('to'),
            qU=url.searchParams.get('userId'), qC=url.searchParams.get('customerId'),
            qS=url.searchParams.get('status'), qTy=url.searchParams.get('type');
      if(qF) r=r.filter(e=>new Date(e.startAt)>=new Date(qF));
      if(qT) r=r.filter(e=>new Date(e.startAt)<=new Date(qT));
      if(qU) r=r.filter(e=>e.userId===qU);
      if(qC) r=r.filter(e=>e.customerId===qC);
      if(qS) r=r.filter(e=>e.status===qS);
      if(qTy) r=r.filter(e=>e.entryType===qTy);
      r.sort((a,b)=>new Date(b.startAt)-new Date(a.startAt));
      return json(r.map(enrich));
    }
    if (apiPath === '/time-entries/running') return json(timeEntries.filter(e=>!e.endAt).map(enrich));
    if (apiPath === '/time-entries/submitted') return json(timeEntries.filter(e=>e.status==='SUBMITTED').map(enrich));

    if (apiPath === '/time-entries/start' && method === 'POST') {
      const running = timeEntries.find(e=>e.userId===cu.id&&!e.endAt);
      if (running) return json({message:'Es läuft bereits eine Erfassung'},409);
      const ne = {id:genId(),userId:cu.id,customerId:body.customerId||null,projectId:body.projectId||null,
        entryType:body.entryType||'WORK',startAt:body.startAt||new Date().toISOString(),endAt:null,
        status:'DRAFT',rapport:body.rapport||null,createdVia:body.createdVia||'WEB',breaks:[]};
      timeEntries.push(ne); return json(enrich(ne),201);
    }

    if ((m=apiPath.match(/^\/time-entries\/([^/]+)\/end$/))&&method==='POST') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      e.endAt=body.endAt||new Date().toISOString();
      for(const b of e.breaks) if(!b.endAt) b.endAt=e.endAt;
      return json(enrich(e));
    }
    if ((m=apiPath.match(/^\/time-entries\/([^/]+)\/rapport$/))&&method==='POST') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      e.rapport=body.rapport; return json(enrich(e));
    }
    if ((m=apiPath.match(/^\/time-entries\/([^/]+)\/break\/start$/))&&method==='POST') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      e.breaks.push({id:genId(),timeEntryId:e.id,breakType:body.breakType||'DEFAULT',startAt:new Date().toISOString(),endAt:null});
      return json(enrich(e));
    }
    if ((m=apiPath.match(/^\/time-entries\/([^/]+)\/break\/end$/))&&method==='POST') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      const ob=e.breaks.find(b=>!b.endAt); if(ob) ob.endAt=body.endAt||new Date().toISOString();
      return json(enrich(e));
    }
    if ((m=apiPath.match(/^\/time-entries\/([^/]+)\/submit$/))&&method==='POST') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      if(!e.endAt) return json({message:'Eintrag muss zuerst beendet werden'},400);
      e.status='SUBMITTED'; return json(enrich(e));
    }
    if ((m=apiPath.match(/^\/time-entries\/([^/]+)\/approve$/))&&method==='POST') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      e.status='APPROVED'; return json(enrich(e));
    }
    if ((m=apiPath.match(/^\/time-entries\/([^/]+)\/reopen$/))&&method==='POST') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      e.status='DRAFT'; return json(enrich(e));
    }
    if ((m=apiPath.match(/^\/time-entries\/([^/]+)$/))&&method==='PATCH') {
      const e=timeEntries.find(x=>x.id===m[1]); if(!e) return json({message:'Nicht gefunden'},404);
      Object.assign(e,body); return json(enrich(e));
    }
    // BULK
    if (apiPath==='/time-entries/bulk/submit'&&method==='POST') {
      return json((body.ids||[]).map(id=>{const e=timeEntries.find(x=>x.id===id);if(!e)return{id,success:false};if(!e.endAt)return{id,success:false};e.status='SUBMITTED';return{id,success:true};}));
    }
    if (apiPath==='/time-entries/bulk/approve'&&method==='POST') {
      return json((body.ids||[]).map(id=>{const e=timeEntries.find(x=>x.id===id);if(!e)return{id,success:false};e.status='APPROVED';return{id,success:true};}));
    }
    if (apiPath==='/time-entries/bulk/reopen'&&method==='POST') {
      return json((body.ids||[]).map(id=>{const e=timeEntries.find(x=>x.id===id);if(!e)return{id,success:false};e.status='DRAFT';return{id,success:true};}));
    }

    return json({message:`Route nicht gefunden: ${method} ${apiPath}`},404);
  }

  // ── Static Files ────────────────────────────────
  let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);

  // SPA Fallback
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html');
  }

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const mime = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ✅ Zeiterfassung läuft auf http://localhost:${PORT}\n`);
  console.log('  Login-Daten:');
  console.log('  ┌──────────┬──────────────────────────────────────────┬──────────────┐');
  console.log('  │ Rolle    │ E-Mail                                   │ Passwort     │');
  console.log('  ├──────────┼──────────────────────────────────────────┼──────────────┤');
  console.log('  │ Admin    │ admin@zeiterfassung.local                │ Admin1234!   │');
  console.log('  │ Dispo    │ dispo@zeiterfassung.local                │ Dispo1234!   │');
  console.log('  │ Worker   │ max.mustermann@zeiterfassung.local       │ Worker1234!  │');
  console.log('  │ Worker   │ anna.schmidt@zeiterfassung.local         │ Worker1234!  │');
  console.log('  └──────────┴──────────────────────────────────────────┴──────────────┘\n');
});

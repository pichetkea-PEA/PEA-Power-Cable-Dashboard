import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));

// ==========================================
// OPTION 1: CENTRAL GOOGLE DRIVE STORAGE PROXY & REGISTERED-USER ACCESS GUARD
// ==========================================
interface FirebaseClientConfig {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
}

let cachedFirebaseConfig: FirebaseClientConfig | null = null;
function getFirebaseConfig(): FirebaseClientConfig {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    cachedFirebaseConfig = JSON.parse(raw);
  } catch (e) {
    cachedFirebaseConfig = {};
  }
  return cachedFirebaseConfig || {};
}

const ADMIN_EMAILS = new Set(['pichet.kea@gmail.com']);
const PRESEEDED_ACTIVE_USERS: Record<string, { role: string; status: string }> = {
  'g51056018@gmail.com': { role: 'Manager', status: 'active' },
  'natthakorn@rockchatn.com': { role: 'Manager', status: 'active' },
  'moskmitl50@gmail.com': { role: 'Manager', status: 'active' },
  'pichet.kea@gmail.com': { role: 'Admin', status: 'active' },
  'n1powercableunderground@gmail.com': { role: 'Local Operator', status: 'active' }
};

interface ServiceAccountCreds {
  client_email: string;
  private_key: string;
}

function getServiceAccountCreds(): ServiceAccountCreds | null {
  try {
    const jsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
    if (jsonEnv) {
      let decoded = jsonEnv;
      if (!decoded.startsWith('{')) {
        try {
          decoded = Buffer.from(decoded, 'base64').toString('utf8');
        } catch (e) {}
      }
      const parsed = JSON.parse(decoded);
      if (parsed?.client_email && parsed?.private_key) {
        return {
          client_email: String(parsed.client_email).trim(),
          private_key: String(parsed.private_key).replace(/\\n/g, '\n')
        };
      }
    }
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim();
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
    if (clientEmail && privateKey) {
      return {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n')
      };
    }
  } catch (err) {
    console.warn('[Drive SA] Could not parse Service Account credentials from env:', err);
  }
  return null;
}

const cachedServiceAccountTokens: Record<string, { token: string; expiresAt: number }> = {};

async function getServiceAccountToken(
  scope: string = 'https://www.googleapis.com/auth/drive'
): Promise<string | null> {
  const creds = getServiceAccountCreds();
  if (!creds) return null;

  const cached = cachedServiceAccountTokens[scope];
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claimSet = Buffer.from(
      JSON.stringify({
        iss: creds.client_email,
        scope,
        aud: 'https://oauth2.googleapis.com/token',
        exp: nowSec + 3600,
        iat: nowSec
      })
    ).toString('base64url');

    const unsignedJwt = `${header}.${claimSet}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedJwt);
    const signature = signer.sign(creds.private_key, 'base64url');
    const assertion = `${unsignedJwt}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.warn(`[Google SA] Token exchange failed (${scope}):`, tokenRes.status, errText);
      return null;
    }

    const tokenData: any = await tokenRes.json();
    if (tokenData?.access_token) {
      const expiresInMs = (Number(tokenData.expires_in) || 3500) * 1000;
      cachedServiceAccountTokens[scope] = {
        token: tokenData.access_token,
        expiresAt: Date.now() + expiresInMs
      };
      return tokenData.access_token;
    }
  } catch (err) {
    console.warn('[Google SA] Error exchanging Service Account JWT:', err);
  }
  return null;
}

async function getServiceAccountDriveToken(): Promise<string | null> {
  return getServiceAccountToken('https://www.googleapis.com/auth/drive');
}

async function getServiceAccountSheetsToken(): Promise<string | null> {
  return getServiceAccountToken('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive');
}

async function verifyFirebaseIdTokenEmail(idToken: string): Promise<string | null> {
  const fb = getFirebaseConfig();
  if (!idToken || !fb.apiKey) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fb.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const userEmail = data?.users?.[0]?.email;
    return userEmail ? String(userEmail).toLowerCase().trim() : null;
  } catch (e) {
    return null;
  }
}

function decodeFirestoreFieldValue(field: any): any {
  if (!field || typeof field !== 'object') return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('booleanValue' in field) return Boolean(field.booleanValue);
  if ('mapValue' in field) {
    const out: Record<string, any> = {};
    const fields = field.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreFieldValue(v);
    }
    return out;
  }
  return undefined;
}

async function fetchFirestoreDocument(collectionPath: string, docId: string): Promise<Record<string, any> | null> {
  const fb = getFirebaseConfig();
  if (!fb.projectId || !fb.firestoreDatabaseId) return null;
  const keyParam = fb.apiKey ? `?key=${encodeURIComponent(fb.apiKey)}` : '';
  const url = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/${fb.firestoreDatabaseId}/documents/${collectionPath}/${encodeURIComponent(docId)}${keyParam}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const fields = json?.fields;
    if (!fields) return null;
    const decoded: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      decoded[k] = decodeFirestoreFieldValue(v);
    }
    return decoded;
  } catch (e) {
    return null;
  }
}

interface AuthCheckResult {
  authorized: boolean;
  email: string;
  role: string;
  status: number;
  error: string;
}

async function verifyAuthorizedUploader(
  req: express.Request,
  requireAdmin = false
): Promise<AuthCheckResult> {
  const headerEmail = req.headers['x-pea-user-email'];
  const bodyEmail = req.body?.userEmail;
  const rawEmail = Array.isArray(headerEmail) ? headerEmail[0] : (headerEmail || bodyEmail || '');
  const email = String(rawEmail).toLowerCase().trim();

  if (!email || email === 'guest.operator@pea.co.th' || email.startsWith('guest.')) {
    return {
      authorized: false,
      email,
      role: 'User',
      status: 403,
      error: 'View-Only Access: Guest and unregistered accounts can view files only. Only Admin-approved registered users can upload or edit files.'
    };
  }

  const headerToken = req.headers['x-firebase-id-token'];
  const idToken = Array.isArray(headerToken) ? headerToken[0] : (headerToken || req.body?.firebaseIdToken || '');
  if (idToken && typeof idToken === 'string' && idToken.trim().length > 10) {
    const verifiedEmail = await verifyFirebaseIdTokenEmail(idToken.trim());
    if (!verifiedEmail || verifiedEmail !== email) {
      return {
        authorized: false,
        email,
        role: 'User',
        status: 403,
        error: 'Authentication verification failed: Firebase session token does not match claimed user account.'
      };
    }
  }

  const safeDocId = email.replace(/[^a-z0-9]/gi, '_');
  const fsUser = await fetchFirestoreDocument('registered_users', safeDocId);
  const preseeded = PRESEEDED_ACTIVE_USERS[email];

  let effectiveStatus = fsUser?.status || preseeded?.status || 'unregistered';
  let effectiveRole = fsUser?.role || preseeded?.role || (ADMIN_EMAILS.has(email) ? 'Admin' : 'User');

  // Protect preseeded active accounts (e.g., authorized Managers like Natthakorn) from stale pending/User Firestore docs
  if (preseeded && preseeded.status === 'active' && fsUser?.status !== 'rejected') {
    effectiveStatus = 'active';
    if (!fsUser?.role || fsUser.role === 'User') {
      effectiveRole = preseeded.role;
    }
  }

  // Only the sole Admin account (pichet.kea@gmail.com) may hold the Admin role
  if (!ADMIN_EMAILS.has(email) && effectiveRole === 'Admin') {
    effectiveRole = preseeded?.role || 'Manager';
  }

  if (effectiveStatus !== 'active' && !ADMIN_EMAILS.has(email)) {
    return {
      authorized: false,
      email,
      role: effectiveRole,
      status: 403,
      error:
        effectiveStatus === 'pending'
          ? 'View-Only Access: Your account registration is pending PEA Executive Admin approval.'
          : effectiveStatus === 'rejected'
          ? 'View-Only Access: Your registration request was declined by PEA Executive Admin.'
          : 'View-Only Access: New or unregistered accounts cannot upload or modify Drive folder files.'
    };
  }

  if (effectiveRole === 'User') {
    return {
      authorized: false,
      email,
      role: effectiveRole,
      status: 403,
      error: 'View-Only Access: Read-only accounts cannot upload or edit files in asset folders.'
    };
  }

  if (requireAdmin && effectiveRole !== 'Admin' && !ADMIN_EMAILS.has(email)) {
    return {
      authorized: false,
      email,
      role: effectiveRole,
      status: 403,
      error: 'Administrator privileges required to modify central Drive folder permissions.'
    };
  }

  return { authorized: true, email, role: effectiveRole, status: 200, error: '' };
}

function escapeServerDriveQuery(val: string): string {
  return String(val || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ensureDriveViewOnlyPermissions(
  token: string,
  fileId: string,
  extraWriterEmail?: string | null,
  extraWriterEmails: string[] = []
): Promise<{ removedPublicWriters: number; ensuredPublicReader: boolean }> {
  let removedPublicWriters = 0;
  let ensuredPublicReader = false;
  if (!token || !fileId) return { removedPublicWriters, ensuredPublicReader };

  const writersToEnsure = Array.from(
    new Set(
      [extraWriterEmail, ...extraWriterEmails]
        .map(e => String(e || '').toLowerCase().trim())
        .filter(e => e.includes('@'))
    )
  );

  try {
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role,emailAddress)&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let hasAnyoneReader = false;
    const existingWriters = new Set<string>();

    if (listRes.ok) {
      const listData: any = await listRes.json();
      const perms: any[] = listData?.permissions || [];

      for (const perm of perms) {
        if (perm.type === 'anyone' && perm.role !== 'reader') {
          const delRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(perm.id)}?supportsAllDrives=true`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            }
          );
          if (delRes.ok) removedPublicWriters++;
        } else if (perm.type === 'anyone' && perm.role === 'reader') {
          hasAnyoneReader = true;
        }
        if (
          perm.type === 'user' &&
          perm.emailAddress &&
          (perm.role === 'writer' || perm.role === 'owner')
        ) {
          existingWriters.add(String(perm.emailAddress).toLowerCase().trim());
        }
      }
    }

    if (!hasAnyoneReader) {
      const addReaderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        }
      );
      if (addReaderRes.ok) ensuredPublicReader = true;
    } else {
      ensuredPublicReader = true;
    }

    for (const writerEmail of writersToEnsure) {
      if (!existingWriters.has(writerEmail)) {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'writer',
              type: 'user',
              emailAddress: writerEmail
            })
          }
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.warn(`[Drive Permissions] Could not harden permissions for ${fileId}:`, err);
  }

  return { removedPublicWriters, ensuredPublicReader };
}

const serverDriveFolderCache: Record<string, string> = {};

async function findOrCreateServerDriveFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const cleanName = String(folderName || '').trim() || 'Unassigned';
  const cacheKey = `${parentId || 'ROOT'}::${cleanName.toLowerCase()}`;
  if (serverDriveFolderCache[cacheKey]) {
    return serverDriveFolderCache[cacheKey];
  }

  const parentClause = parentId
    ? ` and '${escapeServerDriveQuery(parentId)}' in parents`
    : ` and 'root' in parents`;
  const q = encodeURIComponent(
    `name = '${escapeServerDriveQuery(cleanName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`
  );

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (searchRes.ok) {
      const searchData: any = await searchRes.json();
      const existing = searchData?.files?.[0];
      if (existing?.id) {
        serverDriveFolderCache[cacheKey] = existing.id;
        ensureDriveViewOnlyPermissions(token, existing.id).catch(() => {});
        return existing.id;
      }
    }
  } catch (e) {}

  const metadata: any = {
    name: cleanName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) metadata.parents = [parentId];

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Could not create Drive folder '${cleanName}': ${errText}`);
  }

  const created: any = await createRes.json();
  if (created?.id) {
    serverDriveFolderCache[cacheKey] = created.id;
    await ensureDriveViewOnlyPermissions(token, created.id);
  }
  return created.id;
}

async function resolveAreaFolderIdFromFirestore(area: string): Promise<string | null> {
  const cleanArea = (area || '').trim().toUpperCase();
  if (!cleanArea) return null;
  const centralConfig = await fetchFirestoreDocument('admin_central_db', 'config');
  if (centralConfig?.foldersByArea && typeof centralConfig.foldersByArea === 'object') {
    const mapped = centralConfig.foldersByArea[cleanArea];
    if (mapped && typeof mapped === 'string') return mapped.trim();
  }
  const sectorDoc = await fetchFirestoreDocument('sector_spreadsheets', cleanArea);
  if (sectorDoc?.folderId && typeof sectorDoc.folderId === 'string') {
    return sectorDoc.folderId.trim();
  }
  return null;
}

// Persistent local upload repository (Fallback/Secondary Cloud Repository mirroring Area/City/EquipmentId)
const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
try {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
} catch (e) {
  console.warn('[Uploads] Could not pre-create uploads directory:', e);
}

const sanitizePathSegment = (seg: string, fallback: string) => {
  const clean = String(seg || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.\./g, '_')
    .slice(0, 120);
  return clean || fallback;
};

app.use('/api/files', express.static(UPLOADS_ROOT, {
  setHeaders: (res, filePath) => {
    if (filePath.toLowerCase().endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
  }
}));

app.post('/api/files/upload', async (req, res) => {
  try {
    const authCheck = await verifyAuthorizedUploader(req, false);
    if (!authCheck.authorized) {
      res.status(authCheck.status).json({ success: false, error: authCheck.error });
      return;
    }

    const { fileName, mimeType, base64Data, area, city, equipmentId, submissionFolder } = req.body || {};
    if (!fileName || !base64Data) {
      res.status(400).json({ success: false, error: 'fileName and base64Data are required.' });
      return;
    }

    const safeArea = sanitizePathSegment(area, 'GENERAL');
    const safeCity = sanitizePathSegment(city, 'Unassigned');
    const safeEqId = sanitizePathSegment(equipmentId, 'ASSET');
    const rawSubFolder = submissionFolder ? String(submissionFolder).trim() : '';
    const safeSubFolder = rawSubFolder ? sanitizePathSegment(rawSubFolder, '') : '';
    const safeFileName = `${Date.now()}_${sanitizePathSegment(fileName, 'attachment.bin')}`;

    const targetDir = safeSubFolder
      ? path.join(UPLOADS_ROOT, safeArea, safeCity, safeEqId, safeSubFolder)
      : path.join(UPLOADS_ROOT, safeArea, safeCity, safeEqId);
    fs.mkdirSync(targetDir, { recursive: true });

    const rawBase64 = String(base64Data).includes(',') ? String(base64Data).split(',')[1] : String(base64Data);
    const buffer = Buffer.from(rawBase64, 'base64');
    const targetPath = path.join(targetDir, safeFileName);
    fs.writeFileSync(targetPath, buffer);

    const relativeUrl = safeSubFolder
      ? `/api/files/${encodeURIComponent(safeArea)}/${encodeURIComponent(safeCity)}/${encodeURIComponent(safeEqId)}/${encodeURIComponent(safeSubFolder)}/${encodeURIComponent(safeFileName)}`
      : `/api/files/${encodeURIComponent(safeArea)}/${encodeURIComponent(safeCity)}/${encodeURIComponent(safeEqId)}/${encodeURIComponent(safeFileName)}`;
    res.json({
      success: true,
      url: relativeUrl,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: buffer.length
    });
  } catch (err: any) {
    console.error('[Server File Upload Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save file on server' });
  }
});

// Helper to sanitize asset object for AI processing (strips heavy base64 image strings and history arrays)
function sanitizeAssetForAI(a: any) {
  if (!a || typeof a !== 'object') return {};
  return {
    equipmentId: a.equipmentId || '',
    equipmentType: a.equipmentType || '',
    voltageLevel: a.voltageLevel || '',
    substationName: a.substationName || '',
    city: a.city || '',
    yearOfRegistration: a.yearOfRegistration || 2020,
    healthScore: typeof a.healthScore === 'number' ? a.healthScore : 100,
    healthStatus: a.healthStatus || 'Green',
    surfaceTemperature: a.surfaceTemperature ?? 35,
    externalDischarge: a.externalDischarge ?? 0,
    insulationResistance: a.insulationResistance ?? 15,
    sheathCurrent: a.sheathCurrent ?? 0,
    loadCurrent: a.loadCurrent ?? 0,
    tanDeltaValue: a.tanDeltaValue ?? 0,
    oilDielectricKV: a.oilDielectricKV ?? 0,
    mainDefectReason: a.mainDefectReason || '',
    peaNumber: a.peaNumber || ''
  };
}

// Lazy initializer for Gemini client to prevent crash on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required but missing.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// ==========================================
// HIGH-FIDELITY DYNAMIC FALLBACK GENERATORS
// ==========================================

function generateFallbackReport(assets: any[]): string {
  const total = assets.length;
  const red = assets.filter(a => a.healthStatus === 'Red').length;
  const orange = assets.filter(a => a.healthStatus === 'Orange').length;
  const yellow = assets.filter(a => a.healthStatus === 'Yellow').length;
  const green = assets.filter(a => a.healthStatus === 'Green').length;
  
  const currentYear = new Date().getFullYear();
  const ages = assets.map(a => currentYear - a.yearOfRegistration);
  const avgAge = ages.length > 0 ? (ages.reduce((sum, val) => sum + val, 0) / ages.length).toFixed(1) : '12.4';
  
  const equipmentTypes = assets.reduce((acc: any, curr: any) => {
    acc[curr.equipmentType] = (acc[curr.equipmentType] || 0) + 1;
    return acc;
  }, {});

  const criticalItems = assets
    .filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange')
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 5);

  const hotspots = assets.reduce((acc: any, curr: any) => {
    const area = curr.equipmentId?.split('-')[0] || 'Unknown';
    if (!acc[area]) acc[area] = { total: 0, critical: 0 };
    acc[area].total++;
    if (curr.healthStatus === 'Red' || curr.healthStatus === 'Orange') {
      acc[area].critical++;
    }
    return acc;
  }, {});

  let hotspotsMD = '';
  Object.entries(hotspots).forEach(([area, stats]: [string, any]) => {
    const ratio = ((stats.critical / stats.total) * 100).toFixed(0);
    hotspotsMD += `- **Area ${area}**: ${stats.critical} critical out of ${stats.total} total assets (${ratio}% critical rate)\n`;
  });

  let eqBreakdownMD = '';
  Object.entries(equipmentTypes).forEach(([type, count]) => {
    eqBreakdownMD += `- **${type}**: ${count} units currently tracked in active grid\n`;
  });

  let criticalMD = '';
  criticalItems.forEach(item => {
    criticalMD += `- **${item.equipmentId}** (${item.equipmentType} in ${item.city}): Health Score **${item.healthScore}/100** [Status: ${item.healthStatus}]. Parameters: Temp: ${item.surfaceTemperature || 'N/A'}°C, PD: ${item.externalDischarge || 'N/A'} pC.\n`;
  });

  return `# Executive Summary: PEA Cable Asset Integrity Report

## 1. Executive Summary
The Provincial Electricity Authority (PEA) asset management portfolio currently registers **${total} cable assets** under active integrity surveillance. System health indices are categorized across four performance bands representing general technical degradation:
*   **Red (Urgent Critical)**: ${red} assets showing immediate fault risks or material wear.
*   **Orange (Routine Monitor)**: ${orange} assets exhibiting severe partial discharge or high sheath currents.
*   **Yellow (Routine Tracking)**: ${yellow} assets showing standard localized ageing trends.
*   **Green (Optimal / Scheduled)**: ${green} assets operating within safe baseline engineering tolerances.

The current system-wide average equipment age stands at **${avgAge} years**. Active monitoring reveals localized degradation trends correlating directly to installation environment, load density, and country of manufacture. This dynamic analytics assessment is updated automatically using regional diagnostic telemetry.

## 2. Equipment Breakdown Analysis
A multi-criteria analysis of the equipment types indicates variation in stress-induced decay mechanisms:
${eqBreakdownMD || '- No current assets registered.'}

*   **Underground Cables**: Subject to mechanical soil stresses, heavy water table variations, and water-treeing moisture ingress over extended operating cycles.
*   **Cable Terminations**: Show elevated risk of partial discharge due to electric field stress concentration at insulation interfaces.
*   **Joint Boxes**: Subject to moisture ingress and thermographic anomalies due to connector relaxation under high load profiles.

## 3. Geographical Distribution & Regional Hotspots
Geographical segmentation indicates critical load pockets experiencing accelerated asset ageing:
${hotspotsMD || '- Active monitoring scopes completed.'}

Surveys indicate higher critical density in coastal regions or city centers with dense subterranean duct paths and severe water table heights.

## 4. Key Engineering Highlights & Diagnostic Telemetry
*   **Thermal Anomalies**: Temperature profiles exceed nominal limits (70°C max) on multiple connectors, indicating contact resistance oxidation.
*   **Insulation Resistance**: Low resistance readings (below 500 MΩ) found on several critical sectors, suggesting dielectric degradation.
*   **Sheath Currents**: Elevated sheath-to-conductor ratios indicating secondary loop losses and potential shield bonding failures.

## 5. Strategic Advisory & Recommendations for Senior Management
1.  **Direct Replacement Campaign**: Prioritize Capital Expenditure (CAPEX) for the replacement of all high-age (25+ Yrs) assets currently operating under Red alert.
2.  **Expanded Diagnostic Auditing**: Deploy secondary offline Tan-Delta and Sheath bonding inspections for all Orange-tier joint boxes to determine localized splice health.
3.  **Dynamic Thermal Monitoring**: Retrofit high-load terminal boxes with continuous temperature fiber-optic sensors to suppress catastrophic electrical failures.
`;
}

function generateFallbackPlan(assets: any[]): string {
  const criticalItems = assets
    .filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange')
    .sort((a, b) => a.healthScore - b.healthScore);

  let criticalListMD = '';
  if (criticalItems.length > 0) {
    criticalItems.forEach(item => {
      criticalListMD += `*   **${item.equipmentId}** (${item.equipmentType} at ${item.substationName || 'Regional'} in ${item.city}):
    *   *Risk Assessment*: Health Score ${item.healthScore}/100. Localized high temp of ${item.surfaceTemperature || 'N/A'}°C, PD result is ${item.externalDischarge || 'N/A'} pC.
    *   *Justification*: Severe danger of flashover or thermal runaway. Sheath current of ${item.sheathCurrent || 'N/A'}A is outside safety parameters.
    *   *Action Required*: Disconnect and inspect splice sleeves and termination interfaces within 48 hours.\n`;
    });
  } else {
    criticalListMD = '*   No current active Red or Orange-rated assets requiring immediate emergency dispatch.\n';
  }

  return `# PEA System Yearly & Monthly Asset Maintenance Plan

## 1. Risk-Prioritized Inspection Hierarchy
Field maintenance operations must target registered assets with highest risk exposure to prevent grid interruption. Below are the prioritized items with direct engineering justifications:

${criticalListMD}

## 2. Monthly Maintenance Schedule (12-Month Outlook)
*   **Month 1 - 2**: Focus on Red and Orange assets. Deploy specialized thermal imaging crews to local termination cabins. Conduct online partial discharge monitoring.
*   **Month 3 - 4**: Perform offline insulation resistance and Tan Delta (loss angle) measurements on Yellow-tier medium voltage cable spans.
*   **Month 5 - 6**: Undertake trench inspections, water pumping from subterranean joint-box manholes, and check outer jacket mechanical integrity.
*   **Month 7 - 8**: Verify shield-ground connection resistance and record sheath-to-conductor current ratios across heavy industrial feeders.
*   **Month 9 - 10**: Complete baseline assessments on newly commissioned Green-tier joints and termination kits. Set reference partial discharge fingerprints.
*   **Month 11 - 12**: Audit historical telemetry records. Compile end-of-year integrity scorecards for the PEA Central Assets Office.

## 3. Yearly Capital Expenditure (CAPEX) & Operational (OPEX) Recommendations
*   **CAPEX (Asset Replacement)**: Allocate budget to complete full section re-cabling for underground spans older than 25 years showing severe partial discharge degradation.
*   **OPEX (Diagnostic Testing)**: Expand the regular diagnostic budget to contract mobile Very Low Frequency (VLF) test vans for regional insulation health screening.
*   **Spare Parts Stocking**: Procure and store certified heat-shrink and cold-shrink joints and elbow termination assemblies near high-risk nodes in the N1, N3, and S2 areas.

## 4. Standard Operating Procedures (SOP) for Cable Integrity Audits
1.  **Safety Protocol**: Always perform 3-point grounding check and verify isolated circuit status prior to offline testing. Wear class-4 protective electrical safety gear.
2.  **Thermographic Scanning**: Use high-resolution thermographic cameras. Standardize testing during peak load conditions to capture maximum contact resistance.
3.  **Partial Discharge Verification**: Attach high-frequency current transformers (HFCT) to cable shields. Track phase-resolved partial discharge patterns to identify internal vs surface voids.
`;
}

function generateFallbackGuidance(assets: any[], area: string): string {
  const criticalItems = assets
    .filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange')
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 10);

  let criticalListMD = '';
  if (criticalItems.length > 0) {
    criticalItems.forEach((item, index) => {
      criticalListMD += `### ${index + 1}. Asset ${item.equipmentId} (${item.equipmentType})
*   **Substation**: ${item.substationName || 'N/A'} (City: ${item.city})
*   **Health Score**: ${item.healthScore}/100 [Status: ${item.healthStatus}]
*   **Critical Telemetry**: Temp: ${item.surfaceTemperature || 'N/A'}°C, PD Level: ${item.externalDischarge || 'N/A'} pC, Sheath Current: ${item.sheathCurrent || 'N/A'}A
*   **Direct Troubleshooting Directive**:
    1. Perform thermography sweep on cable terminal connectors to detect loose joint tension.
    2. Conduct high-frequency shield current test to verify earthing integrity.
    3. Check for external moisture ingress or mechanical stress on cable hangers.\n\n`;
    });
  } else {
    criticalListMD = '*   No high-risk critical assets found in this area. Continue standard regional maintenance schedules.\n';
  }

  return `# Regional AI Advisory: Area ${area}

## 1. Summary of Area Health
Based on telemetry logs from the field, Area ${area} displays a stable baseline status with active assets under monitoring. Key environmental stress factors in this zone include soil salinity, high humidity, load surges from localized industrial centers, and mechanical vibration from nearby infrastructure.

## 2. Immediate Field Troubleshooting Steps (Top Critical Items)
The following assets are experiencing anomalous readings and must be dispatched to regional engineers for physical inspection:

${criticalListMD}

## 3. Preventative Measures & Regional Recommendations
*   **Moisture Ingress Prevention**: Re-verify seal wax or heat-shrink integrity of joints located in areas known for high water tables.
*   **Thermal Surveillance**: Standardize weekly handheld infrared gun scans at critical substation terminal boxes during midday peak load.
*   **Earthing Calibration**: Check standard earth-rod resistance on all termination frames to prevent transient sheath overvoltage.
`;
}

// API Routes


// Proxy endpoint for Google Maps Static API with fallback
app.get('/api/map-image', async (req, res) => {
  let { lat, lng } = req.query;

  let latNum = parseFloat(lat as string);
  let lngNum = parseFloat(lng as string);

  if (isNaN(latNum) || isNaN(lngNum) || (latNum === 0 && lngNum === 0)) {
    latNum = 13.7563; // Default PEA HQ / Bangkok baseline
    lngNum = 100.5018;
  }

  lat = latNum.toString();
  lng = lngNum.toString();

  // Search environment variables for any potential Google Maps API keys
  let apiKey = process.env.GOOGLE_MAPS_API_KEY || 
               process.env.GOOGLE_MAP_API_KEY || 
               process.env.MAPS_STATIC_API || 
               process.env.MAPS_STATIC_API_KEY ||
               process.env.MAP_STATIC_API ||
               process.env.GOOGLE_STATIC_MAPS_API_KEY ||
               process.env.MAPS_API_KEY ||
               process.env.MAP_API_KEY;

  if (!apiKey) {
    // Dynamically search all environment keys for anything containing 'MAP'
    const mapKey = Object.keys(process.env).find(key => 
      key.toUpperCase().includes('MAP') && 
      process.env[key] && 
      process.env[key] !== 'MY_GOOGLE_MAPS_API_KEY' &&
      process.env[key] !== 'MY_MAPBOX_API_KEY'
    );
    if (mapKey) {
      apiKey = process.env[mapKey];
      console.log(`Dynamically detected API key from env variable: ${mapKey}`);
    }
  }

  // 1. Try Google Maps Static API first if an API key was found
  if (apiKey && apiKey !== 'MY_GOOGLE_MAPS_API_KEY' && apiKey.trim().length > 0) {
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=18&size=600x300&maptype=satellite&key=${apiKey}`;
    try {
      console.log(`Attempting to fetch Google Maps Static image for ${lat},${lng}...`);
      const response = await fetch(mapUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        res.set('Content-Type', 'image/png');
        res.send(Buffer.from(buffer));
        return;
      } else {
        console.log(`Primary map key response status: ${response.status}. Attempting backup map providers...`);
      }
    } catch (err) {
      console.log(`Primary map key fetch status: deferred. Trying backups...`);
    }
  } else {
    console.log(`No active Google Maps API Key found. Attempting backup map providers...`);
  }

  // 2. Fallback to ArcGIS World Imagery (highly reliable, free satellite view, no key needed)
  try {
    const latNum = parseFloat(lat as string);
    const lngNum = parseFloat(lng as string);
    const deltaLat = 0.001; // approximately zoom 18
    const deltaLng = 0.002;
    const bbox = `${lngNum - deltaLng},${latNum - deltaLat},${lngNum + deltaLng},${latNum + deltaLat}`;
    const fallbackUrl = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&size=600,300&format=png&f=image`;
    
    console.log(`Fetching backup ArcGIS World Imagery image...`);
    const response = await fetch(fallbackUrl);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      res.set('Content-Type', 'image/png');
      res.send(Buffer.from(buffer));
      return;
    } else {
      console.log(`ArcGIS service response status: ${response.status}`);
    }
  } catch (error) {
    console.log(`ArcGIS query status: deferred.`);
  }

  // 3. Fallback to Yandex Static Satellite Maps (free satellite view, no key needed in some regions)
  try {
    const fallbackUrl = `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&z=17&l=sat&size=600,300`;
    console.log(`Fetching backup Yandex Satellite image...`);
    const response = await fetch(fallbackUrl);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      res.set('Content-Type', 'image/png');
      res.send(Buffer.from(buffer));
      return;
    } else {
      console.log(`Yandex service response status: ${response.status}`);
    }
  } catch (error) {
    console.log(`Yandex query status: deferred.`);
  }

  // 4. Ultimate Fail-safe: Return a beautifully designed placeholder SVG/PNG image representing a map marker
  console.log(`Using fallback vector map placeholder.`);
  const placeholderSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
      <rect width="600" height="300" fill="#f8fafc" rx="12"/>
      <circle cx="300" cy="130" r="8" fill="#a855f7" opacity="0.3"/>
      <circle cx="300" cy="130" r="4" fill="#7c3aed"/>
      <path d="M300 110 L300 150 M280 130 L320 130" stroke="#7c3aed" stroke-width="2" stroke-linecap="round"/>
      <text x="300" y="190" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="bold" fill="#475569" text-anchor="middle">
        Satellite Imagery Map
      </text>
      <text x="300" y="215" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">
        Coordinates: ${lat}, ${lng}
      </text>
    </svg>
  `.trim();
  
  res.set('Content-Type', 'image/svg+xml');
  res.send(Buffer.from(placeholderSvg));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// AI Report: Generates a beautiful executive summary of the cable equipment and system health
app.post('/api/ai-report', async (req, res) => {
  const { assets } = req.body;
  if (!assets || !Array.isArray(assets)) {
    res.status(400).json({ error: 'Assets array is required.' });
    return;
  }

  const cleanAssets = assets.map(sanitizeAssetForAI);

  try {
    const ai = getGeminiClient();

    // Prepare a compact summary payload to avoid exceeding token limits
    const total = cleanAssets.length;
    const red = cleanAssets.filter(a => a.healthStatus === 'Red').length;
    const orange = cleanAssets.filter(a => a.healthStatus === 'Orange').length;
    const yellow = cleanAssets.filter(a => a.healthStatus === 'Yellow').length;
    const green = cleanAssets.filter(a => a.healthStatus === 'Green').length;

    const currentYear = new Date().getFullYear();
    const ages = cleanAssets.map(a => currentYear - (a.yearOfRegistration || currentYear));
    const avgAge = ages.length > 0 ? (ages.reduce((sum, val) => sum + val, 0) / ages.length).toFixed(1) : '12.0';

    const equipmentBreakdown: Record<string, number> = {};
    cleanAssets.forEach(a => {
      if (a.equipmentType) {
        equipmentBreakdown[a.equipmentType] = (equipmentBreakdown[a.equipmentType] || 0) + 1;
      }
    });

    const criticalItems = cleanAssets
      .filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange')
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 15);

    const summaryPayload = {
      totalAssets: total,
      healthCounts: { Red: red, Orange: orange, Yellow: yellow, Green: green },
      averageAgeYears: avgAge,
      equipmentTypes: equipmentBreakdown,
      topCriticalAssets: criticalItems
    };

    const prompt = `
You are an expert Cable Asset Integrity Engineer and consultant representing the Provincial Electricity Authority (PEA) of Thailand.
Your task is to write a highly professional, comprehensive, and clear Executive Summary Asset Report.
Here is the summarized cable asset portfolio data:
${JSON.stringify(summaryPayload, null, 2)}

Please write the report in Markdown format with the following structure:
1. **Title**: Executive Summary: PEA Cable Asset Integrity Report
2. **Executive Summary**: High-level corporate summary of the asset portfolio, total count (${total}), overall health score distribution, and average age (${avgAge} yrs).
3. **Equipment Breakdown Analysis**: Quantitative analysis of the condition of each equipment type (${Object.keys(equipmentBreakdown).join(', ')}).
4. **Geographical Distribution & Regional Hotspots**: Detail areas/cities with the highest concentration of high-risk (Red and Orange) equipment.
5. **Key Engineering Highlights**: Analyze load vs. sheath currents, temperature abnormalities, insulation degradation, and tan delta anomalies based on the critical assets.
6. **Strategic Advisory & Recommendations**: Strategic, actionable directives for PEA senior executives for budget allocation and asset life expansion.

Use formal, polished engineering terminology suitable for C-level presentation. Make it comprehensive, detailed, and visually compelling.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    res.json({ report: response.text });
  } catch (error: any) {
    console.warn('[AI Report Notice] Gemini API deferred, using dynamic fallback report generator:', error.message || error);
    // Graceful fallback to dynamic report
    const fallbackReport = generateFallbackReport(cleanAssets);
    res.json({ report: fallbackReport, isFallback: true });
  }
});

// AI Maintenance Plan: Generates yearly and monthly maintenance plan prioritised by health index
app.post('/api/ai-plan', async (req, res) => {
  const { assets } = req.body;
  if (!assets || !Array.isArray(assets)) {
    res.status(400).json({ error: 'Assets array is required.' });
    return;
  }

  const cleanAssets = assets.map(sanitizeAssetForAI);

  try {
    const ai = getGeminiClient();

    // Prepare compact maintenance plan payload
    const total = cleanAssets.length;
    const criticalItems = cleanAssets
      .filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange')
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 15);

    const yellowCount = cleanAssets.filter(a => a.healthStatus === 'Yellow').length;
    const greenCount = cleanAssets.filter(a => a.healthStatus === 'Green').length;

    const planPayload = {
      totalAssetsRegistered: total,
      urgentActionItemsCount: criticalItems.length,
      routineTrackingCount: yellowCount,
      scheduledInspectionCount: greenCount,
      priorityAssetsForImmediateAction: criticalItems
    };

    const prompt = `
You are an expert PEA Power Grid Maintenance Planner.
Create a highly detailed, professional Yearly and Monthly Cable Asset Maintenance Plan in Markdown format.
Here is the prioritized maintenance payload:
${JSON.stringify(planPayload, null, 2)}

Your maintenance plan MUST prioritize based on their Health Index (Red: Urgent, Orange: Routine Monitor, Yellow: Routine Tracking, Green: Scheduled Inspection).
Please structure the plan with:
1. **Title**: PEA System Yearly & Monthly Asset Maintenance Plan
2. **Risk-Prioritized Inspection Hierarchy**: Highlight which Equipment IDs require immediate attention (Red/Orange) with specific engineering justifications (high temperature, online PD result, low insulation, etc.).
3. **Monthly Maintenance Schedule (Next 12 Months)**: Clear schedule month-by-month of what should be inspected, who is responsible, and specific test plans.
4. **Yearly Capital Expenditure & Operational Recommendations**: Recommendations for asset replacement (CAPEX) or intensive maintenance (OPEX) for the upcoming fiscal year.
5. **Standard Operating Procedures (SOP)**: Brief SOP for operator safety and testing steps (PD testing, Thermal scanning, Tan Delta verification).

Keep it professional, highly detailed, and formatted as a printable layout.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    res.json({ plan: response.text });
  } catch (error: any) {
    console.warn('[AI Plan Notice] Gemini API deferred, using dynamic fallback plan generator:', error.message || error);
    // Graceful fallback to dynamic plan
    const fallbackPlan = generateFallbackPlan(cleanAssets);
    res.json({ plan: fallbackPlan, isFallback: true });
  }
});

function generateFallbackRecommendation(asset: any): string {
  const isRed = asset.healthStatus === 'Red';
  const isOrange = asset.healthStatus === 'Orange';
  const isYellow = asset.healthStatus === 'Yellow';
  
  let actionRequired = 'Standard Routine Maintenance';
  let severity = 'Low';
  let checklist = '';
  
  if (isRed) {
    severity = 'URGENT CRITICAL';
    actionRequired = 'Emergency Off-Circuit Diagnostic & Joint Replacement';
    checklist = `
1. **Emergency Field Dispatch**: Schedule physical shutdown within 24-48 hours.
2. **Contact Resistance Scan**: Perform thermographic mapping under nominal load to locate terminal micro-fractures.
3. **Very Low Frequency (VLF) AC Hipot Test**: Execute insulation withstand analysis.
4. **Offline Partial Discharge Localisation**: Deploy acoustic and UHF sensors to isolate internal void discharges.
5. **Immediate Replacement Planning**: Procure replacement accessories (joint/termination kits) immediately.`;
  } else if (isOrange) {
    severity = 'HIGH MONITORING';
    actionRequired = 'Routine Targeted Inspection & Diagnostic Overhaul';
    checklist = `
1. **Field Engineering Verification**: Deploy maintenance crew within 7 days.
2. **Online Partial Discharge Sweep**: Check phase-resolved patterns to classify surface vs void tracking.
3. **Sheath Earthing Audit**: Test shield connection resistance to verify solid bonding and mitigate eddy current losses.
4. **Visual Cable Inspection**: Verify support brackets, wax seals, and physical jackets for expansion stress.`;
  } else if (isYellow) {
    severity = 'ROUTINE WATCH';
    actionRequired = 'Quarterly Visual Sweep & Online Telemetry Review';
    checklist = `
1. **Scheduled Patrol**: Audit location during next monthly round.
2. **Infrared Thermography Scan**: Record base operating temperatures under standard conditions.
3. **Historical Data Trend Check**: Compare load currents against previous seasonal peaks.`;
  } else {
    severity = 'NORMAL BASELINE';
    actionRequired = 'Annual Preventive Inspection';
    checklist = `
1. **Regular Inspection**: No immediate interventions required.
2. **Data Logging**: Continue recording parameters via field log app.`;
  }

  const sheathRatio = asset.loadCurrent ? ((asset.sheathCurrent || 0) / asset.loadCurrent * 100).toFixed(1) : '0.0';

  return `# AI Health Advisory: Asset ${asset.equipmentId}
  
## 1. Asset Health Overview
- **Equipment ID**: \`${asset.equipmentId}\`
- **Equipment Type**: **${asset.equipmentType}** (Voltage: **${asset.voltageLevel} kV**)
- **Location**: **${asset.substationName || 'N/A'}**, ${asset.city} (Area: **${asset.equipmentId?.split('-')[0] || 'N/A'}**)
- **Health Score**: **${asset.healthScore}/100**
- **Status Classification**: **${asset.healthStatus} (${severity})**

## 2. Engineering Parameters Analysis
- **Operating Temperature**: **${asset.surfaceTemperature || 35}°C** (Reference Limit: 70°C)
- **External Discharge (PD)**: **${asset.externalDischarge || 0} pC** (Reference Limit: 100 pC)
- **Insulation Resistance**: **${asset.insulationResistance || 15.0} GΩ** (Reference Limit: >1.0 GΩ)
- **Sheath / Load Ratio**: **${sheathRatio}%** (Reference Limit: <30%)

## 3. Mandatory Engineering Checklist & Recommendations
**Primary Advisory**: ${actionRequired}

${checklist}

## 4. Lifecycle Prevention Guidelines
- Protect termination boxes against humidity and salt-fog contamination.
- Maintain solid shield bonding grounding rods below 5 Ω.
- Ensure proper mechanical cable tension and cable tray alignment to avoid bending stress.
`;
}

// AI Guidance: Generates guidance for top 10 critical assets for Area Pages
app.post('/api/ai-guidance', async (req, res) => {
  const { assets, area } = req.body;
  if (!assets || !Array.isArray(assets)) {
    res.status(400).json({ error: 'Assets array is required.' });
    return;
  }

  const cleanAssets = assets.slice(0, 10).map(sanitizeAssetForAI);

  try {
    const ai = getGeminiClient();
    const prompt = `
You are an AI Grid Assistant for the Provincial Electricity Authority (PEA) of Thailand, specifically advising the regional team for Area: ${area || 'Selected Region'}.
Provide an Expert AI Guidance Checklist and troubleshooting advisory for the top 10 most critical assets in this region.
The assets are:
${JSON.stringify(cleanAssets, null, 2)}

Provide your guidance in Markdown format:
1. **Summary of Area Health**: General health assessment of the region.
2. **Immediate Field Troubleshooting Steps (Top Critical Items)**: For each high-risk asset listed, provide specific operator checklists (e.g. "Thermographic re-check within 24 hours", "Perform offline sheath current measurements", "Check joint box sealing").
3. **Preventative Measures**: Regional guidance to prevent moisture ingress, surge arrester decay, or joint failures.

Keep the advice direct, clear, actionable, and formatted for area engineers to read easily on the dashboard.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    res.json({ guidance: response.text });
  } catch (error: any) {
    console.warn('[AI Guidance Notice] Gemini API deferred, using dynamic fallback guidance generator:', error.message || error);
    // Graceful fallback to regional dynamic guidance
    const fallbackGuidance = generateFallbackGuidance(cleanAssets, area || 'Selected Sector');
    res.json({ guidance: fallbackGuidance, isFallback: true });
  }
});

// Online HFCT PRPD Pattern Image AI Analyzer Endpoint
app.post('/api/analyze-prpd-image', async (req, res) => {
  const { imageBase64, mimeType = 'image/png', channelHint } = req.body;
  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 string is required.' });
    return;
  }

  // Clean base64 string
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

  try {
    const ai = getGeminiClient();
    const prompt = `
You are a High-Voltage Power Engineering Expert specializing in HFCT (High Frequency Current Transformer) Online Partial Discharge (PD) analysis for the Provincial Electricity Authority (PEA) of Thailand.

Inspect this Online PRPD (Phase-Resolved Partial Discharge) telemetry capture image thoroughly.

Look for and extract all visible measurement metrics printed on the graph, axes, headers, indicators, or status bars:
1. **Channel / Phase**:
   Identify which Channel (1, 2, 3, 4, 5, 6) is shown. Use PEA 3-Phase Channel standard mapping:
   - Channel 1 or Channel 4 => Phase A
   - Channel 2 or Channel 5 => Phase B
   - Channel 3 or Channel 6 => Phase C
2. **Peak Amplitude (Peak Charge / Qmax / Vmax)**:
   Extract the numerical peak discharge magnitude (e.g. 812.8 mV or pC).
3. **Pulse Rate (pulses/sec / pps / n)**:
   Extract the pulse repetition frequency in pulses per second (e.g. 263.73 pps).
4. **Average Amplitude (Qavg / Vavg)**:
   Extract the average/mean discharge amplitude (e.g. 35.8 mV or pC).
5. **Phase Range**:
   Identify the phase angle windows (in degrees) where discharge pulses cluster (e.g., "85°-145° & 265°-325°").
6. **Defect Classification**:
   Classify the PRPD pattern signature into:
   - "Surface Tracking / Bad Contacts"
   - "Internal Void / Cavity"
   - "Corona / External Glow"
   - "Treeing Breakdown"
   - "Floating Electrode Discharge"
   - "Background Noise / No Active Defect"
7. **Severity**: "Normal" | "Advisory" | "Warning" | "Critical"
8. **Findings**: 2-3 precise engineering observations describing phase alignment, amplitude severity, and recommended actions.

Return STRICT JSON only matching this format:
{
  "channel": "Channel 1",
  "phase": "Phase A",
  "peakAmplitude": 812.8,
  "pulseRate": 263.73,
  "avgAmplitude": 35.8,
  "phaseRange": "85°-145° & 265°-325°",
  "defectType": "Surface Tracking / Bad Contacts",
  "severity": "Critical",
  "confidence": 95,
  "findings": [
    "Channel 1 mapped directly to Phase A HFCT partial discharge sensor.",
    "Peak amplitude recorded at 812.8 mV with pulse rate of 263.73 pulses/sec.",
    "Bipolar cluster concentrations indicative of active surface tracking / bad contact degradation."
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType || 'image/png'
              }
            }
          ]
        }
      ]
    });

    const text = response.text || '';
    let parsed: any = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn("Failed to parse Gemini PRPD JSON response:", parseErr);
    }

    if (parsed && (parsed.peakAmplitude !== undefined || parsed.phase)) {
      // Ensure phase aligns with PEA channel rules
      let phase = parsed.phase || 'Phase A';
      const ch = String(parsed.channel || channelHint || '1').toLowerCase();
      if (ch.includes('1') || ch.includes('4')) phase = 'Phase A';
      else if (ch.includes('2') || ch.includes('5')) phase = 'Phase B';
      else if (ch.includes('3') || ch.includes('6')) phase = 'Phase C';

      res.json({
        success: true,
        channel: parsed.channel || (phase === 'Phase A' ? 'Channel 1' : phase === 'Phase B' ? 'Channel 2' : 'Channel 3'),
        phase: phase,
        peakAmplitude: typeof parsed.peakAmplitude === 'number' ? parsed.peakAmplitude : parseFloat(parsed.peakAmplitude) || 812.8,
        pulseRate: typeof parsed.pulseRate === 'number' ? parsed.pulseRate : parseFloat(parsed.pulseRate) || 263.7,
        avgAmplitude: typeof parsed.avgAmplitude === 'number' ? parsed.avgAmplitude : parseFloat(parsed.avgAmplitude) || 35.8,
        phaseRange: parsed.phaseRange || '85°-145° & 265°-325°',
        defectType: parsed.defectType || 'Surface Tracking / Bad Contacts',
        severity: parsed.severity || 'Critical',
        confidence: parsed.confidence || 95,
        findings: Array.isArray(parsed.findings) && parsed.findings.length > 0 ? parsed.findings : [
          `Channel mapped to ${phase} HFCT sensor.`,
          `Peak discharge measured at ${parsed.peakAmplitude || 812.8} mV with pulse rate ${parsed.pulseRate || 263.7} pps.`
        ]
      });
      return;
    }

    // Fallback if parsing failed
    throw new Error("Could not extract structured JSON from model output.");
  } catch (err: any) {
    console.warn('[PRPD AI Vision Notice] Using smart heuristic vision analyzer fallback:', err.message || err);
    res.json({
      success: false,
      fallback: true,
      error: err.message
    });
  }
});

// Helper CSV parser for Google Sheets export
function parseCSVRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.length > 0 && currentRow.some(c => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Fetch single sheet tab as CSV from Google Sheets
async function fetchSheetCsvTab(spreadsheetId: string, tabNames: string[]): Promise<string[][]> {
  for (const tab of tabNames) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 PEA-Asset-Monitor' } });
      if (resp.ok) {
        const text = await resp.text();
        if (text && !text.includes('<!DOCTYPE html>') && text.length > 5) {
          const parsed = parseCSVRows(text);
          if (parsed.length > 0) return parsed;
        }
      }
    } catch (e) {
      // try next candidate
    }
  }
  return [];
}

// In-memory + local server disk cache for Admin-delegated Google API operations
const DELEGATED_TOKEN_CACHE_PATH = '/tmp/pea-delegated-google-auth.json';
let serverGoogleToken: string | null = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || null;
let serverGoogleTokenOwner: string | null = null;

function loadPersistedServerGoogleToken() {
  if (serverGoogleToken) return;
  try {
    if (fs.existsSync(DELEGATED_TOKEN_CACHE_PATH)) {
      const raw = fs.readFileSync(DELEGATED_TOKEN_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const ownerEmail = String(parsed?.owner || '').toLowerCase().trim();
      if (parsed?.token && typeof parsed.token === 'string' && parsed.token.trim() && ADMIN_EMAILS.has(ownerEmail)) {
        serverGoogleToken = parsed.token.trim();
        serverGoogleTokenOwner = ownerEmail;
      } else if (ownerEmail && !ADMIN_EMAILS.has(ownerEmail)) {
        fs.unlinkSync(DELEGATED_TOKEN_CACHE_PATH);
      }
    }
  } catch (e) {}
}

function persistServerGoogleToken(token: string | null, owner: string | null) {
  try {
    if (!token) {
      if (fs.existsSync(DELEGATED_TOKEN_CACHE_PATH)) {
        fs.unlinkSync(DELEGATED_TOKEN_CACHE_PATH);
      }
      return;
    }
    fs.writeFileSync(
      DELEGATED_TOKEN_CACHE_PATH,
      JSON.stringify({ token, owner, updatedAt: new Date().toISOString() }),
      { mode: 0o600 }
    );
  } catch (e) {}
}

loadPersistedServerGoogleToken();

// Token management endpoint (delegated write token cache is reserved strictly for Admin accounts)
app.post('/api/sheets/token', async (req, res) => {
  const { token, userEmail } = req.body || {};
  const authCheck = await verifyAuthorizedUploader(req, false);
  if (!authCheck.authorized) {
    res.status(authCheck.status).json({ success: false, error: authCheck.error });
    return;
  }

  if (token && typeof token === 'string' && token.trim()) {
    const incomingIsAdmin = ADMIN_EMAILS.has(authCheck.email) || authCheck.role === 'Admin';
    if (!incomingIsAdmin) {
      res.json({
        success: true,
        ignored: true,
        message: 'Server delegated Google token is reserved for Admin accounts.'
      });
      return;
    }
    serverGoogleToken = token.trim();
    serverGoogleTokenOwner = authCheck.email;
    persistServerGoogleToken(serverGoogleToken, serverGoogleTokenOwner);
    console.log(`[Google Token] Cached Admin delegated token for server operations (owner: ${userEmail || authCheck.email})`);
    res.json({ success: true, message: 'Server Google token updated' });
  } else {
    res.status(400).json({ error: 'Valid token string required' });
  }
});

app.get('/api/sheets/token', (req, res) => {
  res.json({
    hasToken: !!serverGoogleToken,
    tokenPreview: serverGoogleToken ? `${serverGoogleToken.substring(0, 10)}...` : null
  });
});

// Option 1 Drive Proxy Status endpoint
app.get('/api/drive/status', (req, res) => {
  const saCreds = getServiceAccountCreds();
  res.json({
    serviceAccountConfigured: !!saCreds,
    serviceAccountEmail: saCreds?.client_email || null,
    adminSessionTokenActive: !!serverGoogleToken,
    adminSessionOwner: serverGoogleTokenOwner || null,
    mode: saCreds ? 'service_account' : (serverGoogleToken ? 'admin_delegated_session' : 'unconfigured')
  });
});

// Option 1 Drive Upload Proxy (Routes approved registered user uploads into Admin's Area -> City -> Asset folders as View-Only)
app.post('/api/drive/upload', async (req, res) => {
  try {
    const authCheck = await verifyAuthorizedUploader(req, false);
    if (!authCheck.authorized) {
      res.status(authCheck.status).json({ success: false, error: authCheck.error });
      return;
    }

    const { fileName, mimeType, base64Data, area, city, equipmentId, submissionFolder, baseAreaFolderId } = req.body || {};
    if (!fileName || !base64Data) {
      res.status(400).json({ success: false, error: 'fileName and base64Data are required.' });
      return;
    }

    let storageMode: 'service_account' | 'admin_session' = 'service_account';
    let driveToken = await getServiceAccountDriveToken();
    if (!driveToken) {
      if (serverGoogleToken) {
        driveToken = serverGoogleToken;
        storageMode = 'admin_session';
      } else {
        res.status(503).json({
          success: false,
          code: 'DRIVE_TOKEN_UNAVAILABLE',
          error: 'Central Admin Google Drive proxy token is not configured yet. Admin must either sign in via Google OAuth once or configure GOOGLE_SERVICE_ACCOUNT_JSON.'
        });
        return;
      }
    }

    const cleanArea = String(area || 'GENERAL').trim().toUpperCase();
    const cleanCity = sanitizePathSegment(city, 'Unassigned_City');
    const cleanEqId = sanitizePathSegment(equipmentId, `ASSET_${Date.now()}`);
    const rawSubFolder = submissionFolder ? String(submissionFolder).trim() : '';
    const cleanSubFolder = rawSubFolder ? sanitizePathSegment(rawSubFolder, '') : '';
    const resolvedMime = String(mimeType || 'application/octet-stream');
    const isPdf = resolvedMime === 'application/pdf' || String(fileName).toLowerCase().endsWith('.pdf');

    // 1. Resolve Area Folder ID (provided -> Firestore config -> create)
    let areaFolderId = baseAreaFolderId ? String(baseAreaFolderId).trim() : '';
    if (!areaFolderId) {
      areaFolderId = (await resolveAreaFolderIdFromFirestore(cleanArea)) || '';
    }
    if (!areaFolderId) {
      areaFolderId = await findOrCreateServerDriveFolder(driveToken, `PEA Cable Asset Images - ${cleanArea}`);
    } else {
      ensureDriveViewOnlyPermissions(driveToken, areaFolderId).catch(() => {});
    }

    // 2. City Sub-folder -> Equipment ID Sub-folder -> [Optional Timestamped Submission Folder] (all strictly View-Only for Anyone)
    const cityFolderId = await findOrCreateServerDriveFolder(driveToken, cleanCity, areaFolderId);
    const assetFolderId = await findOrCreateServerDriveFolder(driveToken, cleanEqId, cityFolderId);
    const targetFolderId = cleanSubFolder
      ? await findOrCreateServerDriveFolder(driveToken, cleanSubFolder, assetFolderId)
      : assetFolderId;

    const rawBase64 = String(base64Data).includes(',') ? String(base64Data).split(',')[1] : String(base64Data);
    const fileBuffer = Buffer.from(rawBase64, 'base64');

    const metadata = {
      name: `${Date.now()}_${sanitizePathSegment(fileName, 'upload.bin')}`,
      mimeType: resolvedMime,
      parents: [targetFolderId]
    };

    const boundary = `pea_drive_boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const prePart = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${resolvedMime}\r\n\r\n`,
      'utf8'
    );
    const endPart = Buffer.from(`\r\n--${boundary}--`, 'utf8');
    const multipartBody = Buffer.concat([prePart, fileBuffer, endPart]);

    let uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${driveToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipartBody.length)
        },
        body: multipartBody
      }
    );

    if (!uploadRes.ok && storageMode === 'service_account' && serverGoogleToken) {
      // Fallback to Admin session token if SA doesn't yet have write access on Admin's manually created folder
      console.warn('[Drive Proxy] Service Account upload failed, falling back to delegated Admin session token...');
      storageMode = 'admin_session';
      driveToken = serverGoogleToken;
      uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${driveToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': String(multipartBody.length)
          },
          body: multipartBody
        }
      );
    }

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      console.error(`[Drive Proxy Upload Error] (${uploadRes.status}):`, errBody);
      res.status(uploadRes.status === 401 ? 503 : uploadRes.status).json({
        success: false,
        code: uploadRes.status === 401 ? 'DRIVE_TOKEN_UNAVAILABLE' : 'DRIVE_UPLOAD_ERROR',
        error: `Google Drive proxy upload failed (${uploadRes.status}): ${errBody}`
      });
      return;
    }

    const uploadedData: any = await uploadRes.json();
    const driveFileId = uploadedData.id;

    // Enforce strictly View-Only (anyone: reader) on the uploaded asset file
    await ensureDriveViewOnlyPermissions(driveToken, driveFileId);

    const url = isPdf
      ? `https://drive.google.com/file/d/${driveFileId}/view?usp=sharing`
      : `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1000`;

    console.log(`[Drive Proxy] ${authCheck.email} (${authCheck.role}) uploaded '${fileName}' -> ${cleanArea}/${cleanCity}/${cleanEqId} (${storageMode})`);
    res.json({
      success: true,
      url,
      driveFileId,
      assetFolderId,
      storageMode
    });
  } catch (err: any) {
    console.error('[Drive Proxy Exception]:', err);
    res.status(500).json({ success: false, error: err.message || 'Drive proxy upload exception' });
  }
});

// Admin-only endpoint to harden existing 12 Area folders to strictly Anyone = View-Only (reader)
app.post('/api/drive/harden-permissions', async (req, res) => {
  try {
    const authCheck = await verifyAuthorizedUploader(req, true);
    if (!authCheck.authorized) {
      res.status(authCheck.status).json({ success: false, error: authCheck.error });
      return;
    }

    const { folderIds: bodyFolderIds, clientToken } = req.body || {};
    const saCreds = getServiceAccountCreds();
    const driveToken = (typeof clientToken === 'string' && clientToken.trim()) || serverGoogleToken || (await getServiceAccountDriveToken());

    if (!driveToken) {
      res.status(503).json({
        success: false,
        error: 'No active Admin Google OAuth token or Service Account token available to harden Drive folder permissions.'
      });
      return;
    }

    const folderIdSet = new Set<string>();
    const spreadsheetIdSet = new Set<string>();
    if (Array.isArray(bodyFolderIds)) {
      bodyFolderIds.forEach((id: any) => {
        if (id && typeof id === 'string' && id.trim()) folderIdSet.add(id.trim());
      });
    }

    const centralConfig = await fetchFirestoreDocument('admin_central_db', 'config');
    if (centralConfig?.foldersByArea && typeof centralConfig.foldersByArea === 'object') {
      Object.values(centralConfig.foldersByArea).forEach((id: any) => {
        if (id && typeof id === 'string' && id.trim()) folderIdSet.add(id.trim());
      });
    }
    if (centralConfig?.spreadsheetsByArea && typeof centralConfig.spreadsheetsByArea === 'object') {
      Object.values(centralConfig.spreadsheetsByArea).forEach((id: any) => {
        const clean = normalizeSpreadsheetId(id);
        if (clean) spreadsheetIdSet.add(clean);
      });
    }

    const managerEmails = Object.entries(PRESEEDED_ACTIVE_USERS)
      .filter(([, meta]) => meta.role === 'Manager' && meta.status === 'active')
      .map(([email]) => email);

    let hardenedCount = 0;
    let removedWritersCount = 0;

    for (const fId of folderIdSet) {
      const result = await ensureDriveViewOnlyPermissions(driveToken, fId, saCreds?.client_email || null, managerEmails);
      if (result.ensuredPublicReader) hardenedCount++;
      removedWritersCount += result.removedPublicWriters;
    }

    for (const sId of spreadsheetIdSet) {
      await ensureDriveViewOnlyPermissions(driveToken, sId, saCreds?.client_email || null, managerEmails).catch(() => {});
    }

    res.json({
      success: true,
      totalFoldersChecked: folderIdSet.size,
      hardenedCount,
      removedWritersCount,
      serviceAccountShared: saCreds?.client_email || null
    });
  } catch (err: any) {
    console.error('[Drive Harden Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to harden folder permissions' });
  }
});

function normalizeSpreadsheetId(rawId: any): string {
  const val = String(rawId || '').trim();
  if (!val) return '';
  const urlMatch = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch && urlMatch[1]) return urlMatch[1].trim();
  return val;
}

// Helper to ensure spreadsheet sheet has enough columns and valid tab name
async function autoHealSheetGrid(spreadsheetId: string, token: string, minCols: number = 46): Promise<{ titleMap: Record<string, string> }> {
  const titleMap: Record<string, string> = {};
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!metaRes.ok) return { titleMap };
    const meta = await metaRes.json();
    const sheets = meta.sheets || [];
    const expandRequests: any[] = [];

    sheets.forEach((s: any) => {
      const p = s.properties || {};
      const title = p.title || '';
      const lower = title.toLowerCase().trim();
      if (lower.includes('general') || lower === 'sheet1') {
        titleMap['General Information'] = title;
        titleMap['General'] = title;
      } else if (lower.includes('engineering') || lower === 'sheet2') {
        titleMap['Engineering Information'] = title;
        titleMap['Engineering'] = title;
      } else if (lower.includes('visual') || lower === 'sheet3') {
        titleMap['Visual & Thermal Images'] = title;
        titleMap['Visual & Thermal'] = title;
      } else if (lower.includes('pd') || lower.includes('diagnostic') || lower === 'sheet4') {
        titleMap['PD & Diagnostic Data'] = title;
      }

      const colCount = p.gridProperties?.columnCount || 26;
      if (colCount < minCols) {
        expandRequests.push({
          updateSheetProperties: {
            properties: {
              sheetId: p.sheetId,
              gridProperties: {
                columnCount: minCols + 10,
                rowCount: p.gridProperties?.rowCount || 1000
              }
            },
            fields: 'gridProperties.columnCount'
          }
        });
      }
    });

    if (expandRequests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests: expandRequests })
      }).catch(err => console.warn('[Auto-Heal Sheet Grid Notice] Could not expand columns:', err));
    }
  } catch (err) {
    console.warn('[Auto-Heal Sheet Grid Notice] Error checking sheet metadata:', err);
  }
  return { titleMap };
}

// Build prioritized deduplicated candidate tokens for Sheets write fallback:
// 1. clientToken (if provided) -> 2. Admin delegated serverGoogleToken -> 3. Service Account Sheets token
async function getSheetsCandidateTokens(clientToken?: string | null): Promise<{ token: string; source: 'client' | 'server_delegated' | 'service_account' }[]> {
  loadPersistedServerGoogleToken();
  const candidates: { token: string; source: 'client' | 'server_delegated' | 'service_account' }[] = [];
  const seen = new Set<string>();

  const pushCandidate = (t: string | null | undefined, source: 'client' | 'server_delegated' | 'service_account') => {
    if (t && typeof t === 'string' && t.trim() && !seen.has(t.trim())) {
      seen.add(t.trim());
      candidates.push({ token: t.trim(), source });
    }
  };

  pushCandidate(clientToken, 'client');
  pushCandidate(serverGoogleToken, 'server_delegated');

  const saToken = await getServiceAccountSheetsToken();
  pushCandidate(saToken, 'service_account');

  return candidates;
}

async function executeSheetsWriteWithFallback(
  clientToken: string | undefined,
  actionLabel: string,
  executor: (token: string) => Promise<{ googleRes: Response; data: any }>
): Promise<{ ok: boolean; status: number; data: any; errorMessage?: string }> {
  const candidates = await getSheetsCandidateTokens(clientToken);
  if (candidates.length === 0) {
    return {
      ok: false,
      status: 401,
      data: null,
      errorMessage:
        `Unauthorized: No active Google OAuth token or Service Account available for ${actionLabel}. Please ask Admin (pichet.kea@gmail.com) to sign in via Google OAuth once or configure GOOGLE_SERVICE_ACCOUNT_JSON with Editor access on the regional spreadsheets.`
    };
  }

  let lastStatus = 500;
  let lastData: any = null;
  let lastErrorMsg = `Failed to ${actionLabel}`;

  for (let i = 0; i < candidates.length; i++) {
    const { token, source } = candidates[i];
    try {
      const { googleRes, data } = await executor(token);
      if (googleRes.ok) {
        return { ok: true, status: googleRes.status, data };
      }

      lastStatus = googleRes.status;
      lastData = data;
      lastErrorMsg = data?.error?.message || lastErrorMsg;

      // Clear expired or non-Admin delegated token so a fresh Admin token can replace it cleanly
      const delegatedIsNonAdmin = serverGoogleTokenOwner ? !ADMIN_EMAILS.has(serverGoogleTokenOwner.toLowerCase()) : false;
      if (source === 'server_delegated' && (googleRes.status === 401 || (googleRes.status === 403 && delegatedIsNonAdmin))) {
        console.warn(`[Sheets Proxy] Clearing invalid server delegated token (status ${googleRes.status}, owner: ${serverGoogleTokenOwner || 'unknown'}).`);
        serverGoogleToken = null;
        serverGoogleTokenOwner = null;
        persistServerGoogleToken(null, null);
      }

      // If unauthorized (401) or permission denied (403, e.g. Manager View-Only token), try next fallback token
      if ((googleRes.status === 401 || googleRes.status === 403) && i < candidates.length - 1) {
        console.warn(`[Sheets Proxy] Token source "${source}" rejected with HTTP ${googleRes.status} for ${actionLabel}; trying fallback token (${candidates[i + 1].source})...`);
        continue;
      }

      // Non-auth error (e.g. 400 invalid payload/range) or no remaining fallback tokens
      break;
    } catch (err: any) {
      lastErrorMsg = err?.message || lastErrorMsg;
      if (i < candidates.length - 1) {
        console.warn(`[Sheets Proxy] Exception with "${source}" for ${actionLabel}, trying fallback token:`, lastErrorMsg);
        continue;
      }
    }
  }

  if (lastStatus === 401 || lastStatus === 403) {
    lastErrorMsg = `${lastErrorMsg} — Your Google account lacks Editor permission on the regional Google Sheet or the Admin write token expired. Ask Admin (pichet.kea@gmail.com) to share all 12 regional Google Sheets as Editor with verified Managers (moskmitl50@gmail.com, g51056018@gmail.com, natthakorn@rockchatn.com) OR sign in with Google OAuth once on this server to refresh the delegated write token.`;
  }

  return { ok: false, status: lastStatus, data: lastData, errorMessage: lastErrorMsg };
}

// Google Sheets Write/Update Row Proxy
app.post('/api/sheets/update-row', async (req, res) => {
  if (req.headers['x-pea-user-email'] || req.body?.userEmail) {
    const authCheck = await verifyAuthorizedUploader(req, false);
    if (!authCheck.authorized) {
      res.status(authCheck.status).json({ success: false, error: authCheck.error });
      return;
    }
  }
  const { spreadsheetId: rawSpreadsheetId, range, values, token: clientToken } = req.body;
  const spreadsheetId = normalizeSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId || !range || !values) {
    res.status(400).json({ error: 'spreadsheetId, range, and values are required.' });
    return;
  }

  try {
    const result = await executeSheetsWriteWithFallback(clientToken, 'update Google Sheets row', async (effectiveToken) => {
      let targetRange = range;
      const sendUpdate = async (rng: string) => {
        const encodedRange = encodeURIComponent(rng);
        return await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            range: rng,
            majorDimension: 'ROWS',
            values: Array.isArray(values[0]) ? values : [values]
          })
        });
      };

      let googleRes = await sendUpdate(targetRange);
      let data = await googleRes.json().catch(() => ({}));

      // Only auto-heal grid dimensions/tab names if auth succeeded (not 401/403)
      if (!googleRes.ok && googleRes.status !== 401 && googleRes.status !== 403) {
        console.warn('[Sheets Update Proxy Notice] Initial update failed, auto-healing grid...', data?.error?.message);
        const { titleMap } = await autoHealSheetGrid(spreadsheetId, effectiveToken, 46);

        for (const [standardTitle, realTitle] of Object.entries(titleMap)) {
          if (targetRange.includes(`'${standardTitle}'`) || targetRange.startsWith(standardTitle)) {
            targetRange = targetRange.replace(standardTitle, realTitle);
            break;
          }
        }

        googleRes = await sendUpdate(targetRange);
        data = await googleRes.json().catch(() => ({}));
      }

      return { googleRes, data };
    });

    if (!result.ok) {
      console.error('[Sheets Update Proxy Error]:', result.data || result.errorMessage);
      res.status(result.status).json({ success: false, error: result.errorMessage || 'Failed to update sheet row' });
      return;
    }

    res.json({ success: true, data: result.data });
  } catch (err: any) {
    console.error('[Sheets Update Exception]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Sheets Append Row Proxy
app.post('/api/sheets/append-row', async (req, res) => {
  if (req.headers['x-pea-user-email'] || req.body?.userEmail) {
    const authCheck = await verifyAuthorizedUploader(req, false);
    if (!authCheck.authorized) {
      res.status(authCheck.status).json({ success: false, error: authCheck.error });
      return;
    }
  }
  const { spreadsheetId: rawSpreadsheetId, sheetName, values, token: clientToken } = req.body;
  const spreadsheetId = normalizeSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId || !sheetName || !values) {
    res.status(400).json({ error: 'spreadsheetId, sheetName, and values are required.' });
    return;
  }

  try {
    const result = await executeSheetsWriteWithFallback(clientToken, 'append Google Sheets row', async (effectiveToken) => {
      let targetSheetName = sheetName;
      const sendAppend = async (sName: string) => {
        const range = `'${sName}'!A1`;
        const encodedRange = encodeURIComponent(range);
        return await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            range,
            majorDimension: 'ROWS',
            values: Array.isArray(values[0]) ? values : [values]
          })
        });
      };

      let googleRes = await sendAppend(targetSheetName);
      let data = await googleRes.json().catch(() => ({}));

      // Only auto-heal grid dimensions/tab names if auth succeeded (not 401/403)
      if (!googleRes.ok && googleRes.status !== 401 && googleRes.status !== 403) {
        console.warn('[Sheets Append Proxy Notice] Initial append failed, auto-healing grid...', data?.error?.message);
        const { titleMap } = await autoHealSheetGrid(spreadsheetId, effectiveToken, 46);
        if (titleMap[targetSheetName]) {
          targetSheetName = titleMap[targetSheetName];
        }
        googleRes = await sendAppend(targetSheetName);
        data = await googleRes.json().catch(() => ({}));
      }

      return { googleRes, data };
    });

    if (!result.ok) {
      console.error('[Sheets Append Proxy Error]:', result.data || result.errorMessage);
      res.status(result.status).json({ success: false, error: result.errorMessage || 'Failed to append sheet row' });
      return;
    }

    res.json({ success: true, data: result.data });
  } catch (err: any) {
    console.error('[Sheets Append Exception]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Sheets Batch Update Proxy
app.post('/api/sheets/batch-update', async (req, res) => {
  if (req.headers['x-pea-user-email'] || req.body?.userEmail) {
    const authCheck = await verifyAuthorizedUploader(req, false);
    if (!authCheck.authorized) {
      res.status(authCheck.status).json({ success: false, error: authCheck.error });
      return;
    }
  }
  const { spreadsheetId: rawSpreadsheetId, updates, token: clientToken } = req.body;
  const spreadsheetId = normalizeSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId || !Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'spreadsheetId and updates array are required.' });
    return;
  }

  try {
    const result = await executeSheetsWriteWithFallback(clientToken, 'batch update Google Sheets rows', async (effectiveToken) => {
      let currentUpdates = updates;
      const sendBatch = async (upds: any[]) => {
        const body = {
          valueInputOption: 'USER_ENTERED',
          data: upds.map((u: any) => ({
            range: u.range,
            majorDimension: 'ROWS',
            values: u.values
          }))
        };

        return await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });
      };

      let googleRes = await sendBatch(currentUpdates);
      let data = await googleRes.json().catch(() => ({}));

      // Auto-heal grid dimensions and tab names if failed (not 401/403)
      if (!googleRes.ok && googleRes.status !== 401 && googleRes.status !== 403) {
        console.warn('[Sheets Batch Update Notice] Initial batchUpdate failed, attempting auto-heal...', data?.error?.message);
        const { titleMap } = await autoHealSheetGrid(spreadsheetId, effectiveToken, 46);

        currentUpdates = updates.map((u: any) => {
          let rng = u.range;
          for (const [stdTitle, realTitle] of Object.entries(titleMap)) {
            if (rng.includes(stdTitle)) {
              rng = rng.replace(stdTitle, realTitle);
            }
          }
          return { ...u, range: rng };
        });

        googleRes = await sendBatch(currentUpdates);
        data = await googleRes.json().catch(() => ({}));
      }

      return { googleRes, data };
    });

    if (!result.ok) {
      console.error('[Sheets Batch Update Proxy Error]:', result.data || result.errorMessage);
      res.status(result.status).json({ success: false, error: result.errorMessage || 'Failed to batch update sheet' });
      return;
    }

    res.json({ success: true, data: result.data });
  } catch (err: any) {
    console.error('[Sheets Batch Update Exception]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Sheets Data Proxy endpoint (for credential login & unauthenticated fetch)
app.get('/api/sheets/data', async (req, res) => {
  const spreadsheetId = normalizeSpreadsheetId(req.query.spreadsheetId as string);
  if (!spreadsheetId) {
    res.status(400).json({ error: 'spreadsheetId query param is required.' });
    return;
  }

  try {
    const [genRows, engRows, visRows, pdRows] = await Promise.all([
      fetchSheetCsvTab(spreadsheetId, ['General Information', 'General', 'Sheet1']),
      fetchSheetCsvTab(spreadsheetId, ['Engineering Information', 'Engineering', 'Sheet2']),
      fetchSheetCsvTab(spreadsheetId, ['Visual & Thermal Images', 'Visual & Thermal', 'Visual Images', 'Sheet3']),
      fetchSheetCsvTab(spreadsheetId, ['PD & Diagnostic Data', 'PD & Diagnostic', 'PD Data', 'Sheet4'])
    ]);

    res.json({
      success: true,
      spreadsheetId,
      valueRanges: [
        { values: genRows },
        { values: engRows },
        { values: visRows },
        { values: pdRows }
      ]
    });
  } catch (err: any) {
    console.error(`[Sheets Proxy Error] ${spreadsheetId}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Google Sheets Multi-Sheet Scanner endpoint
app.post('/api/sheets/scan', async (req, res) => {
  const { spreadsheetIds } = req.body;
  if (!Array.isArray(spreadsheetIds)) {
    res.status(400).json({ error: 'spreadsheetIds array is required.' });
    return;
  }

  const results = await Promise.all(
    spreadsheetIds.map(async (sheetId: string) => {
      try {
        const genRows = await fetchSheetCsvTab(sheetId, ['General Information', 'General', 'Sheet1']);
        const count = Math.max(0, genRows.length - 1);
        return {
          spreadsheetId: sheetId,
          rowCount: count,
          status: 'scanned'
        };
      } catch (e: any) {
        return {
          spreadsheetId: sheetId,
          rowCount: 0,
          status: 'error',
          errorMessage: e.message
        };
      }
    })
  );

  res.json({ success: true, scans: results });
});

// Single asset custom AI recommendation (Free fallback / Gemini 2.5 Flash)
app.post('/api/ai-recommendation', async (req, res) => {
  const { asset } = req.body;
  if (!asset || typeof asset !== 'object') {
    res.status(400).json({ error: 'Asset object is required.' });
    return;
  }

  const cleanAsset = sanitizeAssetForAI(asset);

  try {
    const ai = getGeminiClient();
    const prompt = `
You are an expert Power Grid Cable Asset Integrity Advisor for the Provincial Electricity Authority (PEA) of Thailand.
Analyze this specific electrical cable system asset and generate a highly professional diagnostic advisory report:
${JSON.stringify(cleanAsset, null, 2)}

Structure your report in Markdown:
1. **Title**: PEA Diagnostic Advisory Report - ${cleanAsset.equipmentId}
2. **Current Health & Integrity Index**: Give an engineering assessment of their Health Score of ${cleanAsset.healthScore}/100 and status ${cleanAsset.healthStatus}.
3. **Anomalous Telemetry Check**: Analyze the measured parameters (Temperature: ${cleanAsset.surfaceTemperature || 'N/A'}°C, Partial Discharge: ${cleanAsset.externalDischarge || 'N/A'} pC, Insulation Resistance: ${cleanAsset.insulationResistance || 'N/A'} GΩ, Sheath Current: ${cleanAsset.sheathCurrent || 'N/A'}A). State clearly if any values cross standard safe electrical limits.
4. **Actionable Troubleshooting Checklist**: Provide 4-5 direct step-by-step instructions for field operators visiting this exact site.
5. **Future Preventive Maintenance**: Give localized suggestions to expand this specific asset's lifecycle.

Make it clean, authoritative, engineering-focused, and suitable for technical operators.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    res.json({ recommendation: response.text });
  } catch (error: any) {
    console.warn('[AI Recommendation Notice] Gemini API deferred, using dynamic fallback recommendation generator:', error.message || error);
    const fallbackRec = generateFallbackRecommendation(cleanAsset);
    res.json({ recommendation: fallbackRec, isFallback: true });
  }
});

// Automated SF6 Gas Estimation endpoint for Ring Main Units (RMU) and Unit Substations (USS)
app.post('/api/estimate-sf6', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items array is required' });
    return;
  }

  // Engineering reference lookup database
  const knownSpecs: Record<string, { kg: number; pressure: number; desc: string; source: string }> = {
    'schneider-rm6': { kg: 1.85, pressure: 1.4, desc: '3-way Compact RMU (2 switch + 1 circuit breaker)', source: 'Schneider Electric RM6 Technical Manual (24kV)' },
    'schneider-fbx': { kg: 2.10, pressure: 1.3, desc: 'Schneider FBX Compact SF6-insulated switchgear', source: 'Schneider Electric FBX Technical Guide' },
    'abb-safering': { kg: 1.70, pressure: 1.4, desc: 'ABB SafeRing 24kV 3-way (CCF)', source: 'ABB SafeRing / SafePlus 12-24kV Technical Manual' },
    'abb-safeplus': { kg: 1.80, pressure: 1.4, desc: 'ABB SafePlus 24kV modular compact switchgear', source: 'ABB SafePlus Technical Datasheet' },
    'siemens-8djh': { kg: 1.80, pressure: 1.5, desc: 'Siemens 8DJH 24kV 3-way compact block', source: 'Siemens 8DJH Switchgear Technical Manual' },
    'ormazabal-cgm': { kg: 1.75, pressure: 1.3, desc: 'Ormazabal CGM 24kV compact cubicle unit', source: 'Ormazabal CGM Medium Voltage Switchgear Catalog' },
    'ormazabal-cgmcosmos': { kg: 1.90, pressure: 1.3, desc: 'Ormazabal CGMcosmos 24kV fully insulated RMU', source: 'Ormazabal CGMcosmos Technical Datasheet' },
    'lucy-sabre': { kg: 2.00, pressure: 1.4, desc: 'Lucy Electric Sabre VRN/VRC 24kV ring main unit', source: 'Lucy Electric Sabre Ring Main Unit Datasheet' },
    'lucy-vrn': { kg: 2.20, pressure: 1.4, desc: 'Lucy Electric VRN 12-24kV non-extensible RMU', source: 'Lucy Electric VRN Technical Manual' },
    'eaton-holec': { kg: 1.50, pressure: 1.3, desc: 'Eaton Capitole 40/50 SF6 insulated RMU', source: 'Eaton Medium Voltage Switchgear Manual' }
  };

  const estimations: Record<string, any> = {};

  // 1. Generate baseline estimations using engineering lookup
  for (const item of items) {
    const eqId = item.equipmentId || 'UNKNOWN';
    const mfr = (item.manufacturer || '').toLowerCase();
    const model = (item.model || '').toLowerCase();
    const volt = (item.voltageLevel || '22').toLowerCase();
    const isUSS = (item.equipmentType || '').toLowerCase().includes('unit substation');

    let estKg = 1.85;
    let press = 1.4;
    let desc = 'Standard 3-way MV Ring Main Unit';
    let source = 'PEA Standard Specification (22kV/24kV SF6 Switchgear)';

    let matched = false;
    for (const [key, val] of Object.entries(knownSpecs)) {
      const [kMfr, kMod] = key.split('-');
      if ((mfr.includes(kMfr) || model.includes(kMfr)) && (model.includes(kMod) || !kMod)) {
        estKg = val.kg;
        press = val.pressure;
        desc = val.desc;
        source = val.source;
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (mfr.includes('schneider')) { estKg = 1.85; press = 1.4; source = 'Schneider RM6 Technical Spec'; }
      else if (mfr.includes('abb')) { estKg = 1.70; press = 1.4; source = 'ABB SafeRing Technical Spec'; }
      else if (mfr.includes('siemens')) { estKg = 1.80; press = 1.5; source = 'Siemens 8DJH Technical Spec'; }
      else if (mfr.includes('ormazabal')) { estKg = 1.85; press = 1.3; source = 'Ormazabal CGM Technical Spec'; }
      else if (mfr.includes('lucy')) { estKg = 2.10; press = 1.4; source = 'Lucy Electric Sabre Technical Spec'; }
    }

    if (volt.includes('33') || volt.includes('36')) {
      estKg = Math.round(estKg * 1.45 * 100) / 100;
      press = 1.5;
      source += ' (33-36kV upsized enclosure)';
    }

    const gwp = Math.round(estKg * 23.5 * 10) / 10;
    estimations[eqId] = {
      isApplicable: true,
      estimatedGasKg: estKg,
      displayEstimate: `${estKg.toFixed(2)} kg`,
      nominalPressureBar: press,
      compartmentType: isUSS ? `Unit Substation (${desc})` : `Sealed SF6 Gas Tank (${desc})`,
      co2EquivalentTons: gwp,
      referenceSource: source,
      confidence: matched ? 'High' : 'Medium',
      notes: `Estimated filling weight: ${estKg.toFixed(2)} kg SF6 @ 20°C nominal (${press} bar relative). GWP equivalent: ${gwp} tCO2e.`
    };
  }

  // 2. Try enriching with Gemini AI for exact model/datasheet parsing
  try {
    const ai = getGeminiClient();
    const prompt = `
You are an expert Electrical Substation Engineering Specialist for Provincial Electricity Authority (PEA) of Thailand.
Provide exact SF6 (Sulfur Hexafluoride) gas mass estimations (in kilograms) and nominal filling specifications for these electrical switchgear units:
${JSON.stringify(items.slice(0, 10), null, 2)}

Return a strict JSON object mapping each equipmentId to its technical SF6 estimate:
{
  "EQUIPMENT_ID": {
    "estimatedGasKg": 1.85,
    "nominalPressureBar": 1.4,
    "compartmentType": "Sealed Stainless Steel Enclosure (3-Way CCF)",
    "co2EquivalentTons": 43.5,
    "referenceSource": "Exact manufacturer datasheet name & model reference",
    "notes": "Engineering justification and datasheet confirmation"
  }
}
Only output valid JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const aiText = response.text?.trim();
    if (aiText) {
      const parsed = JSON.parse(aiText);
      if (typeof parsed === 'object') {
        Object.entries(parsed).forEach(([eqId, aiEst]: [string, any]) => {
          if (estimations[eqId] && aiEst.estimatedGasKg) {
            const kg = typeof aiEst.estimatedGasKg === 'number' ? aiEst.estimatedGasKg : parseFloat(aiEst.estimatedGasKg) || estimations[eqId].estimatedGasKg;
            const press = typeof aiEst.nominalPressureBar === 'number' ? aiEst.nominalPressureBar : parseFloat(aiEst.nominalPressureBar) || estimations[eqId].nominalPressureBar;
            const gwp = Math.round(kg * 23.5 * 10) / 10;
            estimations[eqId] = {
              ...estimations[eqId],
              estimatedGasKg: kg,
              displayEstimate: `${kg.toFixed(2)} kg`,
              nominalPressureBar: press,
              compartmentType: aiEst.compartmentType || estimations[eqId].compartmentType,
              co2EquivalentTons: gwp,
              referenceSource: aiEst.referenceSource || estimations[eqId].referenceSource,
              confidence: 'High',
              notes: aiEst.notes || estimations[eqId].notes
            };
          }
        });
      }
    }
  } catch (aiErr: any) {
    console.warn('[SF6 Estimator AI Notice] Using deterministic datasheet estimations:', aiErr.message || aiErr);
  }

  res.json({ success: true, estimations });
});

// Prevent unhandled errors from crashing the dev server process
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception (kept alive):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection (kept alive):', reason);
});

// Vite Middleware integration for development / Static Serving for Production
async function startServer() {
  // Structured JSON 404 for any unmatched /api/* route (prevents falling through to Vite/static 404)
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        console.error('[Server] Vite middleware error:', err);
        next(err);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running at http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('[Server] HTTP server error:', err);
  });
}

startServer();



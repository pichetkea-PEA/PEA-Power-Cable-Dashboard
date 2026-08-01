import { db, auth } from './firebaseAuth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function getSectorSpreadsheet(interestArea: string): Promise<{ spreadsheetId: string, folderId: string } | null> {
  if (!interestArea) return null;
  const path = `sector_spreadsheets/${interestArea}`;
  try {
    const docRef = doc(db, 'sector_spreadsheets', interestArea);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        spreadsheetId: data.spreadsheetId,
        folderId: data.folderId
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null; // unreachable due to handleFirestoreError throw
  }
}

// In-memory cache variables for Firestore query deduplication and quota conservation
let inMemoryAssetsCache: any[] | null = null;
let inMemoryAssetsCacheTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

let inMemorySectorsCache: { [area: string]: { spreadsheetId: string, folderId: string } } | null = null;
let inMemorySectorsCacheTime = 0;

let inMemoryAdminConfigCache: CentralAdminConfig | null = null;
let inMemoryAdminConfigCacheTime = 0;

export async function getAllSectorSpreadsheets(forceRefresh: boolean = false): Promise<{ [area: string]: { spreadsheetId: string, folderId: string } }> {
  const now = Date.now();
  if (!forceRefresh && inMemorySectorsCache && (now - inMemorySectorsCacheTime < CACHE_TTL_MS)) {
    return inMemorySectorsCache;
  }

  const result: { [area: string]: { spreadsheetId: string, folderId: string } } = {};
  try {
    const colRef = collection(db, 'sector_spreadsheets');
    const snap = await getDocs(colRef);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.spreadsheetId) {
        result[docSnap.id] = {
          spreadsheetId: data.spreadsheetId,
          folderId: data.folderId || ''
        };
      }
    });
    inMemorySectorsCache = result;
    inMemorySectorsCacheTime = now;
    return result;
  } catch (error) {
    console.warn('Failed to fetch all sector spreadsheets from Firestore:', error);
    return inMemorySectorsCache || result;
  }
}

export async function saveSectorSpreadsheet(interestArea: string, spreadsheetId: string, folderId: string): Promise<void> {
  if (!interestArea || !spreadsheetId) return;
  if ((window as any).firestoreQuotaExceeded) {
    console.warn('Skipping Firestore save Sector Spreadsheet due to active quota exhaustion');
    return;
  }
  const path = `sector_spreadsheets/${interestArea}`;
  try {
    const docRef = doc(db, 'sector_spreadsheets', interestArea);
    await setDoc(docRef, { spreadsheetId, folderId });
    if (inMemorySectorsCache) {
      inMemorySectorsCache[interestArea] = { spreadsheetId, folderId };
    }
  } catch (error: any) {
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted' || error?.message?.includes('resource-exhausted')) {
      (window as any).firestoreQuotaExceeded = true;
    }
    console.warn('Sector Spreadsheet write failed:', error);
  }
}

export interface CentralAdminConfig {
  spreadsheetIds: string[];
  spreadsheetsByArea: { [area: string]: string };
  foldersByArea: { [area: string]: string };
  updatedAt: string;
}

export async function saveCentralAdminDatabaseConfig(config: CentralAdminConfig): Promise<void> {
  inMemoryAdminConfigCache = config;
  inMemoryAdminConfigCacheTime = Date.now();

  if ((window as any).firestoreQuotaExceeded) {
    console.warn('Skipping Firestore save Central Admin Config due to active quota exhaustion');
    return;
  }

  const path = 'admin_central_db/config';
  try {
    const docRef = doc(db, 'admin_central_db', 'config');
    await setDoc(docRef, config);

    // Also save individual sector documents
    if (config.spreadsheetsByArea) {
      for (const [area, sId] of Object.entries(config.spreadsheetsByArea)) {
        if (sId && !(window as any).firestoreQuotaExceeded) {
          const docRefArea = doc(db, 'sector_spreadsheets', area);
          await setDoc(docRefArea, { spreadsheetId: sId, folderId: config.foldersByArea?.[area] || '' });
        }
      }
    }
  } catch (error: any) {
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted' || error?.message?.includes('resource-exhausted')) {
      (window as any).firestoreQuotaExceeded = true;
    }
    console.warn('Failed to save central admin DB config to Firestore:', error);
  }
}

export async function getCentralAdminDatabaseConfig(forceRefresh: boolean = false): Promise<CentralAdminConfig | null> {
  const now = Date.now();
  if (!forceRefresh && inMemoryAdminConfigCache && (now - inMemoryAdminConfigCacheTime < CACHE_TTL_MS)) {
    return inMemoryAdminConfigCache;
  }

  if ((window as any).firestoreQuotaExceeded && inMemoryAdminConfigCache) {
    return inMemoryAdminConfigCache;
  }

  try {
    const docRef = doc(db, 'admin_central_db', 'config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as CentralAdminConfig;
      inMemoryAdminConfigCache = data;
      inMemoryAdminConfigCacheTime = now;
      return data;
    }
  } catch (error: any) {
    console.warn('Failed to fetch central admin DB config from Firestore:', error);
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted' || error?.message?.includes('resource-exhausted')) {
      (window as any).firestoreQuotaExceeded = true;
    }
  }
  return inMemoryAdminConfigCache;
}

export async function saveCentralAssetsCache(assets: any[]): Promise<void> {
  if (!assets || assets.length === 0) return;

  // 1. Immediately update in-memory and local storage cache so UI responds with 0 delay
  inMemoryAssetsCache = assets;
  inMemoryAssetsCacheTime = Date.now();
  try {
    localStorage.setItem('pea_central_assets_backup', JSON.stringify(assets));
    localStorage.setItem('pea_central_assets_timestamp', String(Date.now()));
  } catch (e) {}

  if ((window as any).firestoreQuotaExceeded) {
    console.warn('Skipping Firestore save central assets cache due to active quota exhaustion');
    return;
  }

  try {
    const CHUNK_SIZE = 800; // ~200KB per chunk, well within Firestore 1MB per document limit
    const totalChunks = Math.ceil(assets.length / CHUNK_SIZE);
    
    // Save metadata first
    const metaRef = doc(db, 'admin_central_db', 'assets_cache_meta');
    await setDoc(metaRef, {
      totalAssets: assets.length,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      updatedAt: new Date().toISOString()
    });

    // Save chunks sequentially to avoid overflowing Firestore write stream buffer queue
    for (let i = 0; i < totalChunks; i++) {
      if ((window as any).firestoreQuotaExceeded) break;
      const chunkData = assets.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkRef = doc(db, 'admin_central_db', `assets_cache_chunk_${i}`);
      await setDoc(chunkRef, { chunkIndex: i, assets: chunkData });
    }
    console.log(`Firestore: Successfully saved ${assets.length} central assets across ${totalChunks} chunks!`);
  } catch (error: any) {
    console.warn('Failed to save chunked central assets cache to Firestore:', error);
    if (
      error?.message?.includes('Quota limit exceeded') || 
      error?.message?.includes('resource-exhausted') || 
      error?.message?.includes('Write stream exhausted') || 
      error?.code === 'resource-exhausted'
    ) {
      (window as any).firestoreQuotaExceeded = true;
    }
  }
}

export async function getCentralAssetsCache(forceRefresh: boolean = false): Promise<any[]> {
  const now = Date.now();

  // 1. Quick in-memory cache return (0 network calls)
  if (!forceRefresh && inMemoryAssetsCache && inMemoryAssetsCache.length > 0 && (now - inMemoryAssetsCacheTime < CACHE_TTL_MS)) {
    console.log(`Cache Hit (In-Memory): Loaded ${inMemoryAssetsCache.length} assets with 0 Firestore reads.`);
    return inMemoryAssetsCache;
  }

  // 2. LocalStorage fast return if within 10-minute TTL (0 network calls)
  if (!forceRefresh) {
    try {
      const localTimeStr = localStorage.getItem('pea_central_assets_timestamp');
      const backup = localStorage.getItem('pea_central_assets_backup');
      if (localTimeStr && backup) {
        const localTime = parseInt(localTimeStr, 10);
        if (!isNaN(localTime) && (now - localTime < CACHE_TTL_MS)) {
          const parsed = JSON.parse(backup);
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log(`Cache Hit (LocalStorage): Loaded ${parsed.length} assets with 0 Firestore reads.`);
            inMemoryAssetsCache = parsed;
            inMemoryAssetsCacheTime = localTime;
            return parsed;
          }
        }
      }
    } catch (e) {}
  }

  // If quota is already flagged as exceeded, skip network calls and use local backup
  if ((window as any).firestoreQuotaExceeded) {
    try {
      const backup = localStorage.getItem('pea_central_assets_backup');
      if (backup) {
        const parsed = JSON.parse(backup);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryAssetsCache = parsed;
          inMemoryAssetsCacheTime = now;
          return parsed;
        }
      }
    } catch (e) {}
    return inMemoryAssetsCache || [];
  }

  // 3. Fetch from Firestore if cache expired or forceRefresh requested
  try {
    const metaRef = doc(db, 'admin_central_db', 'assets_cache_meta');
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      const meta = metaSnap.data();
      const totalChunks = meta.totalChunks || 0;
      if (totalChunks > 0) {
        const fetchPromises = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunkRef = doc(db, 'admin_central_db', `assets_cache_chunk_${i}`);
          fetchPromises.push(getDoc(chunkRef));
        }
        const chunkSnaps = await Promise.all(fetchPromises);
        let allAssets: any[] = [];
        for (const snap of chunkSnaps) {
          if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.assets)) {
              allAssets.push(...data.assets);
            }
          }
        }
        if (allAssets.length > 0) {
          console.log(`Firestore: Loaded ${allAssets.length} central assets from ${totalChunks} chunks.`);
          inMemoryAssetsCache = allAssets;
          inMemoryAssetsCacheTime = now;
          try {
            localStorage.setItem('pea_central_assets_backup', JSON.stringify(allAssets));
            localStorage.setItem('pea_central_assets_timestamp', String(now));
          } catch (e) {}
          return allAssets;
        }
      }
    }

    // Legacy fallback: single document
    const docRef = doc(db, 'admin_central_db', 'assets_cache');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.assets) && data.assets.length > 0) {
        inMemoryAssetsCache = data.assets;
        inMemoryAssetsCacheTime = now;
        return data.assets;
      }
    }
  } catch (error: any) {
    console.warn('Failed to fetch central assets cache from Firestore:', error);
    if (
      error?.message?.includes('Quota limit exceeded') || 
      error?.message?.includes('resource-exhausted') || 
      error?.message?.includes('Write stream exhausted') || 
      error?.code === 'resource-exhausted'
    ) {
      (window as any).firestoreQuotaExceeded = true;
    }
  }

  // 4. LocalStorage fallback if Firestore is unreachable or quota exhausted
  try {
    const backup = localStorage.getItem('pea_central_assets_backup');
    if (backup) {
      const parsed = JSON.parse(backup);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`LocalStorage Fallback: Loaded ${parsed.length} central assets from local backup.`);
        inMemoryAssetsCache = parsed;
        inMemoryAssetsCacheTime = now;
        return parsed;
      }
    }
  } catch (e) {}

  return inMemoryAssetsCache || [];
}

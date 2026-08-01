import { db, auth } from './firebaseAuth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { setLocalIndexedDBItem, getLocalIndexedDBItem, generateAssetsHash } from './localCache';

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

// In-memory cache variables for Firestore query deduplication
let inMemoryAssetsCache: any[] | null = null;
let inMemorySectorsCache: { [area: string]: { spreadsheetId: string, folderId: string } } | null = null;
let inMemoryAdminConfigCache: CentralAdminConfig | null = null;

export async function getSectorSpreadsheet(interestArea: string): Promise<{ spreadsheetId: string, folderId: string } | null> {
  if (!interestArea) return null;
  // 1. Check local cache first
  const allSectors = await getAllSectorSpreadsheets();
  if (allSectors && allSectors[interestArea]) {
    return allSectors[interestArea];
  }

  const path = `sector_spreadsheets/${interestArea}`;
  try {
    const docRef = doc(db, 'sector_spreadsheets', interestArea);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const res = {
        spreadsheetId: data.spreadsheetId,
        folderId: data.folderId || ''
      };
      if (inMemorySectorsCache) inMemorySectorsCache[interestArea] = res;
      return res;
    }
    return null;
  } catch (error) {
    console.warn(`Firestore getSectorSpreadsheet error for ${interestArea}:`, error);
    return null;
  }
}

export async function getAllSectorSpreadsheets(forceRefresh: boolean = false): Promise<{ [area: string]: { spreadsheetId: string, folderId: string } }> {
  // 1. Memory check
  if (!forceRefresh && inMemorySectorsCache && Object.keys(inMemorySectorsCache).length > 0) {
    return inMemorySectorsCache;
  }

  // 2. IndexedDB check
  if (!forceRefresh) {
    const localSectors = await getLocalIndexedDBItem<{ [area: string]: { spreadsheetId: string, folderId: string } }>('pea_sector_spreadsheets');
    if (localSectors && Object.keys(localSectors).length > 0) {
      inMemorySectorsCache = localSectors;
      return localSectors;
    }
  }

  if ((window as any).firestoreQuotaExceeded && inMemorySectorsCache) {
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
    if (Object.keys(result).length > 0) {
      inMemorySectorsCache = result;
      await setLocalIndexedDBItem('pea_sector_spreadsheets', result);
    }
    return result;
  } catch (error: any) {
    console.warn('Failed to fetch all sector spreadsheets from Firestore:', error);
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted') {
      (window as any).firestoreQuotaExceeded = true;
    }
    return inMemorySectorsCache || result;
  }
}

export async function saveSectorSpreadsheet(interestArea: string, spreadsheetId: string, folderId: string): Promise<void> {
  if (!interestArea || !spreadsheetId) return;

  // Update memory & local IndexedDB cache immediately
  const currentSectors = (await getAllSectorSpreadsheets()) || {};
  currentSectors[interestArea] = { spreadsheetId, folderId };
  inMemorySectorsCache = currentSectors;
  await setLocalIndexedDBItem('pea_sector_spreadsheets', currentSectors);

  if ((window as any).firestoreQuotaExceeded) {
    console.warn('Skipping Firestore save Sector Spreadsheet due to active quota exhaustion');
    return;
  }

  try {
    const docRef = doc(db, 'sector_spreadsheets', interestArea);
    await setDoc(docRef, { spreadsheetId, folderId });
  } catch (error: any) {
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted') {
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
  // Always store locally first
  inMemoryAdminConfigCache = config;
  await setLocalIndexedDBItem('pea_central_config', config);

  if ((window as any).firestoreQuotaExceeded) {
    console.warn('Skipping Firestore save Central Admin Config due to active quota exhaustion');
    return;
  }

  try {
    const docRef = doc(db, 'admin_central_db', 'config');
    await setDoc(docRef, config);

    // Also update local sector map
    if (config.spreadsheetsByArea) {
      const currentSectors = (await getAllSectorSpreadsheets()) || {};
      for (const [area, sId] of Object.entries(config.spreadsheetsByArea)) {
        if (sId) {
          currentSectors[area] = { spreadsheetId: sId, folderId: config.foldersByArea?.[area] || '' };
        }
      }
      inMemorySectorsCache = currentSectors;
      await setLocalIndexedDBItem('pea_sector_spreadsheets', currentSectors);
    }
  } catch (error: any) {
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted') {
      (window as any).firestoreQuotaExceeded = true;
    }
    console.warn('Failed to save central admin DB config to Firestore:', error);
  }
}

export async function getCentralAdminDatabaseConfig(forceRefresh: boolean = false): Promise<CentralAdminConfig | null> {
  // 1. Memory check
  if (!forceRefresh && inMemoryAdminConfigCache) {
    return inMemoryAdminConfigCache;
  }

  // 2. IndexedDB check
  if (!forceRefresh) {
    const localConfig = await getLocalIndexedDBItem<CentralAdminConfig>('pea_central_config');
    if (localConfig) {
      inMemoryAdminConfigCache = localConfig;
      return localConfig;
    }
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
      await setLocalIndexedDBItem('pea_central_config', data);
      return data;
    }
  } catch (error: any) {
    console.warn('Failed to fetch central admin DB config from Firestore:', error);
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted') {
      (window as any).firestoreQuotaExceeded = true;
    }
  }
  return inMemoryAdminConfigCache;
}

export async function saveCentralAssetsCache(assets: any[], syncToFirestore: boolean = false): Promise<void> {
  if (!assets || assets.length === 0) return;

  // 1. Always update in-memory and local IndexedDB cache instantly (0 latency, 0 quota)
  inMemoryAssetsCache = assets;
  await setLocalIndexedDBItem('pea_central_assets', assets);
  
  const newHash = generateAssetsHash(assets);
  const prevHash = await getLocalIndexedDBItem<string>('pea_assets_hash');
  
  // If hash hasn't changed and syncToFirestore isn't explicitly forced, skip Firestore write entirely!
  if (newHash === prevHash && !syncToFirestore) {
    return;
  }
  
  await setLocalIndexedDBItem('pea_assets_hash', newHash);

  // If syncToFirestore is false or quota is already flagged, skip Firestore writes to save daily quota
  if (!syncToFirestore || (window as any).firestoreQuotaExceeded) {
    return;
  }

  try {
    const CHUNK_SIZE = 800; // ~200KB per chunk
    const totalChunks = Math.ceil(assets.length / CHUNK_SIZE);
    
    // Save metadata
    const metaRef = doc(db, 'admin_central_db', 'assets_cache_meta');
    await setDoc(metaRef, {
      totalAssets: assets.length,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      hash: newHash,
      updatedAt: new Date().toISOString()
    });

    // Save chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      if ((window as any).firestoreQuotaExceeded) break;
      const chunkData = assets.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkRef = doc(db, 'admin_central_db', `assets_cache_chunk_${i}`);
      await setDoc(chunkRef, { chunkIndex: i, assets: chunkData });
    }
    console.log(`Firestore: Saved ${assets.length} assets across ${totalChunks} chunks.`);
  } catch (error: any) {
    console.warn('Failed to save central assets cache to Firestore:', error);
    if (
      error?.message?.includes('Quota limit exceeded') || 
      error?.message?.includes('resource-exhausted') || 
      error?.code === 'resource-exhausted'
    ) {
      (window as any).firestoreQuotaExceeded = true;
    }
  }
}

export async function getCentralAssetsCache(forceRefresh: boolean = false): Promise<any[]> {
  // 1. Quick in-memory cache return (0 network calls)
  if (!forceRefresh && inMemoryAssetsCache && inMemoryAssetsCache.length > 0) {
    return inMemoryAssetsCache;
  }

  // 2. IndexedDB local return (0 network calls, zero quota usage)
  if (!forceRefresh) {
    const localAssets = await getLocalIndexedDBItem<any[]>('pea_central_assets');
    if (Array.isArray(localAssets) && localAssets.length > 0) {
      console.log(`Cache Hit (IndexedDB Client Storage): Loaded ${localAssets.length} assets with 0 Firestore reads.`);
      inMemoryAssetsCache = localAssets;
      return localAssets;
    }
  }

  // If quota is already flagged as exceeded, skip network calls and use local backup
  if ((window as any).firestoreQuotaExceeded) {
    const localAssets = await getLocalIndexedDBItem<any[]>('pea_central_assets');
    if (Array.isArray(localAssets) && localAssets.length > 0) {
      inMemoryAssetsCache = localAssets;
      return localAssets;
    }
    return inMemoryAssetsCache || [];
  }

  // 3. Fetch from Firestore only if forceRefresh requested or local cache is empty
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
          await setLocalIndexedDBItem('pea_central_assets', allAssets);
          if (meta.hash) await setLocalIndexedDBItem('pea_assets_hash', meta.hash);
          return allAssets;
        }
      }
    }
  } catch (error: any) {
    console.warn('Failed to fetch central assets cache from Firestore:', error);
    if (
      error?.message?.includes('Quota limit exceeded') || 
      error?.message?.includes('resource-exhausted') || 
      error?.code === 'resource-exhausted'
    ) {
      (window as any).firestoreQuotaExceeded = true;
    }
  }

  // 4. Fallback to local storage if Firestore failed
  const localAssets = await getLocalIndexedDBItem<any[]>('pea_central_assets');
  if (Array.isArray(localAssets) && localAssets.length > 0) {
    inMemoryAssetsCache = localAssets;
    return localAssets;
  }

  return inMemoryAssetsCache || [];
}


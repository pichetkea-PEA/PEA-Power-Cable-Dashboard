import { CableAsset } from '../types';

const DB_NAME = 'PEA_CABLE_CACHE_DB';
const DB_VERSION = 1;
const STORE_NAME = 'pea_asset_store';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function setLocalIndexedDBItem<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        // Fallback to localStorage for small items if IndexedDB put fails
        try {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            localStorage.setItem(`pea_idb_fb_${key}`, String(value));
          } else {
            localStorage.setItem(`pea_idb_fb_${key}`, JSON.stringify(value));
          }
        } catch (e) {}
        resolve(false);
      };
    });
  } catch (err) {
    try {
      localStorage.setItem(`pea_idb_fb_${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) {}
    return false;
  }
}

export async function getLocalIndexedDBItem<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result !== undefined && req.result !== null) {
          resolve(req.result as T);
        } else {
          // Check fallback localStorage
          const fb = localStorage.getItem(`pea_idb_fb_${key}`);
          if (fb) {
            try {
              resolve(JSON.parse(fb));
            } catch (e) {
              resolve(fb as unknown as T);
            }
          } else {
            resolve(null);
          }
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    const fb = localStorage.getItem(`pea_idb_fb_${key}`);
    if (fb) {
      try {
        return JSON.parse(fb);
      } catch (e) {
        return fb as unknown as T;
      }
    }
    return null;
  }
}

export async function clearLocalIndexedDBCache(): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => {
        localStorage.removeItem('pea_central_assets_backup');
        localStorage.removeItem('pea_central_config_backup');
        localStorage.removeItem('pea_sector_spreadsheets_backup');
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}

// Generate simple numerical hash or fingerprint of assets array to check if changed
export function generateAssetsHash(assets: CableAsset[]): string {
  if (!assets || assets.length === 0) return '0_empty';
  let totalLen = assets.length;
  let sampleIds = '';
  // Inspect head, middle, tail items for fast fingerprinting
  if (assets[0]?.equipmentId) sampleIds += assets[0].equipmentId;
  if (assets[Math.floor(totalLen / 2)]?.equipmentId) sampleIds += assets[Math.floor(totalLen / 2)].equipmentId;
  if (assets[totalLen - 1]?.equipmentId) sampleIds += assets[totalLen - 1].equipmentId;
  return `${totalLen}_${sampleIds}_${assets[0]?.timestamp || ''}`;
}

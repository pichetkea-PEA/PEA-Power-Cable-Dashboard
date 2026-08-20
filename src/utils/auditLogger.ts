import { CableAsset, EquipmentType } from '../types';
import { getBangkokTimestamp } from './dateUtils';
import { getLocalIndexedDBItem, setLocalIndexedDBItem } from './localCache';

export interface AssetActivityLog {
  id: string;
  type: 'registration' | 'edit';
  source?: 'registration_suite' | 'asset_record' | 'batch_import' | 'manual' | string;
  equipmentId: string;
  equipmentType: string;
  voltageLevel: string;
  area: string;
  operatorName: string;
  userEmail?: string;
  timestamp: string; // ISO string or Bangkok timestamp
  details?: string;
  changedFields?: string[];
  gps?: { lat: number; lng: number };
  substationName?: string;
  landmark?: string;
  city?: string;
}

const STORAGE_KEY = 'pea_asset_activity_logs_v1';

/**
 * Save an explicit asset activity log entry (e.g. when an asset is registered or edited)
 */
export async function logAssetActivity(activity: Omit<AssetActivityLog, 'id'>): Promise<AssetActivityLog> {
  const newLog: AssetActivityLog = {
    ...activity,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: activity.timestamp || getBangkokTimestamp()
  };

  try {
    const existingLogs = (await getLocalIndexedDBItem<AssetActivityLog[]>(STORAGE_KEY)) || [];
    const updated = [newLog, ...existingLogs];
    await setLocalIndexedDBItem(STORAGE_KEY, updated);
  } catch (err) {
    console.warn("Failed to persist asset activity log to local cache:", err);
  }

  return newLog;
}

/**
 * Get all explicit audit logs from storage
 */
export async function getStoredAssetActivityLogs(): Promise<AssetActivityLog[]> {
  try {
    const logs = await getLocalIndexedDBItem<AssetActivityLog[]>(STORAGE_KEY);
    return Array.isArray(logs) ? logs : [];
  } catch (e) {
    return [];
  }
}

/**
 * Helper to derive area code from asset (e.g. NE2-115TLUG-... -> NE2)
 */
export function deriveAssetArea(asset: CableAsset): string {
  if (asset.equipmentId) {
    const parts = asset.equipmentId.split('-');
    if (parts.length > 0) {
      const candidate = parts[0].trim().toUpperCase();
      if (['N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3', 'NE1', 'NE2', 'NE3'].includes(candidate)) {
        return candidate;
      }
    }
  }
  if (asset.city) {
    const uppercaseCity = asset.city.toUpperCase();
    for (const code of ['N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3', 'NE1', 'NE2', 'NE3']) {
      if (uppercaseCity.includes(code)) return code;
    }
  }
  return 'N1'; // Default fallback
}

/**
 * Derive activity logs (both registrations and edits) from the current list of CableAssets,
 * merged with any explicitly stored logs.
 */
export async function deriveAllActivityLogs(assets: CableAsset[]): Promise<{
  registrationLogs: AssetActivityLog[];
  editLogs: AssetActivityLog[];
}> {
  const storedLogs = await getStoredAssetActivityLogs();
  
  const registrationMap = new Map<string, AssetActivityLog>();
  const editLogsList: AssetActivityLog[] = [];

  // 1. Process stored explicit logs first
  for (const log of storedLogs) {
    if (log.type === 'registration') {
      if (!registrationMap.has(log.equipmentId)) {
        registrationMap.set(log.equipmentId, log);
      }
    } else if (log.type === 'edit') {
      editLogsList.push({
        ...log,
        source: log.source || 'asset_record'
      });
    }
  }

  // 2. Synthesize/merge logs from assets dataset
  for (const asset of assets) {
    const eqId = asset.equipmentId || `ASSET-${asset.number}`;
    const area = deriveAssetArea(asset);

    // Detect if this asset has been edited from the Asset Record panel or updated recently
    const hasExplicitEdit = !!(asset.latestUpdatedAt && asset.latestUpdatedBy);
    const isMarkedEdited = !!asset.isEdited || asset.lastEditSource === 'asset_record';
    
    // Check if timestamp in asset is from today while year of registration is older (e.g. 2025 vs today)
    const rawAssetTs = asset.timestamp ? String(asset.timestamp).trim() : '';
    const tsYear = rawAssetTs ? new Date(rawAssetTs).getFullYear() : 0;
    const assetRegYear = asset.yearOfRegistration || 0;
    const isTimestampFromRecentEdit = !!(
      (hasExplicitEdit || isMarkedEdited) ||
      (assetRegYear > 0 && tsYear > 0 && assetRegYear < tsYear) ||
      (assetRegYear > 0 && assetRegYear < 2026 && rawAssetTs.includes('2026-08-20'))
    );

    // Determine initial registration timestamp vs edit timestamp
    let originalRegTimestamp = '';
    if (asset.registrationDate) {
      originalRegTimestamp = asset.registrationDate;
    } else if (isTimestampFromRecentEdit && assetRegYear > 0) {
      originalRegTimestamp = `${assetRegYear}-01-01T00:00:00.000Z`;
    } else if (asset.timestamp) {
      originalRegTimestamp = asset.timestamp;
    } else if (assetRegYear > 0) {
      originalRegTimestamp = `${assetRegYear}-01-01T00:00:00.000Z`;
    } else {
      originalRegTimestamp = '2024-01-01T00:00:00.000Z';
    }

    // Add to registration map if not already present from storedLogs
    if (!registrationMap.has(eqId)) {
      registrationMap.set(eqId, {
        id: `reg_${eqId}`,
        type: 'registration',
        source: 'registration_suite',
        equipmentId: eqId,
        equipmentType: asset.equipmentType || 'Underground Cable',
        voltageLevel: asset.voltageLevel ? `${asset.voltageLevel} kV` : '115 kV',
        area,
        operatorName: asset.operatorName || 'PEA Operator',
        timestamp: originalRegTimestamp,
        details: `Registered ${asset.equipmentType || 'Equipment'} in ${area} (${asset.substationName || 'Substation'})`,
        gps: asset.gps,
        substationName: asset.substationName,
        landmark: asset.landmark,
        city: asset.city
      });
    }

    // Check if asset has edit records (latestUpdatedAt, isEdited, or recent timestamp modification)
    if (hasExplicitEdit || isTimestampFromRecentEdit) {
      const editTimestamp = asset.latestUpdatedAt || asset.timestamp || getBangkokTimestamp();
      const editorName = asset.latestUpdatedBy || asset.operatorName || 'PEA Operator';
      
      // Ensure we don't duplicate if already in storedLogs
      const existsInStored = editLogsList.some(
        l => l.type === 'edit' && l.equipmentId === eqId && (l.timestamp === editTimestamp || l.timestamp.slice(0, 16) === editTimestamp.slice(0, 16))
      );

      if (!existsInStored) {
        editLogsList.push({
          id: `edit_${eqId}_${editTimestamp.replace(/[^a-zA-Z0-9]/g, '')}`,
          type: 'edit',
          source: 'asset_record',
          equipmentId: eqId,
          equipmentType: asset.equipmentType || 'Underground Cable',
          voltageLevel: asset.voltageLevel ? `${asset.voltageLevel} kV` : '115 kV',
          area,
          operatorName: editorName,
          timestamp: editTimestamp,
          details: `Edited asset data in Asset Record panel by ${editorName}`,
          changedFields: ['General Information', 'Engineering Specs', 'Visual/Thermal Images'],
          gps: asset.gps,
          substationName: asset.substationName,
          landmark: asset.landmark,
          city: asset.city
        });
      }
    }

    // Process history if present
    if (Array.isArray(asset.history)) {
      for (let i = 0; i < asset.history.length; i++) {
        const hist = asset.history[i];
        if (hist.timestamp && hist.operatorName) {
          const histLogId = `edit_${eqId}_hist_${i}`;
          const alreadyExists = editLogsList.some(l => l.id === histLogId || (l.equipmentId === eqId && l.timestamp === hist.timestamp));
          if (!alreadyExists) {
            editLogsList.push({
              id: histLogId,
              type: 'edit',
              source: 'asset_record',
              equipmentId: eqId,
              equipmentType: hist.equipmentType || asset.equipmentType || 'Underground Cable',
              voltageLevel: hist.voltageLevel ? `${hist.voltageLevel} kV` : '115 kV',
              area: deriveAssetArea(hist),
              operatorName: hist.operatorName,
              timestamp: hist.timestamp,
              details: `Edited asset telemetry & inspection data in Asset Record panel`,
              gps: hist.gps || asset.gps,
              substationName: hist.substationName || asset.substationName,
              landmark: hist.landmark || asset.landmark,
              city: hist.city || asset.city
            });
          }
        }
      }
    }
  }

  const registrationLogs = Array.from(registrationMap.values()).sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  editLogsList.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return { registrationLogs, editLogs: editLogsList };
}

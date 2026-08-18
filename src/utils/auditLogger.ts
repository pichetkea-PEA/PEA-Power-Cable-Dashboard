import { CableAsset, EquipmentType } from '../types';
import { getBangkokTimestamp } from './dateUtils';
import { getLocalIndexedDBItem, setLocalIndexedDBItem } from './localCache';

export interface AssetActivityLog {
  id: string;
  type: 'registration' | 'edit';
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
      editLogsList.push(log);
    }
  }

  // 2. Synthesize/merge logs from assets dataset
  for (const asset of assets) {
    const eqId = asset.equipmentId || `ASSET-${asset.number}`;
    const area = deriveAssetArea(asset);
    const regTimestamp = asset.timestamp || (asset.yearOfRegistration ? `${asset.yearOfRegistration}-01-01T00:00:00.000Z` : '2024-01-01T00:00:00.000Z');

    if (!registrationMap.has(eqId)) {
      registrationMap.set(eqId, {
        id: `reg_${eqId}`,
        type: 'registration',
        equipmentId: eqId,
        equipmentType: asset.equipmentType || 'Underground Cable',
        voltageLevel: asset.voltageLevel ? `${asset.voltageLevel} kV` : '115 kV',
        area,
        operatorName: asset.operatorName || 'System Admin',
        timestamp: regTimestamp,
        details: `Registered ${asset.equipmentType || 'Equipment'} in ${area} (${asset.substationName || 'Substation'})`,
        gps: asset.gps,
        substationName: asset.substationName,
        landmark: asset.landmark,
        city: asset.city
      });
    }

    // Check if asset has edit records (latestUpdatedAt or history)
    if (asset.latestUpdatedAt && asset.latestUpdatedBy) {
      const editTimestamp = asset.latestUpdatedAt;
      // Ensure we don't duplicate if already in storedLogs
      const existsInStored = storedLogs.some(
        l => l.type === 'edit' && l.equipmentId === eqId && l.timestamp === editTimestamp
      );

      if (!existsInStored) {
        editLogsList.push({
          id: `edit_${eqId}_${editTimestamp.replace(/[^a-zA-Z0-9]/g, '')}`,
          type: 'edit',
          equipmentId: eqId,
          equipmentType: asset.equipmentType || 'Underground Cable',
          voltageLevel: asset.voltageLevel ? `${asset.voltageLevel} kV` : '115 kV',
          area,
          operatorName: asset.latestUpdatedBy || asset.operatorName || 'System Editor',
          timestamp: editTimestamp,
          details: `Modified integrity parameters / diagnostic telemetry for ${eqId}`,
          changedFields: ['PRPD Waveform', 'Offline VLF', 'Health Score', 'Engineering Specs'],
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
              equipmentId: eqId,
              equipmentType: hist.equipmentType || asset.equipmentType || 'Underground Cable',
              voltageLevel: hist.voltageLevel ? `${hist.voltageLevel} kV` : '115 kV',
              area: deriveAssetArea(hist),
              operatorName: hist.operatorName,
              timestamp: hist.timestamp,
              details: `Historic inspection & telemetry update`,
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

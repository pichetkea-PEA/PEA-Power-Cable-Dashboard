/**
 * Utility functions for handling timestamps in Asia/Bangkok (UTC+7) timezone.
 * All timestamps saved to Google Sheets and local stores will be formatted
 * as "YYYY-MM-DD HH:mm:ss" in Bangkok, Hanoi, Jakarta (UTC+7) time.
 */

export function getBangkokTimestamp(dateInput?: Date | string | number): string {
  if (dateInput === null || dateInput === undefined || dateInput === '') {
    dateInput = new Date();
  }

  let d: Date;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) {
      d = new Date();
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      // Already formatted as "YYYY-MM-DD HH:mm:ss"
      return trimmed;
    } else if (trimmed.includes('T') || trimmed.endsWith('Z') || trimmed.includes('+')) {
      // Parse ISO or UTC formatted string
      d = new Date(trimmed);
    } else {
      // Parse standard date string
      d = new Date(trimmed.replace(/-/g, '/'));
    }
  } else if (typeof dateInput === 'number') {
    d = new Date(dateInput);
  } else {
    d = dateInput;
  }

  if (isNaN(d.getTime())) {
    // Return original string if valid fallback or current Bangkok time
    return typeof dateInput === 'string' && dateInput.length > 0 ? dateInput : getBangkokTimestamp(new Date());
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  let hour = getPart('hour');
  if (hour === '24') hour = '00';
  const minute = getPart('minute');
  const second = getPart('second');

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Normalizes an arbitrary timestamp string or ISO date into Bangkok UTC+7 format.
 */
export function normalizeToBangkokTime(timestampStr?: string): string {
  if (!timestampStr) return getBangkokTimestamp();
  return getBangkokTimestamp(timestampStr);
}

/**
 * Parses an arbitrary timestamp string into epoch milliseconds for reliable chronological sorting.
 * Handles "YYYY-MM-DD HH:mm:ss" (Bangkok UTC+7), "DD/MM/YYYY HH:mm:ss", and ISO timestamps.
 */
export function parseTimestampMs(ts?: string): number {
  if (!ts || typeof ts !== 'string') return 0;
  const trimmed = ts.trim();
  if (!trimmed) return 0;

  // Match "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm" or "YYYY-MM-DD"
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ymdMatch) {
    const [, y, m, d, hh = '00', mm = '00', ss = '00'] = ymdMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}+07:00`;
    const parsed = Date.parse(iso);
    if (!isNaN(parsed)) return parsed;
  }

  // Match "DD/MM/YYYY HH:mm:ss" or "DD-MM-YYYY HH:mm:ss"
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmyMatch) {
    const [, d, m, y, hh = '00', mm = '00', ss = '00'] = dmyMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss.padStart(2, '0')}+07:00`;
    const parsed = Date.parse(iso);
    if (!isNaN(parsed)) return parsed;
  }

  const direct = Date.parse(trimmed);
  if (!isNaN(direct)) return direct;

  const normalized = Date.parse(trimmed.replace(/-/g, '/'));
  return isNaN(normalized) ? 0 : normalized;
}

/**
 * Formats an individual submission subfolder name under the asset's Equipment ID folder (Option A):
 * {Equipment ID}_{YYYY-MM-DD}_{HH-mm-ss} (e.g., N1-115-2023-SUB-UG-HY-001_2026-11-20_14-30-05)
 */
export function formatSubmissionFolderName(equipmentId: string, timestamp?: string): string {
  const cleanEqId = (equipmentId || 'ASSET').trim().replace(/[<>:"/\\|?*]/g, '_');
  const bangkokTs = getBangkokTimestamp(timestamp);
  const folderTs = bangkokTs.replace(' ', '_').replace(/:/g, '-');
  return `${cleanEqId}_${folderTs}`;
}

/**
 * Deduplicates multi-submission asset records by equipmentId, always selecting the latest record
 * (by newest timestamp, tie-broken by highest sequential running number) while preserving chronological history.
 */
export function getLatestAssetsByEquipmentId<
  T extends {
    equipmentId?: string;
    peaNumber?: string;
    timestamp?: string;
    latestUpdatedAt?: string;
    number?: number;
    history?: T[];
  }
>(assets: T[], fallbackToPea = false): T[] {
  if (!Array.isArray(assets) || assets.length === 0) return [];

  const getRecencyMs = (asset: T): number => {
    return Math.max(
      parseTimestampMs(asset.timestamp),
      parseTimestampMs(asset.latestUpdatedAt)
    );
  };

  const sorted = [...assets].sort((a, b) => {
    const timeDiff = getRecencyMs(a) - getRecencyMs(b);
    if (timeDiff !== 0) return timeDiff;
    return (Number(a.number) || 0) - (Number(b.number) || 0);
  });

  const groups = new Map<string, T[]>();
  for (const asset of sorted) {
    const rawKey = (asset.equipmentId || (fallbackToPea ? asset.peaNumber : '') || '').trim();
    if (!rawKey) continue;
    const key = rawKey.toLowerCase();
    const list = groups.get(key) || [];
    list.push(asset);
    groups.set(key, list);
  }

  const latestList: T[] = [];
  for (const group of groups.values()) {
    const latest = group[group.length - 1];
    latestList.push({
      ...latest,
      history: group
    });
  }

  return latestList;
}


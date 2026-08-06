import { CableAsset, GeneralInformation, EngineeringInformation, VisualInformation, EquipmentType, LocationType, PDResultType, TanDeltaResult } from '../types';
import { calculateHealth, generateEquipmentId, getCityAbbreviation, getLocationTypeAbbreviation, getEquipmentTypeAbbreviation2, getVoltageCode, getPea6Digits, getAreaFromCity, PEA_AREAS } from './peaData';
import { getCentralAdminDatabaseConfig, getAllSectorSpreadsheets } from './firestore';
import { getBangkokTimestamp } from './dateUtils';

// Helper to set public write permissions on Google Drive files so all authorized users can sync
export async function makeFileReadableByAnyone(accessToken: string, fileId: string): Promise<void> {
  if (!accessToken || !fileId) return;
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'writer',
        type: 'anyone'
      })
    });
  } catch (e) {
    console.warn(`Failed to set public write permission on file ${fileId}:`, e);
  }
}

// Master Spreadsheet mapping retriever combining Firestore Central DB config and Drive discovery
export async function getMasterSpreadsheetsMap(accessToken?: string | null): Promise<{
  spreadsheets: { [area: string]: string };
  folders: { [area: string]: string };
}> {
  const spreadsheets: { [area: string]: string } = {};
  const folders: { [area: string]: string } = {};

  // 1. Fetch from Firestore Central Config
  try {
    const config = await getCentralAdminDatabaseConfig();
    if (config?.spreadsheetsByArea) {
      Object.assign(spreadsheets, config.spreadsheetsByArea);
    }
    if (config?.foldersByArea) {
      Object.assign(folders, config.foldersByArea);
    }
  } catch (e) {
    console.warn("Error getting central config for spreadsheets map:", e);
  }

  // 2. Fetch from sector_spreadsheets Firestore collection
  try {
    const sectorSheets = await getAllSectorSpreadsheets();
    for (const [area, item] of Object.entries(sectorSheets)) {
      if (item.spreadsheetId) spreadsheets[area.toUpperCase()] = item.spreadsheetId;
      if (item.folderId) folders[area.toUpperCase()] = item.folderId;
    }
  } catch (e) {
    console.warn("Error getting sector spreadsheets from Firestore:", e);
  }

  // 3. Auto discover from Drive if token is available
  if (accessToken) {
    try {
      const discovered = await autoDiscoverAndSync(accessToken);
      if (discovered.spreadsheets) {
        Object.assign(spreadsheets, discovered.spreadsheets);
      }
      if (discovered.folders) {
        Object.assign(folders, discovered.folders);
      }
    } catch (e) {
      console.warn("Auto discover spreadsheets error:", e);
    }
  }

  return { spreadsheets, folders };
}

// Helper to list existing spreadsheets matching our pattern
export async function listSpreadsheets(accessToken: string): Promise<{ name: string; id: string }[]> {
  const query = encodeURIComponent("name contains 'PEA Cable Asset Database -' and mimeType = 'application/vnd.google-apps.spreadsheet'");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('Failed to list spreadsheets');
  const data = await res.json();
  return data.files || [];
}

// Helper to automatically discover all existing spreadsheets and image folders in Google Drive
export async function autoDiscoverAndSync(accessToken: string): Promise<{
  spreadsheets: { [area: string]: string };
  folders: { [area: string]: string };
}> {
  const spreadsheets: { [area: string]: string } = {};
  const folders: { [area: string]: string } = {};

  try {
    // 1. List all spreadsheets containing the pattern
    const sheetQuery = encodeURIComponent("name contains 'PEA Cable Asset Database' and mimeType = 'application/vnd.google-apps.spreadsheet'");
    const sheetRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${sheetQuery}&fields=files(id, name)&pageSize=100`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (sheetRes.ok) {
      const sheetData = await sheetRes.json();
      const files = sheetData.files || [];
      files.forEach((file: any) => {
        const match = file.name.match(/PEA\s+Cable\s+Asset\s+Database\s*-\s*([A-Za-z0-9]+)/i) || 
                      file.name.match(/PEA\s+Cable\s+Asset\s+Database\s+([A-Za-z0-9]+)/i);
        if (match) {
          const area = match[1].trim().toUpperCase();
          spreadsheets[area] = file.id;
          makeFileReadableByAnyone(accessToken, file.id).catch(() => {});
        }
      });
    }

    // 2. List all folders containing the pattern
    const folderQuery = encodeURIComponent("name contains 'PEA Cable Asset Images' and mimeType = 'application/vnd.google-apps.folder'");
    const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id, name)&pageSize=100`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (folderRes.ok) {
      const folderData = await folderRes.json();
      const files = folderData.files || [];
      files.forEach((file: any) => {
        const match = file.name.match(/PEA\s+Cable\s+Asset\s+Images\s*-\s*([A-Za-z0-9]+)/i) ||
                      file.name.match(/PEA\s+Cable\s+Asset\s+Images\s+([A-Za-z0-9]+)/i);
        if (match) {
          const area = match[1].trim().toUpperCase();
          folders[area] = file.id;
        }
      });
    }

    // Create folder on-demand for any mapped spreadsheet if a folder is missing
    const areas = ['N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3', 'NE1', 'NE2', 'NE3'];
    for (const area of areas) {
      const sheetId = spreadsheets[area];
      if (sheetId && !folders[area]) {
        try {
          const folderMetadata = {
            name: `PEA Cable Asset Images - ${area}`,
            mimeType: 'application/vnd.google-apps.folder'
          };
          const fRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(folderMetadata)
          });
          if (fRes.ok) {
            const fData = await fRes.json();
            const folderId = fData.id;
            folders[area] = folderId;
            
            // Set Folder Permission to public reader
            await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
              })
            });
          }
        } catch (err) {
          console.error(`Failed to create missing image folder for ${area}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("Error in autoDiscoverAndSync:", err);
  }

  return { spreadsheets, folders };
}

// Helper to create a new spreadsheet template
export async function createSheetsTemplate(accessToken: string, interestArea?: string): Promise<{ spreadsheetId: string; folderId: string }> {
  // First check for existing
  const existingSheets = await listSpreadsheets(accessToken);
  const areaSuffix = interestArea && interestArea !== 'ALL' ? ` - ${interestArea}` : '';
  const sheetName = `PEA Cable Asset Database${areaSuffix}`;
  
  const existing = existingSheets.find(s => s.name === sheetName);
  
  if (existing) {
    // In a real app we might need to find the corresponding folder ID too,
    // but for now let's assume we can re-create the folder or it's linked in firestore
    // For now, return existing sheet and create a new folder just to be safe, 
    // or better: search for folder too.
    return { spreadsheetId: existing.id, folderId: '' }; // Folder handling needs refinement
  }
  
  // 1. Create Folder in Google Drive for Images
  const folderMetadata = {
    name: `PEA Cable Asset Images${areaSuffix}`,
    mimeType: 'application/vnd.google-apps.folder'
  };

  const folderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(folderMetadata)
  });

  if (!folderRes.ok) {
    const errorBody = await folderRes.text();
    if (folderRes.status === 403 && errorBody.includes('API has not been used in project')) {
      throw new Error('The Google Drive API is not enabled in your Google Cloud Project. Please enable it in the Google Cloud Console.');
    }
    throw new Error('Failed to create image folder in Google Drive. Details: ' + errorBody);
  }
  const folderData = await folderRes.json();
  const folderId = folderData.id;

  // Set Folder Permission to anyone reader so images can load in the dashboard
  await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  // 2. Create Google Sheet
  const sheetMetadata = {
    properties: {
      title: `PEA Cable Asset Database${areaSuffix}`
    },
    sheets: [
      { properties: { title: 'General Information' } },
      { properties: { title: 'Engineering Information' } },
      { properties: { title: 'Visual & Thermal Images' } }
    ]
  };

  const sheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sheetMetadata)
  });

  if (!sheetRes.ok) {
    const errorBody = await sheetRes.text();
    if (sheetRes.status === 403 && errorBody.includes('API has not been used in project')) {
      throw new Error('The Google Sheets API is not enabled in your Google Cloud Project. Please enable it in the Google Cloud Console.');
    }
    throw new Error('Failed to create spreadsheet in Google Sheets. Details: ' + errorBody);
  }

  const sheetData = await sheetRes.json();
  const spreadsheetId = sheetData.spreadsheetId;

  // Set file permission to public reader so all roles can read Google Sheet data
  await makeFileReadableByAnyone(accessToken, spreadsheetId);

  // 3. Write Headers to each sheet
  const headers = {
    valueInputOption: 'USER_ENTERED',
    data: [
      {
        range: "'General Information'!A1:AG1",
        values: [[
          'Number', 'Timestamp', 'Name of user or admin', 'Voltage Level (kV)', 'City', 
          'Equipment type', 'Product Manufacturer', 'Country of Origin', 'Location type', 
          'Substation', 'Landmark Location', 'GPS', 'Year of registration', 'PEA Number (ID)', 
          'Equipment Number ADS', 'Account Asset Number (AA)', 'Production Month', 'Installation Date', 
          'WBS', 'Business Type', 'Cost Center', 'GISTAG', 'Class', 'Contract Number', 
          'Feeder', 'Substation ID', 'Operate ID', 'Serial Number', 'Model', 'Work Order', 
          'Size', 'Asset Value', 'Equipment ID'
        ]]
      },
      {
        range: "'Engineering Information'!A1:M1",
        values: [[
          'Number', 'Timestamp', 'Name of user or admin', 'Equipment ID', 'Load current (Amps)', 
          'Sheath Current(Amps)', 'Surface Temperature (Celsius)', 'External Discharge (pC)', 
          'Online PD Result', 'Online PD amplitude (pC)', 'Insulation Resistance (GOhm)', 
          'Tan Delta Result', 'Tan delta amplitude'
        ]]
      },
      {
        range: "'Visual & Thermal Images'!A1:F1",
        values: [[
          'Number', 'Timestamp', 'Name of user or admin', 'Equipment ID', 'Visual Picture', 'Thermal image'
        ]]
      }
    ]
  };

  const headersRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(headers)
  });

  if (!headersRes.ok) {
    throw new Error('Failed to initialize headers in the spreadsheet');
  }

  // 4. Seed with some initial mock data so the Sheet is populated nicely!
  const seedData = {
    valueInputOption: 'USER_ENTERED',
    data: [
      {
        range: "'General Information'!A2:AG3",
        values: [
          [
            1, '2026-07-15 10:30:00', 'Somsak PEA', '115', 'Chiang Mai', 'Underground Cable', 
            'Prysmian Group', 'Germany', 'Transmission Line', 'Chiang Mai 2 Substation', 
            'Main Highway Road 107', '18.7883, 98.9853', '2018', 'PEA-N1-UG01', 'SAP-9081234', 
            'ADS-1001', '07/2018', '2018-07-15', 'WBS-N1-001', 'Utility', 'CC-N1-908', 'GIS-N1-UG01', 
            'Class A', 'CN-2018-001', 'FDR-501', 'SUB-CM2', 'OP-N1-01', 'SN-Pry-001', 'Model A', 'WO-99881', '3x240 sq.mm', '2,500,000 THB', 'N1-115kV-2018-UND-PEA-N1-UG01'
          ],
          [
            2, '2026-07-16 11:24:00', 'Somsak PEA', '115', 'Chiang Mai', 'Termination', 
            'ABB Hitachi', 'Sweden', 'Substation', 'Chiang Mai 2 Substation', 'Substation Bay 04', 
            '18.7905, 98.9950', '2018', 'PEA-N1-TR01', 'SAP-9081235', 'ADS-1002', '07/2018', '2018-07-16', 
            'WBS-N1-002', 'Utility', 'CC-N1-908', 'GIS-N1-TR01', 'Class A', 'CN-2018-002', 'FDR-501', 'SUB-CM2', 
            'OP-N1-02', 'SN-ABB-001', 'Model B', 'WO-99882', '115kV Plug-in', '1,800,000 THB', 'N1-115kV-2018-TER-PEA-N1-TR01'
          ]
        ]
      },
      {
        range: "'Engineering Information'!A2:M3",
        values: [
          [
            1, '2026-07-15 10:35:00', 'Somsak PEA', 'N1-115kV-2018-UND-PEA-N1-UG01', 
            '180', '12', '45', '8', 'None', '5', '12.5', 'No Action Required', '0.05'
          ],
          [
            2, '2026-07-16 11:30:00', 'Somsak PEA', 'N1-115kV-2018-TER-PEA-N1-TR01', 
            '180', '42', '58', '80', 'Corona', '75', '8.2', 'Further Study Advised', '0.18'
          ]
        ]
      },
      {
        range: "'Visual & Thermal Images'!A2:F3",
        values: [
          [
            1, '2026-07-15 10:30:00', 'Somsak PEA', 'N1-115kV-2018-UND-PEA-N1-UG01', 
            'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=400', 
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'
          ],
          [
            2, '2026-07-16 11:24:00', 'Somsak PEA', 'N1-115kV-2018-TER-PEA-N1-TR01', 
            'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400', 
            'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400'
          ]
        ]
      }
    ]
  };

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(seedData)
  });

  return { spreadsheetId, folderId };
}

// Upload file to specific Google Drive Folder and return publicly accessible direct URL
export async function uploadImageToDrive(accessToken: string, folderId: string, file: File): Promise<string> {
  const metadata = {
    name: `${Date.now()}_${file.name}`,
    parents: [folderId],
    mimeType: file.type
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Failed to upload image to Google Drive: ${res.statusText}`);
  }

  const data = await res.json();
  const fileId = data.id;

  // Set file permission to public readers
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  // Use the standard direct hotlink URL for Google Drive images
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
}

// Helper to normalize sheet headers
export function normalizeHeader(h: string): string {
  if (!h) return '';
  return String(h).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

// Helper to align data object with current spreadsheet headers
export function alignRowWithHeaders(headers: string[], data: Record<string, any>, defaultValues: any[] = []): any[] {
  return headers.map((header, idx) => {
    const norm = normalizeHeader(header);
    
    // Standard General Information
    if (norm === 'number' || norm === 'no') return data.number ?? defaultValues[idx] ?? '';
    if (norm === 'timestamp' || norm === 'date' || norm === 'time') {
      const rawTs = data.timestamp ?? defaultValues[idx] ?? '';
      return rawTs ? getBangkokTimestamp(rawTs) : getBangkokTimestamp();
    }
    if (norm === 'nameofuseroradmin' || norm === 'operatorname' || norm === 'operator') return data.operatorName ?? defaultValues[idx] ?? '';
    if (norm === 'voltagelevelkv' || norm === 'voltagelevel' || norm === 'voltage') return data.voltageLevel ?? defaultValues[idx] ?? '';
    if (norm === 'city' || norm === 'province') return data.city ?? defaultValues[idx] ?? '';
    if (norm === 'equipmenttype') return data.equipmentType ?? defaultValues[idx] ?? '';
    if (norm === 'productmanufacturer' || norm === 'manufacturer' || norm === 'brand') return data.manufacturer ?? defaultValues[idx] ?? '';
    if (norm === 'countryoforigin' || norm === 'country') return data.country ?? defaultValues[idx] ?? '';
    if (norm === 'locationtype') return data.locationType ?? defaultValues[idx] ?? '';
    if (norm === 'substation' || norm === 'substationname') return data.substationName ?? defaultValues[idx] ?? '';
    if (norm === 'landmarklocation' || norm === 'landmark') return data.landmark ?? defaultValues[idx] ?? '';
    if (norm === 'gps' || norm === 'coordinates') {
      if (data.gps) {
        if (typeof data.gps === 'string') return data.gps;
        return `${data.gps.lat}, ${data.gps.lng}`;
      }
      return defaultValues[idx] ?? '';
    }
    if (norm === 'yearofregistration' || norm === 'registrationyear') return data.yearOfRegistration ?? defaultValues[idx] ?? '';
    if (norm === 'peanumberid' || norm === 'peanumber') return data.peaNumber ?? defaultValues[idx] ?? '';
    if (norm === 'equipmentnumberads' || norm === 'assetnumber') return data.assetNumber ?? defaultValues[idx] ?? '';
    if (norm === 'accountassetnumberaa' || norm === 'adsnumber' || norm === 'aanumber') return data.adsNumber ?? defaultValues[idx] ?? '';
    if (norm === 'productionmonth') return data.productionMonth ?? defaultValues[idx] ?? '';
    if (norm === 'installationdate') return data.installationDate ?? defaultValues[idx] ?? '';
    if (norm === 'wbs' || norm === 'wbscode') return data.wbs ?? defaultValues[idx] ?? '';
    if (norm === 'businesstype') return data.businessType ?? defaultValues[idx] ?? '';
    if (norm === 'costcenter') return data.costCenter ?? defaultValues[idx] ?? '';
    if (norm === 'gistag') return data.gistag ?? defaultValues[idx] ?? '';
    if (norm === 'class') return data.class ?? defaultValues[idx] ?? '';
    if (norm === 'contractnumber') return data.contractNumber ?? defaultValues[idx] ?? '';
    if (norm === 'feeder') return data.feeder ?? defaultValues[idx] ?? '';
    if (norm === 'substationid') return data.substationId ?? defaultValues[idx] ?? '';
    if (norm === 'operateid') return data.operateId ?? defaultValues[idx] ?? '';
    if (norm === 'serialnumber') return data.serialNumber ?? defaultValues[idx] ?? '';
    if (norm === 'model') return data.model ?? defaultValues[idx] ?? '';
    if (norm === 'workorder') return data.workOrder ?? defaultValues[idx] ?? '';
    if (norm === 'size') return data.size ?? defaultValues[idx] ?? '';
    if (norm === 'assetvalue' || norm === 'value') return data.assetValue ?? defaultValues[idx] ?? '';
    if (norm === 'equipmentid') return data.equipmentId ?? defaultValues[idx] ?? '';
    
    // Standard Engineering Information
    if (norm === 'loadcurrentamps' || norm === 'loadcurrent') return data.loadCurrent ?? defaultValues[idx] ?? '';
    if (norm === 'sheathcurrentamps' || norm === 'sheathcurrent') return data.sheathCurrent ?? defaultValues[idx] ?? '';
    if (norm === 'surfacetemperaturecelsius' || norm === 'surfacetemperature') return data.surfaceTemperature ?? defaultValues[idx] ?? '';
    if (norm === 'externaldischargepc' || norm === 'externaldischarge') return data.externalDischarge ?? defaultValues[idx] ?? '';
    if (norm === 'onlinepdresult' || norm === 'pdresult') return data.pdResult ?? defaultValues[idx] ?? '';
    if (norm === 'onlinepdamplitudepc' || norm === 'onlinepdamplitude') return data.onlinePdAmplitude ?? defaultValues[idx] ?? '';
    if (norm === 'insulationresistancegohm' || norm === 'insulationresistance') return data.insulationResistance ?? defaultValues[idx] ?? '';
    if (norm === 'tandeltaresult' || norm === 'tandelta') return data.tanDelta ?? defaultValues[idx] ?? '';
    if (norm === 'tandeltaamplitude') return data.tanDeltaAmplitude ?? defaultValues[idx] ?? '';

    // Custom properties / newly added columns
    if (data.customFields && data.customFields[header]) return data.customFields[header];
    if (data.customFields && data.customFields[norm]) return data.customFields[norm];
    if (data[header] !== undefined) return data[header];
    if (data[norm] !== undefined) return data[norm];

    return defaultValues[idx] ?? '';
  });
}

export async function fetchWithRetry(url: string, options: RequestInit, retries = 3, initialDelayMs = 1000): Promise<Response> {
  let delay = initialDelayMs;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      console.warn(`Google API rate limit (429) encountered. Retrying after ${delay}ms... (Attempt ${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
      continue;
    }
    return res;
  }
  return fetch(url, options);
}

// Fetch all sheets from the spreadsheet, join columns and output parsed CableAsset array
export async function fetchSheetsData(accessToken: string, spreadsheetId: string): Promise<CableAsset[]> {
  // Determine if this spreadsheet is targeted to a specific PEA area via its title
  let allowedArea: string | null = null;
  try {
    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const title = meta.properties?.title || '';
      const match = title.match(/PEA\s+Cable\s+Asset\s+Database\s*-\s*([A-Za-z0-9]+)/i) || 
                    title.match(/PEA\s+Cable\s+Asset\s+Database\s+([A-Za-z0-9]+)/i);
      if (match) {
        allowedArea = match[1].trim().toUpperCase();
      }
    }
  } catch (err) {
    console.warn("Failed to fetch spreadsheet title metadata:", err);
  }

  // Fetch wider range A1:AZ to include the header row (1) and any new columns!
  const ranges = [
    "'General Information'!A1:AZ",
    "'Engineering Information'!A1:AZ",
    "'Visual & Thermal Images'!A1:AZ"
  ];

  const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('Spreadsheet fetch error:', res.status, res.statusText, errorBody);
    
    let advice = "Please verify file access permissions.";
    if (res.status === 403 && errorBody.includes('API has not been used in project')) {
      advice = "The Google Sheets API is not enabled in your Google Cloud Project. Please enable it in the Google Cloud Console.";
    } else if (res.status === 404) {
      advice = "The spreadsheet could not be found. It may have been deleted. Please click 'Disconnect' in the top right to reset your connection and create a new one.";
    } else if (res.status === 403) {
      advice = "You don't have permission to access this spreadsheet. You might be signed into a different Google account. Try clicking 'Disconnect' to reset.";
    } else if (res.status === 429) {
      advice = "Google API rate limit reached. The system will retry shortly or use locally synced database cache.";
    }
    
    throw new Error(`Failed to fetch spreadsheet data (Status: ${res.status}). ${advice}`);
  }

  // Trigger background conversion of existing sheet timestamps to Bangkok UTC+7 & equipment ID format migration
  convertExistingSheetTimestampsToUTC7(accessToken, spreadsheetId).catch(() => {});
  migrateExistingSheetEquipmentIds(accessToken, spreadsheetId).catch(() => {});

  const data = await res.json();
  const valueRanges = data.valueRanges || [];

  const genRows = valueRanges[0]?.values || [];
  const engRows = valueRanges[1]?.values || [];
  const visRows = valueRanges[2]?.values || [];

  if (genRows.length === 0) {
    return [];
  }

  const genHeaders = genRows[0] || [];
  const engHeaders = engRows[0] || [];
  const visHeaders = visRows[0] || [];

  const genDataRows = genRows.slice(1);
  const engDataRows = engRows.slice(1);
  const visDataRows = visRows.slice(1);

  const cleanStr = (val: any) => (val === undefined || val === null) ? '' : String(val).trim();

  // Parse Page 1: General Information (Dynamic & Header-driven)
  const generals: GeneralInformation[] = genDataRows.map((row: any[], index: number) => {
    const getVal = (headerName: string) => {
      const idx = genHeaders.findIndex((h: string) => normalizeHeader(h) === normalizeHeader(headerName));
      return idx !== -1 && idx < row.length ? cleanStr(row[idx]) : '';
    };

    const gpsString = getVal('gps') || getVal('coordinates') || '13.7563, 100.5018';
    const [lat, lng] = gpsString.split(',').map((c: string) => parseFloat(c.trim()) || 0);

    const number = parseInt(getVal('number') || getVal('no')) || (index + 1);
    const rawTs = getVal('timestamp') || getVal('date') || getVal('time');
    const timestamp = rawTs ? getBangkokTimestamp(rawTs) : getBangkokTimestamp();
    const operatorName = getVal('nameofuseroradmin') || getVal('operatorname') || getVal('operator');
    const voltageLevel = getVal('voltagelevelkv') || getVal('voltagelevel') || getVal('voltage');
    const city = getVal('city') || getVal('province');
    const equipmentType = getVal('equipmenttype') as EquipmentType;
    const manufacturer = getVal('productmanufacturer') || getVal('manufacturer') || getVal('brand');
    const country = getVal('countryoforigin') || getVal('country');
    const locationType = getVal('locationtype') as LocationType;
    const substationName = getVal('substation') || getVal('substationname');
    const landmark = getVal('landmarklocation') || getVal('landmark');
    const yearOfRegistration = parseInt(getVal('yearofregistration') || getVal('registrationyear')) || new Date().getFullYear();
    const peaNumber = getVal('peanumberid') || getVal('peanumber');
    const assetNumber = getVal('equipmentnumberads') || getVal('assetnumber');
    const adsNumber = getVal('accountassetnumberaa') || getVal('adsnumber') || getVal('aanumber');
    const productionMonth = getVal('productionmonth');
    const installationDate = getVal('installationdate');
    const wbs = getVal('wbs') || getVal('wbscode');
    const businessType = getVal('businesstype');
    const costCenter = getVal('costcenter');
    const gistag = getVal('gistag');
    const cls = getVal('class');
    const contractNumber = getVal('contractnumber');
    const feeder = getVal('feeder');
    const substationId = getVal('substationid');
    const operateId = getVal('operateid');
    const serialNumber = getVal('serialnumber');
    const model = getVal('model');
    const workOrder = getVal('workorder');
    const size = getVal('size');
    const assetValue = getVal('assetvalue') || getVal('value') || (row.length > 31 && !row[31]?.toString().includes('-') ? cleanStr(row[31]) : '');
    let equipmentId = getVal('equipmentid');

    // Fallbacks if equipmentid didn't match directly
    if (!equipmentId) {
      if (row.length > 32) {
        equipmentId = cleanStr(row[32]);
      } else if (row.length > 31) {
        const col31 = cleanStr(row[31]);
        if (col31.includes('-') && (col31.includes('kV') || col31.split('-').length >= 3)) {
          equipmentId = col31;
        } else {
          equipmentId = cleanStr(row[32]) || col31;
        }
      } else {
        const col15 = cleanStr(row[15]);
        const col16 = cleanStr(row[16]);
        const col15IsEqId = col15.includes('-') && (col15.includes('kV') || col15.split('-').length >= 3);
        const col16IsEqId = col16.includes('-') && (col16.includes('kV') || col16.split('-').length >= 3);
        if (col16IsEqId) {
          equipmentId = col16;
        } else if (col15IsEqId) {
          equipmentId = col15;
        } else {
          equipmentId = col16 || col15 || '';
        }
      }
    }

    // Now gather all other columns that do NOT match standard headers into customFields
    const standardKeys = [
      'number', 'no', 'timestamp', 'date', 'time', 'nameofuseroradmin', 'operatorname', 'operator',
      'voltagelevelkv', 'voltagelevel', 'voltage', 'city', 'province', 'equipmenttype',
      'productmanufacturer', 'manufacturer', 'brand', 'countryoforigin', 'country', 'locationtype',
      'substation', 'substationname', 'landmarklocation', 'landmark', 'gps', 'coordinates',
      'yearofregistration', 'registrationyear', 'peanumberid', 'peanumber', 'equipmentnumberads',
      'assetnumber', 'accountassetnumberaa', 'adsnumber', 'aanumber', 'productionmonth',
      'installationdate', 'wbs', 'wbscode', 'businesstype', 'costcenter', 'gistag', 'class',
      'contractnumber', 'feeder', 'substationid', 'operateid', 'serialnumber', 'model',
      'workorder', 'size', 'assetvalue', 'value', 'equipmentid'
    ];

    const customFields: Record<string, string> = {};
    genHeaders.forEach((header: string, colIdx: number) => {
      const norm = normalizeHeader(header);
      if (norm && !standardKeys.includes(norm) && colIdx < row.length) {
        customFields[header] = cleanStr(row[colIdx]);
      }
    });

    return {
      number,
      timestamp,
      operatorName,
      voltageLevel,
      city,
      equipmentType,
      manufacturer,
      country,
      locationType,
      substationName,
      landmark,
      gps: { lat, lng },
      yearOfRegistration,
      peaNumber,
      assetNumber,
      adsNumber,
      productionMonth,
      installationDate,
      wbs,
      businessType,
      costCenter,
      gistag,
      class: cls,
      contractNumber,
      feeder,
      substationId,
      operateId,
      serialNumber,
      model,
      workOrder,
      size,
      assetValue,
      equipmentId,
      customFields
    };
  });

  // Parse Page 2: Engineering Information (Dynamic & Header-driven)
  const engineerings: Record<string, EngineeringInformation> = {};
  engDataRows.forEach((row: any[], index: number) => {
    const getVal = (headerName: string) => {
      const idx = engHeaders.findIndex((h: string) => normalizeHeader(h) === normalizeHeader(headerName));
      return idx !== -1 && idx < row.length ? cleanStr(row[idx]) : '';
    };

    let eqId = getVal('equipmentid');
    if (!eqId) {
      eqId = cleanStr(row[3]);
    }
    if (!eqId) return;

    const loadCurrent = parseFloat(getVal('loadcurrentamps') || getVal('loadcurrent') || cleanStr(row[4])) || 0;
    const sheathCurrent = parseFloat(getVal('sheathcurrentamps') || getVal('sheathcurrent') || cleanStr(row[5])) || 0;
    const surfaceTemperature = parseFloat(getVal('surfacetemperaturecelsius') || getVal('surfacetemperature') || cleanStr(row[6])) || 0;
    const externalDischarge = parseFloat(getVal('externaldischargepc') || getVal('externaldischarge') || cleanStr(row[7])) || 0;
    const pdResult = (getVal('onlinepdresult') || getVal('pdresult') || cleanStr(row[8]) || 'None') as PDResultType;
    const onlinePdAmplitude = parseFloat(getVal('onlinepdamplitudepc') || getVal('onlinepdamplitude') || cleanStr(row[9])) || 0;
    const insulationResistance = parseFloat(getVal('insulationresistancegohm') || getVal('insulationresistance') || cleanStr(row[10]) || cleanStr(row[9])) || 0;
    const tanDelta = (getVal('tandeltaresult') || getVal('tandelta') || cleanStr(row[11]) || cleanStr(row[10]) || 'No record') as TanDeltaResult;
    const tanDeltaAmplitude = parseFloat(getVal('tandeltaamplitude') || cleanStr(row[12])) || 0;

    const standardEngKeys = [
      'number', 'no', 'timestamp', 'nameofuseroradmin', 'operatorname', 'operator', 'equipmentid',
      'loadcurrentamps', 'loadcurrent', 'sheathcurrentamps', 'sheathcurrent', 'surfacetemperaturecelsius',
      'surfacetemperature', 'externaldischargepc', 'externaldischarge', 'onlinepdresult', 'pdresult',
      'onlinepdamplitudepc', 'onlinepdamplitude', 'insulationresistancegohm', 'insulationresistance',
      'tandeltaresult', 'tandelta', 'tandeltaamplitude'
    ];

    const customFields: Record<string, string> = {};
    engHeaders.forEach((header: string, colIdx: number) => {
      const norm = normalizeHeader(header);
      if (norm && !standardEngKeys.includes(norm) && colIdx < row.length) {
        customFields[header] = cleanStr(row[colIdx]);
      }
    });

    const engRawTs = getVal('timestamp') || cleanStr(row[1]);
    engineerings[eqId] = {
      number: parseInt(getVal('number') || getVal('no')) || (index + 1),
      timestamp: engRawTs ? getBangkokTimestamp(engRawTs) : getBangkokTimestamp(),
      operatorName: getVal('nameofuseroradmin') || getVal('operatorname') || getVal('operator') || cleanStr(row[2]),
      equipmentId: eqId,
      loadCurrent,
      sheathCurrent,
      surfaceTemperature,
      externalDischarge,
      pdResult,
      onlinePdAmplitude,
      insulationResistance,
      tanDelta,
      tanDeltaAmplitude,
      customFields
    };
  });

  // Parse Page 3: Visual & Thermal Images (Dynamic & Header-driven)
  const visuals: Record<string, VisualInformation> = {};
  visDataRows.forEach((row: any[], index: number) => {
    const getVal = (headerName: string) => {
      const idx = visHeaders.findIndex((h: string) => normalizeHeader(h) === normalizeHeader(headerName));
      return idx !== -1 && idx < row.length ? cleanStr(row[idx]) : '';
    };

    let eqId = getVal('equipmentid');
    if (!eqId) {
      eqId = cleanStr(row[3]);
    }
    if (!eqId) return;

    const fixDriveUrl = (url: string) => {
      if (!url) return url;
      if (url.includes('drive.google.com/uc?export=view&id=')) {
        return url.replace('uc?export=view&id=', 'thumbnail?id=') + '&sz=w1000';
      }
      return url;
    };

    const visRawTs = getVal('timestamp') || cleanStr(row[1]);
    visuals[eqId] = {
      number: parseInt(getVal('number') || getVal('no')) || (index + 1),
      timestamp: visRawTs ? getBangkokTimestamp(visRawTs) : getBangkokTimestamp(),
      operatorName: getVal('nameofuseroradmin') || getVal('operatorname') || getVal('operator') || cleanStr(row[2]),
      equipmentId: eqId,
      visualPictureUrl: fixDriveUrl(getVal('visualpictureurl') || getVal('visualpicture') || cleanStr(row[4])),
      thermalImageUrl: fixDriveUrl(getVal('thermalimageurl') || getVal('thermalimage') || cleanStr(row[5]))
    };
  });

  // Join them together and compute health index
  const results = generals.map(gen => {
    const eng = (engineerings[gen.equipmentId] || {}) as Partial<EngineeringInformation>;
    const vis = (visuals[gen.equipmentId] || {}) as Partial<VisualInformation>;
    const { score, status } = calculateHealth(eng);

    const getMs = (ts: string) => {
      if (!ts) return 0;
      const d = new Date(ts.replace(/-/g, '/'));
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    let latestBy = gen.operatorName || 'System';
    let latestAt = gen.timestamp || '';
    let maxMs = getMs(latestAt);

    const engMs = getMs(eng.timestamp || '');
    if (engMs > maxMs) {
      latestBy = eng.operatorName || 'System';
      latestAt = eng.timestamp || '';
      maxMs = engMs;
    }

    const visMs = getMs(vis.timestamp || '');
    if (visMs > maxMs) {
      latestBy = vis.operatorName || 'System';
      latestAt = vis.timestamp || '';
      maxMs = visMs;
    }

    return {
      ...gen,
      ...eng,
      ...vis,
      healthScore: score,
      healthStatus: status,
      latestUpdatedBy: latestBy,
      latestUpdatedAt: latestAt,
      spreadsheetId,
      customFields: {
        ...(gen.customFields || {}),
        ...(eng.customFields || {})
      }
    } as CableAsset;
  });

  // Deduplicate and group results by equipmentId so multiple audit/maintenance rows for 1 asset count as 1 asset
  const assetMap = new Map<string, CableAsset>();
  results.forEach(asset => {
    const key = asset.equipmentId ? asset.equipmentId.trim() : `ROW_${asset.number}`;
    if (!assetMap.has(key)) {
      assetMap.set(key, { ...asset, history: [asset] });
    } else {
      const existing = assetMap.get(key)!;
      const history = [...(existing.history || []), asset];
      const existingTime = existing.timestamp ? new Date(existing.timestamp.replace(/-/g, '/')).getTime() : 0;
      const currTime = asset.timestamp ? new Date(asset.timestamp.replace(/-/g, '/')).getTime() : 0;
      if (currTime >= existingTime) {
        assetMap.set(key, { ...asset, history });
      } else {
        assetMap.set(key, { ...existing, history });
      }
    }
  });

  let deduplicatedResults = Array.from(assetMap.values());

  if (allowedArea) {
    deduplicatedResults = deduplicatedResults.filter(asset => {
      let assetArea = '';
      if (asset.equipmentId) {
        const parts = asset.equipmentId.split('-');
        if (parts.length > 0) assetArea = parts[0].trim().toUpperCase();
      }
      if (!assetArea && asset.peaNumber) {
        const parts = asset.peaNumber.split('-');
        if (parts.length > 1) assetArea = parts[1].trim().toUpperCase();
      }
      // If we cannot find any area code on the asset itself, default it to allowedArea
      // since it literally exists in that spreadsheet! Otherwise, verify they match.
      return !assetArea || assetArea === allowedArea;
    });
  }

  return deduplicatedResults;
}

// Helper function for fetching with exponential backoff on HTTP 429 / Rate Limit
export async function fetchWithBackoff(url: string, options: RequestInit = {}, maxRetries = 5, initialDelayMs = 2000): Promise<Response> {
  let delay = initialDelayMs;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 503) {
        if (attempt === maxRetries) return res; // Last attempt, return response
        console.warn(`[Google Sheets API 429 Rate Limit] Retrying attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2; // Exponential backoff: 2s, 4s, 8s, 16s...
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return fetch(url, options);
}

// Append new general row
export async function appendGeneralRow(accessToken: string, spreadsheetId: string, rowOrData: any[] | Record<string, any>) {
  let rowValues: any[];
  if (Array.isArray(rowOrData)) {
    rowValues = rowOrData;
  } else {
    // It's an object! Let's fetch the first row (headers) to align it
    const resHeaders = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27General%20Information%27%21A1:AZ1`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resHeaders.ok) throw new Error('Failed to fetch General Information headers for alignment');
    const dataHeaders = await resHeaders.json();
    const headers = dataHeaders.values?.[0] || [];
    rowValues = alignRowWithHeaders(headers, rowOrData);
  }

  const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27General%20Information%27%21A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'General Information'!A1",
      majorDimension: 'ROWS',
      values: [rowValues]
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to append general information to Google Sheets: ${errorText}`);
  }
}

// Append multiple general rows in a SINGLE API call (Batch Append to avoid 60 requests/min rate limit)
export async function appendGeneralRowsBatch(accessToken: string, spreadsheetId: string, rowsValues: any[][]) {
  if (!rowsValues || rowsValues.length === 0) return;

  const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27General%20Information%27%21A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'General Information'!A1",
      majorDimension: 'ROWS',
      values: rowsValues
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to batch append general information to Google Sheets: ${errorText}`);
  }
}

// Fetch highest number in Column A of General Information sheet
export async function fetchLastSheetNumber(accessToken: string, spreadsheetId: string): Promise<number> {
  try {
    const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27General%20Information%27%21A2:A`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const rows = data.values || [];
    let maxNum = 0;
    for (const r of rows) {
      if (r && r[0] !== undefined && r[0] !== null) {
        const val = parseInt(String(r[0]).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(val) && val > maxNum && val < 100000) {
          maxNum = val;
        }
      }
    }
    return maxNum;
  } catch (err) {
    console.warn("Failed to fetch last sheet number:", err);
    return 0;
  }
}

// Append new engineering row
export async function appendEngineeringRow(accessToken: string, spreadsheetId: string, rowOrData: any[] | Record<string, any>) {
  let rowValues: any[];
  if (Array.isArray(rowOrData)) {
    rowValues = rowOrData;
  } else {
    // Fetch headers of Engineering Information to align
    const resHeaders = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27Engineering%20Information%27%21A1:AZ1`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resHeaders.ok) throw new Error('Failed to fetch Engineering Information headers for alignment');
    const dataHeaders = await resHeaders.json();
    const headers = dataHeaders.values?.[0] || [];
    rowValues = alignRowWithHeaders(headers, rowOrData);
  }

  const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27Engineering%20Information%27%21A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'Engineering Information'!A1",
      majorDimension: 'ROWS',
      values: [rowValues]
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to append engineering parameters to Google Sheets: ${errorText}`);
  }
}

// Append multiple engineering rows in a SINGLE API call
export async function appendEngineeringRowsBatch(accessToken: string, spreadsheetId: string, rowsValues: any[][]) {
  if (!rowsValues || rowsValues.length === 0) return;

  const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27Engineering%20Information%27%21A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'Engineering Information'!A1",
      majorDimension: 'ROWS',
      values: rowsValues
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to batch append engineering parameters to Google Sheets: ${errorText}`);
  }
}

// Append new visual images row
export async function appendVisualRow(accessToken: string, spreadsheetId: string, row: any[]) {
  const possibleSheetNames = [
    'Visual & Thermal Images',
    'Visual & Thermal',
    'Visual Images',
    'Visual',
    'Visual&Thermal Images'
  ];

  for (const sheetName of possibleSheetNames) {
    try {
      const encodedRange = encodeURIComponent(`'${sheetName}'!A1`);
      const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `'${sheetName}'!A1`,
          majorDimension: 'ROWS',
          values: [row]
        })
      });

      if (res.ok) {
        return; // Successfully appended
      }
    } catch (err) {
      // try next candidate sheet name
    }
  }

  // Log warning if visual sheet tab does not exist or append fails, so main asset registration is not blocked
  console.warn(`Visual & Thermal Images sheet tab not found or append skipped for spreadsheet ${spreadsheetId}`);
}

// Append multiple visual rows in a SINGLE API call
export async function appendVisualRowsBatch(accessToken: string, spreadsheetId: string, rowsValues: any[][]) {
  if (!rowsValues || rowsValues.length === 0) return;

  const possibleSheetNames = [
    'Visual & Thermal Images',
    'Visual & Thermal',
    'Visual Images',
    'Visual',
    'Visual&Thermal Images'
  ];

  for (const sheetName of possibleSheetNames) {
    try {
      const encodedRange = encodeURIComponent(`'${sheetName}'!A1`);
      const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `'${sheetName}'!A1`,
          majorDimension: 'ROWS',
          values: rowsValues
        })
      });

      if (res.ok) return;
    } catch (err) {
      // try next candidate sheet name
    }
  }
  console.warn(`Visual & Thermal Images sheet tab not found or batch append skipped for spreadsheet ${spreadsheetId}`);
}

// Update specific spreadsheet row
export async function updateSheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  rowValuesOrData: any[] | Record<string, any>,
  columnRange: string
) {
  let rowValues: any[];
  let maxColLetter = columnRange.split(':')[1] || 'AF';

  if (Array.isArray(rowValuesOrData)) {
    rowValues = rowValuesOrData;
  } else {
    // Fetch headers of that sheet to align
    const resHeaders = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${sheetName}'!A1:AZ1`)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resHeaders.ok) throw new Error(`Failed to fetch ${sheetName} headers for alignment`);
    const dataHeaders = await resHeaders.json();
    const headers = dataHeaders.values?.[0] || [];
    rowValues = alignRowWithHeaders(headers, rowValuesOrData);
    
    // Calculate max target column letter dynamically
    if (headers.length > 0) {
      const getColumnLetter = (colIdx: number) => {
        let temp = colIdx;
        let letter = '';
        while (temp >= 0) {
          letter = String.fromCharCode((temp % 26) + 65) + letter;
          temp = Math.floor(temp / 26) - 1;
        }
        return letter;
      };
      maxColLetter = getColumnLetter(headers.length - 1);
    }
  }

  const range = `'${sheetName}'!A${rowIndex}:${maxColLetter}${rowIndex}`;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: [rowValues]
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to update row in Google Sheets (${sheetName}): ${errorText}`);
  }
}

// Batch update multiple rows/ranges on a single spreadsheet in a single API call
export async function batchUpdateSheetRows(
  accessToken: string,
  spreadsheetId: string,
  updates: { range: string; values: any[][] }[]
) {
  if (updates.length === 0) return;
  
  const body = {
    valueInputOption: 'USER_ENTERED',
    data: updates.map(u => ({
      range: u.range,
      majorDimension: 'ROWS',
      values: u.values
    }))
  };

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to batch update spreadsheet ${spreadsheetId}: ${errorText}`);
  }
}

// Fetch row mappings for an equipmentId or specific record number to support overwrite edits
export async function fetchSheetsRowIndices(
  accessToken: string,
  spreadsheetId: string,
  equipmentId: string,
  recordNumber?: number
): Promise<{ genRowIndex: number; engRowIndex: number; visRowIndex: number }> {
  const ranges = [
    "'General Information'!A1:AZ",
    "'Engineering Information'!A1:AZ",
    "'Visual & Thermal Images'!A1:AZ"
  ];

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error('Failed to retrieve spreadsheet row mappings.');
  }

  const data = await res.json();
  const valueRanges = data.valueRanges || [];

  const genRows = valueRanges[0]?.values || [];
  const engRows = valueRanges[1]?.values || [];
  const visRows = valueRanges[2]?.values || [];

  const genHeaders = genRows[0] || [];
  const engHeaders = engRows[0] || [];
  const visHeaders = visRows[0] || [];

  const genDataRows = genRows.slice(1);
  const engDataRows = engRows.slice(1);
  const visDataRows = visRows.slice(1);

  const cleanStr = (val: any) => (val === undefined || val === null) ? '' : String(val).trim();
  const searchId = cleanStr(equipmentId).toLowerCase();

  const getColIdxOfEqId = (headers: string[]) => {
    return headers.findIndex(h => normalizeHeader(h) === 'equipmentid');
  };

  const genEqIdIdx = getColIdxOfEqId(genHeaders);
  const engEqIdIdx = getColIdxOfEqId(engHeaders);
  const visEqIdIdx = getColIdxOfEqId(visHeaders);

  // Find index in General Information
  let genIndex = -1;
  if (recordNumber) {
    genIndex = genDataRows.findIndex((row: any[]) => parseInt(row[0]) === recordNumber);
  }
  if (genIndex === -1) {
    genIndex = genDataRows.findIndex((row: any[]) => {
      if (genEqIdIdx !== -1 && row.length > genEqIdIdx) {
        if (cleanStr(row[genEqIdIdx]).toLowerCase() === searchId) return true;
      }
      if (row.length > 32 && cleanStr(row[32]).toLowerCase() === searchId) return true;
      if (row.length > 31 && cleanStr(row[31]).toLowerCase() === searchId) return true;
      return false;
    });
  }

  // Find index in Engineering Information
  let engIndex = -1;
  if (recordNumber) {
    engIndex = engDataRows.findIndex((row: any[]) => parseInt(row[0]) === recordNumber);
  }
  if (engIndex === -1) {
    const targetIdx = engEqIdIdx !== -1 ? engEqIdIdx : 3; // fallback to D
    engIndex = engDataRows.findIndex((row: any[]) => {
      if (row.length > targetIdx) {
        return cleanStr(row[targetIdx]).toLowerCase() === searchId;
      }
      return false;
    });
  }

  // Find index in Visual & Thermal Images
  let visIndex = -1;
  if (recordNumber) {
    visIndex = visDataRows.findIndex((row: any[]) => parseInt(row[0]) === recordNumber);
  }
  if (visIndex === -1) {
    const targetIdx = visEqIdIdx !== -1 ? visEqIdIdx : 3; // fallback to D
    visIndex = visDataRows.findIndex((row: any[]) => {
      if (row.length > targetIdx) {
        return cleanStr(row[targetIdx]).toLowerCase() === searchId;
      }
      return false;
    });
  }

  return {
    genRowIndex: genIndex !== -1 ? genIndex + 2 : -1,
    engRowIndex: engIndex !== -1 ? engIndex + 2 : -1,
    visRowIndex: visIndex !== -1 ? visIndex + 2 : -1
  };
}

/**
 * Scans an existing Google Sheet file and converts any unformatted or ISO UTC timestamps
 * across all sheets into Bangkok, Hanoi, Jakarta (UTC+7) timezone format ("YYYY-MM-DD HH:mm:ss").
 * Performs batch updates to update the spreadsheet in place.
 */
export async function convertExistingSheetTimestampsToUTC7(accessToken: string, spreadsheetId: string): Promise<number> {
  if (!accessToken || !spreadsheetId) return 0;
  let convertedCount = 0;
  const sheetsToProcess = [
    'General Information',
    'Engineering Information',
    'Visual & Thermal Images'
  ];

  try {
    const ranges = sheetsToProcess.map(s => `'${s}'!A1:B`);
    const res = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) return 0;
    const data = await res.json();
    const valueRanges = data.valueRanges || [];
    const updates: { range: string; values: any[][] }[] = [];

    valueRanges.forEach((rangeData: any, idx: number) => {
      const sheetName = sheetsToProcess[idx];
      const rows: any[][] = rangeData.values || [];
      if (rows.length <= 1) return; // Only header row or empty

      const headers = rows[0] || [];
      let tsColIdx = headers.findIndex((h: string) => {
        const norm = normalizeHeader(h);
        return norm === 'timestamp' || norm === 'date' || norm === 'time';
      });
      if (tsColIdx === -1) tsColIdx = 1; // Fallback to Column B

      const getColLetter = (colIdx: number) => String.fromCharCode(65 + colIdx);
      const colLetter = getColLetter(tsColIdx);

      rows.slice(1).forEach((row: any[], rowIdx: number) => {
        const currentTs = row[tsColIdx] ? String(row[tsColIdx]).trim() : '';
        if (currentTs) {
          const convertedTs = getBangkokTimestamp(currentTs);
          // If the timestamp changed (e.g. from ISO UTC string to Bangkok UTC+7 string), stage for batch update
          if (convertedTs !== currentTs) {
            const actualRowNumber = rowIdx + 2;
            updates.push({
              range: `'${sheetName}'!${colLetter}${actualRowNumber}`,
              values: [[convertedTs]]
            });
            convertedCount++;
          }
        }
      });
    });

    if (updates.length > 0) {
      await batchUpdateSheetRows(accessToken, spreadsheetId, updates);
      console.log(`Converted ${convertedCount} timestamp(s) in spreadsheet ${spreadsheetId} to Bangkok (UTC+7) time.`);
    }
  } catch (err) {
    console.warn("Error converting existing spreadsheet timestamps to UTC+7:", err);
  }

  return convertedCount;
}

/**
 * Scans an existing Google Sheet file and migrates all equipment IDs
 * across all 3 sheets ('General Information', 'Engineering Information', 'Visual & Thermal Images')
/**
 * Migrates Equipment IDs (Column AG / column index 32) in a given Google Sheet
 * to strictly conform to the latest PEA Equipment ID format:
 * "{AREA}-{VOLTAGE}{LOC_TYPE}{EQ_TYPE}-{YEAR}-{CITY_ABBR}#{RUNNING_NO}-{PEA_6DIGITS}"
 * (e.g., "C1-115TLTM-2020-AYU#00001-550009")
 */
export async function migrateExistingSheetEquipmentIds(
  accessToken: string,
  spreadsheetId: string,
  explicitArea?: string
): Promise<{ updatedCount: number; areaCode: string }> {
  if (!accessToken || !spreadsheetId) return { updatedCount: 0, areaCode: '' };
  let updatedCount = 0;
  let areaCode = (explicitArea || '').trim().toUpperCase();

  try {
    let title = '';
    try {
      const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        title = meta.properties?.title || '';
        if (!areaCode) {
          const match = title.match(/PEA\s+Cable\s+Asset\s+Database\s*[-_]?\s*(Area\s+)?([A-Za-z0-9]+)/i) ||
                        title.match(/([A-Z]{1,2}\d{1})/i);
          if (match) {
            const found = (match[2] || match[1] || '').trim().toUpperCase();
            if (PEA_AREAS.includes(found as any)) {
              areaCode = found;
            }
          }
        }
      }
    } catch (err) {
      console.warn("Title fetch failed for migration area code:", err);
    }

    const ranges = [
      "'General Information'!A1:AZ",
      "'Engineering Information'!A1:AZ",
      "'Visual & Thermal Images'!A1:AZ"
    ];

    const res = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) return { updatedCount: 0, areaCode };
    const data = await res.json();
    const valueRanges = data.valueRanges || [];

    const genRows = valueRanges[0]?.values || [];
    const engRows = valueRanges[1]?.values || [];
    const visRows = valueRanges[2]?.values || [];

    if (genRows.length <= 1) return { updatedCount: 0, areaCode };

    const genHeaders = genRows[0] || [];
    const engHeaders = engRows[0] || [];
    const visHeaders = visRows[0] || [];

    const cleanStr = (val: any) => (val === undefined || val === null) ? '' : String(val).trim();

    const findColIdx = (headers: string[], names: string[], fallbackIdx: number) => {
      const idx = headers.findIndex((h: string) => {
        const norm = normalizeHeader(h);
        return names.includes(norm);
      });
      return idx !== -1 ? idx : fallbackIdx;
    };

    const genEqIdIdx = findColIdx(genHeaders, ['equipmentid'], 32);
    const engEqIdIdx = findColIdx(engHeaders, ['equipmentid'], 3);
    const visEqIdIdx = findColIdx(visHeaders, ['equipmentid'], 3);

    const voltageIdx = findColIdx(genHeaders, ['voltagelevelkv', 'voltagelevel', 'voltage'], 3);
    const cityIdx = findColIdx(genHeaders, ['city', 'province'], 4);
    const eqTypeIdx = findColIdx(genHeaders, ['equipmenttype'], 5);
    const locTypeIdx = findColIdx(genHeaders, ['locationtype'], 8);
    const yearIdx = findColIdx(genHeaders, ['yearofregistration', 'registrationyear'], 12);
    const peaIdx = findColIdx(genHeaders, ['peanumberid', 'peanumber'], 13);

    // If areaCode is still empty, deduce from city in first valid row
    if (!areaCode) {
      for (const row of genRows.slice(1)) {
        const c = cityIdx < row.length ? cleanStr(row[cityIdx]) : '';
        const deduced = getAreaFromCity(c);
        if (deduced) {
          areaCode = deduced;
          break;
        }
      }
    }
    if (!areaCode || areaCode === 'ALL') areaCode = 'S2';

    const eqIdMap: Record<string, string> = {};
    const cityCounters: Record<string, number> = {};

    genRows.slice(1).forEach((row: any[]) => {
      let oldEqId = genEqIdIdx < row.length ? cleanStr(row[genEqIdIdx]) : '';
      if (!oldEqId && row.length > 31) oldEqId = cleanStr(row[31]);
      if (!oldEqId && row.length > 15) oldEqId = cleanStr(row[15]);

      const voltage = voltageIdx < row.length ? cleanStr(row[voltageIdx]) : '115';
      const city = cityIdx < row.length ? cleanStr(row[cityIdx]) : 'Trat';
      const eqType = eqTypeIdx < row.length ? cleanStr(row[eqTypeIdx]) : 'Underground Cable';
      const locType = locTypeIdx < row.length ? cleanStr(row[locTypeIdx]) : 'Transmission line';
      const year = yearIdx < row.length ? cleanStr(row[yearIdx]) : '2020';
      const peaNumber = peaIdx < row.length ? cleanStr(row[peaIdx]) : '';

      const cityAbbr = getCityAbbreviation(city);

      // Deduce row-specific area code if city explicitly maps to another area
      const rowArea = getAreaFromCity(city) || areaCode;

      cityCounters[cityAbbr] = (cityCounters[cityAbbr] || 0) + 1;
      const cityIndex = cityCounters[cityAbbr];

      const newEqId = generateEquipmentId({
        area: rowArea,
        voltage,
        year,
        locationType: locType,
        equipmentType: eqType,
        city,
        cityIndex,
        peaNumber
      });

      let key = oldEqId;
      if (!key) {
        key = `${city}_${eqType}_${peaNumber || row[0]}`;
      }

      eqIdMap[key] = newEqId;
      if (oldEqId) {
        eqIdMap[oldEqId] = newEqId;
      }
    });

    const getColLetter = (colIdx: number) => {
      if (colIdx < 26) return String.fromCharCode(65 + colIdx);
      const first = String.fromCharCode(65 + Math.floor(colIdx / 26) - 1);
      const second = String.fromCharCode(65 + (colIdx % 26));
      return `${first}${second}`;
    };

    const updates: { range: string; values: any[][] }[] = [];

    // Ensure Column AG header is set to "Equipment ID"
    if (!genHeaders[genEqIdIdx] || normalizeHeader(genHeaders[genEqIdIdx]) !== 'equipmentid') {
      const letter = getColLetter(genEqIdIdx);
      updates.push({
        range: `'General Information'!${letter}1`,
        values: [['Equipment ID']]
      });
    }

    // 1. General Information updates
    const genLetter = getColLetter(genEqIdIdx);
    genRows.slice(1).forEach((row: any[], rIdx: number) => {
      const rowNum = rIdx + 2;
      let oldEqId = genEqIdIdx < row.length ? cleanStr(row[genEqIdIdx]) : '';
      if (!oldEqId && row.length > 31) oldEqId = cleanStr(row[31]);
      if (!oldEqId && row.length > 15) oldEqId = cleanStr(row[15]);

      const city = cityIdx < row.length ? cleanStr(row[cityIdx]) : 'Trat';
      const eqType = eqTypeIdx < row.length ? cleanStr(row[eqTypeIdx]) : 'Underground Cable';
      const peaNumber = peaIdx < row.length ? cleanStr(row[peaIdx]) : '';

      let key = oldEqId;
      if (!key) key = `${city}_${eqType}_${peaNumber || row[0]}`;

      const targetEqId = eqIdMap[key] || eqIdMap[oldEqId];
      if (targetEqId && oldEqId !== targetEqId) {
        updates.push({
          range: `'General Information'!${genLetter}${rowNum}`,
          values: [[targetEqId]]
        });
        updatedCount++;
      }
    });

    // 2. Engineering Information updates
    const engLetter = getColLetter(engEqIdIdx);
    engRows.slice(1).forEach((row: any[], rIdx: number) => {
      const rowNum = rIdx + 2;
      const oldEqId = engEqIdIdx < row.length ? cleanStr(row[engEqIdIdx]) : (row.length > 3 ? cleanStr(row[3]) : '');
      const targetEqId = eqIdMap[oldEqId];
      if (targetEqId && oldEqId !== targetEqId) {
        updates.push({
          range: `'Engineering Information'!${engLetter}${rowNum}`,
          values: [[targetEqId]]
        });
        updatedCount++;
      }
    });

    // 3. Visual & Thermal Images updates
    const visLetter = getColLetter(visEqIdIdx);
    visRows.slice(1).forEach((row: any[], rIdx: number) => {
      const rowNum = rIdx + 2;
      const oldEqId = visEqIdIdx < row.length ? cleanStr(row[visEqIdIdx]) : (row.length > 3 ? cleanStr(row[3]) : '');
      const targetEqId = eqIdMap[oldEqId];
      if (targetEqId && oldEqId !== targetEqId) {
        updates.push({
          range: `'Visual & Thermal Images'!${visLetter}${rowNum}`,
          values: [[targetEqId]]
        });
        updatedCount++;
      }
    });

    if (updates.length > 0) {
      await batchUpdateSheetRows(accessToken, spreadsheetId, updates);
      console.log(`[Equipment ID Migration] Updated ${updatedCount} cell(s) in spreadsheet ${spreadsheetId} (${areaCode}).`);
    }
  } catch (err) {
    console.warn("Error migrating spreadsheet equipment IDs:", err);
  }

  return { updatedCount, areaCode };
}

/**
 * Scans ALL 12 PEA Google Sheet files in Google Drive, checks column AG "Equipment ID"
 * on General Information (and corresponding Equipment IDs on Engineering Information and Visual Images),
 * verifies whether Equipment IDs match the area rules, and updates all mismatched Equipment IDs.
 */
export async function migrateAll12GoogleSheetsEquipmentIds(accessToken: string): Promise<{
  totalSpreadsheets: number;
  totalUpdates: number;
  areaBreakdown: Record<string, number>;
}> {
  if (!accessToken) return { totalSpreadsheets: 0, totalUpdates: 0, areaBreakdown: {} };

  console.log("Starting batch Equipment ID migration across all 12 PEA Google Sheets...");

  const masterMap = await getMasterSpreadsheetsMap(accessToken);
  const spreadsheetsByArea = masterMap.spreadsheets || {};

  let totalUpdates = 0;
  let totalSpreadsheets = 0;
  const areaBreakdown: Record<string, number> = {};

  // Process all mapped area spreadsheets
  for (const [area, spreadsheetId] of Object.entries(spreadsheetsByArea)) {
    if (!spreadsheetId) continue;
    try {
      const result = await migrateExistingSheetEquipmentIds(accessToken, spreadsheetId, area);
      totalSpreadsheets++;
      totalUpdates += result.updatedCount;
      if (result.updatedCount > 0) {
        areaBreakdown[area] = (areaBreakdown[area] || 0) + result.updatedCount;
      }
    } catch (err) {
      console.warn(`Error migrating Equipment IDs for Area ${area} (${spreadsheetId}):`, err);
    }
  }

  // Also search Drive for any other sheets containing "PEA Cable Asset Database"
  try {
    const list = await listSpreadsheets(accessToken);
    for (const file of list) {
      const alreadyProcessed = Object.values(spreadsheetsByArea).includes(file.id);
      if (!alreadyProcessed) {
        const match = file.name.match(/PEA\s+Cable\s+Asset\s+Database\s*[-_]?\s*(Area\s+)?([A-Za-z0-9]+)/i);
        const areaStr = match ? match[2] || match[1] : '';
        const result = await migrateExistingSheetEquipmentIds(accessToken, file.id, areaStr);
        totalSpreadsheets++;
        totalUpdates += result.updatedCount;
        if (result.areaCode && result.updatedCount > 0) {
          areaBreakdown[result.areaCode] = (areaBreakdown[result.areaCode] || 0) + result.updatedCount;
        }
      }
    }
  } catch (err) {
    console.warn("Drive search for remaining spreadsheets failed:", err);
  }

  console.log(`[Batch Equipment ID Migration Completed] Checked ${totalSpreadsheets} spreadsheets, updated ${totalUpdates} cell(s). Breakdown:`, areaBreakdown);

  return {
    totalSpreadsheets,
    totalUpdates,
    areaBreakdown
  };
}


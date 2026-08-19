import { CableAsset, GeneralInformation, EngineeringInformation, VisualInformation, PDDiagnosticInformation, EquipmentType, LocationType, PDResultType, TanDeltaResult } from '../types';
import { calculateHealth, generateEquipmentId, getEquipmentConditionPrefix, getCityAbbreviation, getLocationTypeAbbreviation, getEquipmentTypeAbbreviation2, getVoltageCode, getPea6Digits, getAreaFromCity, PEA_AREAS, PEA_AREA_NAMES, getCityGpsCenter } from './peaData';
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
      { properties: { title: 'Visual & Thermal Images' } },
      { properties: { title: 'PD & Diagnostic Data' } }
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
      },
      {
        range: "'PD & Diagnostic Data'!A1:AA1",
        values: [[
          'Number', 'Timestamp', 'Name of user or admin', 'Equipment ID', 'PEA Number (ID)',
          'Voltage Level (kV)', 'City', 'Equipment type', 'Location type', 'Substation',
          'Online PRPD Picture URL', 'Online PRPD Phase', 'Online PD Amplitude (mV / pC)',
          'Online PD Pulse Rate (pps)', 'Online PD Phase Range', 'Online PD Defect Classification', 'Online PD Severity',
          'Offline PDF Report URL', 'Offline PDF Report Name', 'Offline Test Voltage (kV)',
          'Offline Max Discharge Qmax (nC)', 'Offline TDR Defect Location (m)', 'Offline Inception Voltage (kV)',
          'Offline Defect Classification', 'Offline IEEE 400.2 Status', '3x3 Failure Risk Level', 'Diagnostic & Maintenance Summary'
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
      },
      {
        range: "'PD & Diagnostic Data'!A2:AA3",
        values: [
          [
            1, '2026-07-15 10:30:00', 'Somsak PEA', 'N1-115kV-2018-UND-PEA-N1-UG01', 'PEA-N1-UG01',
            '115', 'Chiang Mai', 'Underground Cable', 'Transmission Line', 'Chiang Mai 2 Substation',
            'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600', 'Phase A', '14.5',
            '185', '90°-135°', 'Internal Void', 'Advisory',
            'https://drive.google.com/file/d/sample_vlf_report/view', 'VLF_ChiangMai2_Span01.pdf', '6.4 kV (U0)',
            '1.2', '20.32m (Section Joint)', '6.4', 'Bad Contacts', 'Pass / Normal Monitoring', 'Low',
            'Online PRPD shows stable internal void baseline. Offline VLF PD shows minor localized discharge at 20.32m within safe IEEE thresholds.'
          ],
          [
            2, '2026-07-16 11:24:00', 'Somsak PEA', 'N1-115kV-2018-TER-PEA-N1-TR01', 'PEA-N1-TR01',
            '115', 'Chiang Mai', 'Termination', 'Substation', 'Chiang Mai 2 Substation',
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600', '3-Phase', '812.8',
            '263', '85°-145° / 265°-325°', 'Surface Tracking / Bad Contacts', 'Critical',
            'https://drive.google.com/file/d/sample_vlf_report2/view', 'VLF_Termination_Bay04_Report.pdf', '12.8 kV (2.0xU0)',
            '3.6', '80.0m (Far Termination Joint)', '6.4', 'Surface Discharges', 'Immediate Action Required', 'High / Red Zone',
            'Severe phase-resolved discharge clusters at 85°-145° and 265°-325°. Offline VLF TDR isolates major surface tracking at 80.0m far termination.'
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
export async function uploadFileToDrive(accessToken: string, folderId: string, file: File): Promise<string> {
  if (!accessToken || !file) {
    throw new Error('Missing access token or file');
  }

  const cleanFolderId = folderId ? String(folderId).trim() : '';
  const metadata: any = {
    name: `${Date.now()}_${file.name}`,
    mimeType: file.type || 'application/octet-stream'
  };

  if (cleanFolderId) {
    metadata.parents = [cleanFolderId];
  }

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  let res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  // If upload to specific parent folder failed (e.g. 404 folder not found or 403 access forbidden), retry uploading to Google Drive root
  if (!res.ok && metadata.parents) {
    console.warn(`Drive upload to parent folder '${cleanFolderId}' failed with HTTP ${res.status}. Retrying upload to Google Drive root...`);
    delete metadata.parents;
    const retryFormData = new FormData();
    retryFormData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    retryFormData.append('file', file);

    res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: retryFormData
    });
  }

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Google Drive upload failed (${res.status}):`, errorBody);

    // Fallback for image files: convert to Base64 Data URL so user picture upload never breaks asset saving
    if (file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)) {
      console.warn("Converting image to Base64 Data URL fallback after Drive HTTP upload failure.");
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }

    throw new Error(`Failed to upload file to Google Drive (${res.status}): ${res.statusText || errorBody || 'Upload HTTP error'}`);
  }

  const data = await res.json();
  const fileId = data.id;

  // Set file permission to public readers
  try {
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
  } catch (e) {
    console.warn(`Could not set public permission on Drive file ${fileId}:`, e);
  }

  // If PDF, provide direct Drive view link
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  }

  // Use standard direct hotlink URL for Google Drive images
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
}

// Upload file to specific Google Drive Folder (Alias for backwards compatibility)
export async function uploadImageToDrive(accessToken: string, folderId: string, file: File): Promise<string> {
  return uploadFileToDrive(accessToken, folderId, file);
}

export const PD_DIAGNOSTIC_HEADERS = [
  'Number', 'Timestamp', 'Name of user or admin', 'Equipment ID', 'PEA Number (ID)',
  'Voltage Level (kV)', 'City', 'Equipment type', 'Location type', 'Substation',
  'Online PRPD Picture URL', 'Online PRPD Phase', 'Online PD Amplitude (mV / pC)',
  'Online PD Pulse Rate (pps)', 'Online PD Phase Range', 'Online PD Defect Classification', 'Online PD Severity',
  'Offline PDF Report URL', 'Offline PDF Report Name', 'Offline Test Voltage (kV)',
  'Offline Max Discharge Qmax (nC)', 'Offline TDR Defect Location (m)', 'Offline Inception Voltage (kV)',
  'Offline Defect Classification', 'Offline IEEE 400.2 Status', '3x3 Failure Risk Level', 'Diagnostic & Maintenance Summary'
];

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
    if (norm === 'qrdocument' || norm === 'qrdocumenturl' || norm === 'qrdocumentlink') return data.qrDocument ?? defaultValues[idx] ?? '';
    
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

    // Online PRPD & Offline PD Diagnostics
    if (norm === 'onlineprpdpictururl' || norm === 'onlineprpdpictureurl' || norm === 'onlineprpdimageurl') return data.onlinePrpdImageUrl ?? defaultValues[idx] ?? '';
    if (norm === 'onlineprpdphase') return data.onlinePrpdPhase ?? defaultValues[idx] ?? '';
    if (norm === 'onlinepdamplitudemvpc' || norm === 'onlinepdamplitude') return data.onlinePrpdAmplitude ?? defaultValues[idx] ?? '';
    if (norm === 'onlinepdpulseratepps' || norm === 'onlinepdrepetitionrate' || norm === 'onlinepdpulserate') return data.onlinePrpdRepetitionRate ?? defaultValues[idx] ?? '';
    if (norm === 'onlinepdphaserange') return data.onlinePrpdPhaseRange ?? defaultValues[idx] ?? '';
    if (norm === 'onlinepddefectclassification' || norm === 'onlinepddefecttype') return data.onlinePrpdDefectType ?? defaultValues[idx] ?? '';
    if (norm === 'onlinepdseverity') return data.onlinePrpdSeverity ?? defaultValues[idx] ?? '';

    if (norm === 'offlinepdfreporturl' || norm === 'offlinetestresultpdfreporturl' || norm === 'offlinereporturl') return data.offlinePdfReportUrl ?? defaultValues[idx] ?? '';
    if (norm === 'offlinepdfreportname' || norm === 'offlinereportname') return data.offlinePdfReportName ?? defaultValues[idx] ?? '';
    if (norm === 'offlinetestvoltagekv' || norm === 'offlinetestvoltage') return data.offlineTestVoltage ?? defaultValues[idx] ?? '';
    if (norm === 'offlinemaxdischargeqmaxnc' || norm === 'offlinemaxdischarge') return data.offlineMaxDischarge ?? defaultValues[idx] ?? '';
    if (norm === 'offlinetdrdefectlocationm' || norm === 'offlinedefectlocation') return data.offlineDefectLocation ?? defaultValues[idx] ?? '';
    if (norm === 'offlineinceptionvoltagekv' || norm === 'offlineinceptionvoltage') return data.offlineInceptionVoltage ?? defaultValues[idx] ?? '';
    if (norm === 'offlinedefectclassification') return data.offlineDefectClassification ?? defaultValues[idx] ?? '';
    if (norm === 'offlineieee4002status' || norm === 'offlineieeeverdict') return data.offlineIeeeVerdict ?? defaultValues[idx] ?? '';
    if (norm === '3x3failurerisklevel' || norm === 'offlinerisklevel' || norm === 'risklevel') return data.offlineRiskLevel ?? defaultValues[idx] ?? '';
    if (norm === 'diagnosticmaintenancesummary' || norm === 'diagnosticsummary') return data.diagnosticSummary ?? defaultValues[idx] ?? '';

    // Custom properties / newly added columns
    if (data.customFields && data.customFields[header]) return data.customFields[header];
    if (data.customFields && data.customFields[norm]) return data.customFields[norm];
    if (data[header] !== undefined) return data[header];
    if (data[norm] !== undefined) return data[norm];

    return defaultValues[idx] ?? '';
  });
}

export async function fetchWithRetry(url: string, options: RequestInit, retries = 4, initialDelayMs = 1500): Promise<Response> {
  let delay = initialDelayMs;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      console.warn(`Google API rate limit (429) encountered. Retrying after ${delay}ms... (Attempt ${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2.5;
      continue;
    }
    return res;
  }
  return fetch(url, options);
}

// RFC-4180 Compliant CSV parser that handles quotes and embedded commas correctly
export function parseCSVRows(csvText: string): string[][] {
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
      if (currentRow.some(c => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
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

// Fetch single sheet tab as CSV directly from Google Sheets (Client-side)
export async function fetchSheetCsvTabClient(spreadsheetId: string, tabNames: string[]): Promise<string[][]> {
  for (const tab of tabNames) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
      const resp = await fetch(url);
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

// Fetch all sheets from the spreadsheet, join columns and output parsed CableAsset array
export async function fetchSheetsData(accessToken: string | null, spreadsheetId: string, runMaintenance = false): Promise<CableAsset[]> {
  // Determine if this spreadsheet is targeted to a specific PEA area via its title and inspect its sheet tabs
  let allowedArea: string | null = null;
  let sheetsMeta: any[] = [];
  let valueRanges: any[] = [];
  let genRows: any[][] = [];
  let engRows: any[][] = [];
  let visRows: any[][] = [];
  let pdRows: any[][] = [];

  if (accessToken) {
    try {
      const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        sheetsMeta = meta.sheets || [];
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

    // Find actual tab names present in this spreadsheet to prevent HTTP 400 'Unable to parse range' on missing tabs
    const genSheet = sheetsMeta.find((s: any) => /general/i.test(s.properties?.title || '')) || sheetsMeta[0];
    const engSheet = sheetsMeta.find((s: any) => /engineering/i.test(s.properties?.title || '')) || (sheetsMeta.length > 1 ? sheetsMeta[1] : null);
    const visSheet = sheetsMeta.find((s: any) => /(visual|thermal|image)/i.test(s.properties?.title || '')) || (sheetsMeta.length > 2 ? sheetsMeta[2] : null);
    const pdSheet = sheetsMeta.find((s: any) => /(pd|diagnostic)/i.test(s.properties?.title || ''));

    const rangesToFetch: string[] = [];
    const rangeIndexMap: { gen?: number; eng?: number; vis?: number; pd?: number } = {};

    if (genSheet?.properties?.title) {
      rangeIndexMap.gen = rangesToFetch.length;
      rangesToFetch.push(`'${genSheet.properties.title}'!A1:AZ`);
    } else {
      rangeIndexMap.gen = rangesToFetch.length;
      rangesToFetch.push("'General Information'!A1:AZ");
    }

    if (engSheet?.properties?.title) {
      rangeIndexMap.eng = rangesToFetch.length;
      rangesToFetch.push(`'${engSheet.properties.title}'!A1:AZ`);
    }

    if (visSheet?.properties?.title) {
      rangeIndexMap.vis = rangesToFetch.length;
      rangesToFetch.push(`'${visSheet.properties.title}'!A1:AZ`);
    }

    if (pdSheet?.properties?.title) {
      rangeIndexMap.pd = rangesToFetch.length;
      rangesToFetch.push(`'${pdSheet.properties.title}'!A1:AZ`);
    }

    try {
      const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesToFetch.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        valueRanges = data.valueRanges || [];
        genRows = rangeIndexMap.gen !== undefined ? (valueRanges[rangeIndexMap.gen]?.values || []) : [];
        engRows = rangeIndexMap.eng !== undefined ? (valueRanges[rangeIndexMap.eng]?.values || []) : [];
        visRows = rangeIndexMap.vis !== undefined ? (valueRanges[rangeIndexMap.vis]?.values || []) : [];
        pdRows = rangeIndexMap.pd !== undefined ? (valueRanges[rangeIndexMap.pd]?.values || []) : [];
      }
    } catch (apiErr) {
      console.warn("Google Sheets API batchGet error, falling back to proxy:", apiErr);
    }
  }

  // Fallback to backend Sheets proxy when accessToken is null or direct API failed
  if (genRows.length === 0) {
    try {
      const proxyRes = await fetch(`/api/sheets/data?spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.valueRanges && Array.isArray(proxyData.valueRanges)) {
          genRows = proxyData.valueRanges[0]?.values || [];
          engRows = proxyData.valueRanges[1]?.values || [];
          visRows = proxyData.valueRanges[2]?.values || [];
          pdRows = proxyData.valueRanges[3]?.values || [];
        }
      }
    } catch (proxyErr) {
      console.warn("Proxy sheet fetch failed:", proxyErr);
    }
  }

  // Fallback to direct client-side GViz CSV fetch across all 4 tabs if backend proxy was unavailable (e.g. on Vercel)
  if (genRows.length === 0) {
    try {
      const [csvGen, csvEng, csvVis, csvPd] = await Promise.all([
        fetchSheetCsvTabClient(spreadsheetId, ['General Information', 'General', 'Sheet1']),
        fetchSheetCsvTabClient(spreadsheetId, ['Engineering Information', 'Engineering', 'Sheet2']),
        fetchSheetCsvTabClient(spreadsheetId, ['Visual & Thermal Images', 'Visual & Thermal', 'Visual Images', 'Sheet3']),
        fetchSheetCsvTabClient(spreadsheetId, ['PD & Diagnostic Data', 'PD & Diagnostic', 'PD Data', 'Sheet4'])
      ]);
      genRows = csvGen;
      engRows = csvEng;
      visRows = csvVis;
      pdRows = csvPd;
    } catch (gvizErr) {
      console.warn("Direct GViz CSV fetch failed:", gvizErr);
    }
  }

  if (genRows.length === 0) {
    return [];
  }

  // Trigger background maintenance only if explicitly requested and token is present
  if (runMaintenance && accessToken) {
    convertExistingSheetTimestampsToUTC7(accessToken, spreadsheetId).catch(() => {});
    migrateExistingSheetEquipmentIds(accessToken, spreadsheetId).catch(() => {});
  }

  const genHeaders = genRows[0] || [];
  const engHeaders = engRows[0] || [];
  const visHeaders = visRows[0] || [];
  const pdHeaders = pdRows[0] || [];

  const genDataRows = genRows.slice(1);
  const engDataRows = engRows.slice(1);
  const visDataRows = visRows.slice(1);
  const pdDataRows = pdRows.slice(1);

  const cleanStr = (val: any) => (val === undefined || val === null) ? '' : String(val).trim();

  const fixDriveUrl = (url: string) => {
    if (!url) return url;
    if (url.includes('drive.google.com/uc?export=view&id=')) {
      return url.replace('uc?export=view&id=', 'thumbnail?id=') + '&sz=w1000';
    }
    return url;
  };

  // Filter to valid non-blank rows
  const isValidRow = (r: any[]) => r && r.length > 0 && r.some((cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== '');
  const validGenDataRows = genDataRows.filter(isValidRow);

  // Parse Page 1: General Information (Dynamic & Header-driven)
  const generals: GeneralInformation[] = validGenDataRows.map((row: any[], index: number) => {
    const getVal = (headerName: string) => {
      const target = normalizeHeader(headerName);
      const idx = genHeaders.findIndex((h: string) => {
        const n = normalizeHeader(h);
        return n === target || n.startsWith(target) || n.includes(target);
      });
      return idx !== -1 && idx < row.length ? cleanStr(row[idx]) : '';
    };

    const city = getVal('city') || getVal('province');
    const defaultArea = getAreaFromCity(city) || 'C1';

    // Column L (12th column, index 11) is GPS (Latitude, Longitude) in the standard Google Sheet template
    let gpsString = '';
    if (row.length > 11 && row[11] && cleanStr(row[11])) {
      const rawColL = cleanStr(row[11]);
      if (/[\d.]+[,\s]+[\d.]+/.test(rawColL)) {
        gpsString = rawColL;
      }
    }
    if (!gpsString) {
      const gpsHeaderIdx = genHeaders.findIndex((h: string) => {
        const n = normalizeHeader(h);
        return n === 'gps' || n === 'coordinates' || n.includes('gps') || n.includes('coordinate') || n.includes('latlng');
      });
      if (gpsHeaderIdx !== -1 && gpsHeaderIdx < row.length) {
        gpsString = cleanStr(row[gpsHeaderIdx]);
      }
    }
    if (!gpsString) {
      gpsString = getVal('gps') || getVal('coordinates') || '';
    }

    let lat = 0;
    let lng = 0;
    if (gpsString) {
      const parts = gpsString.split(/[,\s]+/).map((c: string) => parseFloat(c.trim())).filter((n: number) => !isNaN(n));
      if (parts.length >= 2 && (parts[0] !== 0 || parts[1] !== 0)) {
        lat = parts[0];
        lng = parts[1];
      }
    }

    if (lat === 0 && lng === 0) {
      const center = getCityGpsCenter(city, defaultArea);
      lat = center.lat;
      lng = center.lng;
    }

    const number = parseInt(getVal('number') || getVal('no')) || (index + 1);
    const rawTs = getVal('timestamp') || getVal('date') || getVal('time');
    const timestamp = rawTs ? getBangkokTimestamp(rawTs) : getBangkokTimestamp();
    const operatorName = getVal('nameofuseroradmin') || getVal('operatorname') || getVal('operator');
    const voltageLevel = getVal('voltagelevelkv') || getVal('voltagelevel') || getVal('voltage');
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
    const qrDocument = getVal('qrdocument') || getVal('qrdocumenturl') || getVal('qrdocumentlink') || (row.length > 33 ? cleanStr(row[33]) : '');

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
      'workorder', 'size', 'assetvalue', 'value', 'equipmentid', 'qrdocument', 'qrdocumenturl', 'qrdocumentlink'
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
      qrDocument,
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

  // Parse Page 4: PD & Diagnostic Data (Dynamic & Header-driven)
  const pdDiagnostics: Record<string, PDDiagnosticInformation> = {};
  pdDataRows.forEach((row: any[], index: number) => {
    const getVal = (headerName: string) => {
      const idx = pdHeaders.findIndex((h: string) => normalizeHeader(h) === normalizeHeader(headerName));
      return idx !== -1 && idx < row.length ? cleanStr(row[idx]) : '';
    };

    let eqId = getVal('equipmentid');
    if (!eqId) {
      eqId = cleanStr(row[3]);
    }
    if (!eqId) return;

    const pdRawTs = getVal('timestamp') || cleanStr(row[1]);
    const onlinePrpdAmplitudeVal = parseFloat(getVal('onlinepdamplitudemvpc') || getVal('onlinepdamplitude') || cleanStr(row[12]));
    const onlinePrpdRepetitionRateVal = parseFloat(getVal('onlinepdpulseratepps') || getVal('onlinepdrepetitionrate') || getVal('onlinepdpulserate') || cleanStr(row[13]));
    const offlineMaxDischargeVal = parseFloat(getVal('offlinemaxdischargeqmaxnc') || getVal('offlinemaxdischarge') || cleanStr(row[20]));
    const offlineInceptionVoltageVal = parseFloat(getVal('offlineinceptionvoltagekv') || getVal('offlineinceptionvoltage') || cleanStr(row[22]));

    pdDiagnostics[eqId] = {
      number: parseInt(getVal('number') || getVal('no')) || (index + 1),
      timestamp: pdRawTs ? getBangkokTimestamp(pdRawTs) : getBangkokTimestamp(),
      operatorName: getVal('nameofuseroradmin') || getVal('operatorname') || getVal('operator') || cleanStr(row[2]),
      equipmentId: eqId,
      peaNumber: getVal('peanumberid') || getVal('peanumber') || cleanStr(row[4]),
      voltageLevel: getVal('voltagelevelkv') || getVal('voltagelevel') || cleanStr(row[5]),
      city: getVal('city') || cleanStr(row[6]),
      equipmentType: getVal('equipmenttype') || cleanStr(row[7]),
      locationType: getVal('locationtype') || cleanStr(row[8]),
      substation: getVal('substation') || cleanStr(row[9]),
      onlinePrpdImageUrl: fixDriveUrl(getVal('onlineprpdpictururl') || getVal('onlineprpdpictureurl') || getVal('onlineprpdimageurl') || cleanStr(row[10])),
      onlinePrpdPhase: getVal('onlineprpdphase') || cleanStr(row[11]),
      onlinePrpdAmplitude: !isNaN(onlinePrpdAmplitudeVal) ? onlinePrpdAmplitudeVal : undefined,
      onlinePrpdRepetitionRate: !isNaN(onlinePrpdRepetitionRateVal) ? onlinePrpdRepetitionRateVal : undefined,
      onlinePrpdPhaseRange: getVal('onlinepdphaserange') || cleanStr(row[14]),
      onlinePrpdDefectType: getVal('onlinepddefectclassification') || getVal('onlinepddefecttype') || cleanStr(row[15]),
      onlinePrpdSeverity: (getVal('onlinepdseverity') || cleanStr(row[16])) as any,
      offlinePdfReportUrl: getVal('offlinepdfreporturl') || getVal('offlinetestresultpdfreporturl') || cleanStr(row[17]),
      offlinePdfReportName: getVal('offlinepdfreportname') || getVal('offlinereportname') || cleanStr(row[18]),
      offlineTestVoltage: getVal('offlinetestvoltagekv') || getVal('offlinetestvoltage') || cleanStr(row[19]),
      offlineMaxDischarge: !isNaN(offlineMaxDischargeVal) ? offlineMaxDischargeVal : undefined,
      offlineDefectLocation: getVal('offlinetdrdefectlocationm') || getVal('offlinedefectlocation') || cleanStr(row[21]),
      offlineInceptionVoltage: !isNaN(offlineInceptionVoltageVal) ? offlineInceptionVoltageVal : undefined,
      offlineDefectClassification: getVal('offlinedefectclassification') || cleanStr(row[23]),
      offlineIeeeVerdict: getVal('offlineieee4002status') || getVal('offlineieeeverdict') || cleanStr(row[24]),
      offlineRiskLevel: (getVal('3x3failurerisklevel') || getVal('offlinerisklevel') || cleanStr(row[25])) as any,
      diagnosticSummary: getVal('diagnosticmaintenancesummary') || getVal('diagnosticsummary') || cleanStr(row[26])
    };
  });

  // Join them together and compute health index
  const results = generals.map(gen => {
    const eng = (engineerings[gen.equipmentId] || {}) as Partial<EngineeringInformation>;
    const vis = (visuals[gen.equipmentId] || {}) as Partial<VisualInformation>;
    const pd = (pdDiagnostics[gen.equipmentId] || {}) as Partial<PDDiagnosticInformation>;
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

    const pdMs = getMs(pd.timestamp || '');
    if (pdMs > maxMs) {
      latestBy = pd.operatorName || 'System';
      latestAt = pd.timestamp || '';
      maxMs = pdMs;
    }

    return {
      ...gen,
      ...eng,
      ...vis,
      ...pd,
      pdDiagnostics: Object.keys(pd).length > 0 ? (pd as PDDiagnosticInformation) : undefined,
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

  // Ensure each asset entry in General Information is preserved and assigned regional sector metadata
  const mappedResults: CableAsset[] = results.map((asset, idx) => {
    let assetArea = '';
    if (asset.equipmentId) {
      const parts = asset.equipmentId.split('-');
      if (parts.length > 0) {
        const candidate = parts[0].trim().toUpperCase();
        if (['N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3', 'NE1', 'NE2', 'NE3'].includes(candidate)) {
          assetArea = candidate;
        }
      }
    }
    if (!assetArea && asset.peaNumber) {
      const parts = asset.peaNumber.split('-');
      if (parts.length > 1) {
        const candidate = parts[1].trim().toUpperCase();
        if (['N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3', 'NE1', 'NE2', 'NE3'].includes(candidate)) {
          assetArea = candidate;
        }
      }
    }

    const finalArea = assetArea || allowedArea || asset.city || 'C1';

    return {
      ...asset,
      peaArea: finalArea,
      history: [asset]
    } as CableAsset;
  });

  return mappedResults;
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

  // Automatically sync and link Tab 4 Columns A-J from Tab 1 for this Google Sheet
  syncSingleSpreadsheetTab4FromTab1(accessToken, spreadsheetId).catch(err => {
    console.warn(`[Auto-Link Tab 4] Post-append sync notice for spreadsheet ${spreadsheetId}:`, err);
  });
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

  // Automatically sync and link Tab 4 Columns A-J from Tab 1 for this Google Sheet
  syncSingleSpreadsheetTab4FromTab1(accessToken, spreadsheetId).catch(err => {
    console.warn(`[Auto-Link Tab 4] Post-batch append sync notice for spreadsheet ${spreadsheetId}:`, err);
  });
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

// Ensure 'PD & Diagnostic Data' sheet exists on the spreadsheet, creating it, formatting headers, and backfilling rows if missing
export async function ensurePdDiagnosticsSheetExists(
  accessToken: string, 
  spreadsheetId: string, 
  autoBackfillExistingAssets: boolean = true
): Promise<{ created: boolean; backfilledCount: number }> {
  try {
    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) return { created: false, backfilledCount: 0 };
    const meta = await metaRes.json();
    const sheets = meta.sheets || [];
    let pdSheetObj = sheets.find((s: any) => {
      const title = (s.properties?.title || '').toLowerCase().trim();
      return title.includes('pd') && title.includes('diagnostic');
    });

    let isCreated = false;
    let pdSheetId = pdSheetObj?.properties?.sheetId;

    if (!pdSheetObj) {
      // 1. Add sheet tab
      const addSheetRes = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'PD & Diagnostic Data',
                  gridProperties: {
                    frozenRowCount: 1
                  }
                }
              }
            }
          ]
        })
      });

      if (!addSheetRes.ok) {
        console.warn(`Could not create PD & Diagnostic Data sheet on ${spreadsheetId}`);
        return { created: false, backfilledCount: 0 };
      }

      const addSheetData = await addSheetRes.json();
      pdSheetId = addSheetData.replies?.[0]?.addSheet?.properties?.sheetId;
      isCreated = true;

      // 2. Add Headers
      await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27PD%20%26%20Diagnostic%20Data%27%21A1:AA1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: "'PD & Diagnostic Data'!A1:AA1",
          majorDimension: 'ROWS',
          values: [PD_DIAGNOSTIC_HEADERS]
        })
      });

      // 3. Format header row: Purple header, bold white text, centered
      if (pdSheetId !== undefined) {
        await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: pdSheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: PD_DIAGNOSTIC_HEADERS.length
                  },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.23, green: 0.05, blue: 0.39 }, // Deep purple #3B0D63
                      textFormat: {
                        foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                        fontSize: 10,
                        bold: true
                      },
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE',
                      wrapStrategy: 'CLIP'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
                }
              },
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: pdSheetId,
                    gridProperties: {
                      frozenRowCount: 1
                    }
                  },
                  fields: 'gridProperties.frozenRowCount'
                }
              }
            ]
          })
        }).catch(err => console.warn("Could not format PD header row:", err));
      }
    }

    // Tab 4 is kept blank for user-registered assets (no simulated mock rows)
    return { created: isCreated, backfilledCount: 0 };
  } catch (err) {
    console.warn("Failed to ensure PD & Diagnostic Data sheet tab:", err);
    return { created: false, backfilledCount: 0 };
  }
}

// Clear all example/data rows from Tab 4 (PD & Diagnostic Data) in a spreadsheet, keeping only headers
export async function clearPdDiagnosticsSheetData(accessToken: string, spreadsheetId: string): Promise<boolean> {
  try {
    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) return false;
    const meta = await metaRes.json();
    const pdSheet = (meta.sheets || []).find((s: any) => {
      const title = (s.properties?.title || '').toLowerCase().trim();
      return title.includes('pd') && title.includes('diagnostic');
    });
    if (!pdSheet) return true; // Tab doesn't exist, nothing to clear

    const title = pdSheet.properties.title || 'PD & Diagnostic Data';
    // Clear data rows starting from row 2 downwards (A2:ZZ)
    const clearRes = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${title}'!A2:ZZ`)}:clear`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return clearRes.ok;
  } catch (e) {
    console.warn(`Could not clear PD Diagnostic sheet for spreadsheet ${spreadsheetId}:`, e);
    return false;
  }
}

// Synchronize Tab 4 ("PD & Diagnostic Data") Columns A through J using data in Tab 1 ("General Information") for a single spreadsheet
export async function syncSingleSpreadsheetTab4FromTab1(accessToken: string, spreadsheetId: string): Promise<{
  success: boolean;
  syncedRowsCount: number;
}> {
  if (!accessToken || !spreadsheetId) return { success: false, syncedRowsCount: 0 };

  try {
    // 1. Ensure Tab 4 exists with standard headers
    await ensurePdDiagnosticsSheetExists(accessToken, spreadsheetId, false);

    // 2. Fetch Tab 1 (General Information) and Tab 4 (PD & Diagnostic Data)
    const ranges = [
      "'General Information'!A1:AZ",
      "'PD & Diagnostic Data'!A1:AZ"
    ];

    const fetchRes = await fetchWithBackoff(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!fetchRes.ok) {
      console.warn(`Failed to fetch sheets for Tab 4 sync on spreadsheet ${spreadsheetId}`);
      return { success: false, syncedRowsCount: 0 };
    }

    const data = await fetchRes.json();
    const valueRanges = data.valueRanges || [];

    const genRows: any[][] = valueRanges[0]?.values || [];
    const pdRows: any[][] = valueRanges[1]?.values || [];

    if (genRows.length <= 1) {
      // Tab 1 has no data rows yet
      return { success: true, syncedRowsCount: 0 };
    }

    const genHeaders = genRows[0] || [];
    const genDataRows = genRows.slice(1);
    const pdHeaders = pdRows[0] || PD_DIAGNOSTIC_HEADERS;
    const pdDataRows = pdRows.slice(1);

    const cleanStr = (val: any) => (val === undefined || val === null) ? '' : String(val).trim();

    // Map existing diagnostic measurements from Tab 4 (Columns K through AA) by equipmentId
    const existingDiagMap: Record<string, string[]> = {};
    const getPdVal = (row: any[], headerName: string) => {
      const idx = pdHeaders.findIndex((h: string) => normalizeHeader(h) === normalizeHeader(headerName));
      return idx !== -1 && idx < row.length ? cleanStr(row[idx]) : '';
    };

    pdDataRows.forEach(row => {
      let eqId = getPdVal(row, 'equipmentid') || cleanStr(row[3]);
      if (!eqId) return;
      eqId = eqId.toLowerCase().trim();

      // Diagnostic columns start from column 10 (0-indexed: K=10, L=11, ... AA=26)
      const diagCols: string[] = [];
      for (let c = 10; c < PD_DIAGNOSTIC_HEADERS.length; c++) {
        diagCols.push(c < row.length ? cleanStr(row[c]) : '');
      }
      existingDiagMap[eqId] = diagCols;
    });

    // Extract helper for Tab 1
    const getGenVal = (row: any[], headerName: string) => {
      const idx = genHeaders.findIndex((h: string) => normalizeHeader(h) === normalizeHeader(headerName));
      return idx !== -1 && idx < row.length ? cleanStr(row[idx]) : '';
    };

    const newPdRows: any[][] = [];

    genDataRows.forEach((genRow: any[], index: number) => {
      // Check if row has any non-blank content
      const hasContent = genRow.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
      if (!hasContent) return;

      const number = getGenVal(genRow, 'number') || getGenVal(genRow, 'no') || cleanStr(genRow[0]) || (index + 1);
      const timestamp = getGenVal(genRow, 'timestamp') || getGenVal(genRow, 'date') || cleanStr(genRow[1]) || getBangkokTimestamp();
      const operatorName = getGenVal(genRow, 'nameofuseroradmin') || getGenVal(genRow, 'operatorname') || getGenVal(genRow, 'operator') || cleanStr(genRow[2]);
      
      let equipmentId = getGenVal(genRow, 'equipmentid');
      if (!equipmentId) {
        if (genRow.length > 32) equipmentId = cleanStr(genRow[32]);
        else if (genRow.length > 31) equipmentId = cleanStr(genRow[31]);
        else equipmentId = cleanStr(genRow[15]) || cleanStr(genRow[16]) || '';
      }

      const peaNumber = getGenVal(genRow, 'peanumberid') || getGenVal(genRow, 'peanumber') || cleanStr(genRow[13]) || '';
      const voltageLevel = getGenVal(genRow, 'voltagelevelkv') || getGenVal(genRow, 'voltagelevel') || cleanStr(genRow[3]) || '';
      const city = getGenVal(genRow, 'city') || getGenVal(genRow, 'province') || cleanStr(genRow[4]) || '';
      const equipmentType = getGenVal(genRow, 'equipmenttype') || cleanStr(genRow[5]) || '';
      const locationType = getGenVal(genRow, 'locationtype') || cleanStr(genRow[8]) || '';
      const substation = getGenVal(genRow, 'substation') || getGenVal(genRow, 'substationname') || cleanStr(genRow[9]) || '';

      // Build Columns A through J (indices 0 to 9)
      const rowCols: any[] = [
        number,        // Col A: Number
        timestamp,     // Col B: Timestamp
        operatorName,  // Col C: Name of user or admin
        equipmentId,   // Col D: Equipment ID
        peaNumber,     // Col E: PEA Number (ID)
        voltageLevel,  // Col F: Voltage Level (kV)
        city,          // Col G: City
        equipmentType, // Col H: Equipment type
        locationType,  // Col I: Location type
        substation     // Col J: Substation
      ];

      // Build Columns K through AA (indices 10 to 26): preserve existing diagnostic data if present, otherwise blank
      const lookupKey = equipmentId.toLowerCase().trim();
      const existingDiag = existingDiagMap[lookupKey];

      for (let c = 10; c < PD_DIAGNOSTIC_HEADERS.length; c++) {
        const diagIdx = c - 10;
        if (existingDiag && existingDiag[diagIdx] !== undefined) {
          rowCols.push(existingDiag[diagIdx]);
        } else {
          rowCols.push('');
        }
      }

      newPdRows.push(rowCols);
    });

    if (newPdRows.length === 0) {
      return { success: true, syncedRowsCount: 0 };
    }

    // 3. Write synchronized rows to Tab 4 starting at A2:AA
    const updateRes = await fetchWithBackoff(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'PD & Diagnostic Data'!A2:AA${newPdRows.length + 1}`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range: `'PD & Diagnostic Data'!A2:AA${newPdRows.length + 1}`,
          majorDimension: 'ROWS',
          values: newPdRows
        })
      }
    );

    // If Tab 4 previously had more rows than newPdRows, clear leftover rows
    if (pdDataRows.length > newPdRows.length) {
      const clearStartRow = newPdRows.length + 2;
      await fetchWithBackoff(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'PD & Diagnostic Data'!A${clearStartRow}:AA`)}:clear`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return {
      success: updateRes.ok,
      syncedRowsCount: newPdRows.length
    };
  } catch (err) {
    console.warn(`Error synchronizing Tab 4 from Tab 1 for spreadsheet ${spreadsheetId}:`, err);
    return { success: false, syncedRowsCount: 0 };
  }
}

// Synchronize Tab 4 Columns A-J across all 12 regional Google Sheets
export async function syncAll12SheetsTab4FromTab1(accessToken: string): Promise<{
  totalSyncedSheets: number;
  totalRowsSynced: number;
  results: Record<string, { success: boolean; rows: number }>;
}> {
  if (!accessToken) return { totalSyncedSheets: 0, totalRowsSynced: 0, results: {} };

  try {
    const masterMap = await getMasterSpreadsheetsMap(accessToken);
    const spreadsheetsByArea = masterMap.spreadsheets || {};
    const driveSheets = await listSpreadsheets(accessToken);
    const sheetMap: Record<string, string> = {};

    for (const area of PEA_AREAS) {
      if (spreadsheetsByArea[area]) {
        sheetMap[area] = spreadsheetsByArea[area];
      }
    }

    for (const file of driveSheets) {
      const match = file.name.match(/PEA\s+Cable\s+Asset\s+Database\s*[-_]?\s*(Area\s+)?([A-Za-z0-9]+)/i);
      if (match) {
        const parsedArea = (match[2] || match[1] || '').toUpperCase();
        if (PEA_AREAS.includes(parsedArea as any) && !sheetMap[parsedArea]) {
          sheetMap[parsedArea] = file.id;
        }
      }
    }

    let totalSyncedSheets = 0;
    let totalRowsSynced = 0;
    const results: Record<string, { success: boolean; rows: number }> = {};

    for (const [area, id] of Object.entries(sheetMap)) {
      const res = await syncSingleSpreadsheetTab4FromTab1(accessToken, id);
      results[area] = { success: res.success, rows: res.syncedRowsCount };
      if (res.success) {
        totalSyncedSheets++;
        totalRowsSynced += res.syncedRowsCount;
      }
    }

    return { totalSyncedSheets, totalRowsSynced, results };
  } catch (err) {
    console.warn("Error synchronizing Tab 4 across all 12 sheets:", err);
    return { totalSyncedSheets: 0, totalRowsSynced: 0, results: {} };
  }
}

// Clear example data across all 12 regional Google Sheets Tab 4
export async function clearAll12SheetsPdDiagnosticData(accessToken: string): Promise<{
  totalCleared: number;
  results: Record<string, boolean>;
}> {
  if (!accessToken) return { totalCleared: 0, results: {} };
  
  try {
    const masterMap = await getMasterSpreadsheetsMap(accessToken);
    const spreadsheetsByArea = masterMap.spreadsheets || {};
    const driveSheets = await listSpreadsheets(accessToken);
    const sheetMap: Record<string, string> = {};

    for (const area of PEA_AREAS) {
      if (spreadsheetsByArea[area]) {
        sheetMap[area] = spreadsheetsByArea[area];
      }
    }

    for (const file of driveSheets) {
      const match = file.name.match(/PEA\s+Cable\s+Asset\s+Database\s*[-_]?\s*(Area\s+)?([A-Za-z0-9]+)/i);
      if (match) {
        const parsedArea = (match[2] || match[1] || '').toUpperCase();
        if (PEA_AREAS.includes(parsedArea as any) && !sheetMap[parsedArea]) {
          sheetMap[parsedArea] = file.id;
        }
      }
    }

    let totalCleared = 0;
    const results: Record<string, boolean> = {};

    for (const [area, id] of Object.entries(sheetMap)) {
      const ok = await clearPdDiagnosticsSheetData(accessToken, id);
      results[area] = ok;
      if (ok) totalCleared++;
    }

    return { totalCleared, results };
  } catch (err) {
    console.warn("Error clearing PD Diagnostic data across sheets:", err);
    return { totalCleared: 0, results: {} };
  }
}

// Append new PD diagnostic row
export async function appendPdDiagnosticRow(accessToken: string, spreadsheetId: string, rowOrData: any[] | Record<string, any>) {
  await ensurePdDiagnosticsSheetExists(accessToken, spreadsheetId);
  let rowValues: any[];
  if (Array.isArray(rowOrData)) {
    rowValues = rowOrData;
  } else {
    const resHeaders = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27PD%20%26%20Diagnostic%20Data%27%21A1:AZ1`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const dataHeaders = resHeaders.ok ? await resHeaders.json() : null;
    const headers = dataHeaders?.values?.[0] || PD_DIAGNOSTIC_HEADERS;
    rowValues = alignRowWithHeaders(headers, rowOrData);
  }

  const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27PD%20%26%20Diagnostic%20Data%27%21A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'PD & Diagnostic Data'!A1",
      majorDimension: 'ROWS',
      values: [rowValues]
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.warn(`Failed to append PD diagnostic row to Google Sheets: ${errorText}`);
  }
}

// Append multiple PD diagnostic rows in a SINGLE API call
export async function appendPdDiagnosticRowsBatch(accessToken: string, spreadsheetId: string, rowsValues: any[][]) {
  if (!rowsValues || rowsValues.length === 0) return;
  await ensurePdDiagnosticsSheetExists(accessToken, spreadsheetId);

  const res = await fetchWithBackoff(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%27PD%20%26%20Diagnostic%20Data%27%21A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'PD & Diagnostic Data'!A1",
      majorDimension: 'ROWS',
      values: rowsValues
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.warn(`Failed to batch append PD diagnostic rows to Google Sheets: ${errorText}`);
  }
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

  if (sheetName.toLowerCase().includes('general')) {
    syncSingleSpreadsheetTab4FromTab1(accessToken, spreadsheetId).catch(err => {
      console.warn(`[Auto-Link Tab 4] Post-update sync notice for spreadsheet ${spreadsheetId}:`, err);
    });
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
): Promise<{ genRowIndex: number; engRowIndex: number; visRowIndex: number; pdRowIndex: number }> {
  const ranges = [
    "'General Information'!A1:AZ",
    "'Engineering Information'!A1:AZ",
    "'Visual & Thermal Images'!A1:AZ",
    "'PD & Diagnostic Data'!A1:AZ"
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
  const pdRows = valueRanges[3]?.values || [];

  const genHeaders = genRows[0] || [];
  const engHeaders = engRows[0] || [];
  const visHeaders = visRows[0] || [];
  const pdHeaders = pdRows[0] || [];

  const genDataRows = genRows.slice(1);
  const engDataRows = engRows.slice(1);
  const visDataRows = visRows.slice(1);
  const pdDataRows = pdRows.slice(1);

  const cleanStr = (val: any) => (val === undefined || val === null) ? '' : String(val).trim();
  const searchId = cleanStr(equipmentId).toLowerCase();

  const getColIdxOfEqId = (headers: string[]) => {
    return headers.findIndex(h => normalizeHeader(h) === 'equipmentid');
  };

  const genEqIdIdx = getColIdxOfEqId(genHeaders);
  const engEqIdIdx = getColIdxOfEqId(engHeaders);
  const visEqIdIdx = getColIdxOfEqId(visHeaders);
  const pdEqIdIdx = getColIdxOfEqId(pdHeaders);

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

  // Find index in PD & Diagnostic Data
  let pdIndex = -1;
  if (recordNumber) {
    pdIndex = pdDataRows.findIndex((row: any[]) => parseInt(row[0]) === recordNumber);
  }
  if (pdIndex === -1) {
    const targetIdx = pdEqIdIdx !== -1 ? pdEqIdIdx : 3; // fallback to D
    pdIndex = pdDataRows.findIndex((row: any[]) => {
      if (row.length > targetIdx) {
        return cleanStr(row[targetIdx]).toLowerCase() === searchId;
      }
      return false;
    });
  }

  return {
    genRowIndex: genIndex !== -1 ? genIndex + 2 : -1,
    engRowIndex: engIndex !== -1 ? engIndex + 2 : -1,
    visRowIndex: visIndex !== -1 ? visIndex + 2 : -1,
    pdRowIndex: pdIndex !== -1 ? pdIndex + 2 : -1
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

      // Deduce row-specific area code if city explicitly maps to another area
      const rowArea = getAreaFromCity(city) || areaCode;

      const condParams = { area: rowArea, voltage, year, locationType: locType, equipmentType: eqType, city };
      const prefix = getEquipmentConditionPrefix(condParams);

      let cityIndex: number;
      const existingMatch = oldEqId ? oldEqId.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#(\\d{1,5})`, 'i')) : null;

      if (existingMatch && existingMatch[1]) {
        cityIndex = parseInt(existingMatch[1], 10);
        if (cityCounters[prefix] === undefined || cityIndex > cityCounters[prefix]) {
          cityCounters[prefix] = cityIndex;
        }
      } else {
        if (cityCounters[prefix] === undefined) {
          cityCounters[prefix] = 0;
        }
        cityCounters[prefix] += 1;
        cityIndex = cityCounters[prefix];
      }

      const newEqId = generateEquipmentId({
        ...condParams,
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

export interface RegionalSheetScanInfo {
  spreadsheetId: string;
  area: string;
  areaName: string;
  title: string;
  rowCount: number;
  status: 'scanned' | 'error';
  errorMessage?: string;
}

export async function scanRegionalSheetsAssetCounts(
  accessToken: string | null,
  spreadsheetIds: string[]
): Promise<RegionalSheetScanInfo[]> {
  const uniqueIds = Array.from(new Set(spreadsheetIds)).filter(id => id && id.trim().length > 0);
  
  const areaOrder = ['N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3', 'NE1', 'NE2', 'NE3'];
  const results: RegionalSheetScanInfo[] = [];

  // If no accessToken, use server-side /api/sheets/scan endpoint first
  if (!accessToken) {
    try {
      const scanRes = await fetch('/api/sheets/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetIds: uniqueIds })
      });
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (scanData.scans && Array.isArray(scanData.scans)) {
          return scanData.scans.map((s: any, idx: number) => {
            const fallbackArea = areaOrder[idx] || `AREA_${idx + 1}`;
            return {
              spreadsheetId: s.spreadsheetId,
              area: fallbackArea,
              areaName: PEA_AREA_NAMES[fallbackArea] || fallbackArea,
              title: `PEA Cable Asset Database - ${fallbackArea}`,
              rowCount: s.rowCount || 0,
              status: s.status || 'scanned',
              errorMessage: s.errorMessage
            };
          });
        }
      }
    } catch (e) {
      console.warn("Backend sheets scan error, falling back to sequential scan:", e);
    }
  }

  for (let i = 0; i < uniqueIds.length; i++) {
    const sheetId = uniqueIds[i];
    const fallbackArea = areaOrder[i] || `AREA_${i + 1}`;

    // Add 150ms delay between consecutive scans to avoid rate limits
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    try {
      let title = '';
      let area = fallbackArea;
      let generalTabTitle = 'General Information';
      if (accessToken) {
        try {
          const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (metaRes.ok) {
            const meta = await metaRes.json();
            const sheets = meta.sheets || [];
            const genSheet = sheets.find((s: any) => /general/i.test(s.properties?.title || '')) || sheets[0];
            if (genSheet?.properties?.title) {
              generalTabTitle = genSheet.properties.title;
            }
            title = meta.properties?.title || '';
            const match = title.match(/PEA\s+Cable\s+Asset\s+Database\s*-\s*([A-Za-z0-9]+)/i) || 
                          title.match(/PEA\s+Cable\s+Asset\s+Database\s+([A-Za-z0-9]+)/i);
            if (match) {
              area = match[1].trim().toUpperCase();
            }
          }
        } catch (e) {}
      }

      let rowCount = 0;
      let isError = false;
      let errorMsg: string | undefined;

      if (accessToken) {
        const range = encodeURIComponent(`'${generalTabTitle}'!A2:A`);
        const valRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        isError = !valRes.ok;

        if (valRes.ok) {
          const valData = await valRes.json();
          const rows = (valData.values || []).filter((r: any[]) => r && r.length > 0 && r.some((c: any) => c !== undefined && c !== null && String(c).trim() !== ''));
          rowCount = rows.length;
        } else {
          errorMsg = valRes.status === 403 ? 'Access forbidden. Please share sheet with view/edit access.' : valRes.status === 404 ? 'Spreadsheet ID not found.' : 'Sheet unavailable';
        }
      } else {
        // Fallback row count via proxy or client-side CSV
        try {
          const proxyRes = await fetch(`/api/sheets/data?spreadsheetId=${encodeURIComponent(sheetId)}`);
          if (proxyRes.ok) {
            const pData = await proxyRes.json();
            const genRows = pData.valueRanges?.[0]?.values || [];
            rowCount = Math.max(0, genRows.length - 1);
          } else {
            const csvGen = await fetchSheetCsvTabClient(sheetId, ['General Information', 'General', 'Sheet1']);
            rowCount = Math.max(0, csvGen.length - 1);
          }
        } catch (pe) {
          try {
            const csvGen = await fetchSheetCsvTabClient(sheetId, ['General Information', 'General', 'Sheet1']);
            rowCount = Math.max(0, csvGen.length - 1);
          } catch (e) {}
        }
      }

      const areaName = PEA_AREA_NAMES[area] || area;

      results.push({
        spreadsheetId: sheetId,
        area,
        areaName,
        title: title || `PEA Cable Asset Database - ${area}`,
        rowCount,
        status: isError ? ('error' as const) : ('scanned' as const),
        errorMessage: errorMsg
      });
    } catch (err: any) {
      console.warn(`Scan error for sheet ${sheetId}:`, err);
      results.push({
        spreadsheetId: sheetId,
        area: fallbackArea,
        areaName: PEA_AREA_NAMES[fallbackArea] || fallbackArea,
        title: `PEA Cable Asset Database - ${fallbackArea}`,
        rowCount: 0,
        status: 'error' as const,
        errorMessage: err.message || 'Sheet unavailable or permission denied'
      });
    }
  }

  results.sort((a, b) => {
    const idxA = areaOrder.indexOf(a.area);
    const idxB = areaOrder.indexOf(b.area);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.area.localeCompare(b.area);
  });

  return results;
}

export interface RegionalSheetUpgradeStatus {
  area: string;
  spreadsheetId: string;
  title: string;
  tabCreated: boolean;
  backfilledCount: number;
  status: 'pending' | 'upgrading' | 'completed' | 'error';
  errorMessage?: string;
}

export async function upgradeAll12GoogleSheetsWithPdTab(
  accessToken: string,
  onProgress?: (info: {
    current: number;
    total: number;
    area: string;
    message: string;
    statuses: RegionalSheetUpgradeStatus[];
  }) => void
): Promise<{
  totalSpreadsheets: number;
  totalCreatedTabs: number;
  totalBackfilled: number;
  details: RegionalSheetUpgradeStatus[];
}> {
  if (!accessToken) {
    throw new Error('Google OAuth token is required to upgrade Google Sheets.');
  }

  console.log("Starting 4-Tab Diagnostic Schema Upgrade across all 12 PEA Sector Google Sheets...");

  // 1. Gather all 12 area spreadsheet IDs
  const masterMap = await getMasterSpreadsheetsMap(accessToken);
  const spreadsheetsByArea = masterMap.spreadsheets || {};

  // Also query Drive to make sure no sheets are missed
  const driveSheets = await listSpreadsheets(accessToken);
  const sheetMap: Record<string, { id: string; title: string }> = {};

  for (const area of PEA_AREAS) {
    if (spreadsheetsByArea[area]) {
      sheetMap[area] = {
        id: spreadsheetsByArea[area],
        title: `PEA Cable Asset Database - ${area}`
      };
    }
  }

  for (const file of driveSheets) {
    const match = file.name.match(/PEA\s+Cable\s+Asset\s+Database\s*[-_]?\s*(Area\s+)?([A-Za-z0-9]+)/i);
    if (match) {
      const parsedArea = (match[2] || match[1] || '').toUpperCase();
      if (PEA_AREAS.includes(parsedArea as any) && !sheetMap[parsedArea]) {
        sheetMap[parsedArea] = { id: file.id, title: file.name };
      }
    }
  }

  const areasToProcess = Object.keys(sheetMap).sort((a, b) => {
    return PEA_AREAS.indexOf(a as any) - PEA_AREAS.indexOf(b as any);
  });

  const statuses: RegionalSheetUpgradeStatus[] = areasToProcess.map(area => ({
    area,
    spreadsheetId: sheetMap[area].id,
    title: sheetMap[area].title,
    tabCreated: false,
    backfilledCount: 0,
    status: 'pending'
  }));

  let totalCreatedTabs = 0;
  let totalBackfilled = 0;

  for (let i = 0; i < areasToProcess.length; i++) {
    const area = areasToProcess[i];
    const item = sheetMap[area];
    statuses[i].status = 'upgrading';

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: areasToProcess.length,
        area,
        message: `Upgrading Area ${area} (${PEA_AREA_NAMES[area] || area}) to 4-Tab Diagnostic Schema...`,
        statuses: [...statuses]
      });
    }

    try {
      const result = await ensurePdDiagnosticsSheetExists(accessToken, item.id, true);
      statuses[i].tabCreated = result.created;
      statuses[i].backfilledCount = result.backfilledCount;
      statuses[i].status = 'completed';

      if (result.created) totalCreatedTabs++;
      totalBackfilled += result.backfilledCount;
    } catch (err: any) {
      console.warn(`Error upgrading sheet for Area ${area}:`, err);
      statuses[i].status = 'error';
      statuses[i].errorMessage = err.message || 'Failed to update sheet';
    }

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: areasToProcess.length,
        area,
        message: `Finished Area ${area}. Created: ${statuses[i].tabCreated ? 'Yes' : 'Already Existed'}, Backfilled: ${statuses[i].backfilledCount} row(s).`,
        statuses: [...statuses]
      });
    }
  }

  return {
    totalSpreadsheets: areasToProcess.length,
    totalCreatedTabs,
    totalBackfilled,
    details: statuses
  };
}



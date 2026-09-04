import { 
  PEAUser, 
  CableAsset, 
  EquipmentType, 
  LocationType,
  HealthStatus, 
  EngineeringInformation,
  GeneralInformation,
  VisualInformation,
  TanDeltaResult,
  PDResultType
} from '../types';

export const PEA_AREAS = [
  'N1', 'N2', 'N3',
  'C1', 'C2', 'C3',
  'NE1', 'NE2', 'NE3',
  'S1', 'S2', 'S3'
] as const;

export const PEA_AREA_NAMES: Record<string, string> = {
  ALL: 'All Areas (National)',
  N1: 'Northern Area 1 (Chiang Mai)',
  N2: 'Northern Area 2 (Phitsanulok)',
  N3: 'Northern Area 3 (Lop Buri)',
  NE1: 'Northeastern Area 1 (Udon Thani)',
  NE2: 'Northeastern Area 2 (Ubon Ratchathani)',
  NE3: 'Northeastern Area 3 (Nakhon Ratchasima)',
  C1: 'Central Area 1 (Phra Nakhon Si Ayutthaya)',
  C2: 'Central Area 2 (Chon Buri)',
  C3: 'Central Area 3 (Nakhon Pathom)',
  S1: 'Southern Area 1 (Phetchaburi)',
  S2: 'Southern Area 2 (Nakhon Si Thammarat)',
  S3: 'Southern Area 3 (Yala)'
};

export const PEA_AREA_CITIES: Record<string, string[]> = {
  ALL: [
    'Chiang Mai', 'Chiang Rai', 'Lampang', 'Lamphun', 'Mae Hong Son', 'Phayao',
    'Phitsanulok', 'Kamphaeng Phet', 'Nan', 'Phichit', 'Phrae', 'Sukhothai', 'Tak', 'Uttaradit',
    'Lop Buri', 'Chai Nat', 'Nakhon Sawan', 'Phetchabun', 'Sing Buri', 'Uthai Thani',
    'Udon Thani', 'Bueng Kan', 'Khon Kaen', 'Loei', 'Nakhon Phanom', 'Nong Bua Lamphu', 'Nong Khai', 'Sakon Nakhon',
    'Ubon Ratchathani', 'Amnat Charoen', 'Kalasin', 'Maha Sarakham', 'Mukdahan', 'Roi Et', 'Sisaket', 'Yasothon',
    'Nakhon Ratchasima', 'Buri Ram', 'Chaiyaphum', 'Surin',
    'Phra Nakhon Si Ayutthaya', 'Ang Thong', 'Nakhon Nayok', 'Pathum Thani', 'Prachin Buri', 'Sa Kaeo', 'Saraburi',
    'Chon Buri', 'Chachoengsao', 'Chanthaburi', 'Rayong', 'Trat',
    'Nakhon Pathom', 'Kanchanaburi', 'Samut Sakhon', 'Suphan Buri',
    'Phetchaburi', 'Chumphon', 'Prachuap Khiri Khan', 'Ranong', 'Ratchaburi', 'Samut Songkhram',
    'Nakhon Si Thammarat', 'Krabi', 'Phang Nga', 'Phuket', 'Surat Thani', 'Trang',
    'Yala', 'Narathiwat', 'Pattani', 'Phatthalung', 'Satun', 'Songkhla'
  ],
  N1: ['Chiang Mai', 'Chiang Rai', 'Lampang', 'Lamphun', 'Mae Hong Son', 'Phayao'],
  N2: ['Phitsanulok', 'Kamphaeng Phet', 'Nan', 'Phichit', 'Phrae', 'Sukhothai', 'Tak', 'Uttaradit'],
  N3: ['Lop Buri', 'Chai Nat', 'Nakhon Sawan', 'Phetchabun', 'Sing Buri', 'Uthai Thani'],
  NE1: ['Udon Thani', 'Bueng Kan', 'Khon Kaen', 'Loei', 'Nakhon Phanom', 'Nong Bua Lamphu', 'Nong Khai', 'Sakon Nakhon'],
  NE2: ['Ubon Ratchathani', 'Amnat Charoen', 'Kalasin', 'Maha Sarakham', 'Mukdahan', 'Roi Et', 'Sisaket', 'Yasothon'],
  NE3: ['Nakhon Ratchasima', 'Buri Ram', 'Chaiyaphum', 'Surin'],
  C1: ['Phra Nakhon Si Ayutthaya', 'Ang Thong', 'Nakhon Nayok', 'Pathum Thani', 'Prachin Buri', 'Sa Kaeo', 'Saraburi'],
  C2: ['Chon Buri', 'Chachoengsao', 'Chanthaburi', 'Rayong', 'Trat'],
  C3: ['Nakhon Pathom', 'Kanchanaburi', 'Samut Sakhon', 'Suphan Buri'],
  S1: ['Phetchaburi', 'Chumphon', 'Prachuap Khiri Khan', 'Ranong', 'Ratchaburi', 'Samut Songkhram'],
  S2: ['Nakhon Si Thammarat', 'Krabi', 'Phang Nga', 'Phuket', 'Surat Thani', 'Trang'],
  S3: ['Yala', 'Narathiwat', 'Pattani', 'Phatthalung', 'Satun', 'Songkhla']
};

export function getAreaFromCity(city: string): string | null {
  if (!city) return null;
  const clean = city.trim().toLowerCase();
  if (!clean) return null;
  for (const [area, cities] of Object.entries(PEA_AREA_CITIES)) {
    if (area === 'ALL') continue;
    if (cities.some(c => {
      const cl = c.toLowerCase();
      return cl === clean || clean.includes(cl) || cl.includes(clean);
    })) {
      return area;
    }
  }
  return null;
}

/**
 * Robustly extracts the PEA Area code (N1-NE3) from any asset structure,
 * checking area property, equipmentId prefix, peaNumber, city mapping, and landmark text.
 */
export function getAssetArea(asset: any): string {
  if (!asset) return 'UNKNOWN';

  // 1. Direct explicit area field if set
  if (asset.area && typeof asset.area === 'string' && asset.area.trim() !== '' && asset.area.toUpperCase() !== 'ALL') {
    const clean = asset.area.trim().toUpperCase();
    if (PEA_AREAS.includes(clean as any)) return clean;
  }

  // 2. Extract from equipmentId
  if (asset.equipmentId && typeof asset.equipmentId === 'string') {
    const raw = asset.equipmentId.trim();
    // Check standard prefix: C1-..., N1-..., etc.
    const firstPart = raw.split('-')[0]?.toUpperCase();
    if (firstPart && PEA_AREAS.includes(firstPart as any)) {
      return firstPart;
    }
    // Check if equipmentId is PEA-C1-... or similar
    const secondPart = raw.split('-')[1]?.toUpperCase();
    if (secondPart && PEA_AREAS.includes(secondPart as any)) {
      return secondPart;
    }
    // Substring match for area codes
    for (const a of ['NE1', 'NE2', 'NE3', 'N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3']) {
      if (raw.toUpperCase().startsWith(a + '-') || raw.toUpperCase().startsWith(a + '#') || raw.toUpperCase().startsWith(a + '_')) {
        return a;
      }
    }
  }

  // 3. Extract from peaNumber
  if (asset.peaNumber && typeof asset.peaNumber === 'string') {
    const raw = asset.peaNumber.trim();
    const parts = raw.split('-');
    for (const p of parts) {
      const up = p.trim().toUpperCase();
      if (PEA_AREAS.includes(up as any)) return up;
    }
    for (const a of ['NE1', 'NE2', 'NE3', 'N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3']) {
      if (raw.toUpperCase().includes(`PEA-${a}`) || raw.toUpperCase().includes(`-${a}-`) || raw.toUpperCase().startsWith(a)) {
        return a;
      }
    }
  }

  // 4. Map from city / province
  if (asset.city && typeof asset.city === 'string') {
    const fromCity = getAreaFromCity(asset.city);
    if (fromCity && PEA_AREAS.includes(fromCity as any)) {
      return fromCity;
    }
  }

  // 5. Check landmark or substation name
  const locText = `${asset.substationName || ''} ${asset.landmark || ''}`.toUpperCase();
  for (const a of ['NE1', 'NE2', 'NE3', 'N1', 'N2', 'N3', 'C1', 'C2', 'C3', 'S1', 'S2', 'S3']) {
    if (locText.includes(`PEA ${a}`) || locText.includes(`AREA ${a}`) || locText.includes(` ${a} `)) {
      return a;
    }
  }

  return 'UNKNOWN';
}

export const THAI_CITY_TRANSLATIONS: Record<string, string> = {
  'ปทุมธานี': 'Pathum Thani',
  'นนทบุรี': 'Nonthaburi',
  'อยุธยา': 'Phra Nakhon Si Ayutthaya',
  'พระนครศรีอยุธยา': 'Phra Nakhon Si Ayutthaya',
  'กรุงเทพ': 'Bangkok',
  'กรุงเทพมหานคร': 'Bangkok',
  'สมุทรปราการ': 'Samut Prakan',
  'สมุทรสาคร': 'Samut Sakhon',
  'สมุทรสงคราม': 'Samut Songkhram',
  'ชลบุรี': 'Chon Buri',
  'ระยอง': 'Rayong',
  'ฉะเชิงเทรา': 'Chachoengsao',
  'จันทบุรี': 'Chanthaburi',
  'ตราด': 'Trat',
  'นครนายก': 'Nakhon Nayok',
  'ปราจีนบุรี': 'Prachin Buri',
  'สระแก้ว': 'Sa Kaeo',
  'สระบุรี': 'Saraburi',
  'อ่างทอง': 'Ang Thong',
  'เชียงใหม่': 'Chiang Mai',
  'เชียงราย': 'Chiang Rai',
  'ลำปาง': 'Lampang',
  'ลำพูน': 'Lamphun',
  'แม่ฮ่องสอน': 'Mae Hong Son',
  'พะเยา': 'Phayao',
  'พิษณุโลก': 'Phitsanulok',
  'กำแพงเพชร': 'Kamphaeng Phet',
  'น่าน': 'Nan',
  'พิจิตร': 'Phichit',
  'แพร่': 'Phrae',
  'สุโขทัย': 'Sukhothai',
  'ตาก': 'Tak',
  'อุตรดิตถ์': 'Uttaradit',
  'ลพบุรี': 'Lop Buri',
  'ชัยนาท': 'Chai Nat',
  'นครสวรรค์': 'Nakhon Sawan',
  'เพชรบูรณ์': 'Phetchabun',
  'สิงห์บุรี': 'Sing Buri',
  'อุทัยธานี': 'Uthai Thani',
  'อุดรธานี': 'Udon Thani',
  'บึงกาฬ': 'Bueng Kan',
  'ขอนแก่น': 'Khon Kaen',
  'เลย': 'Loei',
  'นครพนม': 'Nakhon Phanom',
  'หนองบัวลำภู': 'Nong Bua Lamphu',
  'หนองคาย': 'Nong Khai',
  'สกลนคร': 'Sakon Nakhon',
  'อุบลราชธานี': 'Ubon Ratchathani',
  'อำนาจเจริญ': 'Amnat Charoen',
  'กาฬสินธุ์': 'Kalasin',
  'มหาสารคาม': 'Maha Sarakham',
  'มุกดาหาร': 'Mukdahan',
  'ร้อยเอ็ด': 'Roi Et',
  'ศรีสะเกษ': 'Sisaket',
  'ยโสธร': 'Yasothon',
  'นครราชสีมา': 'Nakhon Ratchasima',
  'โคราช': 'Nakhon Ratchasima',
  'ปักธงชัย': 'Nakhon Ratchasima',
  'บุรีรัมย์': 'Buri Ram',
  'ชัยภูมิ': 'Chaiyaphum',
  'สุรินทร์': 'Surin',
  'นครปฐม': 'Nakhon Pathom',
  'กาญจนบุรี': 'Kanchanaburi',
  'สุพรรณบุรี': 'Suphan Buri',
  'เพชรบุรี': 'Phetchaburi',
  'ชุมพร': 'Chumphon',
  'ประจวบคีรีขันธ์': 'Prachuap Khiri Khan',
  'ระนอง': 'Ranong',
  'ราชบุรี': 'Ratchaburi',
  'นครศรีธรรมราช': 'Nakhon Si Thammarat',
  'กระบี่': 'Krabi',
  'พังงา': 'Phang Nga',
  'ภูเก็ต': 'Phuket',
  'สุราษฎร์ธานี': 'Surat Thani',
  'ตรัง': 'Trang',
  'ยะลา': 'Yala',
  'นราธิวาส': 'Narathiwat',
  'ปัตตานี': 'Pattani',
  'พัทลุง': 'Phatthalung',
  'สตูล': 'Satun',
  'สงขลา': 'Songkhla'
};

export function normalizeVoltageLevel(raw: string, secondaryText?: string): string {
  const primary = (raw || '').trim().toLowerCase();
  const secondary = (secondaryText || '').trim().toLowerCase();
  const combined = `${primary} ${secondary}`.toLowerCase();

  if (!combined.trim()) return '22';

  // 1. Explicit check for low voltage / 0.4
  if (
    combined.includes('แรงต่ำ') ||
    combined.includes('0.4') ||
    combined.includes('400v') ||
    combined.includes('400 v') ||
    combined.includes('low voltage') ||
    combined.includes('lv')
  ) {
    return '0.4';
  }

  // 2. Explicit check for 115 kV
  if (combined.includes('115') || combined.includes('115000')) return '115';

  // 3. Explicit check for 33 kV
  if (combined.includes('33') || combined.includes('33000')) return '33';

  // 4. Explicit check for 22 kV
  if (combined.includes('22') || combined.includes('22000')) return '22';

  // 5. Numeric fallback
  const numericOnly = primary.replace(/[^0-9.]/g, '');
  if (numericOnly) {
    const val = parseFloat(numericOnly);
    if (!isNaN(val)) {
      if (val >= 100) return '115';
      if (val >= 30) return '33';
      if (val >= 10) return '22';
      if (val > 0) return '0.4';
    }
  }

  return '22';
}

export function normalizeEquipmentType(
  raw: string,
  manufacturer?: string,
  model?: string,
  voltage?: string
): EquipmentType {
  if (!raw) raw = '';
  const clean = raw.trim().toLowerCase();
  const mfrClean = (manufacturer || '').trim().toLowerCase();
  const modelClean = (model || '').trim().toLowerCase();
  const voltClean = normalizeVoltageLevel(voltage || '', raw);

  // Check 1: Thai or English Distribution Circuit ("ระบบจำหน่าย")
  if (
    clean.includes('ระบบจำหน่าย') ||
    clean.includes('distribution circuit') ||
    clean.includes('dist circuit') ||
    clean.includes('distribution line')
  ) {
    return 'Distribution Circuit';
  }

  // Check 2: Intelligent Termination Detection
  const isTerm =
    clean.includes('terminat') ||
    clean.includes('pothead') ||
    clean.includes('tm') ||
    clean.includes('end cap') ||
    clean.includes('head termination') ||
    clean.includes('cable termination') ||
    clean.includes('outdoor termination') ||
    clean.includes('indoor termination') ||
    clean.includes('gis termination') ||
    clean.includes('oil insulated') ||
    clean.includes('heat shrink') ||
    clean.includes('plug in') ||
    clean.includes('plugin') ||
    clean.includes('dry type') ||
    mfrClean.includes('pfisterer') ||
    mfrClean.includes('euromold') ||
    mfrClean.includes('centuray') ||
    mfrClean.includes('arkasil');

  if (isTerm) {
    const combined = `${clean} ${mfrClean} ${modelClean}`.toLowerCase();

    // A. Check Cold Shrink Termination (All Voltage Systems)
    if (
      combined.includes('cold shrink') ||
      combined.includes('cold-shrink') ||
      combined.includes('coldshrink') ||
      combined.includes('cst') ||
      (mfrClean.includes('3m') && combined.includes('shrink'))
    ) {
      return 'Cold Shrink Termination';
    }

    // B. Check Slip-On Termination (Only in 22, 33 kV)
    if (
      combined.includes('slip on') ||
      combined.includes('slip-on') ||
      combined.includes('slipon') ||
      combined.includes('sot')
    ) {
      return 'Slip-On Termination';
    }

    // C. Check Plug in Termination
    if (
      combined.includes('plug in') ||
      combined.includes('plugin') ||
      combined.includes('plug-in') ||
      combined.includes('separable') ||
      combined.includes('elbow') ||
      combined.includes('t-body') ||
      combined.includes('deadbreak') ||
      combined.includes('inner cone') ||
      combined.includes('outer cone') ||
      combined.includes('connex') ||
      combined.includes('rsti') ||
      mfrClean.includes('euromold') ||
      mfrClean.includes('elastimold') ||
      (mfrClean.includes('pfisterer') && !combined.includes('oil'))
    ) {
      return 'Plug in Termination';
    }

    // D. Check Oil Insulated Termination
    if (
      combined.includes('oil insulated') ||
      combined.includes('oil termination') ||
      combined.includes('oil filled') ||
      combined.includes('oil-filled') ||
      combined.includes('fluid filled') ||
      combined.includes('fluid-filled') ||
      combined.includes('oil-immersed') ||
      combined.includes('oil')
    ) {
      return 'Oil Insulated Termination';
    }

    // E. Check Heat Shrink Termination (Only for <115kV)
    if (
      voltClean !== '115' && (
        combined.includes('heat shrink') ||
        combined.includes('heat-shrink') ||
        combined.includes('thermofit') ||
        combined.includes('heatshrink') ||
        combined.includes('hst') ||
        (mfrClean.includes('raychem') && !combined.includes('connex') && !combined.includes('rsti') && !combined.includes('dry')) ||
        (mfrClean.includes('3m') && !combined.includes('elbow'))
      )
    ) {
      return 'Heat Shrink Termination';
    }

    // F. Check Dry Type Termination
    if (
      combined.includes('dry type') ||
      combined.includes('dry-type') ||
      combined.includes('dry outdoor') ||
      combined.includes('dry indoor') ||
      combined.includes('composite') ||
      combined.includes('porcelain') ||
      combined.includes('dry gis') ||
      combined.includes('flexible dry') ||
      combined.includes('dry') ||
      mfrClean.includes('centuray') ||
      mfrClean.includes('arkasil') ||
      mfrClean.includes('g&w')
    ) {
      return 'Dry Type Termination';
    }

    // G. Default termination choice based on voltage
    if (voltClean === '115') {
      return 'Dry Type Termination';
    } else {
      return 'Heat Shrink Termination';
    }
  }

  // Check 3: Other equipment types
  if (clean.includes('unit substation') || clean.includes('compact unit') || clean.includes('substation') || clean.includes('cus')) {
    return 'Unit Substation';
  }
  if (clean.includes('ring main') || clean.includes('rmu')) {
    return 'Ring Main Unit';
  }
  if (clean.includes('slip-on') || clean.includes('slip on') || clean.includes('slipon')) {
    return 'Slip-On Termination';
  }
  if (clean.includes('cold shrink') || clean.includes('cold-shrink') || clean.includes('coldshrink')) {
    return 'Cold Shrink Termination';
  }
  if (clean.includes('gnd') || clean.includes('link box') || clean.includes('ground link')) {
    return 'GND Link box';
  }
  if (clean.includes('lightning') || clean.includes('arrester') || clean.includes('la')) {
    return 'Lightning Arrester';
  }
  if (clean.includes('air break') || clean.includes('abs')) {
    return 'Air Break Switch';
  }
  if (clean.includes('joint')) {
    return 'Joint';
  }
  if (clean.includes('hv ats')) {
    return 'HV ATS';
  }
  if (clean.includes('lv ats')) {
    return 'LV ATS';
  }
  if (clean.includes('underground cable') || clean.includes('ug cable') || clean.includes('cable')) {
    return 'Underground Cable';
  }

  for (const eq of ALL_EQUIPMENT_TYPES) {
    const eqLower = eq.toLowerCase();
    if (clean.includes(eqLower) || eqLower.includes(clean)) {
      return eq;
    }
  }

  return 'Underground Cable';
}

export function normalizeLocationType(rawLoc: string, volt: string): string {
  const normVolt = normalizeVoltageLevel(volt);
  const clean = (rawLoc || '').trim();

  const isBlankOrNA = !clean || clean === 'N/A' || clean === '[Blank]' || clean === '-' || clean.toLowerCase() === 'null' || clean.toLowerCase() === 'none';

  if (isBlankOrNA) {
    if (normVolt === '115') {
      return 'Transmission Line';
    } else {
      return 'Distribution Line';
    }
  }

  const lower = clean.toLowerCase();
  if (lower.includes('transmission')) return 'Transmission Line';
  if (lower.includes('distribution')) return 'Distribution Line';
  if (lower.includes('substation')) return 'Substation';
  if (lower.includes('overhead')) return 'Overhead Line';
  if (lower.includes('underground')) return 'Underground Cable';

  return clean;
}

export function normalizeCity(rawCity: string, currentArea?: string): { city: string; area: string } {
  let cleanCity = (rawCity || '').trim();
  let defaultArea = (currentArea || 'N1').trim();

  if (!cleanCity || cleanCity === 'N/A' || cleanCity === '[Blank]') {
    return { city: defaultArea, area: defaultArea };
  }

  for (const [thai, eng] of Object.entries(THAI_CITY_TRANSLATIONS)) {
    if (cleanCity.includes(thai)) {
      cleanCity = eng;
      break;
    }
  }

  const inferredArea = getAreaFromCity(cleanCity);
  const finalArea = inferredArea || defaultArea;

  return { city: cleanCity, area: finalArea };
}

export function normalizeInstallationDate(rawDate: string): string {
  if (!rawDate) {
    return new Date().toISOString().split('T')[0];
  }

  const clean = rawDate.trim();

  if (/^\d{8}$/.test(clean)) {
    if (clean.startsWith('19') || clean.startsWith('20')) {
      const year = clean.substring(0, 4);
      const month = clean.substring(4, 6);
      const day = clean.substring(6, 8);
      return `${day}/${month}/${year}`;
    } else {
      const day = clean.substring(0, 2);
      const month = clean.substring(2, 4);
      const year = clean.substring(4, 8);
      return `${day}/${month}/${year}`;
    }
  }

  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return parts.join('/');
    }
  }

  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return parts.join('/');
    }
  }

  return clean;
}

export const ALL_EQUIPMENT_TYPES: EquipmentType[] = [
  'Underground Cable',
  'Oil Insulated Termination',
  'Joint',
  'GND Link box',
  'Lightning Arrester',
  'Heat Shrink Termination',
  'Plug in Termination',
  'Slip-On Termination',
  'Cold Shrink Termination',
  'Air Break Switch',
  'Dry Type Termination',
  'Ring Main Unit',
  'Unit Substation',
  'HV ATS',
  'LV ATS',
  'Distribution Circuit'
];

export const EQUIPMENT_TYPES: EquipmentType[] = ALL_EQUIPMENT_TYPES;

export const EXCLUDED_115KV_TYPES: EquipmentType[] = [
  'Heat Shrink Termination',
  'Slip-On Termination',
  'Ring Main Unit',
  'Unit Substation',
  'LV ATS',
  'Distribution Circuit'
];

export function getAvailableEquipmentTypes(voltageLevel: string): EquipmentType[] {
  const normVolt = normalizeVoltageLevel(voltageLevel);
  if (normVolt === '115') {
    return ALL_EQUIPMENT_TYPES.filter(t => !EXCLUDED_115KV_TYPES.includes(t));
  }
  if (normVolt === '22' || normVolt === '33') {
    return ALL_EQUIPMENT_TYPES;
  }
  // For other voltage levels (e.g. 0.4 kV), Slip-On Termination is only for 22, 33 kV
  return ALL_EQUIPMENT_TYPES.filter(t => t !== 'Slip-On Termination');
}

export const MANUFACTURERS_BY_EQUIPMENT_TYPE: Record<string, string[]> = {
  'Underground Cable': [
    'Bangkok Cable (BCC)', 'Phelps Dodge (PHD)', 'Venine (V9)', 'Charoong Thai Wire and Cable (CTW)', 'Thai Yazaki (TYZ)', 'Erawan (ERW)', 'NKT', 'Others', 'Unknown'
  ],
  'Oil Insulated Termination': [
    'PFISTERER', 'Tyco Raychem', 'G&W', 'Arkasil', 'NKT', 'Brugg', 'Changlan', 'Sudkabel', 'Centuray', 'Joslyn', 'ABB Kabeldon', 'BICC', 'Pirelli', 'ATPIAS', 'CCC', 'Fujian', 'Nexans', 'Sumitomo', 'Others', 'Unknown'
  ],
  'Joint': [
    'Tyco Raychem', 'ELASTIMOLD', 'Arkasil', 'G&W', 'Furukawa', 'Nexans', 'CYG', 'NKT', 'Others', 'Unknown'
  ],
  'GND Link box': [
    'Emeleg', 'U-Electric', 'Ormazabal', 'Others', 'Unknown'
  ],
  'Lightning Arrester': [
    'Siemens', 'Gunkul', 'TRIDELTA', 'Tyco Raychem', 'ABB', 'ELPRO', 'Others', 'Unknown'
  ],
  'Heat Shrink Termination': [
    'Tyco Raychem', 'NKT', 'Nexans', 'Ikebana', 'ABB', 'Others', 'Unknown'
  ],
  'Plug in Termination': [
    'Arkasil', 'Euromold', 'NKT', 'ABB', 'Nexans', 'Tyco Raychem', 'Others', 'Unknown'
  ],
  'Slip-On Termination': [
    'PFISTERER', 'Tyco Raychem', 'NKT', 'ABB', 'Nexans', 'Prysmian', 'Südkabel', 'Centuray', 'Others', 'Unknown'
  ],
  'Cold Shrink Termination': [
    '3M', 'Tyco Raychem', 'NKT', 'Nexans', 'ABB', 'Prysmian', 'Chardon', 'Others', 'Unknown'
  ],
  'Air Break Switch': [
    'COELME', 'Hapam', 'S&C', 'Others', 'Unknown'
  ],
  'Dry Type Termination': [
    'CENTURAY', 'Tyco Raychem', 'Arkasil', 'G&W', 'NKT', 'CYG', 'Centuray', 'Changlan', 'Others', 'Unknown'
  ],
  'Ring Main Unit': [
    'Schneider Electric', 'U-Tah', 'ABB', 'U-ELECTRIC', 'Siemens', 'Lahmeyer', 'LUCY', 'PMK', 'Ormazabal', 'Others', 'Unknown'
  ],
  'Unit Substation': [
    'Schneider Electric', 'U-Tah', 'ABB', 'U-ELECTRIC', 'Siemens', 'Lahmeyer', 'LUCY', 'PMK', 'Ormazabal', 'Others', 'Unknown'
  ],
  'HV ATS': [
    'Schneider Electric', 'AVATAR', 'Others', 'Unknown'
  ],
  'LV ATS': [
    'Schneider Electric', 'AVATAR', 'Others', 'Unknown'
  ],
  'Distribution Circuit': [
    'Combine Product', 'Others', 'Unknown'
  ]
};

export function getManufacturersForEquipmentType(equipmentType: string): string[] {
  return MANUFACTURERS_BY_EQUIPMENT_TYPE[equipmentType] || [
    'Bangkok Cable (BCC)', 'Phelps Dodge (PHD)', 'ABB', 'Schneider Electric', 'Siemens', 'Tyco Raychem', 'NKT', 'Others', 'Unknown'
  ];
}

export const MANUFACTURERS = Array.from(
  new Set(Object.values(MANUFACTURERS_BY_EQUIPMENT_TYPE).flat())
);

export const COUNTRIES_OF_ORIGIN = Array.from(new Set([
  'Thailand',
  'China',
  'Germany',
  'United State of America',
  'United States',
  'Switzerland',
  'Russia',
  'Sweden',
  'Denmark',
  'India',
  'France',
  'United Kingdom',
  'Japan',
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Democratic Republic of the Congo', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland',
  'Gabon', 'Gambia', 'Georgia', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast',
  'Jamaica', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe',
  'Others',
  'Unknown'
]));

export const VOLTAGE_LEVELS = ['115', '33', '22', '0.4'];

export const TAN_DELTA_OPTIONS: TanDeltaResult[] = [
  'No Action Required',
  'Action Required',
  'Further Study Advised',
  'No record'
];

export const PD_RESULTS: PDResultType[] = [
  'Corona',
  'Surface',
  'Internal',
  'Floating',
  'Void',
  'Treeing',
  'None'
];

// Health Index Algorithm
export function calculateHealth(eng: Partial<EngineeringInformation>): { score: number; status: HealthStatus } {
  if (!eng || eng.equipmentId === undefined) {
    return { score: 100, status: 'Green' };
  }
  
  let score = 100;
  
  // 1. Surface Temperature
  const temp = eng.surfaceTemperature ?? 30;
  if (temp > 90) {
    score -= 35;
  } else if (temp > 70) {
    score -= 20;
  } else if (temp > 50) {
    score -= 10;
  }
  
  // 2. Partial Discharge (External Discharge pc & Online PD Result)
  const pdVal = eng.externalDischarge ?? 0;
  if (pdVal > 500) {
    score -= 30;
  } else if (pdVal > 100) {
    score -= 15;
  } else if (pdVal > 10) {
    score -= 5;
  }
  
  const pdRes = eng.pdResult ?? 'None';
  if (pdRes === 'Internal' || pdRes === 'Treeing') {
    score -= 25;
  } else if (pdRes === 'Surface' || pdRes === 'Void' || pdRes === 'Floating') {
    score -= 15;
  } else if (pdRes === 'Corona') {
    score -= 5;
  }
  
  // 3. Insulation Resistance (GOhm) - High is good, Low is bad
  const ir = eng.insulationResistance ?? 50;
  if (ir < 0.1) {
    score -= 30;
  } else if (ir < 1.0) {
    score -= 20;
  } else if (ir < 10) {
    score -= 10;
  }
  
  // 4. Sheath Current vs Load Current ratio
  const load = eng.loadCurrent ?? 100;
  const sheath = eng.sheathCurrent ?? 5;
  if (load > 20 && sheath > 0) {
    const ratio = sheath / load;
    if (ratio > 0.4) {
      score -= 25;
    } else if (ratio > 0.2) {
      score -= 12;
    }
  }
  
  // 5. Tan Delta Result
  const td = eng.tanDelta ?? 'No record';
  if (td === 'Action Required') {
    score -= 35;
  } else if (td === 'Further Study Advised') {
    score -= 15;
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  let status: HealthStatus = 'Green';
  if (score < 40) {
    status = 'Red';
  } else if (score < 60) {
    status = 'Orange';
  } else if (score < 80) {
    status = 'Yellow';
  }
  
  return { score, status };
}

export const CITY_ABBREVIATIONS: Record<string, string> = {
  'krabi': 'KBI',
  'bangkok': 'BKK',
  'kanchanaburi': 'KRI',
  'kalasin': 'KSN',
  'kamphaeng phet': 'KPT',
  'kamphaengphet': 'KPT',
  'khon kaen': 'KKN',
  'khonkaen': 'KKN',
  'chanthaburi': 'CTI',
  'chachoengsao': 'CCO',
  'chon buri': 'CBI',
  'chonburi': 'CBI',
  'chai nat': 'CNT',
  'chainat': 'CNT',
  'chaiyaphum': 'CPM',
  'chumphon': 'CPN',
  'chiang rai': 'CRI',
  'chiangrai': 'CRI',
  'chiang mai': 'CMI',
  'chiangmai': 'CMI',
  'trang': 'TRG',
  'trat': 'TRT',
  'tak': 'TAK',
  'nakhon nayok': 'NYK',
  'nakhonnayok': 'NYK',
  'nakhon pathom': 'NPT',
  'nakhonpathom': 'NPT',
  'nakhon phanom': 'NPM',
  'nakhonphanom': 'NPM',
  'nakhon ratchasima': 'NMA',
  'nakhonratchasima': 'NMA',
  'korat': 'NMA',
  'nakhon si thammarat': 'NRT',
  'nakhonsithammarat': 'NRT',
  'nakhon sawan': 'NSN',
  'nakhonsawan': 'NSN',
  'nonthaburi': 'NBI',
  'narathiwat': 'NWT',
  'nan': 'NAN',
  'bueng kan': 'BKN',
  'buengkan': 'BKN',
  'buri ram': 'BRM',
  'buriram': 'BRM',
  'pathum thani': 'PTE',
  'pathumthani': 'PTE',
  'prachuap khiri khan': 'PKN',
  'prachuapkhirikhan': 'PKN',
  'prachin buri': 'PRI',
  'prachinburi': 'PRI',
  'pattani': 'PTN',
  'phayao': 'PYO',
  'phra nakhon si ayutthaya': 'AYA',
  'ayutthaya': 'AYA',
  'phang nga': 'PNA',
  'phangnga': 'PNA',
  'phatthalung': 'PLG',
  'phichit': 'PCK',
  'phitsanulok': 'PLK',
  'phetchaburi': 'PBI',
  'phetchabun': 'PNB',
  'phrae': 'PRE',
  'phuket': 'PKT',
  'maha sarakham': 'MKM',
  'mahasarakham': 'MKM',
  'mukdahan': 'MDH',
  'mae hong son': 'MSN',
  'maehongson': 'MSN',
  'yasothon': 'YST',
  'yala': 'YLA',
  'roi et': 'RET',
  'roiet': 'RET',
  'ranong': 'RNG',
  'rayong': 'RYG',
  'ratchaburi': 'RBR',
  'lop buri': 'LRI',
  'lopburi': 'LRI',
  'lampang': 'LPG',
  'lamphun': 'LPN',
  'loei': 'LEI',
  'sisaket': 'SSK',
  'sakon nakhon': 'SNK',
  'sakonnakhon': 'SNK',
  'songkhla': 'SKA',
  'satun': 'STN',
  'samut prakan': 'SPK',
  'samutprakan': 'SPK',
  'samut songkhram': 'SKM',
  'samutsongkhram': 'SKM',
  'samut sakhon': 'SKN',
  'samutsakhon': 'SKN',
  'sa kaeo': 'SKW',
  'sakaeo': 'SKW',
  'saraburi': 'SRI',
  'sing buri': 'SBR',
  'singburi': 'SBR',
  'sukhothai': 'STI',
  'suphan buri': 'SPB',
  'suphanburi': 'SPB',
  'surat thani': 'SNI',
  'suratthani': 'SNI',
  'surin': 'SRN',
  'nong khai': 'NKI',
  'nongkhai': 'NKI',
  'nong bua lamphu': 'NBP',
  'nongbualamphu': 'NBP',
  'ang thong': 'ATG',
  'angthong': 'ATG',
  'amnat charoen': 'ACR',
  'amnatcharoen': 'ACR',
  'udon thani': 'UDN',
  'udonthani': 'UDN',
  'uttaradit': 'UTT',
  'uthai thani': 'UTI',
  'uthaithani': 'UTI',
  'ubon ratchathani': 'UBN',
  'ubonratchathani': 'UBN',
  'hat yai': 'SKA',
  'hatyai': 'SKA'
};

export function getCityAbbreviation(city: string): string {
  const norm = (city || '').toLowerCase().trim();
  if (!norm) return 'BKK';

  if (CITY_ABBREVIATIONS[norm]) {
    return CITY_ABBREVIATIONS[norm];
  }

  for (const [key, abbr] of Object.entries(CITY_ABBREVIATIONS)) {
    if (norm.includes(key) || key.includes(norm)) {
      return abbr;
    }
  }

  const clean = norm.replace(/[^a-z]/g, '');
  if (clean.length >= 3) {
    return clean.substring(0, 3).toUpperCase();
  }
  return 'BKK';
}

export function getLocationTypeAbbreviation(locType: string): string {
  const norm = (locType || '').toLowerCase().trim();
  if (norm.includes('transmission') || norm === 'tl') return 'TL';
  if (norm.includes('substation') || norm === 'su') return 'SU';
  if (norm.includes('distribution') || norm === 'dt') return 'DT';
  return 'TL';
}

export function getEquipmentTypeAbbreviation2(eqType: string): string {
  const norm = (eqType || '').toLowerCase().trim();
  if (norm.includes('underground cable') || norm === 'ug') return 'UG';
  if (norm.includes('oil insulated termination') || norm.includes('dry type termination') || norm.includes('heat shrink termination') || norm.includes('plug in termination') || norm.includes('slip-on termination') || norm.includes('slip on termination') || norm.includes('cold shrink termination') || norm.includes('termination') || norm === 'tm') return 'TM';
  if (norm.includes('joint') || norm === 'jo') return 'JO';
  if (norm.includes('gnd link box') || norm.includes('ground box') || norm === 'gb') return 'GB';
  if (norm.includes('lightning arrester') || norm.includes('surge arrester') || norm === 'la') return 'LA';
  if (norm.includes('air break switch') || norm === 'ab') return 'AB';
  if (norm.includes('ring main unit') || norm.includes('unit substation') || norm === 'ru') return 'RU';
  if (norm.includes('distribution circuit') || norm === 'dc') return 'DC';
  if (norm.includes('hv ats') || norm === 'hs') return 'HS';
  if (norm.includes('lv ats') || norm === 'ls') return 'LS';
  return 'UG';
}

export function getVoltageCode(voltage: string): string {
  if (!voltage) return '115';
  const digits = String(voltage).replace(/\D/g, '');
  return digits || '115';
}

export function getPea6Digits(peaNumber: string): string {
  const clean = (peaNumber || '').trim();
  if (!clean || clean.toUpperCase() === 'N/A' || clean.toUpperCase() === 'NONE') {
    return 'XXXXXX';
  }

  // If there's a dash, extract digits from the part after the dash (e.g., "TM66-550001" -> "550001")
  const partAfterDash = clean.includes('-') ? clean.substring(clean.lastIndexOf('-') + 1) : clean;
  let digits = partAfterDash.replace(/\D/g, '');

  if (!digits) {
    // Fallback: search digits across entire string if part after dash had none
    digits = clean.replace(/\D/g, '');
  }

  if (digits.length >= 6) {
    return digits.substring(0, 6);
  }
  if (digits.length > 0) {
    return digits.padStart(6, '0');
  }

  const alpha = clean.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (alpha.length >= 6) return alpha.substring(0, 6);
  if (alpha.length > 0) return alpha.padStart(6, 'X');
  return 'XXXXXX';
}

export const EQUIPMENT_TYPE_ABBREVIATIONS: Record<string, string> = {
  'Underground Cable': 'UG',
  'Oil Insulated Termination': 'TM',
  'Dry Type Termination': 'TM',
  'Heat Shrink Termination': 'TM',
  'Plug in Termination': 'TM',
  'Slip-On Termination': 'TM',
  'Cold Shrink Termination': 'TM',
  'Joint': 'JO',
  'GND Link box': 'GB',
  'Lightning Arrester': 'LA',
  'Air Break Switch': 'AB',
  'Ring Main Unit': 'RU',
  'Unit Substation': 'RU',
  'Distribution Circuit': 'DC',
  'HV ATS': 'HS',
  'LV ATS': 'LS'
};

export function getEquipmentTypeAbbreviation(type: string): string {
  return getEquipmentTypeAbbreviation2(type);
}

// Helper to get condition prefix string: {AREA}-{VOLTAGE}{LOC_TYPE}{EQ_TYPE}-{YEAR}-{CITY_ABBR}
export function getEquipmentConditionPrefix(params: {
  area?: string;
  voltage?: string;
  locationType?: string;
  equipmentType?: string;
  year?: string | number;
  city?: string;
}): string {
  const cleanArea = String(params.area || 'S2').trim().split('-')[0].toUpperCase() || 'S2';
  const vCode = getVoltageCode(String(params.voltage || '115'));
  const locCode = getLocationTypeAbbreviation(String(params.locationType || 'Transmission Line'));
  const eqCode = getEquipmentTypeAbbreviation2(String(params.equipmentType || 'Underground Cable'));
  const yearStr = String(params.year || new Date().getFullYear()).replace(/\D/g, '') || String(new Date().getFullYear());
  const cityAbbr = getCityAbbreviation(String(params.city || ''));

  return `${cleanArea}-${vCode}${locCode}${eqCode}-${yearStr}-${cityAbbr}`;
}

// Calculate the latest running number among existing assets matching the exact condition prefix
export function getLatestEquipmentRunningNumber(
  existingAssets: Array<any>,
  params: {
    area?: string;
    voltage?: string;
    locationType?: string;
    equipmentType?: string;
    year?: string | number;
    city?: string;
  }
): number {
  const prefix = getEquipmentConditionPrefix(params);
  let maxNum = 0;

  if (Array.isArray(existingAssets)) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedPrefix}#(\\d{1,5})`, 'i');

    for (const asset of existingAssets) {
      if (!asset) continue;
      const eqId = asset.equipmentId || asset.equipmentID || asset.eqId;
      if (eqId) {
        const match = String(eqId).trim().match(regex);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
  }

  return maxNum;
}

// Generate Equipment ID helper: {AREA}-{VOLTAGE}{LOC_TYPE}{EQ_TYPE}-{YEAR}-{CITY_ABBR}#{RUNNING_NO}-{PEA_6DIGITS}
export function generateEquipmentId(
  p1: any,
  p2?: any,
  p3?: any,
  p4?: any,
  p5?: any,
  p6?: any,
  p7?: any,
  p8?: any
): string {
  let area = 'S2';
  let voltage = '115';
  let year: any = new Date().getFullYear();
  let locationType = 'Transmission Line';
  let equipmentType = 'Underground Cable';
  let city = '';
  let cityIndex: number | null = null;
  let peaNumber = '';

  if (typeof p1 === 'object' && p1 !== null) {
    area = p1.area || area;
    voltage = p1.voltage || voltage;
    year = p1.year || year;
    locationType = p1.locationType || locationType;
    equipmentType = p1.equipmentType || equipmentType;
    city = p1.city || city;
    cityIndex = p1.cityIndex ?? p1.runningNumber ?? p1.index ?? null;
    peaNumber = p1.peaNumber || peaNumber;
  } else if (typeof p4 === 'string' && (p4.toLowerCase().includes('transmission') || p4.toLowerCase().includes('substation') || p4.toLowerCase().includes('distribution') || p4 === 'TL' || p4 === 'SU' || p4 === 'DT')) {
    area = p1 || area;
    voltage = p2 || voltage;
    year = p3 || year;
    locationType = p4 || locationType;
    equipmentType = p5 || equipmentType;
    city = p6 || city;
    cityIndex = p7 ?? null;
    peaNumber = p8 || peaNumber;
  } else {
    area = p1 || area;
    voltage = p2 || voltage;
    year = p3 || year;
    equipmentType = p4 || equipmentType;
    if (typeof p6 === 'number' || (typeof p6 === 'string' && !isNaN(Number(p6)))) {
      city = p5 || city;
      cityIndex = Number(p6) || null;
      peaNumber = p7 || '';
    } else {
      peaNumber = p5 || '';
      if (p6 && typeof p6 === 'string' && isNaN(Number(p6))) city = p6;
      if (p7 && (typeof p7 === 'number' || !isNaN(Number(p7)))) cityIndex = Number(p7);
    }
  }

  const prefix = getEquipmentConditionPrefix({ area, voltage, locationType, equipmentType, year, city });
  
  const numToUse = (cityIndex !== null && cityIndex > 0) ? cityIndex : 1;
  const indexStr = String(numToUse).padStart(5, '0');

  const eqCode = getEquipmentTypeAbbreviation2(String(equipmentType));
  
  // 1.9 Distribution Circuit or empty PEA number gets XXXXXX
  let peaCode = 'XXXXXX';
  if (eqCode !== 'DC' && peaNumber && String(peaNumber).trim() !== '' && String(peaNumber).toUpperCase() !== 'N/A' && String(peaNumber).toUpperCase() !== 'NONE') {
    peaCode = getPea6Digits(String(peaNumber));
  }

  return `${prefix}#${indexStr}-${peaCode}`;
}

// Generate beautiful high-fidelity mock data for initial load/fallback
export function getMockAssets(): CableAsset[] {
  const baseAssets: GeneralInformation[] = [
    {
      number: 1,
      timestamp: '2026-07-15 10:30:00',
      operatorName: 'Somsak PEA',
      voltageLevel: '115',
      city: 'Chiang Mai',
      equipmentType: 'Underground Cable',
      manufacturer: 'Prysmian Group',
      country: 'Germany',
      locationType: 'Transmission Line',
      substationName: 'Chiang Mai 2 Substation',
      landmark: 'Main Highway Road 107',
      gps: { lat: 18.7883, lng: 98.9853 },
      yearOfRegistration: 2018,
      peaNumber: 'PEA-N1-UG01',
      assetNumber: 'SAP-9081234',
      adsNumber: 'ADS-1001',
      equipmentId: generateEquipmentId({ area: 'N1', voltage: '115', year: 2018, locationType: 'Transmission Line', equipmentType: 'Underground Cable', city: 'Chiang Mai', cityIndex: 1, peaNumber: '550001' })
    },
    {
      number: 2,
      timestamp: '2026-07-16 11:24:00',
      operatorName: 'Somsak PEA',
      voltageLevel: '115',
      city: 'Chiang Mai',
      equipmentType: 'Oil Insulated Termination',
      manufacturer: 'ABB Hitachi',
      country: 'Sweden',
      locationType: 'Substation',
      substationName: 'Chiang Mai 2 Substation',
      landmark: 'Substation Bay 04',
      gps: { lat: 18.7905, lng: 98.9950 },
      yearOfRegistration: 2018,
      peaNumber: 'PEA-N1-TR01',
      assetNumber: 'SAP-9081235',
      adsNumber: 'ADS-1002',
      equipmentId: generateEquipmentId({ area: 'N1', voltage: '115', year: 2018, locationType: 'Substation', equipmentType: 'Oil Insulated Termination', city: 'Chiang Mai', cityIndex: 2, peaNumber: '550002' })
    },
    {
      number: 3,
      timestamp: '2026-07-16 14:15:00',
      operatorName: 'Wichai Sompong',
      voltageLevel: '33',
      city: 'Chon Buri',
      equipmentType: 'Underground Cable',
      manufacturer: 'Sumitomo Electric',
      country: 'Japan',
      locationType: 'Transmission Line',
      substationName: 'Koh Larn Receiving Station',
      landmark: 'Pattaya Beach Landing Point',
      gps: { lat: 12.9235, lng: 100.8650 },
      yearOfRegistration: 2015,
      peaNumber: 'PEA-C2-SUB01',
      assetNumber: 'SAP-4059281',
      adsNumber: 'ADS-1003',
      equipmentId: generateEquipmentId({ area: 'C2', voltage: '33', year: 2015, locationType: 'Transmission Line', equipmentType: 'Underground Cable', city: 'Chon Buri', cityIndex: 1, peaNumber: '550003' })
    },
    {
      number: 4,
      timestamp: '2026-07-17 09:12:00',
      operatorName: 'Kitti PEA',
      voltageLevel: '115',
      city: 'Nakhon Ratchasima',
      equipmentType: 'Lightning Arrester',
      manufacturer: 'Siemens Energy',
      country: 'Germany',
      locationType: 'Substation',
      substationName: 'Korat 1 Substation',
      landmark: 'Transformer Bay 1A',
      gps: { lat: 14.9738, lng: 102.0831 },
      yearOfRegistration: 2012,
      peaNumber: 'PEA-NE3-SA01',
      assetNumber: 'SAP-3091845',
      adsNumber: 'ADS-1004',
      equipmentId: generateEquipmentId({ area: 'NE3', voltage: '115', year: 2012, locationType: 'Substation', equipmentType: 'Lightning Arrester', city: 'Nakhon Ratchasima', cityIndex: 1, peaNumber: '550004' })
    },
    {
      number: 5,
      timestamp: '2026-07-17 15:45:00',
      operatorName: 'Prasert Rakdee',
      voltageLevel: '115',
      city: 'Phetchaburi',
      equipmentType: 'Joint',
      manufacturer: 'LS Cable & System',
      country: 'South Korea',
      locationType: 'Transmission Line',
      substationName: 'Phuket 3 Substation',
      landmark: 'Manhole 42 near Bypass Rd',
      gps: { lat: 7.8804, lng: 98.3922 },
      yearOfRegistration: 2020,
      peaNumber: 'PEA-S1-JT42',
      assetNumber: 'SAP-8094821',
      adsNumber: 'ADS-1005',
      equipmentId: generateEquipmentId({ area: 'S1', voltage: '115', year: 2020, locationType: 'Transmission Line', equipmentType: 'Joint', city: 'Phetchaburi', cityIndex: 1, peaNumber: '550005' })
    },
    {
      number: 6,
      timestamp: '2026-07-18 08:30:00',
      operatorName: 'Anan Suksamran',
      voltageLevel: '115',
      city: 'Phitsanulok',
      equipmentType: 'GND Link box',
      manufacturer: 'Thai Maxwell',
      country: 'Thailand',
      locationType: 'Substation',
      substationName: 'Phitsanulok 1 Substation',
      landmark: 'Link Box Yard',
      gps: { lat: 16.8219, lng: 100.2653 },
      yearOfRegistration: 2021,
      peaNumber: 'PEA-N2-GB01',
      assetNumber: 'SAP-5012395',
      adsNumber: 'ADS-1006',
      equipmentId: generateEquipmentId({ area: 'N2', voltage: '115', year: 2021, locationType: 'Substation', equipmentType: 'GND Link box', city: 'Phitsanulok', cityIndex: 1, peaNumber: '550006' })
    },
    {
      number: 7,
      timestamp: '2026-07-18 10:45:00',
      operatorName: 'Sawat PEA',
      voltageLevel: '115',
      city: 'Nakhon Si Thammarat',
      equipmentType: 'Underground Cable',
      manufacturer: 'Bangkok Cable',
      country: 'Thailand',
      locationType: 'Transmission Line',
      substationName: 'Hat Yai 2 Substation',
      landmark: 'Phetkasem Road Crossing',
      gps: { lat: 7.0084, lng: 100.4767 },
      yearOfRegistration: 2010,
      peaNumber: 'PEA-S2-UG02',
      assetNumber: 'SAP-2098412',
      adsNumber: 'ADS-1007',
      equipmentId: generateEquipmentId({ area: 'S2', voltage: '115', year: 2010, locationType: 'Transmission Line', equipmentType: 'Underground Cable', city: 'Nakhon Si Thammarat', cityIndex: 1, peaNumber: '550007' })
    }
  ];

  const engInfo: Record<string, EngineeringInformation> = {
    [baseAssets[0].equipmentId]: {
      number: 1,
      timestamp: '2026-07-15 10:35:00',
      operatorName: 'Somsak PEA',
      equipmentId: baseAssets[0].equipmentId,
      loadCurrent: 180,
      sheathCurrent: 12,
      surfaceTemperature: 45,
      externalDischarge: 8,
      pdResult: 'None',
      onlinePdAmplitude: 8,
      insulationResistance: 12.5,
      tanDelta: 'No Action Required',
      tanDeltaAmplitude: 0.05
    },
    [baseAssets[1].equipmentId]: {
      number: 2,
      timestamp: '2026-07-16 11:30:00',
      operatorName: 'Somsak PEA',
      equipmentId: baseAssets[1].equipmentId,
      loadCurrent: 180,
      sheathCurrent: 42,
      surfaceTemperature: 58,
      externalDischarge: 80,
      pdResult: 'Corona',
      onlinePdAmplitude: 65,
      insulationResistance: 8.2,
      tanDelta: 'Further Study Advised',
      tanDeltaAmplitude: 0.38
    },
    [baseAssets[2].equipmentId]: {
      number: 3,
      timestamp: '2026-07-16 14:25:00',
      operatorName: 'Wichai Sompong',
      equipmentId: baseAssets[2].equipmentId,
      loadCurrent: 310,
      sheathCurrent: 135,
      surfaceTemperature: 76,
      externalDischarge: 320,
      pdResult: 'Surface',
      onlinePdAmplitude: 240,
      insulationResistance: 0.85,
      tanDelta: 'Further Study Advised',
      tanDeltaAmplitude: 0.62
    },
    [baseAssets[3].equipmentId]: {
      number: 4,
      timestamp: '2026-07-17 09:20:00',
      operatorName: 'Kitti PEA',
      equipmentId: baseAssets[3].equipmentId,
      loadCurrent: 140,
      sheathCurrent: 5,
      surfaceTemperature: 96,
      externalDischarge: 650,
      pdResult: 'Internal',
      onlinePdAmplitude: 580,
      insulationResistance: 0.05,
      tanDelta: 'Action Required',
      tanDeltaAmplitude: 1.45
    },
    [baseAssets[4].equipmentId]: {
      number: 5,
      timestamp: '2026-07-17 15:55:00',
      operatorName: 'Prasert Rakdee',
      equipmentId: baseAssets[4].equipmentId,
      loadCurrent: 220,
      sheathCurrent: 15,
      surfaceTemperature: 38,
      externalDischarge: 5,
      pdResult: 'None',
      onlinePdAmplitude: 5,
      insulationResistance: 45.0,
      tanDelta: 'No Action Required',
      tanDeltaAmplitude: 0.02
    },
    [baseAssets[5].equipmentId]: {
      number: 6,
      timestamp: '2026-07-18 08:40:00',
      operatorName: 'Anan Suksamran',
      equipmentId: baseAssets[5].equipmentId,
      loadCurrent: 190,
      sheathCurrent: 8,
      surfaceTemperature: 41,
      externalDischarge: 4,
      pdResult: 'None',
      onlinePdAmplitude: 4,
      insulationResistance: 22.1,
      tanDelta: 'No Action Required',
      tanDeltaAmplitude: 0.04
    },
    [baseAssets[6].equipmentId]: {
      number: 7,
      timestamp: '2026-07-18 10:55:00',
      operatorName: 'Sawat PEA',
      equipmentId: baseAssets[6].equipmentId,
      loadCurrent: 250,
      sheathCurrent: 110,
      surfaceTemperature: 82,
      externalDischarge: 580,
      pdResult: 'Treeing',
      onlinePdAmplitude: 510,
      insulationResistance: 0.08,
      tanDelta: 'Action Required',
      tanDeltaAmplitude: 1.82
    }
  };

  const visualInfo: Record<string, VisualInformation> = {
    [baseAssets[0].equipmentId]: {
      number: 1,
      timestamp: '2026-07-15 10:30:00',
      operatorName: 'Somsak PEA',
      equipmentId: baseAssets[0].equipmentId,
      visualPictureUrl: 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=400',
      thermalImageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'
    },
    [baseAssets[1].equipmentId]: {
      number: 2,
      timestamp: '2026-07-16 11:24:00',
      operatorName: 'Somsak PEA',
      equipmentId: baseAssets[1].equipmentId,
      visualPictureUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400',
      thermalImageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400'
    }
  };

  return baseAssets.map(asset => {
    const eng = (engInfo[asset.equipmentId] || {}) as Partial<EngineeringInformation>;
    const vis = (visualInfo[asset.equipmentId] || {}) as Partial<VisualInformation>;
    const { score, status } = calculateHealth(eng);

    const getMs = (ts: string) => {
      if (!ts) return 0;
      const d = new Date(ts.replace(/-/g, '/'));
      return isNaN(d.getTime()) ? 0 : d.getTime();
    };

    let latestBy = asset.operatorName || 'System';
    let latestAt = asset.timestamp || '';
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
      ...asset,
      ...eng,
      ...vis,
      healthScore: score,
      healthStatus: status,
      latestUpdatedBy: latestBy,
      latestUpdatedAt: latestAt
    } as CableAsset;
  });
}

export const PEA_TARGET_REGIONAL_COUNTS: Record<string, number> = {
  N1: 540,
  N2: 143,
  N3: 312,
  C1: 2025,
  C2: 1715,
  C3: 1279,
  S1: 299,
  S2: 781,
  S3: 148,
  NE1: 121,
  NE2: 44,
  NE3: 517
};

export const PEA_AREA_GPS_CENTER: Record<string, { lat: number; lng: number }> = {
  N1: { lat: 18.7883, lng: 98.9853 },
  N2: { lat: 16.8211, lng: 100.2659 },
  N3: { lat: 14.7995, lng: 100.6534 },
  NE1: { lat: 17.4138, lng: 102.7872 },
  NE2: { lat: 15.2293, lng: 104.8577 },
  NE3: { lat: 14.9707, lng: 102.0978 },
  C1: { lat: 14.3532, lng: 100.5684 },
  C2: { lat: 13.3611, lng: 100.9847 },
  C3: { lat: 13.8196, lng: 100.0443 },
  S1: { lat: 13.1119, lng: 99.9399 },
  S2: { lat: 8.4304, lng: 99.9631 },
  S3: { lat: 6.5411, lng: 101.2813 }
};

export const PEA_CITY_GPS: Record<string, { lat: number; lng: number }> = {
  // C1 (Central Area 1 - 7 provinces)
  'Phra Nakhon Si Ayutthaya': { lat: 14.3532, lng: 100.5684 },
  'Ang Thong': { lat: 14.5896, lng: 100.4550 },
  'Nakhon Nayok': { lat: 14.2069, lng: 101.2131 },
  'Pathum Thani': { lat: 14.0208, lng: 100.5250 },
  'Prachin Buri': { lat: 14.0510, lng: 101.3734 },
  'Sa Kaeo': { lat: 13.8140, lng: 102.0718 },
  'Saraburi': { lat: 14.5289, lng: 100.9108 },

  // C2 (Central Area 2 - 5 provinces)
  'Chon Buri': { lat: 13.3611, lng: 100.9847 },
  'Chachoengsao': { lat: 13.6904, lng: 101.0779 },
  'Chanthaburi': { lat: 12.6114, lng: 102.1039 },
  'Rayong': { lat: 12.6814, lng: 101.2816 },
  'Trat': { lat: 12.2428, lng: 102.5175 },

  // C3 (Central Area 3 - 4 provinces)
  'Nakhon Pathom': { lat: 13.8196, lng: 100.0443 },
  'Kanchanaburi': { lat: 14.0228, lng: 99.5328 },
  'Samut Sakhon': { lat: 13.5475, lng: 100.2744 },
  'Suphan Buri': { lat: 14.4745, lng: 100.1177 },

  // N1 (Northern Area 1 - 6 provinces)
  'Chiang Mai': { lat: 18.7883, lng: 98.9853 },
  'Chiang Rai': { lat: 19.9105, lng: 99.8406 },
  'Lampang': { lat: 18.2888, lng: 99.4928 },
  'Lamphun': { lat: 18.5745, lng: 99.0087 },
  'Mae Hong Son': { lat: 19.3021, lng: 97.9654 },
  'Phayao': { lat: 19.1664, lng: 99.9019 },

  // N2 (Northern Area 2 - 8 provinces)
  'Phitsanulok': { lat: 16.8211, lng: 100.2659 },
  'Kamphaeng Phet': { lat: 16.4828, lng: 99.5227 },
  'Nan': { lat: 18.7838, lng: 100.7782 },
  'Phichit': { lat: 16.4429, lng: 100.3488 },
  'Phrae': { lat: 18.1446, lng: 100.1410 },
  'Sukhothai': { lat: 17.0078, lng: 99.8230 },
  'Tak': { lat: 16.8839, lng: 99.1259 },
  'Uttaradit': { lat: 17.6256, lng: 100.0993 },

  // N3 (Northern Area 3 - 6 provinces)
  'Lop Buri': { lat: 14.7995, lng: 100.6534 },
  'Chai Nat': { lat: 15.1852, lng: 100.1251 },
  'Nakhon Sawan': { lat: 15.7057, lng: 100.1378 },
  'Phetchabun': { lat: 16.4190, lng: 101.1574 },
  'Sing Buri': { lat: 14.8936, lng: 100.4015 },
  'Uthai Thani': { lat: 15.3835, lng: 100.0246 },

  // NE1 (Northeastern Area 1 - 8 provinces)
  'Udon Thani': { lat: 17.4138, lng: 102.7872 },
  'Bueng Kan': { lat: 18.3633, lng: 103.6464 },
  'Khon Kaen': { lat: 16.4322, lng: 102.8236 },
  'Loei': { lat: 17.4860, lng: 101.7223 },
  'Nakhon Phanom': { lat: 17.4060, lng: 104.7788 },
  'Nong Bua Lamphu': { lat: 17.2044, lng: 102.4407 },
  'Nong Khai': { lat: 17.8783, lng: 102.7413 },
  'Sakon Nakhon': { lat: 17.1612, lng: 104.1486 },

  // NE2 (Northeastern Area 2 - 8 provinces)
  'Ubon Ratchathani': { lat: 15.2293, lng: 104.8577 },
  'Amnat Charoen': { lat: 15.8585, lng: 104.6258 },
  'Kalasin': { lat: 16.4327, lng: 103.5064 },
  'Maha Sarakham': { lat: 16.1852, lng: 103.3007 },
  'Mukdahan': { lat: 16.5436, lng: 104.7235 },
  'Roi Et': { lat: 16.0538, lng: 103.6520 },
  'Sisaket': { lat: 15.1186, lng: 104.3220 },
  'Yasothon': { lat: 15.7926, lng: 104.1451 },

  // NE3 (Northeastern Area 3 - 4 provinces)
  'Nakhon Ratchasima': { lat: 14.9707, lng: 102.0978 },
  'Buri Ram': { lat: 14.9930, lng: 103.1029 },
  'Chaiyaphum': { lat: 15.8105, lng: 102.0315 },
  'Surin': { lat: 14.8818, lng: 103.4936 },

  // S1 (Southern Area 1 - 6 provinces)
  'Phetchaburi': { lat: 13.1119, lng: 99.9399 },
  'Chumphon': { lat: 10.4930, lng: 99.1800 },
  'Prachuap Khiri Khan': { lat: 11.8124, lng: 99.7974 },
  'Ranong': { lat: 9.9658, lng: 98.6348 },
  'Ratchaburi': { lat: 13.5283, lng: 99.8134 },
  'Samut Songkhram': { lat: 13.4098, lng: 99.9994 },

  // S2 (Southern Area 2 - 6 provinces)
  'Nakhon Si Thammarat': { lat: 8.4304, lng: 99.9631 },
  'Krabi': { lat: 8.0863, lng: 98.9063 },
  'Phang Nga': { lat: 8.4501, lng: 98.5255 },
  'Phuket': { lat: 7.8804, lng: 98.3923 },
  'Surat Thani': { lat: 9.1382, lng: 99.3217 },
  'Trang': { lat: 7.5563, lng: 99.6114 },

  // S3 (Southern Area 3 - 6 provinces)
  'Yala': { lat: 6.5411, lng: 101.2813 },
  'Narathiwat': { lat: 6.4255, lng: 101.8253 },
  'Pattani': { lat: 6.8675, lng: 101.2501 },
  'Phatthalung': { lat: 7.6167, lng: 100.0740 },
  'Satun': { lat: 6.6238, lng: 100.0674 },
  'Songkhla': { lat: 7.1988, lng: 100.5951 }
};

export function getCityGpsCenter(city?: string, area?: string): { lat: number; lng: number } {
  if (city) {
    const clean = city.trim();
    if (PEA_CITY_GPS[clean]) {
      return PEA_CITY_GPS[clean];
    }
    const cleanLower = clean.toLowerCase();
    for (const [c, gps] of Object.entries(PEA_CITY_GPS)) {
      const cLower = c.toLowerCase();
      if (cLower === cleanLower || cleanLower.includes(cLower) || cLower.includes(cleanLower)) {
        return gps;
      }
    }
  }
  if (area && PEA_AREA_GPS_CENTER[area]) {
    return PEA_AREA_GPS_CENTER[area];
  }
  return { lat: 13.7563, lng: 100.5018 };
}

/**
 * Ensures only authentic Google Sheets assets are preserved and cleans any synthetic dummy records.
 * For all genuine assets, their authentic GPS coordinates (from Google Sheets Column L)
 * are strictly preserved without modification.
 */
export function ensureComplete12Areas(existingAssets?: CableAsset[]): CableAsset[] {
  if (!Array.isArray(existingAssets)) return [];

  // Filter out any synthetic/mock assets from previous generation runs
  const cleanList = existingAssets.filter(asset => {
    if (!asset) return false;
    if (asset.latestUpdatedBy && (asset.latestUpdatedBy.includes('Telemetry System') || asset.latestUpdatedBy.includes('Synthetic'))) return false;
    if (asset.operatorName && (asset.operatorName.includes('Telemetry System') || asset.operatorName.includes('Synthetic') || asset.operatorName.includes('Automatic Grid Monitor'))) return false;
    if (asset.assetNumber && (String(asset.assetNumber).startsWith('SAP-900') || String(asset.assetNumber).startsWith('SYNTH'))) return false;
    if ((asset as any).isSynthetic) return false;
    return true;
  });

  return cleanList.map((asset, idx) => ({
    ...asset,
    number: asset.number || idx + 1
  }));
}

/**
 * Formats a long URL into a clean, shortened display representation for UI cards.
 * Note: The underlying href and QR code MUST ALWAYS use the authentic full original link
 * to prevent third-party shortener expiration, rate limits, or link death.
 */
export function formatShortUrl(url?: string, maxLength = 32): string {
  if (!url) return '';
  const clean = url.trim();
  try {
    const parsed = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    const search = parsed.search ? '?' + parsed.search.slice(1, 6) : '';
    const fullDisplay = host + pathname + search;
    if (fullDisplay.length <= maxLength) {
      return fullDisplay;
    }
    const availPath = maxLength - host.length - 3;
    if (availPath > 5) {
      return `${host}${pathname.substring(0, availPath)}...`;
    }
    return `${host}/...`;
  } catch {
    if (clean.length <= maxLength) return clean;
    return clean.substring(0, maxLength - 3) + '...';
  }
}

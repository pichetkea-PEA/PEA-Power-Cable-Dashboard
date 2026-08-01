import { 
  PEAUser, 
  CableAsset, 
  EquipmentType, 
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

export const ALL_EQUIPMENT_TYPES: EquipmentType[] = [
  'Underground Cable',
  'Oil Insulated Termination',
  'Joint',
  'GND Link box',
  'Lightning Arrester',
  'Heat Shrink Termination',
  'Plug in Termination',
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
  'Ring Main Unit',
  'Unit Substation',
  'LV ATS',
  'Distribution Circuit'
];

export function getAvailableEquipmentTypes(voltageLevel: string): EquipmentType[] {
  if (voltageLevel === '115') {
    return ALL_EQUIPMENT_TYPES.filter(t => !EXCLUDED_115KV_TYPES.includes(t));
  }
  return ALL_EQUIPMENT_TYPES;
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

export const VOLTAGE_LEVELS = ['115', '33', '22'];

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

export const EQUIPMENT_TYPE_ABBREVIATIONS: Record<string, string> = {
  'Underground Cable': 'UGC',
  'Oil Insulated Termination': 'OTE',
  'Joint': 'JOT',
  'GND Link box': 'GNB',
  'Lightning Arrester': 'LNA',
  'Heat Shrink Termination': 'HST',
  'Plug in Termination': 'PLT',
  'Air Break Switch': 'ABS',
  'Dry Type Termination': 'DTE',
  'Ring Main Unit': 'RMU',
  'Unit Substation': 'UNS',
  'HV ATS': 'HAT',
  'LV ATS': 'LAT',
  'Distribution Circuit': 'DSC'
};

export function getEquipmentTypeAbbreviation(type: string): string {
  if (EQUIPMENT_TYPE_ABBREVIATIONS[type]) {
    return EQUIPMENT_TYPE_ABBREVIATIONS[type];
  }
  if (type === 'Submarine Cable') return 'UGC';
  if (type === 'Termination') return 'OTE';
  if (type === 'Surge Arrester') return 'LNA';
  if (type === 'Ground Box') return 'GNB';
  if (type === 'SVL') return 'GNB';
  return (type || '').substring(0, 3).toUpperCase() || 'EQP';
}

// Generate Equipment ID helper
export function generateEquipmentId(
  area: string,
  voltage: string,
  year: number,
  type: string,
  peaNumber: string,
  assetNumber?: string,
  adsNumber?: string
): string {
  const typeCode = getEquipmentTypeAbbreviation(type);
  const cleanPea = (peaNumber || '').trim().replace(/\s+/g, '');
  const cleanAsset = (assetNumber || '').trim().replace(/\s+/g, '');
  const cleanAds = (adsNumber || '').trim().replace(/\s+/g, '');
  
  let suffix = cleanPea;
  if (!suffix) {
    if (cleanAsset) suffix = cleanAsset;
    else if (cleanAds) suffix = cleanAds;
    else suffix = 'TEMP-' + Math.floor(1000 + Math.random() * 9000);
  }
  
  return `${area}-${voltage}kV-${year}-${typeCode}-${suffix}`;
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
      equipmentId: 'N1-115kV-2018-UND-PEA-N1-UG01'
    },
    {
      number: 2,
      timestamp: '2026-07-16 11:24:00',
      operatorName: 'Somsak PEA',
      voltageLevel: '115',
      city: 'Chiang Mai',
      equipmentType: 'Termination',
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
      equipmentId: 'N1-115kV-2018-TER-PEA-N1-TR01'
    },
    {
      number: 3,
      timestamp: '2026-07-16 14:15:00',
      operatorName: 'Wichai Sompong',
      voltageLevel: '33',
      city: 'Chon Buri',
      equipmentType: 'Submarine Cable',
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
      equipmentId: 'C2-33kV-2015-SUB-PEA-C2-SUB01'
    },
    {
      number: 4,
      timestamp: '2026-07-17 09:12:00',
      operatorName: 'Kitti PEA',
      voltageLevel: '115',
      city: 'Nakhon Ratchasima',
      equipmentType: 'Surge Arrester',
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
      equipmentId: 'NE3-115kV-2012-SUR-PEA-NE3-SA01'
    },
    {
      number: 5,
      timestamp: '2026-07-17 15:45:00',
      operatorName: 'Prasert Rakdee',
      voltageLevel: '115',
      city: 'Phuket',
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
      equipmentId: 'S1-115kV-2020-JOI-PEA-S1-JT42'
    },
    {
      number: 6,
      timestamp: '2026-07-18 08:30:00',
      operatorName: 'Anan Suksamran',
      voltageLevel: '115',
      city: 'Phitsanulok',
      equipmentType: 'Ground Box',
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
      equipmentId: 'N2-115kV-2021-GRO-PEA-N2-GB01'
    },
    {
      number: 7,
      timestamp: '2026-07-18 10:45:00',
      operatorName: 'Sawat PEA',
      voltageLevel: '115',
      city: 'Hat Yai',
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
      equipmentId: 'S2-115kV-2010-UND-PEA-S2-UG02'
    }
  ];

  const engInfo: Record<string, EngineeringInformation> = {
    'N1-115kV-2018-UND-PEA-N1-UG01': {
      number: 1,
      timestamp: '2026-07-15 10:35:00',
      operatorName: 'Somsak PEA',
      equipmentId: 'N1-115kV-2018-UND-PEA-N1-UG01',
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
    'N1-115kV-2018-TER-PEA-N1-TR01': {
      number: 2,
      timestamp: '2026-07-16 11:30:00',
      operatorName: 'Somsak PEA',
      equipmentId: 'N1-115kV-2018-TER-PEA-N1-TR01',
      loadCurrent: 180,
      sheathCurrent: 42, // Elevated sheath current
      surfaceTemperature: 58, // Yellow: elevated temperature
      externalDischarge: 80, // Yellow PD
      pdResult: 'Corona',
      onlinePdAmplitude: 65,
      insulationResistance: 8.2, // Yellow
      tanDelta: 'Further Study Advised', // Yellow
      tanDeltaAmplitude: 0.38
    },
    'C2-33kV-2015-SUB-PEA-C2-SUB01': {
      number: 3,
      timestamp: '2026-07-16 14:25:00',
      operatorName: 'Wichai Sompong',
      equipmentId: 'C2-33kV-2015-SUB-PEA-C2-SUB01',
      loadCurrent: 310,
      sheathCurrent: 135, // High sheath current ratio
      surfaceTemperature: 76, // Orange surface temp
      externalDischarge: 320, // Orange discharge
      pdResult: 'Surface',
      onlinePdAmplitude: 240,
      insulationResistance: 0.85, // Orange insulation
      tanDelta: 'Further Study Advised',
      tanDeltaAmplitude: 0.62
    },
    'NE3-115kV-2012-SUR-PEA-NE3-SA01': {
      number: 4,
      timestamp: '2026-07-17 09:20:00',
      operatorName: 'Kitti PEA',
      equipmentId: 'NE3-115kV-2012-SUR-PEA-NE3-SA01',
      loadCurrent: 140,
      sheathCurrent: 5,
      surfaceTemperature: 96, // Red: Severe temperature
      externalDischarge: 650, // Red: Severe discharge
      pdResult: 'Internal', // Red: Internal PD
      onlinePdAmplitude: 580,
      insulationResistance: 0.05, // Red: Extremely low resistance
      tanDelta: 'Action Required', // Red
      tanDeltaAmplitude: 1.45
    },
    'S1-115kV-2020-JOI-PEA-S1-JT42': {
      number: 5,
      timestamp: '2026-07-17 15:55:00',
      operatorName: 'Prasert Rakdee',
      equipmentId: 'S1-115kV-2020-JOI-PEA-S1-JT42',
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
    'N2-115kV-2021-GRO-PEA-N2-GB01': {
      number: 6,
      timestamp: '2026-07-18 08:40:00',
      operatorName: 'Anan Suksamran',
      equipmentId: 'N2-115kV-2021-GRO-PEA-N2-GB01',
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
    'S2-115kV-2010-UND-PEA-S2-UG02': {
      number: 7,
      timestamp: '2026-07-18 10:55:00',
      operatorName: 'Sawat PEA',
      equipmentId: 'S2-115kV-2010-UND-PEA-S2-UG02',
      loadCurrent: 250,
      sheathCurrent: 110, // Extreme Sheath Current
      surfaceTemperature: 82, // Orange/Red thermal hotspot
      externalDischarge: 580, // Red PD
      pdResult: 'Treeing', // Red: Treeing insulation degradation
      onlinePdAmplitude: 510,
      insulationResistance: 0.08, // Red IR
      tanDelta: 'Action Required', // Red
      tanDeltaAmplitude: 1.82
    }
  };

  const visualInfo: Record<string, VisualInformation> = {
    'N1-115kV-2018-UND-PEA-N1-UG01': {
      number: 1,
      timestamp: '2026-07-15 10:30:00',
      operatorName: 'Somsak PEA',
      equipmentId: 'N1-115kV-2018-UND-PEA-N1-UG01',
      visualPictureUrl: 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=400',
      thermalImageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'
    },
    'N1-115kV-2018-TER-PEA-N1-TR01': {
      number: 2,
      timestamp: '2026-07-16 11:24:00',
      operatorName: 'Somsak PEA',
      equipmentId: 'N1-115kV-2018-TER-PEA-N1-TR01',
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

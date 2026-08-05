export type UserRole = 'Local Operator' | 'Manager' | 'Admin' | 'User';

export interface PEAUser {
  uid?: string;
  email: string;
  name: string;
  employeeId?: string;
  requestId?: string;
  status?: 'active' | 'pending' | 'rejected';
  role: UserRole;
  interestArea: string; // e.g. N1 to S3 or ALL
}

export type LocationType = 'Transmission Line' | 'Substation' | 'Distribution Line';

export type EquipmentType =
  | 'Underground Cable'
  | 'Oil Insulated Termination'
  | 'Joint'
  | 'GND Link box'
  | 'Lightning Arrester'
  | 'Heat Shrink Termination'
  | 'Plug in Termination'
  | 'Air Break Switch'
  | 'Dry Type Termination'
  | 'Ring Main Unit'
  | 'Unit Substation'
  | 'HV ATS'
  | 'LV ATS'
  | 'Distribution Circuit'
  | 'Submarine Cable'
  | 'Termination'
  | 'Surge Arrester'
  | 'Ground Box'
  | 'SVL';

export type TanDeltaResult =
  | 'No Action Required'
  | 'Action Required'
  | 'Further Study Advised'
  | 'No record';

export type PDResultType =
  | 'Corona'
  | 'Surface'
  | 'Internal'
  | 'Floating'
  | 'Void'
  | 'Treeing'
  | 'None';

export type HealthStatus = 'Green' | 'Yellow' | 'Orange' | 'Red';

export interface GeneralInformation {
  number: number;
  timestamp: string;
  operatorName: string;
  voltageLevel: string; // e.g. "115", "22", "33"
  city: string;
  equipmentType: EquipmentType;
  manufacturer: string;
  country: string;
  locationType: LocationType;
  substationName: string;
  landmark: string;
  gps: {
    lat: number;
    lng: number;
  };
  yearOfRegistration: number;
  peaNumber: string;
  assetNumber: string;
  adsNumber?: string;
  // 15 New Columns (Q-AE)
  productionMonth?: string;
  installationDate?: string;
  wbs?: string;
  businessType?: string;
  costCenter?: string;
  gistag?: string;
  class?: string;
  contractNumber?: string;
  feeder?: string;
  substationId?: string;
  operateId?: string;
  serialNumber?: string;
  model?: string;
  workOrder?: string;
  size?: string;
  assetValue?: string; // Col AF in Google Sheets, Col AD in uploaded CSV
  // Shifted to AG
  equipmentId: string;
  customFields?: Record<string, string>;
}

export interface EngineeringInformation {
  number: number;
  timestamp: string;
  operatorName: string;
  equipmentId: string;
  loadCurrent: number; // Amps
  sheathCurrent: number; // Amps
  surfaceTemperature: number; // Celsius
  externalDischarge: number; // pC
  pdResult: PDResultType;
  onlinePdAmplitude: number; // pC (inserted at J)
  insulationResistance: number; // GOhm (shifted to K)
  tanDelta: TanDeltaResult; // (shifted to L)
  tanDeltaAmplitude: number; // (added at M)
  customFields?: Record<string, string>;
}

export interface VisualInformation {
  number: number;
  timestamp: string;
  operatorName: string;
  equipmentId: string;
  visualPictureUrl: string;
  thermalImageUrl: string;
}

export interface CableAsset extends GeneralInformation {
  // Joined engineering details (last entry matching equipmentId)
  loadCurrent?: number;
  sheathCurrent?: number;
  surfaceTemperature?: number;
  externalDischarge?: number;
  pdResult?: PDResultType;
  onlinePdAmplitude?: number;
  insulationResistance?: number;
  tanDelta?: TanDeltaResult;
  tanDeltaAmplitude?: number;
  
  // Joined visual details (last entry)
  visualPictureUrl?: string;
  thermalImageUrl?: string;

  // Computed metrics
  healthScore: number; // 0 to 100
  healthStatus: HealthStatus;

  // Latest update tracker
  latestUpdatedBy?: string;
  latestUpdatedAt?: string;
  spreadsheetId?: string;
}

export interface DashboardFilters {
  area: string; // "All" or area name
  city: string; // "All" or city name
  voltageLevel: string; // "All" or voltage
  equipmentType: string; // "All" or equipment type
  yearOfRegistration?: string; // "All" or year
  ageRange: string; // "All" or age range: "0-5", "5-15", "15-25", "25+"
  countryOfOrigin: string; // "All" or country
  manufacturer: string; // "All" or manufacturer
  assetOrPeaNumber: string; // search string
}

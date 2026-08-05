import React, { useState, useMemo, useEffect } from 'react';
import { CableAsset, EquipmentType, LocationType, PEAUser } from '../types';
import { getBangkokTimestamp } from '../utils/dateUtils';
import { 
  PEA_AREAS, 
  PEA_AREA_NAMES, 
  EQUIPMENT_TYPES, 
  ALL_EQUIPMENT_TYPES,
  VOLTAGE_LEVELS,
  getEquipmentTypeAbbreviation,
  getManufacturersForEquipmentType,
  COUNTRIES_OF_ORIGIN,
  generateEquipmentId
} from '../utils/peaData';
import { 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle, 
  UploadCloud, 
  FileText, 
  FileSpreadsheet, 
  Play, 
  Trash2, 
  Edit, 
  Save, 
  X, 
  Sparkles, 
  Lock,
  RefreshCw,
  Search,
  PlusCircle,
  Copy,
  Database,
  Download,
  Loader2
} from 'lucide-react';
import { updateSheetRow, fetchSheetsRowIndices, autoDiscoverAndSync, fetchSheetsData, appendGeneralRow, appendEngineeringRow, appendVisualRow, appendGeneralRowsBatch, appendEngineeringRowsBatch, appendVisualRowsBatch, fetchLastSheetNumber, getMasterSpreadsheetsMap, batchUpdateSheetRows } from '../utils/googleSheets';
import { saveCentralAssetsCache } from '../utils/firestore';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { ChevronDown } from 'lucide-react';
import { RegistrationProgressModal } from './RegistrationProgressModal';

interface AdminRegistrationSuiteProps {
  assets: CableAsset[];
  googleToken: string | null;
  spreadsheetId: string | null;
  spreadsheetIds: string[];
  onRefresh: () => void;
  user?: PEAUser | null;
}

export default function AdminRegistrationSuite({
  assets,
  googleToken,
  spreadsheetId,
  spreadsheetIds,
  onRefresh,
  user
}: AdminRegistrationSuiteProps) {
  // Navigation Tabs within Registration Suite
  const [activeSubTab, setActiveSubTab] = useState<'register' | 'integrity'>('register');

  // Manual Asset Entry Fields
  const [selectedArea, setSelectedArea] = useState<string>('N1');
  const [operatorName, setOperatorName] = useState<string>('PEA Admin');
  const [voltageLevel, setVoltageLevel] = useState<string>('115');
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('Underground Cable');
  const [manufacturer, setManufacturer] = useState<string>('');
  const [country, setCountry] = useState<string>('Thailand');
  const [locationType, setLocationType] = useState<LocationType>('Substation');
  const [substationName, setSubstationName] = useState<string>('');
  const [landmark, setLandmark] = useState<string>('');
  const [lat, setLat] = useState<string>('13.7563');
  const [lng, setLng] = useState<string>('100.5018');
  const [yearOfRegistration, setYearOfRegistration] = useState<number>(new Date().getFullYear());
  
  // New General Info Columns
  const [productionMonth, setProductionMonth] = useState<string>('');
  const [installationDate, setInstallationDate] = useState<string>('');
  const [wbs, setWbs] = useState<string>('');
  const [businessType, setBusinessType] = useState<string>('');
  const [costCenter, setCostCenter] = useState<string>('');
  const [gistag, setGistag] = useState<string>('');
  const [assetClass, setAssetClass] = useState<string>('');
  const [contractNumber, setContractNumber] = useState<string>('');
  const [feeder, setFeeder] = useState<string>('');
  const [substationId, setSubstationId] = useState<string>('');
  const [operateId, setOperateId] = useState<string>('');
  const [serialNumber, setSerialNumber] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [workOrder, setWorkOrder] = useState<string>('');
  const [size, setSize] = useState<string>('400 sq.mm');

  // SAP manual keys
  const [assetNumber, setAssetNumber] = useState<string>(''); // Equipment Number ADS
  const [adsNumber, setAdsNumber] = useState<string>(''); // Account Asset Number (AA)

  // Auto generated PEA number preview
  const runningNumber = useMemo(() => {
    // Find the max running number for this equipment type
    const sameType = assets.filter(a => a.equipmentType === equipmentType);
    return sameType.length + 1;
  }, [assets, equipmentType]);

  const generatedPeaNumber = useMemo(() => {
    const typeCode = getEquipmentTypeAbbreviation(equipmentType) || 'EQP';
    const cleanSize = size.replace(/\s+/g, '').substring(0, 5);
    const paddedNum = String(runningNumber).padStart(4, '0');
    return `${typeCode}${yearOfRegistration}-${voltageLevel}${cleanSize}${paddedNum}`;
  }, [equipmentType, yearOfRegistration, voltageLevel, size, runningNumber]);

  const generatedEquipmentId = useMemo(() => {
    const typeCode = getEquipmentTypeAbbreviation(equipmentType) || 'EQP';
    return `${selectedArea}-${voltageLevel}kV-${yearOfRegistration}-${typeCode}-${generatedPeaNumber}`;
  }, [selectedArea, voltageLevel, yearOfRegistration, equipmentType, generatedPeaNumber]);

  // CSV Bulk File Import states
  const [csvFileObj, setCsvFileObj] = useState<File | null>(null);
  const [csvParsedRows, setCsvParsedRows] = useState<string[][]>([]);
  const [selectedCsvOption, setSelectedCsvOption] = useState<1 | 2 | null>(null);
  const [option1ReviewList, setOption1ReviewList] = useState<any[]>([]);
  const [option2ReviewList, setOption2ReviewList] = useState<any[]>([]);
  const [showCsvModal, setShowCsvModal] = useState<boolean>(false);
  const [isProcessingOption1, setIsProcessingOption1] = useState<boolean>(false);
  const [editingOption1Item, setEditingOption1Item] = useState<{ index: number; data: any } | null>(null);
  const [editingOption2Item, setEditingOption2Item] = useState<{ index: number; data: any } | null>(null);
  const [option2StatusMsg, setOption2StatusMsg] = useState<string>('');
  const [isProcessingOption2, setIsProcessingOption2] = useState<boolean>(false);
  const [option2TotalToUpdate, setOption2TotalToUpdate] = useState<number>(0);
  const [option2CurrentIndex, setOption2CurrentIndex] = useState<number>(0);
  const [option2CurrentPea, setOption2CurrentPea] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [commitSuccess, setCommitSuccess] = useState<string>('');
  const [mismatchModalData, setMismatchModalData] = useState<{
    spreadsheetId: string;
    rowIndex: number;
    existingData: any;
    uploadedData: any;
    mismatches: string[];
    onResolve: (overwrite: boolean) => void;
  } | null>(null);

  // Integrity checks duplicates state
  const [integrityFilterType, setIntegrityFilterType] = useState<'all' | 'pea' | 'sap' | 'aa'>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveAction, setResolveAction] = useState<string>('');

  // Manual duplicate override editing states
  const [editingAsset, setEditingAsset] = useState<CableAsset | null>(null);
  const [editPea, setEditPea] = useState<string>('');
  const [editAds, setEditAds] = useState<string>('');
  const [editAa, setEditAa] = useState<string>('');
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);

  // Registration Progress Modal State
  const [progressModal, setProgressModal] = useState<{
    isOpen: boolean;
    title: string;
    stepMessage: string;
    percent: number;
    isError: boolean;
    errorMessage?: string;
    isComplete: boolean;
    totalItems?: number;
    currentItemIndex?: number;
    currentItemName?: string;
  }>({
    isOpen: false,
    title: 'Registering New Asset',
    stepMessage: '',
    percent: 0,
    isError: false,
    isComplete: false
  });

  // Latest PEA Number per equipment type across 12 sheets (Column N)
  const [isCheckingPea, setIsCheckingPea] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('');

  // 5 Dropdown Filters for Latest PEA Number finding
  const [filterVoltage, setFilterVoltage] = useState<string>('115');
  const [filterEquipmentType, setFilterEquipmentType] = useState<EquipmentType>('Underground Cable');
  const [filterLocationType, setFilterLocationType] = useState<LocationType>('Substation');
  const [filterSize, setFilterSize] = useState<string>('400 sq.mm');
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));

  // Computed available equipment types based on voltage level
  const availableEquipmentTypes = useMemo(() => {
    if (filterVoltage === '115') {
      return ALL_EQUIPMENT_TYPES.filter(t => !['Heat Shrink Termination', 'Ring Main Unit', 'Unit Substation', 'LV ATS', 'Distribution Circuit'].includes(t));
    } else {
      return ALL_EQUIPMENT_TYPES.filter(t => !['Air Break Switch', 'HV ATS'].includes(t));
    }
  }, [filterVoltage]);

  // Computed available location types based on voltage level
  const availableLocationTypes = useMemo(() => {
    if (filterVoltage === '115') {
      return ['Substation', 'Transmission Line'];
    } else {
      return ['Substation', 'Distribution Line'];
    }
  }, [filterVoltage]);

  // Computed available size options based on equipment type and location type
  const availableSizes = useMemo(() => {
    const cableOrTerm = ['Underground Cable', 'Oil Insulated Termination', 'Dry Type Termination', 'Heat Shrink Termination', 'Plug in Termination', 'Joint', 'Submarine Cable'].includes(filterEquipmentType);
    if (!cableOrTerm) {
      return ['Standard'];
    }
    const sizes = ['400 sq.mm', '240 sq.mm', '95 sq.mm', '500 sq.mm', '800 sq.mm', '35 sq.mm', '50 sq.mm', '300 sq.mm'];
    if (filterEquipmentType === 'Submarine Cable') {
      sizes.push('120 sq.mm', '70 sq.mm', '185 sq.mm');
    }
    if (filterEquipmentType === 'Joint' && filterLocationType !== 'Substation') {
      sizes.push('Separate Joint', 'Straight Joint');
    }
    return sizes;
  }, [filterEquipmentType, filterLocationType]);

  const handleVoltageChange = (newVal: string) => {
    setFilterVoltage(newVal);
    const newEquips = newVal === '115' 
      ? ALL_EQUIPMENT_TYPES.filter(t => !['Heat Shrink Termination', 'Ring Main Unit', 'Unit Substation', 'LV ATS', 'Distribution Circuit'].includes(t))
      : ALL_EQUIPMENT_TYPES.filter(t => !['Air Break Switch', 'HV ATS'].includes(t));
    if (!newEquips.includes(filterEquipmentType)) {
      setFilterEquipmentType(newEquips[0]);
    }
    const newLocs = newVal === '115' ? ['Substation', 'Transmission Line'] : ['Substation', 'Distribution Line'];
    if (!newLocs.includes(filterLocationType)) {
      setFilterLocationType('Substation' as LocationType);
    }
  };

  const handleEquipmentTypeChange = (newEq: EquipmentType) => {
    setFilterEquipmentType(newEq);
    const cableOrTerm = ['Underground Cable', 'Oil Insulated Termination', 'Dry Type Termination', 'Heat Shrink Termination', 'Plug in Termination', 'Joint', 'Submarine Cable'].includes(newEq);
    if (!cableOrTerm) {
      setFilterSize('Standard');
    } else {
      const sizes = ['400 sq.mm', '240 sq.mm', '95 sq.mm', '500 sq.mm', '800 sq.mm', '35 sq.mm', '50 sq.mm', '300 sq.mm'];
      if (newEq === 'Submarine Cable') sizes.push('120 sq.mm', '70 sq.mm', '185 sq.mm');
      if (newEq === 'Joint' && filterLocationType !== 'Substation') sizes.push('Separate Joint', 'Straight Joint');
      if (!sizes.includes(filterSize)) {
        setFilterSize(sizes[0]);
      }
    }
  };

  const handleLocationTypeChange = (newLoc: LocationType) => {
    setFilterLocationType(newLoc);
    if (filterEquipmentType === 'Joint') {
      const sizes = ['400 sq.mm', '240 sq.mm', '95 sq.mm', '500 sq.mm', '800 sq.mm', '35 sq.mm', '50 sq.mm', '300 sq.mm'];
      if (newLoc !== 'Substation') sizes.push('Separate Joint', 'Straight Joint');
      if (!sizes.includes(filterSize)) {
        setFilterSize(sizes[0]);
      }
    }
  };

  const [filterScanResult, setFilterScanResult] = useState<{
    latestPea: string;
    area: string;
    matchingCount: number;
    protocolPrefix: string;
    suggestedNextPea: string;
  }>({
    latestPea: 'N/A',
    area: '-',
    matchingCount: 0,
    protocolPrefix: '',
    suggestedNextPea: ''
  });

  const checkLatestPeaWithFilters = async () => {
    setIsCheckingPea(true);
    setScanMessage('Scanning Column N ("PEA Number") across 12 Google Sheets using PEA Protocol filters...');
    try {
      const selectedYearNum = parseInt(filterYear, 10) || new Date().getFullYear();
      const buddhistYr = selectedYearNum + 543;
      const yy = String(buddhistYr).slice(-2);

      let prefix = 'UG';
      if (['Oil Insulated Termination', 'Dry Type Termination', 'Heat Shrink Termination', 'Plug in Termination'].includes(filterEquipmentType)) {
        prefix = 'TM';
      } else if (filterEquipmentType === 'Lightning Arrester') {
        prefix = 'LA';
      } else if (filterEquipmentType === 'Submarine Cable') {
        prefix = 'SB';
      } else if (filterEquipmentType === 'Underground Cable') {
        prefix = 'UG';
      } else if (filterEquipmentType === 'Ring Main Unit' || filterEquipmentType === 'Unit Substation') {
        prefix = 'RU';
      } else if (filterEquipmentType === 'Joint') {
        prefix = 'JO';
      } else if (filterEquipmentType === 'Air Break Switch') {
        prefix = 'AB';
      } else if (filterEquipmentType === 'GND Link box') {
        prefix = 'GB';
      } else if (filterEquipmentType === 'HV ATS' || filterEquipmentType === 'LV ATS') {
        prefix = 'AM';
      } else if (filterEquipmentType === 'Distribution Circuit') {
        prefix = 'DC';
      }

      let x1 = '5';
      if (filterVoltage === '22') x1 = '2';
      else if (filterVoltage === '33') x1 = '3';
      else if (filterVoltage === '69') x1 = '4';
      else if (filterVoltage === '115') x1 = '5';

      let x2 = '0';
      const s = (filterSize || '').toLowerCase();
      const loc = (filterLocationType || '').toLowerCase();

      if (prefix === 'TM') {
        if (loc.includes('substation')) {
          if (s.includes('95')) x2 = '1';
          else if (s.includes('240')) x2 = '2';
          else if (s.includes('400')) x2 = '3';
          else if (s.includes('500')) x2 = '4';
          else if (s.includes('800')) x2 = '5';
          else if (s.includes('35')) x2 = '6';
          else if (s.includes('50')) x2 = '7';
          else if (s.includes('300')) x2 = '8';
          else x2 = '0';
        } else {
          x2 = '0';
        }
      } else if (prefix === 'LA' || prefix === 'RU' || prefix === 'AB' || prefix === 'GB' || prefix === 'AM' || prefix === 'DC') {
        x2 = '0';
      } else if (prefix === 'UG') {
        if (s.includes('95')) x2 = '1';
        else if (s.includes('240')) x2 = '2';
        else if (s.includes('400')) x2 = '3';
        else if (s.includes('500')) x2 = '4';
        else if (s.includes('800')) x2 = '5';
        else if (s.includes('35')) x2 = '6';
        else if (s.includes('50')) x2 = '7';
        else if (s.includes('300')) x2 = '8';
        else x2 = '0';
      } else if (prefix === 'JO') {
        if (loc.includes('substation')) {
          if (s.includes('95')) x2 = '1';
          else if (s.includes('240')) x2 = '2';
          else if (s.includes('400')) x2 = '3';
          else if (s.includes('500')) x2 = '4';
          else if (s.includes('800')) x2 = '5';
          else if (s.includes('35')) x2 = '6';
          else if (s.includes('50')) x2 = '7';
          else if (s.includes('300')) x2 = '8';
          else x2 = '0';
        } else {
          if (s.includes('separate')) x2 = '4';
          else if (s.includes('straight')) x2 = '5';
          else x2 = '0';
        }
      } else if (prefix === 'SB') {
        if (s.includes('95')) x2 = '1';
        else if (s.includes('240')) x2 = '2';
        else if (s.includes('400')) x2 = '3';
        else if (s.includes('500')) x2 = '4';
        else if (s.includes('800')) x2 = '5';
        else if (s.includes('120')) x2 = '6';
        else if (s.includes('70')) x2 = '7';
        else if (s.includes('300')) x2 = '8';
        else if (s.includes('185')) x2 = '9';
        else x2 = '0';
      }

      const patternPrefix = `${prefix}${yy}-${x1}${x2}`;

      let latestPea = 'N/A';
      let bestArea = '-';
      let matchingCount = 0;
      let maxRunningNum = 0;

      const allCollectedAssets: { pea: string; area: string }[] = [];

      if (googleToken) {
        const { spreadsheets } = await getMasterSpreadsheetsMap(googleToken);
        const entries = Object.entries(spreadsheets);
        await Promise.all(
          entries.map(async ([area, sheetId]) => {
            try {
              const sheetAssets = await fetchSheetsData(googleToken, sheetId);
              sheetAssets.forEach(asset => {
                const pea = (asset.peaNumber || '').trim();
                if (pea && pea !== 'N/A') {
                  allCollectedAssets.push({ pea, area });
                }
              });
            } catch (e) {
              console.warn(`Failed scanning area ${area}:`, e);
            }
          })
        );
      }

      assets.forEach(asset => {
        const pea = (asset.peaNumber || '').trim();
        if (pea && pea !== 'N/A') {
          allCollectedAssets.push({ pea, area: asset.city || 'Regional' });
        }
      });

      allCollectedAssets.forEach(item => {
        if (item.pea.toUpperCase().startsWith(patternPrefix.toUpperCase())) {
          matchingCount += 1;
          const matchNum = parseInt(item.pea.slice(-4), 10);
          if (!isNaN(matchNum)) {
            if (matchNum > maxRunningNum || latestPea === 'N/A') {
              maxRunningNum = matchNum;
              latestPea = item.pea;
              bestArea = item.area;
            }
          } else {
            if (latestPea === 'N/A' || item.pea > latestPea) {
              latestPea = item.pea;
              bestArea = item.area;
            }
          }
        }
      });

      const nextRunningNum = maxRunningNum > 0 ? maxRunningNum + 1 : 1;
      const suggestedNextPea = `${patternPrefix}${String(nextRunningNum).padStart(4, '0')}`;

      setFilterScanResult({
        latestPea,
        area: bestArea,
        matchingCount,
        protocolPrefix: patternPrefix,
        suggestedNextPea
      });
      setScanMessage(`Scan completed using protocol "${patternPrefix}". Found ${matchingCount} records across 12 sheets.`);
    } catch (err: any) {
      console.error("Error in filter scan:", err);
      setScanMessage(`Error scanning: ${err.message || 'Failed'}`);
    } finally {
      setIsCheckingPea(false);
    }
  };

  // Drag-and-drop / manual files selection upload handler
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseCSVFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseCSVFile(e.target.files[0]);
    }
  };

  const parseCsvLine = (line: string, delimiter: string = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped double quotes "" inside quoted field
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const parseCSVFile = async (file: File) => {
    setCsvFileObj(file);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let text = '';

      // Check UTF-16 LE/BE BOMs (Common when exporting "Unicode Text" from Excel)
      if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
        text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
      } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
        text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
      } else if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        // UTF-8 with BOM
        text = new TextDecoder('utf-8').decode(bytes.subarray(3));
      } else {
        // Test decoding with both Windows-874 / TIS-620 (standard Thai Windows CSV) and UTF-8
        let utf8Text = '';
        let thaiText = '';

        try {
          const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
          utf8Text = utf8Decoder.decode(bytes);
        } catch (e) {
          // Not strict UTF-8
        }

        try {
          const thaiDecoder = new TextDecoder('windows-874');
          thaiText = thaiDecoder.decode(bytes);
        } catch (e) {
          try {
            const tisDecoder = new TextDecoder('tis-620');
            thaiText = tisDecoder.decode(bytes);
          } catch (e2) {}
        }

        // Count Thai characters \u0E00-\u0E7F in both decoded texts
        const thaiInUtf8 = (utf8Text.match(/[\u0E00-\u0E7F]/g) || []).length;
        const thaiInThai = (thaiText.match(/[\u0E00-\u0E7F]/g) || []).length;
        const badInUtf8 = (utf8Text.match(/[\uFFFD]/g) || []).length;

        if (thaiInThai > thaiInUtf8 || (!utf8Text && thaiText)) {
          text = thaiText;
        } else if (utf8Text && badInUtf8 === 0) {
          text = utf8Text;
        } else if (thaiText) {
          text = thaiText;
        } else {
          text = new TextDecoder('utf-8').decode(bytes);
        }
      }

      // Remove UTF-8 Byte Order Mark (BOM) if present
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
      }

      if (!text) return;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length <= 1) {
        setValidationErrors(["CSV file is empty or only contains headers."]);
        return;
      }

      // Auto-detect delimiter (comma vs semicolon vs tab)
      const firstLine = lines[0];
      let delimiter = ',';
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      const tabCount = (firstLine.match(/\t/g) || []).length;
      if (semiCount > commaCount && semiCount > tabCount) {
        delimiter = ';';
      } else if (tabCount > commaCount && tabCount > semiCount) {
        delimiter = '\t';
      }

      const rows = lines.map(line => parseCsvLine(line, delimiter));
      setCsvParsedRows(rows);
      setValidationErrors([]);
      setSelectedCsvOption(null);
      setOption1ReviewList([]);
      setOption2StatusMsg('');
    } catch (err) {
      console.error("Error decoding CSV file:", err);
      setValidationErrors(["Failed to read or decode CSV file."]);
    }
  };

  const generateAutoPeaForCsvRow = (
    volt: string, 
    eqType: string, 
    locType: string, 
    sz: string, 
    allCollectedAssets: { pea: string; area: string }[], 
    installationDate?: string,
    regYear?: string
  ) => {
    // New Concept: PEA Number is generated using Column R "Installation Date" year converted to Buddhist Era (BE)
    const dateOrYearStr = (installationDate && installationDate.trim()) ? installationDate : (regYear || '');
    let yearNum = new Date().getFullYear();
    
    if (dateOrYearStr) {
      const match = dateOrYearStr.match(/\b(19\d\d|20\d\d|25\d\d)\b/);
      if (match) {
        yearNum = parseInt(match[1], 10);
      } else {
        const parsedDate = new Date(dateOrYearStr);
        if (!isNaN(parsedDate.getTime())) {
          yearNum = parsedDate.getFullYear();
        }
      }
    }

    const buddhistYr = yearNum > 2500 ? yearNum : yearNum + 543;
    const yy = String(buddhistYr).slice(-2);

    let prefix = 'UG';
    const eqLower = (eqType || '').toLowerCase();
    if (eqLower.includes('termination')) {
      prefix = 'TM';
    } else if (eqLower.includes('lightning') || eqLower.includes('arrester')) {
      prefix = 'LA';
    } else if (eqLower.includes('submarine')) {
      prefix = 'SB';
    } else if (eqLower.includes('underground') || eqLower.includes('cable')) {
      prefix = 'UG';
    } else if (eqLower.includes('ring main') || eqLower.includes('unit substation') || eqLower.includes('rmu')) {
      prefix = 'RU';
    } else if (eqLower.includes('joint')) {
      prefix = 'JO';
    } else if (eqLower.includes('air break') || eqLower.includes('switch')) {
      prefix = 'AB';
    } else if (eqLower.includes('link box') || eqLower.includes('gnd')) {
      prefix = 'GB';
    } else if (eqLower.includes('ats')) {
      prefix = 'AM';
    } else if (eqLower.includes('distribution circuit')) {
      prefix = 'DC';
    }

    let x1 = '5';
    const vStr = String(volt || '').trim();
    if (vStr.includes('22')) x1 = '2';
    else if (vStr.includes('33')) x1 = '3';
    else if (vStr.includes('69')) x1 = '4';
    else if (vStr.includes('115')) x1 = '5';

    let x2 = '0';
    const s = (sz || '').toLowerCase();
    const loc = (locType || '').toLowerCase();

    if (prefix === 'TM') {
      if (loc.includes('substation')) {
        if (s.includes('95')) x2 = '1';
        else if (s.includes('240')) x2 = '2';
        else if (s.includes('400')) x2 = '3';
        else if (s.includes('500')) x2 = '4';
        else if (s.includes('800')) x2 = '5';
        else if (s.includes('35')) x2 = '6';
        else if (s.includes('50')) x2 = '7';
        else if (s.includes('300')) x2 = '8';
        else x2 = '0';
      } else {
        x2 = '0';
      }
    } else if (['LA', 'RU', 'AB', 'GB', 'AM', 'DC'].includes(prefix)) {
      x2 = '0';
    } else if (prefix === 'UG') {
      if (s.includes('95')) x2 = '1';
      else if (s.includes('240')) x2 = '2';
      else if (s.includes('400')) x2 = '3';
      else if (s.includes('500')) x2 = '4';
      else if (s.includes('800')) x2 = '5';
      else if (s.includes('35')) x2 = '6';
      else if (s.includes('50')) x2 = '7';
      else if (s.includes('300')) x2 = '8';
      else x2 = '0';
    } else if (prefix === 'JO') {
      if (loc.includes('substation')) {
        if (s.includes('95')) x2 = '1';
        else if (s.includes('240')) x2 = '2';
        else if (s.includes('400')) x2 = '3';
        else if (s.includes('500')) x2 = '4';
        else if (s.includes('800')) x2 = '5';
        else if (s.includes('35')) x2 = '6';
        else if (s.includes('50')) x2 = '7';
        else if (s.includes('300')) x2 = '8';
        else x2 = '0';
      } else {
        if (s.includes('separate')) x2 = '4';
        else if (s.includes('straight')) x2 = '5';
        else x2 = '0';
      }
    } else if (prefix === 'SB') {
      if (s.includes('95')) x2 = '1';
      else if (s.includes('240')) x2 = '2';
      else if (s.includes('400')) x2 = '3';
      else if (s.includes('500')) x2 = '4';
      else if (s.includes('800')) x2 = '5';
      else if (s.includes('120')) x2 = '6';
      else if (s.includes('70')) x2 = '7';
      else if (s.includes('300')) x2 = '8';
      else if (s.includes('185')) x2 = '9';
      else x2 = '0';
    }

    const patternPrefix = `${prefix}${yy}-${x1}${x2}`;
    const usedSeqNumbers = new Set<number>();

    allCollectedAssets.forEach(item => {
      const peaStr = (item.pea || '').trim().toUpperCase();
      if (peaStr.startsWith(patternPrefix.toUpperCase())) {
        const remainder = peaStr.slice(patternPrefix.length);
        const num = parseInt(remainder, 10);
        if (!isNaN(num) && num >= 0 && num <= 9999 && remainder.length <= 4) {
          usedSeqNumbers.add(num);
        } else if (!isNaN(num) && remainder.length > 4) {
          // If an existing number in the sheet has > 4 digits after patternPrefix (e.g., manual typo like 5010000),
          // extract the last 4 digits if valid <= 9999, ignoring corrupted values >= 10000.
          const last4 = parseInt(remainder.slice(-4), 10);
          if (!isNaN(last4) && last4 >= 0 && last4 <= 9999) {
            usedSeqNumbers.add(last4);
          }
        }
      }
    });

    // Find the first unused sequence number starting from 1 up to 9999
    let nextSeq = 1;
    while (usedSeqNumbers.has(nextSeq) && nextSeq <= 9999) {
      nextSeq++;
    }

    if (nextSeq > 9999) {
      if (!usedSeqNumbers.has(0)) {
        nextSeq = 0;
      } else {
        for (let i = 0; i <= 9999; i++) {
          if (!usedSeqNumbers.has(i)) {
            nextSeq = i;
            break;
          }
        }
        if (nextSeq > 9999) nextSeq = 9999;
      }
    }

    const seqStr = String(nextSeq).padStart(4, '0');
    return `${patternPrefix}${seqStr}`;
  };

  const handleSelectOption1 = async () => {
    if (csvParsedRows.length <= 1) return;
    setSelectedCsvOption(1);
    setIsProcessingOption1(true);

    try {
      const allCollectedAssets: { pea: string; area: string }[] = [];

      if (googleToken) {
        const { spreadsheets } = await autoDiscoverAndSync(googleToken);
        const entries = Object.entries(spreadsheets);
        await Promise.all(
          entries.map(async ([area, sheetId]) => {
            try {
              const sheetAssets = await fetchSheetsData(googleToken, sheetId);
              sheetAssets.forEach(asset => {
                const pea = (asset.peaNumber || '').trim();
                if (pea && pea !== 'N/A') {
                  allCollectedAssets.push({ pea, area });
                }
              });
            } catch (e) {
              console.warn(`Failed scanning area ${area}:`, e);
            }
          })
        );
      }

      assets.forEach(asset => {
        const pea = (asset.peaNumber || '').trim();
        if (pea && pea !== 'N/A') {
          allCollectedAssets.push({ pea, area: asset.city || 'Regional' });
        }
      });

      const dataRows = csvParsedRows.slice(1);
      const parsedReview: any[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const cols = dataRows[i];
        // Col A (0): Voltage Level
        // Col B (1): PEA Area
        // Col C (2): City
        // Col D (3): GPS
        // Col E (4): Location Type
        // Col F (5): Equipment Number ADS
        // Col G (6): Account Asset Number AA
        // Col H (7): Equipment Type
        // Col I (8): Size
        // Col J (9): PEA Number (Auto generated)
        // Col K (10): Operate ID
        // Col L (11): Serial No
        // Col M (12): Manufacturer
        // Col N (13): Model
        // Col O (14): Country of Origin
        // Col P (15): Production Month
        // Col Q (16): Year of registration
        // Col R (17): Substation Name
        // Col S (18): Substation ID
        // Col T (19): Feeder
        // Col U (20): Landmark Location
        // Col V (21): Installation Date
        // Col W (22): WBS
        // Col X (23): Work Order
        // Col Y (24): Business Type
        // Col Z (25): Cost Center
        // Col AA (26): GISTAG
        // Col AB (27): Class
        // Col AC (28): Contract Number

        const volt = (cols[0] || '115').trim();
        const area = (cols[1] || 'N1').trim();
        const city = (cols[2] || area).trim();
        const gps = (cols[3] || '').trim();
        const locationType = (cols[4] || '').trim();
        const adsNumber = (cols[5] || '').trim(); // Col F
        const assetNumber = (cols[6] || '').trim(); // Col G
        const eqType = (cols[7] || 'Underground Cable').trim();
        const size = (cols[8] || '').trim(); // Col I: Leave blank if empty
        const operateId = (cols[10] || '').trim();
        const serialNumber = (cols[11] || '').trim();
        const manufacturer = (cols[12] || '').trim();
        const model = (cols[13] || '').trim();
        const country = (cols[14] || '').trim();
        const productionMonth = (cols[15] || '').trim();
        const yearOfRegistration = (cols[16] || String(new Date().getFullYear())).trim();
        const substationName = (cols[17] || '').trim();
        const substationId = (cols[18] || '').trim();
        const feeder = (cols[19] || '').trim();
        const landmark = (cols[20] || '').trim();
        const installationDate = (cols[21] || new Date().toISOString().split('T')[0]).trim();
        const wbs = (cols[22] || '').trim();
        const workOrder = (cols[23] || '').trim();
        const businessType = (cols[24] || '').trim();
        const costCenter = (cols[25] || '').trim();
        const gistag = (cols[26] || '').trim();
        const cls = (cols[27] || '').trim();
        const contractNumber = (cols[28] || '').trim();
        const assetValue = (cols[29] || '').trim(); // Col AD

        // Automatically assign latest PEA number searching sheet data using Col B, A, H, I and Installation Date (Col R)
        const autoPea = generateAutoPeaForCsvRow(volt, eqType, locationType, size, allCollectedAssets, installationDate, yearOfRegistration);
        allCollectedAssets.push({ pea: autoPea, area });

        const typeCode = getEquipmentTypeAbbreviation(eqType as EquipmentType) || 'EQP';
        const autoEqId = `${area}-${volt}kV-${new Date().getFullYear()}-${typeCode}-${autoPea}`;

        parsedReview.push({
          rowNum: i + 2,
          area,
          city,
          gps,
          voltageLevel: volt,
          equipmentType: eqType,
          manufacturer,
          country,
          locationType,
          substationName,
          substationId,
          size,
          peaNumber: autoPea,
          assetNumber,
          adsNumber,
          equipmentId: autoEqId,
          productionMonth,
          installationDate,
          wbs,
          businessType,
          costCenter,
          gistag,
          class: cls,
          contractNumber,
          feeder,
          landmark,
          operateId,
          serialNumber,
          model,
          workOrder,
          yearOfRegistration,
          assetValue
        });
      }

      setOption1ReviewList(parsedReview);
    } catch (err: any) {
      alert(`Option 1 parse error: ${err.message}`);
    } finally {
      setIsProcessingOption1(false);
    }
  };

  const generateAndDownloadCsv = (
    reviewList: any[],
    originalHeaders?: string[],
    originalRows?: string[][]
  ) => {
    let csvLines: string[] = [];

    if (originalHeaders && originalHeaders.length > 0 && originalRows && originalRows.length === reviewList.length) {
      const headers = [...originalHeaders];
      // Column J corresponds to index 9 (0-indexed: A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9)
      const peaColIdx = 9;

      while (headers.length <= peaColIdx) {
        headers.push('');
      }
      if (!headers[peaColIdx] || headers[peaColIdx].trim() === '') {
        headers[peaColIdx] = 'Assigned PEA Number';
      }

      csvLines.push(headers.map(h => `"${(h || '').toString().replace(/"/g, '""')}"`).join(','));

      originalRows.forEach((row, idx) => {
        const rec = reviewList[idx];
        const newRow = [...row];
        while (newRow.length <= peaColIdx) {
          newRow.push('');
        }
        newRow[peaColIdx] = rec ? rec.peaNumber : '';
        csvLines.push(newRow.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','));
      });
    } else {
      const headers = [
        'Voltage Level', 'PEA Area', 'City', 'GPS', 'Location Type',
        'Equipment Number ADS', 'Account Asset Number AA', 'Equipment Type', 'Size',
        'Assigned PEA Number', // Column J (Index 9)
        'Operate ID', 'Serial No', 'Manufacturer', 'Model', 'Country of Origin',
        'Production Month', 'Year of Registration', 'Substation Name', 'Substation ID',
        'Feeder', 'Landmark Location', 'Installation Date', 'WBS', 'Work Order',
        'Business Type', 'Cost Center', 'GISTAG', 'Class', 'Contract Number',
        'Asset Value' // Column AD (Index 29)
      ];
      csvLines.push(headers.map(h => `"${h}"`).join(','));

      reviewList.forEach(rec => {
        const row = [
          rec.voltageLevel, rec.area, rec.city, rec.gps, rec.locationType,
          rec.adsNumber, rec.assetNumber, rec.equipmentType, rec.size,
          rec.peaNumber, // Column J (Index 9)
          rec.operateId, rec.serialNumber, rec.manufacturer, rec.model, rec.country,
          rec.productionMonth, rec.yearOfRegistration, rec.substationName, rec.substationId,
          rec.feeder, rec.landmark, rec.installationDate, rec.wbs, rec.workOrder,
          rec.businessType, rec.costCenter, rec.gistag, rec.class, rec.contractNumber,
          rec.assetValue || '' // Column AD (Index 29)
        ];
        csvLines.push(row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','));
      });
    }

    // Add UTF-8 BOM \uFEFF so Excel correctly handles Thai language characters
    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().substring(0, 10);
    link.setAttribute('download', `PEA_Assets_With_PEA_Number_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const commitOption1Assets = async (downloadCsv: boolean = false) => {
    if (option1ReviewList.length === 0) return;

    if (downloadCsv) {
      generateAndDownloadCsv(
        option1ReviewList,
        csvParsedRows[0],
        csvParsedRows.slice(1)
      );
    }

    setIsProcessingOption1(true);
    setProgressModal({
      isOpen: true,
      title: 'Registering New Assets',
      stepMessage: 'Initializing batch registration process and verifying spreadsheets...',
      percent: 5,
      isError: false,
      isComplete: false,
      totalItems: option1ReviewList.length,
      currentItemIndex: 0
    });

    try {
      let spreadsheetsMap: { [area: string]: string } = {};
      try {
        const syncRes = await getMasterSpreadsheetsMap(googleToken);
        spreadsheetsMap = syncRes.spreadsheets || {};
      } catch (e) {
        console.warn("Auto sync spreadsheets error:", e);
      }

      // Determine logged-in user name / account email
      const registeredBy = user?.name || user?.email || operatorName || 'PEA Admin';

      // Group records by target spreadsheet ID
      const groupedBySpreadsheet: {
        [spId: string]: {
          records: typeof option1ReviewList;
          area: string;
        }
      } = {};

      for (const rec of option1ReviewList) {
        const targetArea = (rec.area || 'N1').toUpperCase();
        const targetSpreadsheetId = spreadsheetsMap[targetArea] || (spreadsheetIds && spreadsheetIds.length > 0 ? spreadsheetIds[0] : spreadsheetId) || 'local_sheet';
        
        if (!groupedBySpreadsheet[targetSpreadsheetId]) {
          groupedBySpreadsheet[targetSpreadsheetId] = { records: [], area: targetArea };
        }
        groupedBySpreadsheet[targetSpreadsheetId].records.push(rec);
      }

      let totalRegisteredCount = 0;
      const newlyCreatedAssets: CableAsset[] = [];
      const totalCount = option1ReviewList.length;

      const spKeys = Object.keys(groupedBySpreadsheet);
      for (let sIdx = 0; sIdx < spKeys.length; sIdx++) {
        const currentSpId = spKeys[sIdx];
        const group = groupedBySpreadsheet[currentSpId];
        const groupRecords = group.records;

        let sheetLastNum = 0;
        if (googleToken && currentSpId && currentSpId !== 'local_sheet') {
          try {
            sheetLastNum = await fetchLastSheetNumber(googleToken, currentSpId);
          } catch (e) {
            console.warn("Error fetching last sheet number for batch:", e);
          }
        }
        if (sheetLastNum === 0) {
          const areaAssets = assets ? assets.filter(a => {
            const aArea = a.equipmentId?.split('-')[0]?.toUpperCase() || a.city?.toUpperCase();
            return !aArea || aArea === group.area;
          }) : [];
          const areaNums = areaAssets.map(a => Number(a.number) || 0).filter(n => !isNaN(n) && n > 0 && n < 50000);
          sheetLastNum = areaNums.length > 0 ? Math.max(...areaNums) : 0;
        }

        const generalRowsBatch: any[][] = [];
        const engineeringRowsBatch: any[][] = [];
        const visualRowsBatch: any[][] = [];

        for (let rIdx = 0; rIdx < groupRecords.length; rIdx++) {
          const rec = groupRecords[rIdx];
          sheetLastNum += 1;
          const nextIdx = sheetLastNum;
          const timestamp = getBangkokTimestamp();

          const genRow = [
            nextIdx,
            timestamp,
            registeredBy,
            rec.voltageLevel,
            rec.city || rec.area,
            rec.equipmentType,
            rec.manufacturer,
            rec.country,
            rec.locationType,
            rec.substationName,
            rec.landmark || 'Primary Feeder Line',
            rec.gps || '13.7563, 100.5018',
            rec.yearOfRegistration || new Date().getFullYear(),
            rec.peaNumber,
            rec.adsNumber || '',
            rec.assetNumber || '',
            rec.productionMonth,
            rec.installationDate,
            rec.wbs,
            rec.businessType,
            rec.costCenter,
            rec.gistag,
            rec.class,
            rec.contractNumber,
            rec.feeder,
            rec.substationId,
            rec.operateId,
            rec.serialNumber,
            rec.model,
            rec.workOrder,
            rec.size,
            rec.assetValue || '',
            rec.equipmentId
          ];
          generalRowsBatch.push(genRow);

          const engRow = [
            nextIdx,
            timestamp,
            registeredBy,
            rec.equipmentId,
            0, 0, 30, 0, 'None', 0, 100, 'No Action Required', 0
          ];
          engineeringRowsBatch.push(engRow);

          const visRow = [
            nextIdx,
            timestamp,
            registeredBy,
            rec.equipmentId
          ];
          visualRowsBatch.push(visRow);

          const newAssetObj: CableAsset = {
            number: nextIdx,
            timestamp,
            operatorName: registeredBy,
            voltageLevel: rec.voltageLevel,
            city: rec.city || rec.area,
            equipmentType: rec.equipmentType,
            manufacturer: rec.manufacturer,
            country: rec.country,
            locationType: rec.locationType,
            substationName: rec.substationName,
            landmark: rec.landmark || 'Primary Feeder Line',
            gps: { lat: 13.7563, lng: 100.5018 },
            yearOfRegistration: rec.yearOfRegistration || new Date().getFullYear(),
            peaNumber: rec.peaNumber,
            assetNumber: rec.adsNumber || '',
            adsNumber: rec.assetNumber || '',
            productionMonth: rec.productionMonth,
            installationDate: rec.installationDate,
            wbs: rec.wbs,
            businessType: rec.businessType,
            costCenter: rec.costCenter,
            gistag: rec.gistag,
            class: rec.class,
            contractNumber: rec.contractNumber,
            feeder: rec.feeder,
            substationId: rec.substationId,
            operateId: rec.operateId,
            serialNumber: rec.serialNumber,
            model: rec.model,
            workOrder: rec.workOrder,
            size: rec.size,
            equipmentId: rec.equipmentId,
            healthScore: 100,
            healthStatus: 'Green'
          };
          newlyCreatedAssets.push(newAssetObj);
          totalRegisteredCount++;
        }

        // Execute batch API requests per spreadsheet
        if (googleToken && currentSpId && currentSpId !== 'local_sheet') {
          setProgressModal({
            isOpen: true,
            title: 'Registering New Assets',
            stepMessage: `Writing ${generalRowsBatch.length} General Information rows to Google Sheets in a single batch request...`,
            percent: Math.round(20 + (sIdx / spKeys.length) * 70),
            isError: false,
            isComplete: false,
            totalItems: totalCount,
            currentItemIndex: totalRegisteredCount - 1
          });
          await appendGeneralRowsBatch(googleToken, currentSpId, generalRowsBatch);

          setProgressModal({
            isOpen: true,
            title: 'Registering New Assets',
            stepMessage: `Writing ${engineeringRowsBatch.length} Engineering Parameter rows in a single batch request...`,
            percent: Math.round(25 + (sIdx / spKeys.length) * 70),
            isError: false,
            isComplete: false,
            totalItems: totalCount,
            currentItemIndex: totalRegisteredCount - 1
          });
          await appendEngineeringRowsBatch(googleToken, currentSpId, engineeringRowsBatch);

          setProgressModal({
            isOpen: true,
            title: 'Registering New Assets',
            stepMessage: `Writing ${visualRowsBatch.length} Visual & Thermal image rows in a single batch request...`,
            percent: Math.round(30 + (sIdx / spKeys.length) * 70),
            isError: false,
            isComplete: false,
            totalItems: totalCount,
            currentItemIndex: totalRegisteredCount - 1
          });
          await appendVisualRowsBatch(googleToken, currentSpId, visualRowsBatch);
        }
      }

      setProgressModal({
        isOpen: true,
        title: 'Registering New Assets',
        stepMessage: 'Synchronizing central database cache...',
        percent: 96,
        isError: false,
        isComplete: false,
        totalItems: totalCount
      });

      // Always update Central Firestore Cache and Local Storage
      try {
        const updatedList = [...newlyCreatedAssets, ...(assets || [])];
        localStorage.setItem('local_cable_assets', JSON.stringify(updatedList));
        
        // Save to central assets cache in background - DO NOT AWAIT to prevent UI hanging under offline/quota limits
        saveCentralAssetsCache(updatedList).catch(e => {
          console.warn("Background cache save failed in Option 1:", e);
        });
      } catch (e) {
        console.warn("Error updating local assets cache in Option 1:", e);
      }

      setCommitSuccess(`Option 1 Registration Succeeded! Registered ${totalRegisteredCount} new assets (PEA numbers assigned, ADS & AA left for Option 2 update).`);
      setOption1ReviewList([]);
      setCsvParsedRows([]);
      setSelectedCsvOption(null);

      setProgressModal({
        isOpen: true,
        title: 'Registration Complete',
        stepMessage: `Successfully registered ${totalRegisteredCount} new asset record(s) to PEA database! (100%)`,
        percent: 100,
        isError: false,
        isComplete: true,
        totalItems: totalCount
      });

      onRefresh();
    } catch (err: any) {
      setProgressModal({
        isOpen: true,
        title: 'Registration Failed',
        stepMessage: 'An error occurred during asset registration.',
        percent: 0,
        isError: true,
        errorMessage: err.message || 'Unknown registration error',
        isComplete: false
      });
    } finally {
      setIsProcessingOption1(false);
    }
  };

  const handleSelectOption2 = async () => {
    if (csvParsedRows.length <= 1) return;
    
    // File Integrity Check: Check if all data rows have a PEA number in column J (index 9)
    const dataRows = csvParsedRows.slice(1);
    const missingPeaRows: number[] = [];
    
    for (let i = 0; i < dataRows.length; i++) {
      const cols = dataRows[i];
      const targetPea = (cols[9] || '').trim();
      if (!targetPea) {
        missingPeaRows.push(i + 2); // 1-based row number including header
      }
    }

    if (dataRows.length === 0 || missingPeaRows.length > 0) {
      const errMsg = missingPeaRows.length > 0
        ? `File Integrity Check Failed!\n\nThe uploaded CSV file is missing PEA number in Column J at row(s): ${missingPeaRows.slice(0, 5).join(', ')}${missingPeaRows.length > 5 ? '...' : ''}.\n\nThe uploaded file is NOT ready for Option 2 update and the upload process is cancelled.`
        : `File Integrity Check Failed!\n\nThe uploaded file contains no data rows. Process cancelled.`;

      alert(errMsg);
      setOption2StatusMsg(`Option 2 Cancelled: File integrity check failed (${missingPeaRows.length} rows missing PEA number in Column J).`);
      setSelectedCsvOption(null);
      setOption2ReviewList([]);
      return;
    }

    // Integrity check passed! Show popup message and parse items for Review Panel
    alert(`File Integrity Check Passed!\n\nAll ${dataRows.length} uploaded records have valid PEA numbers in Column J. Ready for review before updating ADS & AA numbers.`);

    const parsedReview2: any[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const cols = dataRows[i];
      const volt = (cols[0] || '115').trim();
      const area = (cols[1] || 'N1').trim();
      const city = (cols[2] || area).trim();
      const gps = (cols[3] || '').trim();
      const locationType = (cols[4] || '').trim();
      const adsNumber = (cols[5] || '').trim(); // Col F: Equipment Number ADS
      const assetNumber = (cols[6] || '').trim(); // Col G: Account Asset Number AA
      const eqType = (cols[7] || 'Underground Cable').trim();
      const size = (cols[8] || '').trim();
      const peaNumber = (cols[9] || '').trim(); // Col J: PEA Number
      const operateId = (cols[10] || '').trim();
      const serialNumber = (cols[11] || '').trim();
      const manufacturer = (cols[12] || '').trim();
      const model = (cols[13] || '').trim();
      const country = (cols[14] || '').trim();
      const productionMonth = (cols[15] || '').trim();
      const yearOfRegistration = (cols[16] || String(new Date().getFullYear())).trim();
      const substationName = (cols[17] || '').trim();
      const substationId = (cols[18] || '').trim();
      const feeder = (cols[19] || '').trim();
      const landmark = (cols[20] || '').trim();
      const installationDate = (cols[21] || new Date().toISOString().split('T')[0]).trim();
      const wbs = (cols[22] || '').trim();
      const workOrder = (cols[23] || '').trim();
      const businessType = (cols[24] || '').trim();
      const costCenter = (cols[25] || '').trim();
      const gistag = (cols[26] || '').trim();
      const cls = (cols[27] || '').trim();
      const contractNumber = (cols[28] || '').trim();
      const assetValue = (cols[29] || '').trim(); // Col AD

      parsedReview2.push({
        rowNum: i + 2,
        area,
        city,
        gps,
        voltageLevel: volt,
        equipmentType: eqType,
        manufacturer,
        country,
        locationType,
        substationName,
        substationId,
        size,
        peaNumber,
        assetNumber,
        adsNumber,
        equipmentId: `${area}-${volt}kV-${new Date().getFullYear()}-${eqType}-${peaNumber}`,
        productionMonth,
        installationDate,
        wbs,
        businessType,
        costCenter,
        gistag,
        class: cls,
        contractNumber,
        feeder,
        landmark,
        operateId,
        serialNumber,
        model,
        workOrder,
        yearOfRegistration,
        assetValue
      });
    }

    setOption2ReviewList(parsedReview2);
    setSelectedCsvOption(2);
    setOption2StatusMsg(`File Integrity Check Passed! ${parsedReview2.length} records ready for ADS & AA update review.`);
  };

  const commitOption2Assets = async (downloadCsv: boolean = false) => {
    if (csvParsedRows.length <= 1 && option2ReviewList.length === 0) return;

    if (downloadCsv) {
      generateAndDownloadCsv(
        option2ReviewList.length > 0 ? option2ReviewList : [],
        csvParsedRows[0],
        csvParsedRows.slice(1)
      );
    }

    setIsProcessingOption2(true);
    setOption2StatusMsg('Validating & updating PEA numbers in column J across all regional spreadsheets...');
    setOption2TotalToUpdate(0);
    setOption2CurrentIndex(0);
    setOption2CurrentPea('');

    try {
      const listToProcess = option2ReviewList.length > 0 ? option2ReviewList : csvParsedRows.slice(1).map((cols, i) => ({
        rowNum: i + 2,
        adsNumber: cols[5] || '',
        assetNumber: cols[6] || '',
        peaNumber: cols[9] || '',
        voltageLevel: cols[0] || '',
        equipmentType: cols[7] || '',
        manufacturer: cols[12] || ''
      }));

      setOption2TotalToUpdate(listToProcess.length);

      let updatedCount = 0;

      // Pre-cache all spreadsheet data in parallel first to avoid redundant sequential API hits inside the loop
      const sheetsToCheck = spreadsheetIds && spreadsheetIds.length > 0 ? spreadsheetIds : (spreadsheetId ? [spreadsheetId] : []);
      const cachedSheetsData: { [sId: string]: any[] } = {};

      if (googleToken) {
        await Promise.all(
          sheetsToCheck.map(async (sId) => {
            try {
              const sheetRowsData = await fetchSheetsData(googleToken, sId);
              cachedSheetsData[sId] = sheetRowsData;
            } catch (e) {
              console.error(`Error caching sheet ${sId} for Option 2 update:`, e);
              cachedSheetsData[sId] = [];
            }
          })
        );
      }

      // Phase 1: Validate all items in memory and group them by spreadsheetId
      const batchUpdatesBySheet: { [spreadsheetId: string]: { range: string; values: any[][] }[] } = {};
      const assetsToUpdateInMemory: { targetPea: string; newAds: string; newAa: string }[] = [];

      for (let i = 0; i < listToProcess.length; i++) {
        const item = listToProcess[i];
        const newAds = item.adsNumber || '';
        const newAa = item.assetNumber || '';
        const targetPea = item.peaNumber || '';

        setOption2CurrentIndex(i + 1);
        setOption2CurrentPea(`Validating ${targetPea}...`);

        if (!targetPea || targetPea.trim() === '') {
          alert(`Row ${item.rowNum || (i + 2)}: Missing PEA number in column J.`);
          setIsProcessingOption2(false);
          return;
        }

        let foundLocations: { spreadsheetId: string; rowIndex: number; rowData: any }[] = [];
        
        for (const sId of sheetsToCheck) {
          const sheetRowsData = cachedSheetsData[sId] || [];
          sheetRowsData.forEach((asset) => {
            if (asset.peaNumber && asset.peaNumber.trim().toLowerCase() === targetPea.trim().toLowerCase()) {
              foundLocations.push({
                spreadsheetId: sId,
                rowIndex: asset.number + 1,
                rowData: asset
              });
            }
          });
        }

        if (foundLocations.length === 0) {
          const localSaved = localStorage.getItem('local_cable_assets');
          if (localSaved) {
            const parsedLocal = JSON.parse(localSaved);
            parsedLocal.forEach((ast: any, idx: number) => {
              if (ast.peaNumber && ast.peaNumber.trim().toLowerCase() === targetPea.trim().toLowerCase()) {
                foundLocations.push({
                  spreadsheetId: 'local',
                  rowIndex: idx + 1,
                  rowData: ast
                });
              }
            });
          }
        }

        if (foundLocations.length === 0) {
          alert(`PEA Number "${targetPea}" (Row ${item.rowNum || (i + 2)}) not found in any regional spreadsheet or database.`);
          setIsProcessingOption2(false);
          return;
        }

        if (foundLocations.length > 1) {
          alert(`Found duplicated PEA number ("${targetPea}") across multiple sheets or rows. Please fix this before upload.`);
          setIsProcessingOption2(false);
          return;
        }

        const match = foundLocations[0];
        const existing = match.rowData;

        if (googleToken && match.spreadsheetId !== 'local') {
          const fullRowValues = [
            existing.number,
            existing.timestamp ? getBangkokTimestamp(existing.timestamp) : getBangkokTimestamp(),
            existing.operatorName || 'Option 2 Update',
            existing.voltageLevel,
            existing.city,
            existing.equipmentType,
            existing.manufacturer,
            existing.country,
            existing.locationType,
            existing.substationName,
            existing.landmark || 'Primary Feeder Line',
            existing.gps ? `${existing.gps.lat}, ${existing.gps.lng}` : '13.7563, 100.5018',
            existing.yearOfRegistration,
            existing.peaNumber,
            newAds,
            newAa,
            existing.productionMonth || '',
            existing.installationDate || '',
            existing.wbs || '',
            existing.businessType || '',
            existing.costCenter || '',
            existing.gistag || '',
            existing.class || '',
            existing.contractNumber || '',
            existing.feeder || '',
            existing.substationId || '',
            existing.operateId || '',
            existing.serialNumber || '',
            existing.model || '',
            existing.workOrder || '',
            existing.size || '',
            existing.assetValue || '',
            existing.equipmentId || ''
          ];

          if (!batchUpdatesBySheet[match.spreadsheetId]) {
            batchUpdatesBySheet[match.spreadsheetId] = [];
          }
          batchUpdatesBySheet[match.spreadsheetId].push({
            range: `'General Information'!A${match.rowIndex}:AG${match.rowIndex}`,
            values: [fullRowValues]
          });
        }

        assetsToUpdateInMemory.push({ targetPea, newAds, newAa });
      }

      // Phase 2: Execute batch updates grouped by spreadsheetId
      const sheetsToUpdateList = Object.keys(batchUpdatesBySheet);
      
      if (googleToken && sheetsToUpdateList.length > 0) {
        setOption2TotalToUpdate(sheetsToUpdateList.length);
        setOption2CurrentIndex(0);

        for (let sIdx = 0; sIdx < sheetsToUpdateList.length; sIdx++) {
          const sId = sheetsToUpdateList[sIdx];
          const updates = batchUpdatesBySheet[sId];
          setOption2CurrentPea(`Saving ${updates.length} rows to sheet...`);
          
          await batchUpdateSheetRows(googleToken, sId, updates);
          setOption2CurrentIndex(sIdx + 1);
        }
      }

      // Also update assets in memory and central cache
      assetsToUpdateInMemory.forEach(({ targetPea, newAds, newAa }) => {
        if (assets && assets.length > 0) {
          const targetIndex = assets.findIndex(ast => ast.peaNumber?.trim().toLowerCase() === targetPea.trim().toLowerCase());
          if (targetIndex !== -1) {
            assets[targetIndex].assetNumber = newAds;
            assets[targetIndex].adsNumber = newAa;
          }
        }
      });

      updatedCount = assetsToUpdateInMemory.length;

      try {
        if (assets && assets.length > 0) {
          localStorage.setItem('local_cable_assets', JSON.stringify(assets));
          
          // Save to central assets cache in background - DO NOT AWAIT to prevent UI hanging under offline/quota limits
          saveCentralAssetsCache(assets).catch(e => {
            console.warn("Background cache save failed in Option 2:", e);
          });
        }
      } catch (e) {
        console.warn("Failed saving updated assets locally in Option 2:", e);
      }

      setOption2StatusMsg(`Option 2 Update Succeeded! Successfully updated ADS & AA for ${updatedCount} assets.`);
      setOption2ReviewList([]);
      setCsvParsedRows([]);
      setSelectedCsvOption(null);
      onRefresh();
    } catch (err: any) {
      alert(`Option 2 error: ${err.message}`);
    } finally {
      setIsProcessingOption2(false);
      setOption2TotalToUpdate(0);
      setOption2CurrentIndex(0);
      setOption2CurrentPea('');
    }
  };

  // Duplicate integrity check algorithm
  const duplicateReports = useMemo(() => {
    const peaMap = new Map<string, CableAsset[]>();
    const assetMap = new Map<string, CableAsset[]>();
    const aaMap = new Map<string, CableAsset[]>();

    assets.forEach(asset => {
      const pea = (asset.peaNumber || '').trim();
      const ads = (asset.assetNumber || '').trim();
      const aa = (asset.adsNumber || '').trim();

      if (pea) {
        if (!peaMap.has(pea)) peaMap.set(pea, []);
        peaMap.get(pea)!.push(asset);
      }
      if (ads) {
        if (!assetMap.has(ads)) assetMap.set(ads, []);
        assetMap.get(ads)!.push(asset);
      }
      if (aa) {
        if (!aaMap.has(aa)) aaMap.set(aa, []);
        aaMap.get(aa)!.push(asset);
      }
    });

    const peaDuplicates: any[] = [];
    const sapDuplicates: any[] = [];
    const aaDuplicates: any[] = [];

    peaMap.forEach((items, key) => {
      if (items.length > 1) {
        peaDuplicates.push({ key, items, type: 'PEA Number' });
      }
    });
    assetMap.forEach((items, key) => {
      if (items.length > 1) {
        sapDuplicates.push({ key, items, type: 'Equipment Number ADS' });
      }
    });
    aaMap.forEach((items, key) => {
      if (items.length > 1) {
        aaDuplicates.push({ key, items, type: 'Account Asset Number (AA)' });
      }
    });

    return { peaDuplicates, sapDuplicates, aaDuplicates };
  }, [assets]);

  const allDuplicates = useMemo(() => {
    let result: any[] = [];
    if (integrityFilterType === 'all' || integrityFilterType === 'pea') {
      result = [...result, ...duplicateReports.peaDuplicates];
    }
    if (integrityFilterType === 'all' || integrityFilterType === 'sap') {
      result = [...result, ...duplicateReports.sapDuplicates];
    }
    if (integrityFilterType === 'all' || integrityFilterType === 'aa') {
      result = [...result, ...duplicateReports.aaDuplicates];
    }
    return result;
  }, [duplicateReports, integrityFilterType]);

  const handleResolveDuplicate = async (dup: any, action: 'keep_latest' | 'rename' | 'delete') => {
    setResolvingId(dup.key);
    setResolveAction(action);
    try {
      if (action === 'keep_latest') {
        // Keep the latest record and modify / reset the duplicates on spreadsheet
        const sorted = [...dup.items].sort((a, b) => b.number - a.number);
        const survivor = sorted[0];
        const duplicatesToEliminate = sorted.slice(1);

        for (const item of duplicatesToEliminate) {
          if (googleToken && spreadsheetId) {
            const mappings = await fetchSheetsRowIndices(googleToken, spreadsheetId, item.equipmentId, item.number);
            if (mappings.genRowIndex > 0) {
              // Update field with a custom cleared tag or rename
              const nullifiedRow = [
                item.number,
                getBangkokTimestamp(),
                'Automated Resolve',
                item.voltageLevel,
                item.city,
                item.equipmentType,
                item.manufacturer,
                item.country,
                item.locationType,
                item.substationName,
                item.landmark,
                `${item.gps.lat}, ${item.gps.lng}`,
                item.yearOfRegistration,
                `DELETED-${item.peaNumber}`, // prefix duplicate to clear constraint
                `DEL-${item.assetNumber}`,
                `DEL-${item.adsNumber}`,
                item.productionMonth || '',
                item.installationDate || '',
                item.wbs || '',
                item.businessType || '',
                item.costCenter || '',
                item.gistag || '',
                item.class || '',
                item.contractNumber || '',
                item.feeder || '',
                item.substationId || '',
                item.operateId || '',
                item.serialNumber || '',
                item.model || '',
                item.workOrder || '',
                item.size || '',
                `DEL-${item.equipmentId}`
              ];
              await updateSheetRow(googleToken, spreadsheetId, 'General Information', mappings.genRowIndex, nullifiedRow, 'A:AF');
            }
          } else {
            // Local offline resolution
            const localSaved = localStorage.getItem('local_cable_assets');
            if (localSaved) {
              let parsed = JSON.parse(localSaved);
              parsed = parsed.filter((x: any) => x.number !== item.number);
              localStorage.setItem('local_cable_assets', JSON.stringify(parsed));
            }
          }
        }
        alert(`Duplicate code resolved! Cleared ${duplicatesToEliminate.length} secondary entries.`);
        onRefresh();
      } else {
        alert("Action queued for SAP manual override.");
      }
    } catch (err: any) {
      alert(`Conflict resolution failed: ${err.message}`);
    } finally {
      setResolvingId(null);
      setResolveAction('');
    }
  };

  const startEditingAsset = (asset: CableAsset) => {
    setEditingAsset(asset);
    setEditPea(asset.peaNumber || '');
    setEditAds(asset.assetNumber || ''); // Equipment Number ADS mapped to asset.assetNumber
    setEditAa(asset.adsNumber || ''); // Account Asset Number (AA) mapped to asset.adsNumber
  };

  const saveManualEdit = async () => {
    if (!editingAsset) return;
    setSavingAssetId(editingAsset.equipmentId);
    try {
      const targetSheetId = editingAsset.spreadsheetId || spreadsheetId;
      if (googleToken && targetSheetId) {
        const mappings = await fetchSheetsRowIndices(googleToken, targetSheetId, editingAsset.equipmentId, editingAsset.number);
        if (mappings.genRowIndex > 0) {
          const finalPeaNumber = editPea.trim();
          const finalAssetNumber = editAds.trim();
          const finalAdsNumber = editAa.trim();
          
          const assetArea = editingAsset.equipmentId.split('-')[0];
          const updatedEquipmentId = generateEquipmentId(
            assetArea,
            editingAsset.voltageLevel,
            editingAsset.yearOfRegistration,
            editingAsset.equipmentType,
            finalPeaNumber,
            finalAssetNumber,
            finalAdsNumber
          );

          // Build generalRow with 32 columns
          const generalRow = [
            editingAsset.number,
            getBangkokTimestamp(),
            'Manual Edit',
            editingAsset.voltageLevel,
            editingAsset.city,
            editingAsset.equipmentType,
            editingAsset.manufacturer || 'Prysmian Group',
            editingAsset.country || 'Thailand',
            editingAsset.locationType,
            editingAsset.substationName || 'Main Station',
            editingAsset.landmark || 'No landmarks',
            `${editingAsset.gps?.lat || '13.7563'}, ${editingAsset.gps?.lng || '100.5018'}`,
            editingAsset.yearOfRegistration,
            finalPeaNumber,
            finalAssetNumber,
            finalAdsNumber,
            editingAsset.productionMonth || 'N/A',
            editingAsset.installationDate || 'N/A',
            editingAsset.wbs || 'N/A',
            editingAsset.businessType || 'N/A',
            editingAsset.costCenter || 'N/A',
            editingAsset.gistag || 'N/A',
            editingAsset.class || 'N/A',
            editingAsset.contractNumber || 'N/A',
            editingAsset.feeder || 'N/A',
            editingAsset.substationId || 'N/A',
            editingAsset.operateId || 'N/A',
            editingAsset.serialNumber || 'N/A',
            editingAsset.model || 'N/A',
            editingAsset.workOrder || 'N/A',
            editingAsset.size || 'N/A',
            editingAsset.assetValue || 'N/A',
            updatedEquipmentId
          ];

          await updateSheetRow(googleToken, targetSheetId, 'General Information', mappings.genRowIndex, generalRow, 'A:AG');
          
          // Update engineering row if present
          if (mappings.engRowIndex > 0) {
            const engineeringRow = [
              editingAsset.number,
              editingAsset.timestamp,
              editingAsset.operatorName,
              updatedEquipmentId,
              editingAsset.loadCurrent || 0,
              editingAsset.sheathCurrent || 0,
              editingAsset.surfaceTemperature || 0,
              editingAsset.externalDischarge || 0,
              editingAsset.pdResult || 'None',
              editingAsset.onlinePdAmplitude || 0,
              editingAsset.insulationResistance || 0,
              editingAsset.tanDelta || 'No Action Required',
              editingAsset.tanDeltaAmplitude || 0
            ];
            await updateSheetRow(googleToken, targetSheetId, 'Engineering Information', mappings.engRowIndex, engineeringRow, 'A:M');
          }

          // Update visual row if present
          if (mappings.visRowIndex > 0) {
            const visualRow = [
              editingAsset.number,
              editingAsset.timestamp,
              editingAsset.operatorName,
              updatedEquipmentId,
              editingAsset.visualPictureUrl || '',
              editingAsset.thermalImageUrl || ''
            ];
            await updateSheetRow(googleToken, targetSheetId, 'Visual & Thermal Images', mappings.visRowIndex, visualRow, 'A:F');
          }
        }
      } else {
        // Fallback local storage update
        const localSaved = localStorage.getItem('local_cable_assets');
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          const idx = parsed.findIndex((x: any) => x.equipmentId === editingAsset.equipmentId);
          if (idx !== -1) {
            const finalPeaNumber = editPea.trim();
            const finalAssetNumber = editAds.trim();
            const finalAdsNumber = editAa.trim();
            const assetArea = editingAsset.equipmentId.split('-')[0];
            const updatedEquipmentId = generateEquipmentId(
              assetArea,
              editingAsset.voltageLevel,
              editingAsset.yearOfRegistration,
              editingAsset.equipmentType,
              finalPeaNumber,
              finalAssetNumber,
              finalAdsNumber
            );
            
            parsed[idx] = {
              ...parsed[idx],
              peaNumber: finalPeaNumber,
              assetNumber: finalAssetNumber,
              adsNumber: finalAdsNumber,
              equipmentId: updatedEquipmentId
            };
            localStorage.setItem('local_cable_assets', JSON.stringify(parsed));
          }
        }
      }

      alert('Asset updated successfully to resolve duplicate conflict.');
      setEditingAsset(null);
      onRefresh();
    } catch (err: any) {
      alert(`Error updating asset: ${err.message}`);
    } finally {
      setSavingAssetId(null);
    }
  };

  const chartData = useMemo(() => {
    return [
      { name: 'PEA Number', count: duplicateReports.peaDuplicates.length, color: '#8B5CF6' },
      { name: 'Equipment Number ADS', count: duplicateReports.sapDuplicates.length, color: '#EC4899' },
      { name: 'Account Asset Number (AA)', count: duplicateReports.aaDuplicates.length, color: '#3B82F6' }
    ];
  }, [duplicateReports]);

  return (
    <div className="space-y-6" id="registration-suite-root">
      {/* Primary Header Card with Info */}
      <div className="bg-purple-900 rounded-3xl p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-purple-800/20 via-purple-900/10 to-transparent pointer-events-none" />
        <div className="relative">
          <span className="text-[10px] font-extrabold uppercase tracking-widest bg-purple-800 text-purple-200 px-3 py-1 rounded-md">
            Administrative Suite
          </span>
          <h2 className="text-xl font-extrabold mt-1.5 flex items-center gap-2">
            Asset Registration & Integrity Checks
            <Sparkles className="w-5 h-5 text-yellow-400" />
          </h2>
          <p className="text-xs text-purple-200 mt-1 max-w-xl">
            Register new high-voltage grid equipment into PEA cable assets database. Validate records, resolve code conflicts, and synchronize with all 12 regional files.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-purple-950/60 p-1 rounded-xl border border-purple-700/30 w-full md:w-auto shrink-0">
          <button
            onClick={() => setActiveSubTab('register')}
            className={`flex-1 md:flex-initial text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeSubTab === 'register' ? 'bg-purple-700 text-white shadow-md' : 'text-purple-200 hover:text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Asset Registration
          </button>
          <button
            onClick={() => setActiveSubTab('integrity')}
            className={`flex-1 md:flex-initial text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 relative ${
              activeSubTab === 'integrity' ? 'bg-purple-700 text-white shadow-md' : 'text-purple-200 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Integrity Scanner
            {allDuplicates.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-extrabold text-[9px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-purple-900">
                {allDuplicates.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {commitSuccess && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-semibold shadow-xs">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{commitSuccess}</span>
        </div>
      )}

      {/* SUB-VIEW 1: REGISTRATION (Manual Entry & CSV Import) */}
      {activeSubTab === 'register' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Latest PEA Number Panel with 4 Dropdown Filters */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-xs p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-700" />
                  Latest PEA Number Inspection (Protocol Filters & 12 Google Sheets)
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Select parameters below to audit Column N ("PEA Number") across all 12 regional PEA database spreadsheets
                </p>
              </div>
              <button
                onClick={checkLatestPeaWithFilters}
                disabled={isCheckingPea}
                className="bg-purple-900 hover:bg-purple-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Search className={`w-4 h-4 text-yellow-400 ${isCheckingPea ? 'animate-spin' : ''}`} />
                Finding Latest PEA Number
              </button>
            </div>

            {/* 5 Dropdown Filters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 bg-purple-50/50 border border-purple-100 p-4 rounded-2xl">
              {/* 1. Voltage Level */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-purple-900 uppercase">1. Voltage Level</label>
                <select
                  value={filterVoltage}
                  onChange={e => handleVoltageChange(e.target.value)}
                  className="bg-white border border-purple-200 rounded-xl py-2 px-3 text-xs font-medium text-gray-800 focus:outline-hidden focus:border-purple-600"
                >
                  <option value="115">115 kV</option>
                  <option value="33">33 kV</option>
                  <option value="22">22 kV</option>
                </select>
              </div>

              {/* 2. Equipment Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-purple-900 uppercase">2. Equipment Type</label>
                <select
                  value={filterEquipmentType}
                  onChange={e => handleEquipmentTypeChange(e.target.value as EquipmentType)}
                  className="bg-white border border-purple-200 rounded-xl py-2 px-3 text-xs font-medium text-gray-800 focus:outline-hidden focus:border-purple-600"
                >
                  {availableEquipmentTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* 3. Location Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-purple-900 uppercase">3. Location Type</label>
                <select
                  value={filterLocationType}
                  onChange={e => handleLocationTypeChange(e.target.value as LocationType)}
                  className="bg-white border border-purple-200 rounded-xl py-2 px-3 text-xs font-medium text-gray-800 focus:outline-hidden focus:border-purple-600"
                >
                  {availableLocationTypes.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* 4. Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-purple-900 uppercase">4. Size / Spec</label>
                <select
                  value={filterSize}
                  onChange={e => setFilterSize(e.target.value)}
                  className="bg-white border border-purple-200 rounded-xl py-2 px-3 text-xs font-medium text-gray-800 focus:outline-hidden focus:border-purple-600"
                >
                  {availableSizes.map(sz => (
                    <option key={sz} value={sz}>{sz}</option>
                  ))}
                </select>
              </div>

              {/* 5. Installation Year */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-purple-900 uppercase">5. Installation Year</label>
                <select
                  value={filterYear}
                  onChange={e => setFilterYear(e.target.value)}
                  className="bg-white border border-purple-200 rounded-xl py-2 px-3 text-xs font-medium text-gray-800 focus:outline-hidden focus:border-purple-600"
                >
                  {Array.from({ length: 15 }, (_, i) => {
                    const yr = new Date().getFullYear() - i;
                    const bYr = yr + 543;
                    return (
                      <option key={yr} value={String(yr)}>
                        {yr} (B.E. {bYr})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {scanMessage && (
              <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-xl text-[11px] text-purple-900 font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{scanMessage}</span>
              </div>
            )}

            {/* Protocol Inspection Result Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase block">Protocol Prefix Pattern</span>
                  <span className="text-sm font-black font-mono text-purple-900 mt-1 block">
                    {filterScanResult.protocolPrefix || 'Evaluating...'}
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 mt-2 block">
                  Based on Type, Year (2569), Voltage & Size rules
                </span>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase block">Latest PEA Number Found</span>
                  <span className="text-sm font-black font-mono text-emerald-700 mt-1 block">
                    {filterScanResult.latestPea}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2 text-[10px] text-gray-500">
                  <span>Source Area: <strong>{filterScanResult.area}</strong></span>
                  <span>Matches: <strong>{filterScanResult.matchingCount}</strong></span>
                </div>
              </div>

              <div className="bg-purple-900 text-white rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[9px] font-bold text-purple-300 uppercase block">Suggested Next Running PEA</span>
                  <span className="text-sm font-black font-mono text-yellow-400 mt-1 block flex items-center gap-1.5">
                    {filterScanResult.suggestedNextPea}
                    {filterScanResult.suggestedNextPea && filterScanResult.suggestedNextPea !== 'N/A' && (
                      <Copy 
                        className="w-3.5 h-3.5 text-purple-200 cursor-pointer hover:text-white"
                        onClick={() => {
                          navigator.clipboard.writeText(filterScanResult.suggestedNextPea);
                          alert(`Copied Next PEA Number: ${filterScanResult.suggestedNextPea}`);
                        }}
                      />
                    )}
                  </span>
                </div>
                <span className="text-[10px] text-purple-200 mt-2 block">
                  Next incremental running ID
                </span>
              </div>
            </div>

            {/* Option 1 Review Panel */}
            {selectedCsvOption === 1 && option1ReviewList.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-black text-gray-900 uppercase">Option 1: New Asset Data Review Panel (30 Data Details)</h4>
                    <p className="text-[10px] text-gray-400">Verify extracted attributes & generated PEA numbers from uploaded file. Click "Check & Edit" to adjust any field.</p>
                  </div>
                  <span className="text-[10px] bg-purple-100 text-purple-900 font-bold px-2.5 py-1 rounded-lg">
                    {option1ReviewList.length} assets ready
                  </span>
                </div>

                <div className="max-h-[360px] overflow-y-auto space-y-3 border border-purple-100 rounded-2xl p-3 bg-purple-50/20">
                  {option1ReviewList.map((rec, rIdx) => (
                    <div key={rIdx} className="bg-white border border-gray-100 p-3.5 rounded-2xl text-[10px] space-y-2.5 shadow-2xs">
                      {/* Top Bar */}
                      <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-purple-900 bg-purple-50 px-2 py-0.5 rounded font-black">Row #{rec.rowNum}</span>
                          <span className="font-black text-gray-900 text-xs">{rec.equipmentType || 'N/A'}</span>
                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">{rec.voltageLevel} kV</span>
                        </div>
                        <button
                          onClick={() => setEditingOption1Item({ index: rIdx, data: { ...rec } })}
                          className="bg-purple-900 hover:bg-purple-800 text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Edit className="w-3 h-3 text-yellow-400" /> Check & Edit
                        </button>
                      </div>

                      {/* 30 Data Details Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-gray-50/70 p-2.5 rounded-xl border border-gray-100 text-[10px]">
                        <div><span className="text-gray-400 font-semibold block">1. PEA Area:</span> <span className="font-bold text-gray-800">{rec.area || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">2. Voltage Level:</span> <span className="font-bold text-gray-800">{rec.voltageLevel} kV</span></div>
                        <div><span className="text-gray-400 font-semibold block">3. Equipment Type:</span> <span className="font-bold text-gray-800">{rec.equipmentType || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">4. Size:</span> <span className="font-bold text-gray-800">{rec.size || '[Blank]'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">5. Assigned PEA No:</span> <span className="font-bold text-purple-900 font-mono">{rec.peaNumber}</span></div>
                        <div><span className="text-gray-400 font-semibold block">6. Manufacturer:</span> <span className="font-bold text-gray-800">{rec.manufacturer || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">7. Substation Name:</span> <span className="font-bold text-gray-800">{rec.substationName || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">8. Location Type:</span> <span className="font-bold text-gray-800">{rec.locationType || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">9. GPS:</span> <span className="font-mono text-gray-700">{rec.gps || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">10. City:</span> <span className="font-bold text-gray-800">{rec.city || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">11. Location Type:</span> <span className="font-bold text-gray-800">{rec.locationType || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">12. Equip No (ADS):</span> <span className="font-bold text-amber-700">{rec.adsNumber || '[Blank]'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">13. Account Asset (AA):</span> <span className="font-bold text-amber-700">{rec.assetNumber || '[Blank]'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">14. Operate ID:</span> <span className="font-bold text-gray-800">{rec.operateId || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">15. Serial No:</span> <span className="font-mono text-gray-800">{rec.serialNumber || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">16. Model:</span> <span className="font-bold text-gray-800">{rec.model || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">17. Country of Origin:</span> <span className="font-bold text-gray-800">{rec.country || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">18. Production Month:</span> <span className="font-bold text-gray-800">{rec.productionMonth || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">19. Year of Registration:</span> <span className="font-bold text-gray-800">{rec.yearOfRegistration || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">20. Substation ID:</span> <span className="font-bold text-gray-800">{rec.substationId || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">21. Feeder:</span> <span className="font-bold text-gray-800">{rec.feeder || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">22. Landmark Location:</span> <span className="font-bold text-gray-800">{rec.landmark || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">23. Installation Date:</span> <span className="font-bold text-gray-800">{rec.installationDate || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">24. WBS:</span> <span className="font-bold text-gray-800">{rec.wbs || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">25. Work Order:</span> <span className="font-bold text-gray-800">{rec.workOrder || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">26. Business Type:</span> <span className="font-bold text-gray-800">{rec.businessType || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">27. Cost Center:</span> <span className="font-bold text-gray-800">{rec.costCenter || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">28. GISTAG:</span> <span className="font-bold text-gray-800">{rec.gistag || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">29. Class:</span> <span className="font-bold text-gray-800">{rec.class || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">30. Contract Number:</span> <span className="font-bold text-gray-800">{rec.contractNumber || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">31. Asset Value (Col AD):</span> <span className="font-bold text-emerald-700 font-mono">{rec.assetValue || '[Blank]'}</span></div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowCsvModal(true)}
                  disabled={isProcessingOption1}
                  className="w-full bg-purple-900 hover:bg-purple-800 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:bg-purple-300 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {isProcessingOption1 ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Registering New Assets...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-yellow-400" />
                      Register New Assets ({option1ReviewList.length} Records)
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Option 2 Review Panel */}
            {selectedCsvOption === 2 && option2ReviewList.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-black text-gray-900 uppercase">Option 2: ADS & AA Update Review Panel ({option2ReviewList.length} Records)</h4>
                    <p className="text-[10px] text-gray-400">Verify extracted attributes, PEA numbers (Col J), Equipment Code ADS (Col F), and Account Asset AA (Col G) before updating.</p>
                  </div>
                  <span className="text-[10px] bg-purple-100 text-purple-900 font-bold px-2.5 py-1 rounded-lg">
                    {option2ReviewList.length} assets ready for update
                  </span>
                </div>

                <div className="max-h-[360px] overflow-y-auto space-y-3 border border-purple-100 rounded-2xl p-3 bg-purple-50/20">
                  {option2ReviewList.map((rec, rIdx) => (
                    <div key={rIdx} className="bg-white border border-gray-100 p-3.5 rounded-2xl text-[10px] space-y-2.5 shadow-2xs">
                      {/* Top Bar */}
                      <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-purple-900 bg-purple-50 px-2 py-0.5 rounded font-black">Row #{rec.rowNum}</span>
                          <span className="font-black text-gray-900 text-xs">{rec.equipmentType || 'N/A'}</span>
                          <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">{rec.voltageLevel} kV</span>
                        </div>
                        <button
                          onClick={() => setEditingOption2Item({ index: rIdx, data: { ...rec } })}
                          className="bg-purple-900 hover:bg-purple-800 text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Edit className="w-3 h-3 text-yellow-400" /> Check & Edit
                        </button>
                      </div>

                      {/* 30 Data Details Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-gray-50/70 p-2.5 rounded-xl border border-gray-100 text-[10px]">
                        <div><span className="text-gray-400 font-semibold block">1. PEA Area:</span> <span className="font-bold text-gray-800">{rec.area || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">2. Voltage Level:</span> <span className="font-bold text-gray-800">{rec.voltageLevel} kV</span></div>
                        <div><span className="text-gray-400 font-semibold block">3. Equipment Type:</span> <span className="font-bold text-gray-800">{rec.equipmentType || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">4. Size:</span> <span className="font-bold text-gray-800">{rec.size || '[Blank]'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">5. PEA Number (Col J):</span> <span className="font-bold text-purple-900 font-mono bg-purple-100 px-1.5 py-0.5 rounded">{rec.peaNumber}</span></div>
                        <div><span className="text-gray-400 font-semibold block">6. Equip No (ADS):</span> <span className="font-bold text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded">{rec.adsNumber || '[Blank]'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">7. Account Asset (AA):</span> <span className="font-bold text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded">{rec.assetNumber || '[Blank]'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">8. Manufacturer:</span> <span className="font-bold text-gray-800">{rec.manufacturer || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">9. Substation Name:</span> <span className="font-bold text-gray-800">{rec.substationName || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">10. Location Type:</span> <span className="font-bold text-gray-800">{rec.locationType || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">11. GPS:</span> <span className="font-mono text-gray-700">{rec.gps || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">12. City:</span> <span className="font-bold text-gray-800">{rec.city || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">13. Operate ID:</span> <span className="font-bold text-gray-800">{rec.operateId || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">14. Serial No:</span> <span className="font-mono text-gray-800">{rec.serialNumber || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">15. Model:</span> <span className="font-bold text-gray-800">{rec.model || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">16. Country of Origin:</span> <span className="font-bold text-gray-800">{rec.country || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">17. Production Month:</span> <span className="font-bold text-gray-800">{rec.productionMonth || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">18. Year of Registration:</span> <span className="font-bold text-gray-800">{rec.yearOfRegistration || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">19. Substation ID:</span> <span className="font-bold text-gray-800">{rec.substationId || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">20. Feeder:</span> <span className="font-bold text-gray-800">{rec.feeder || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">21. Landmark Location:</span> <span className="font-bold text-gray-800">{rec.landmark || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">22. Installation Date:</span> <span className="font-bold text-gray-800">{rec.installationDate || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">23. WBS:</span> <span className="font-bold text-gray-800">{rec.wbs || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">24. Work Order:</span> <span className="font-bold text-gray-800">{rec.workOrder || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">25. Business Type:</span> <span className="font-bold text-gray-800">{rec.businessType || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">26. Cost Center:</span> <span className="font-bold text-gray-800">{rec.costCenter || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">27. GISTAG:</span> <span className="font-bold text-gray-800">{rec.gistag || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">28. Class:</span> <span className="font-bold text-gray-800">{rec.class || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">29. Contract Number:</span> <span className="font-bold text-gray-800">{rec.contractNumber || 'N/A'}</span></div>
                        <div><span className="text-gray-400 font-semibold block">30. Asset Value (Col AD):</span> <span className="font-bold text-emerald-700 font-mono">{rec.assetValue || '[Blank]'}</span></div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowCsvModal(true)}
                  disabled={isProcessingOption2}
                  className="w-full bg-purple-900 hover:bg-purple-800 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:bg-purple-300 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {isProcessingOption2 ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Updating ADS & AA Numbers...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-yellow-400" />
                      Update ADS & AA Numbers ({option2ReviewList.length} Records)
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

            {/* Right Side CSV Bulk Importer */}
          <div className="space-y-6">
            {/* CSV Bulk Importer */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-xs p-5">
              <div className="border-b border-gray-100 pb-3 mb-4 flex justify-between items-center">
                <span className="text-xs font-black text-gray-900 uppercase">Bulk CSV File Import</span>
                <span className="text-[9px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold uppercase">2 Options</span>
              </div>

              {/* Upload Stage */}
              <div 
                onDragEnter={e => { e.preventDefault(); e.stopPropagation(); }}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    parseCSVFile(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-50/50 rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer"
                onClick={() => document.getElementById('file-upload-input')?.click()}
              >
                <input
                  type="file"
                  id="file-upload-input"
                  className="hidden"
                  accept=".csv"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      parseCSVFile(e.target.files[0]);
                    }
                  }}
                />
                <UploadCloud className="w-10 h-10 text-purple-700 mb-2.5" />
                <span className="text-xs font-bold text-gray-700">
                  {csvFileObj ? csvFileObj.name : 'Drag CSV file here or click to select'}
                </span>
                <p className="text-[9px] text-gray-400 mt-1">Supports standard CSV file format with headers</p>
              </div>

              {/* Validation Feedback */}
              {validationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-100 p-3 rounded-xl mt-4 space-y-1">
                  <span className="text-[10px] font-bold text-red-800 block">Row Validation Errors ({validationErrors.length})</span>
                  <ul className="text-[9px] text-red-600 list-disc list-inside space-y-0.5 max-h-[100px] overflow-y-auto">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Choose Option Buttons after file loaded */}
              {csvParsedRows.length > 1 && (
                <div className="mt-4 space-y-3 pt-3 border-t border-gray-100">
                  <span className="text-[10px] font-black text-purple-900 uppercase block">Select Import Option:</span>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={handleSelectOption1}
                      className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                        selectedCsvOption === 1 ? 'bg-purple-900 text-white border-purple-900 shadow-sm' : 'bg-purple-50/60 hover:bg-purple-100 text-purple-900 border-purple-200'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Option 1: New Asset Registration</span>
                        <PlusCircle className="w-4 h-4" />
                      </div>
                      <p className="text-[9px] opacity-80 mt-0.5">Generates PEA numbers, leaves ADS & AA blank for review</p>
                    </button>

                    <button
                      onClick={handleSelectOption2}
                      disabled={isProcessingOption2}
                      className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                        selectedCsvOption === 2 ? 'bg-purple-900 text-white border-purple-900 shadow-sm' : 'bg-purple-50/60 hover:bg-purple-100 text-purple-900 border-purple-200'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Option 2: Update ADS & AA</span>
                        <Edit className="w-4 h-4" />
                      </div>
                      <p className="text-[9px] opacity-80 mt-0.5">Updates Equipment Number ADS & Account Asset (AA) via Column J PEA check</p>
                    </button>
                  </div>

                  {isProcessingOption2 && (
                    <div className="bg-purple-50 p-3 rounded-xl text-[10px] font-bold text-purple-900 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-700" />
                      <span>{option2StatusMsg}</span>
                    </div>
                  )}

                  {option2StatusMsg && !isProcessingOption2 && (
                    <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-[10px] font-bold text-emerald-800">
                      {option2StatusMsg}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: INTEGRITY CONFLICTS SCANNER */}
      {activeSubTab === 'integrity' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xs p-6">
          <div className="border-b border-gray-100 pb-4 mb-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase">Cross-Spreadsheet Integrity Check Scanner</h3>
              <p className="text-[11px] text-gray-400">Scans all 12 regional files simultaneously for PEA Number, ADS Equipment code, or Asset AA duplicates</p>
            </div>

            {/* Filter buttons */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={() => setIntegrityFilterType('all')}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  integrityFilterType === 'all' ? 'bg-purple-900 text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                All Duplicates
              </button>
              <button
                onClick={() => setIntegrityFilterType('pea')}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  integrityFilterType === 'pea' ? 'bg-purple-900 text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                PEA Number
              </button>
              <button
                onClick={() => setIntegrityFilterType('sap')}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  integrityFilterType === 'sap' ? 'bg-purple-900 text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                SAP Equipment ADS
              </button>
              <button
                onClick={() => setIntegrityFilterType('aa')}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  integrityFilterType === 'aa' ? 'bg-purple-900 text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                SAP Asset AA
              </button>
            </div>
          </div>

          {/* Chart of duplicates */}
          {allDuplicates.length > 0 && (
            <div className="mb-6 p-5 border border-purple-100 rounded-2xl bg-purple-50/10 space-y-3">
              <h4 className="text-[11px] font-black text-purple-900 uppercase tracking-wider">Duplicate Asset Code Prevalence Analysis</h4>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                    <XAxis type="number" stroke="#9CA3AF" fontSize={9} fontWeight="bold" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" stroke="#9CA3AF" fontSize={9} fontWeight="bold" width={120} />
                    <Tooltip 
                      contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', fontSize: '10px' }}
                      labelClassName="font-bold text-gray-800"
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Duplicates Listing Grid */}
          <div className="space-y-4">
            {allDuplicates.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center justify-center">
                <CheckCircle className="w-14 h-14 text-emerald-500 mb-3" />
                <span className="text-sm font-bold text-gray-800">Database Integrity Validated</span>
                <p className="text-xs text-gray-400 max-w-sm mt-1">Excellent! No duplicates or index clashes found across any of the regional spreadsheet indices.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {allDuplicates.map((dup, dIdx) => (
                  <div key={dIdx} className="border border-red-100 rounded-2xl bg-red-50/20 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:bg-red-50/40">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-red-100 text-red-800 font-black px-2 py-0.5 rounded-md uppercase">
                          {dup.type} Clash
                        </span>
                        <strong className="text-xs font-mono text-gray-900 bg-white border border-gray-100 px-2 py-0.5 rounded shadow-2xs">
                          {dup.key}
                        </strong>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Clashed across <strong>{dup.items.length} records</strong>. Conflicting registries found:
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {dup.items.map((item: CableAsset) => (
                          <div key={item.number} className="bg-white border border-gray-100 rounded-xl p-3 text-[10px] space-y-1 shadow-2xs flex flex-col justify-between">
                            <div>
                              <div className="flex justify-between font-bold">
                                <span className="text-gray-800">{item.equipmentType} ({item.voltageLevel} kV)</span>
                                <span className="text-purple-900 font-mono">Row #{item.number}</span>
                              </div>
                              <div className="text-gray-400 mt-0.5">
                                Spreadsheet ID: <span className="font-mono text-gray-600 block truncate">{spreadsheetId ? spreadsheetId.substring(0, 16) + '...' : 'Local Fallback'}</span>
                              </div>
                              <div className="text-gray-500 mt-0.5">
                                Registered by: <strong>{item.operatorName}</strong> ({item.timestamp})
                              </div>
                            </div>
                            <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-100">
                              <div className="flex flex-col text-[9px] text-gray-400 leading-tight">
                                <span>PEA: <strong className="text-gray-700">{item.peaNumber}</strong></span>
                                <span>ADS: <strong className="text-gray-700">{item.assetNumber}</strong></span>
                                <span>AA: <strong className="text-gray-700">{item.adsNumber}</strong></span>
                              </div>
                              <button
                                onClick={() => startEditingAsset(item)}
                                className="text-[10px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-0.5 cursor-pointer bg-purple-50 hover:bg-purple-100/60 px-2 py-1 rounded-md transition-all shrink-0"
                              >
                                <Edit className="w-3 h-3 text-purple-700" /> Edit Manually
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Panel to resolve duplicate */}
                    <div className="flex flex-row md:flex-col gap-2 shrink-0 w-full md:w-auto">
                      <button
                        onClick={() => handleResolveDuplicate(dup, 'keep_latest')}
                        disabled={resolvingId === dup.key}
                        className="flex-1 md:flex-initial bg-purple-900 hover:bg-purple-800 text-white text-[11px] font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {resolvingId === dup.key && resolveAction === 'keep_latest' ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Resolving...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-3.5 h-3.5" />
                            Keep Latest (Clear Dups)
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleResolveDuplicate(dup, 'rename')}
                        className="flex-1 md:flex-initial bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-[11px] font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Edit className="w-3.5 h-3.5 text-purple-700" />
                        Rename Key
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MANUAL EDIT DIALOG MODAL */}
      {editingAsset && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-purple-700" />
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Manual Duplicate Override</h4>
              </div>
              <button 
                onClick={() => setEditingAsset(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-gray-500">
                You are manually overriding index codes for asset: <strong className="font-mono block truncate mt-1 bg-gray-50 border border-gray-100 p-2 rounded-lg text-purple-900 text-[10px]">{editingAsset.equipmentId}</strong>
              </p>

              <div className="space-y-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase">PEA Number (ID)</label>
                  <input
                    type="text"
                    value={editPea}
                    onChange={e => setEditPea(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white animate-transition"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Equipment Number ADS</label>
                  <input
                    type="text"
                    value={editAds}
                    onChange={e => setEditAds(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white animate-transition"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Account Asset Number (AA)</label>
                  <input
                    type="text"
                    value={editAa}
                    onChange={e => setEditAa(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white animate-transition"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditingAsset(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold py-2 px-3 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveManualEdit}
                disabled={savingAssetId !== null}
                className="flex-1 bg-purple-900 hover:bg-purple-800 text-white text-[11px] font-bold py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {savingAssetId !== null ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Override
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPTION 1 ITEM CHECK & EDIT MODAL */}
      {editingOption1Item && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-purple-700" />
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Check & Edit New Asset Data — 30 Details (Row #{editingOption1Item.data.rowNum})</h4>
              </div>
              <button 
                onClick={() => setEditingOption1Item(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">1. PEA Area (Col B)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.area || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, area: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">2. Voltage Level (Col A)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.voltageLevel || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, voltageLevel: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">3. Equipment Type (Col H)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.equipmentType || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, equipmentType: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">4. Size (Col I)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.size || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, size: e.target.value } })}
                  placeholder="(Blank if empty)"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-purple-700 uppercase">5. Assign PEA Number</label>
                <input
                  type="text"
                  value={editingOption1Item.data.peaNumber || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, peaNumber: e.target.value } })}
                  className="w-full bg-purple-50 border border-purple-200 rounded-lg py-1.5 px-3 font-bold text-purple-900 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">6. Manufacturer (Col M)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.manufacturer || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, manufacturer: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">7. Substation Name (Col R)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.substationName || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, substationName: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">8. Location Type (Col E)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.locationType || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, locationType: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">9. GPS Coordinates (Col D)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.gps || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, gps: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">10. City (Col C)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.city || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, city: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-amber-600 uppercase">12. Equipment Number ADS (Col F)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.adsNumber || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, adsNumber: e.target.value } })}
                  placeholder="[Blank for Option 1]"
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-amber-600 uppercase">13. Account Asset Number AA (Col G)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.assetNumber || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, assetNumber: e.target.value } })}
                  placeholder="[Blank for Option 1]"
                  className="w-full bg-amber-50/50 border border-amber-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">14. Operate ID (Col K)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.operateId || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, operateId: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">15. Serial No (Col L)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.serialNumber || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, serialNumber: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">16. Model (Col N)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.model || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, model: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">17. Country of Origin (Col O)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.country || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, country: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">18. Production Month (Col P)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.productionMonth || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, productionMonth: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">19. Year of Registration (Col Q)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.yearOfRegistration || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, yearOfRegistration: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">20. Substation ID (Col S)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.substationId || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, substationId: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">21. Feeder (Col T)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.feeder || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, feeder: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">22. Landmark Location (Col U)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.landmark || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, landmark: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">23. Installation Date (Col V)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.installationDate || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, installationDate: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">24. WBS (Col W)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.wbs || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, wbs: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">25. Work Order (Col X)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.workOrder || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, workOrder: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">26. Business Type (Col Y)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.businessType || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, businessType: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">27. Cost Center (Col Z)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.costCenter || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, costCenter: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">28. GISTAG (Col AA)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.gistag || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, gistag: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">29. Class (Col AB)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.class || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, class: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">30. Contract Number (Col AC)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.contractNumber || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, contractNumber: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-emerald-600 uppercase">31. Asset Value (Col AD)</label>
                <input
                  type="text"
                  value={editingOption1Item.data.assetValue || ''}
                  onChange={e => setEditingOption1Item({ ...editingOption1Item, data: { ...editingOption1Item.data, assetValue: e.target.value } })}
                  placeholder="e.g. 2,500,000 THB"
                  className="w-full bg-emerald-50/50 border border-emerald-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-emerald-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setEditingOption1Item(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold py-2.5 px-3 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updated = [...option1ReviewList];
                  updated[editingOption1Item.index] = editingOption1Item.data;
                  setOption1ReviewList(updated);
                  setEditingOption1Item(null);
                }}
                className="flex-1 bg-purple-900 hover:bg-purple-800 text-white text-[11px] font-bold py-2.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5 text-yellow-400" />
                Save All 30 Fields
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Check & Edit Modal for Option 2 Item */}
      {editingOption2Item && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full border border-purple-100 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto relative">
            <button 
              onClick={() => setEditingOption2Item(null)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-purple-50 text-purple-900 rounded-xl">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-purple-900 bg-purple-50 px-2 py-0.5 rounded font-black">Row #{editingOption2Item.data.rowNum}</span>
                <h3 className="text-sm font-black text-gray-900">Check & Edit Option 2 Asset Details</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">1. PEA Area (Col B)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.area || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, area: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">2. Voltage Level (Col A)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.voltageLevel || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, voltageLevel: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">3. Equipment Type (Col H)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.equipmentType || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, equipmentType: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">4. Size (Col I)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.size || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, size: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-purple-900 uppercase">5. Assigned PEA Number (Col J)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.peaNumber || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, peaNumber: e.target.value } })}
                  className="w-full bg-purple-50 border border-purple-300 rounded-lg py-1.5 px-3 font-bold text-purple-900 font-mono focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-amber-700 uppercase">6. Equipment Number ADS (Col F)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.adsNumber || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, adsNumber: e.target.value } })}
                  className="w-full bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-3 font-bold text-amber-900 font-mono focus:outline-hidden focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-amber-700 uppercase">7. Account Asset AA (Col G)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.assetNumber || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, assetNumber: e.target.value } })}
                  className="w-full bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-3 font-bold text-amber-900 font-mono focus:outline-hidden focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">8. Manufacturer (Col M)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.manufacturer || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, manufacturer: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">9. Substation Name (Col R)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.substationName || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, substationName: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">10. Location Type (Col E)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.locationType || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, locationType: e.target.value } })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-emerald-600 uppercase">11. Asset Value (Col AD)</label>
                <input
                  type="text"
                  value={editingOption2Item.data.assetValue || ''}
                  onChange={e => setEditingOption2Item({ ...editingOption2Item, data: { ...editingOption2Item.data, assetValue: e.target.value } })}
                  placeholder="e.g. 2,500,000 THB"
                  className="w-full bg-emerald-50/50 border border-emerald-200 rounded-lg py-1.5 px-3 font-semibold text-gray-700 focus:outline-hidden focus:border-emerald-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setEditingOption2Item(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold py-2.5 px-3 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updated = [...option2ReviewList];
                  updated[editingOption2Item.index] = editingOption2Item.data;
                  setOption2ReviewList(updated);
                  setEditingOption2Item(null);
                }}
                className="flex-1 bg-purple-900 hover:bg-purple-800 text-white text-[11px] font-bold py-2.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5 text-yellow-400" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Modal for CSV Download Confirmation */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-purple-100 shadow-2xl space-y-5 relative">
            <button 
              onClick={() => setShowCsvModal(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3.5 border-b border-gray-100 pb-4">
              <div className="p-3 bg-purple-50 text-purple-700 rounded-2xl shrink-0">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">
                  Export Confirmation {selectedCsvOption === 2 ? '(Option 2: Update ADS & AA)' : '(Option 1: Registration)'}
                </span>
                <h3 className="text-base font-black text-gray-900 leading-tight">
                  Do you want a CSV file with PEA number?
                </h3>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              This file will be an Excel CSV that contains all data from your uploaded file along with the assigned PEA numbers in Column J of each row.
            </p>

            <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-100 text-xs text-purple-900 font-semibold flex items-center justify-between">
              <span>{selectedCsvOption === 2 ? 'Assets ready for update:' : 'Assets ready for registration:'}</span>
              <span className="bg-purple-900 text-white font-black text-xs px-2.5 py-0.5 rounded-full">
                {selectedCsvOption === 2 
                  ? `${option2ReviewList.length > 0 ? option2ReviewList.length : (csvParsedRows.length > 1 ? csvParsedRows.length - 1 : 0)} Records`
                  : `${option1ReviewList.length} Records`}
              </span>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => {
                  setShowCsvModal(false);
                  if (selectedCsvOption === 2) {
                    commitOption2Assets(true);
                  } else {
                    commitOption1Assets(true);
                  }
                }}
                className="w-full bg-purple-900 hover:bg-purple-800 text-white py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg"
              >
                <Download className="w-4 h-4 text-yellow-400" />
                {selectedCsvOption === 2 ? 'Yes, Download CSV & Update' : 'Yes, Download CSV & Register'}
              </button>

              <button
                onClick={() => {
                  setShowCsvModal(false);
                  if (selectedCsvOption === 2) {
                    commitOption2Assets(false);
                  } else {
                    commitOption1Assets(false);
                  }
                }}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-purple-700" />
                {selectedCsvOption === 2 ? 'No, Update Without CSV' : 'No, Register Without CSV'}
              </button>

              <button
                onClick={() => setShowCsvModal(false)}
                className="w-full text-gray-400 hover:text-gray-600 text-xs font-bold py-1 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Modal overlay during Option 2 (ADS/AA update) processing */}
      {isProcessingOption2 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-purple-100 shadow-2xl space-y-5 text-center relative overflow-hidden">
            {/* Top decorative gradient or accent */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 to-indigo-600" />
            
            <div className="flex flex-col items-center justify-center space-y-4 pt-2">
              <div className="relative flex items-center justify-center">
                {/* Outer spinning ring */}
                <div className="absolute w-16 h-16 rounded-full border-4 border-purple-100 border-t-purple-600 animate-spin" />
                {/* Inner pulsing indicator */}
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 animate-pulse">
                  <Loader2 className="w-6 h-6 animate-spin duration-3000" />
                </div>
              </div>
              
              <div>
                <h3 className="text-base font-black text-gray-900 leading-tight">
                  Updating ADS & AA Numbers
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Please wait while the regional spreadsheets are updated.
                </p>
              </div>
            </div>

            {/* Custom Progress Bar */}
            {option2TotalToUpdate > 0 && (
              <div className="space-y-2">
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-purple-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${(option2CurrentIndex / option2TotalToUpdate) * 100}%` }}
                  />
                </div>
                
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-500">
                  <span>Progress</span>
                  <span className="text-purple-700">
                    {option2CurrentIndex} / {option2TotalToUpdate} ({Math.round((option2CurrentIndex / option2TotalToUpdate) * 100)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Current item and notice */}
            <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-100 text-xs space-y-1.5">
              {option2CurrentPea ? (
                <div className="flex justify-between items-center text-purple-950 font-medium">
                  <span>Processing PEA:</span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded-md border border-purple-100 font-bold text-[11px]">
                    {option2CurrentPea}
                  </span>
                </div>
              ) : (
                <div className="text-purple-900 font-semibold text-center">
                  Initializing Connection...
                </div>
              )}
            </div>

            <div className="text-[10px] leading-relaxed text-amber-600 bg-amber-50 rounded-xl p-2.5 border border-amber-100 font-medium flex items-start gap-1.5 text-left">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> Do not close this browser window or refresh the page. Google Sheets requests must finish completely to avoid data mismatch.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Registration Progress Percent Modal */}
      <RegistrationProgressModal
        isOpen={progressModal.isOpen}
        title={progressModal.title}
        currentStepMessage={progressModal.stepMessage}
        progressPercent={progressModal.percent}
        isError={progressModal.isError}
        errorMessage={progressModal.errorMessage}
        isComplete={progressModal.isComplete}
        totalItems={progressModal.totalItems}
        currentItemIndex={progressModal.currentItemIndex}
        currentItemName={progressModal.currentItemName}
        onClose={() => setProgressModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

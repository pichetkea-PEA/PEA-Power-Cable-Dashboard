import { useState, useEffect, useMemo, ChangeEvent, FormEvent } from 'react';
import { logAssetActivity } from '../utils/auditLogger';
import { 
  EquipmentType, 
  LocationType, 
  PDResultType, 
  TanDeltaResult, 
  PEAUser,
  CableAsset,
  PDDiagnosticInformation
} from '../types';
import { 
  PEA_AREAS, 
  PEA_AREA_NAMES, 
  PEA_AREA_CITIES, 
  EQUIPMENT_TYPES, 
  COUNTRIES_OF_ORIGIN, 
  MANUFACTURERS, 
  VOLTAGE_LEVELS,
  generateEquipmentId,
  getEquipmentConditionPrefix,
  getLatestEquipmentRunningNumber,
  getAvailableEquipmentTypes,
  getManufacturersForEquipmentType
} from '../utils/peaData';
import { getBangkokTimestamp } from '../utils/dateUtils';
import { 
  uploadImageToDrive,
  uploadFileToDrive,
  appendGeneralRow, 
  appendEngineeringRow, 
  appendVisualRow,
  appendPdDiagnosticRow,
  fetchSheetsData,
  fetchLastSheetNumber,
  getMasterSpreadsheetsMap
} from '../utils/googleSheets';
import { RegistrationProgressModal } from './RegistrationProgressModal';
import { getSectorSpreadsheet, saveSectorSpreadsheet, saveCentralAssetsCache } from '../utils/firestore';
import { 
  analyzePrpdImage, 
  analyzeOfflinePdPdf, 
  generateDiagnosticSummary,
  AnalyzedPrpdResult,
  AnalyzedOfflinePdResult 
} from '../utils/pdAnalyzer';
import { 
  downloadPrpdCsvTemplate, 
  downloadPrpdJsonTemplate 
} from '../utils/prpdTemplates';
import { 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  MapPin, 
  Camera, 
  AlertTriangle, 
  Loader2, 
  ShieldCheck, 
  Sparkles,
  User,
  Activity,
  FileText,
  FileSpreadsheet,
  FileCode,
  Download,
  Upload,
  Radio,
  Layers,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Flame,
  ShieldAlert
} from 'lucide-react';

interface InputFormProps {
  user: PEAUser;
  spreadsheetId: string | null;
  googleToken: string | null;
  folderId: string | null;
  onSuccess: () => void;
  assets?: CableAsset[];
}

export default function InputForm({ user, spreadsheetId, googleToken, folderId, onSuccess, assets }: InputFormProps) {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // --- Form State ---

  // Page 1: General Info
  const [selectedArea, setSelectedArea] = useState<string>(
    user.interestArea === 'ALL' ? 'N1' : user.interestArea
  );
  const [voltage, setVoltage] = useState<string>('115');
  const [city, setCity] = useState<string>('');
  const [eqType, setEqType] = useState<EquipmentType>('Underground Cable');
  const [brand, setBrand] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [locationType, setLocationType] = useState<LocationType>('Substation');
  const [substation, setSubstation] = useState<string>('');
  const [landmark, setLandmark] = useState<string>('');
  const [gpsLat, setGpsLat] = useState<string>('');
  const [gpsLng, setGpsLng] = useState<string>('');
  const [regYear, setRegYear] = useState<number>(new Date().getFullYear());
  const [peaNumber, setPeaNumber] = useState<string>('');
  const [assetNumber, setAssetNumber] = useState<string>('');
  const [adsNumber, setAdsNumber] = useState<string>('');

  // 15 New General Info columns
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
  const [qrDocument, setQrDocument] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Page 2: Engineering Info
  const [loadCurrent, setLoadCurrent] = useState<string>('');
  const [sheathCurrent, setSheathCurrent] = useState<string>('');
  const [surfaceTemp, setSurfaceTemp] = useState<string>('');
  const [discharge, setDischarge] = useState<string>('');
  const [pdResult, setPdResult] = useState<PDResultType>('None');
  const [onlinePdAmplitude, setOnlinePdAmplitude] = useState<string>('');
  const [insulationRes, setInsulationRes] = useState<string>('');
  const [tanDelta, setTanDelta] = useState<TanDeltaResult>('No Action Required');
  const [tanDeltaAmplitude, setTanDeltaAmplitude] = useState<string>('');

  // Page 3: Visual & Thermogram Images
  const [visualFile, setVisualFile] = useState<File | null>(null);
  const [thermalFile, setThermalFile] = useState<File | null>(null);
  const [visualPreview, setVisualPreview] = useState<string>('');
  const [thermalPreview, setThermalPreview] = useState<string>('');

  // Page 4: Advanced Partial Discharge (PD) Diagnostic Suite
  const [onlinePrpdFile, setOnlinePrpdFile] = useState<File | null>(null);
  const [onlinePrpdPreview, setOnlinePrpdPreview] = useState<string>('');
  const [analyzedPrpd, setAnalyzedPrpd] = useState<AnalyzedPrpdResult | null>(null);
  const [isAnalyzingPrpd, setIsAnalyzingPrpd] = useState<boolean>(false);
  const [prpdChannel, setPrpdChannel] = useState<string>('Channel 1');
  const [prpdPhase, setPrpdPhase] = useState<'Phase A' | 'Phase B' | 'Phase C' | '3-Phase'>('Phase A');
  const [prpdPeakCharge, setPrpdPeakCharge] = useState<string>('812.8');
  const [prpdPulseRate, setPrpdPulseRate] = useState<string>('263.7');
  const [prpdAvgAmplitude, setPrpdAvgAmplitude] = useState<string>('35.8');
  const [prpdDefectType, setPrpdDefectType] = useState<string>('Surface Tracking / Bad Contacts');

  // Offline PD PDF Report
  const [offlinePdfFile, setOfflinePdfFile] = useState<File | null>(null);
  const [analyzedOffline, setAnalyzedOffline] = useState<AnalyzedOfflinePdResult | null>(null);
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState<boolean>(false);
  const [offlineTestVoltage, setOfflineTestVoltage] = useState<string>('12.8 kV (2.0 U0)');
  const [offlineMaxCharge, setOfflineMaxCharge] = useState<string>('3.6');
  const [offlineDefectLocation, setOfflineDefectLocation] = useState<string>('80.0 m (Far Termination)');
  const [offlineIeeeVerdict, setOfflineIeeeVerdict] = useState<string>('Action Required');
  const [offlineRiskLevel, setOfflineRiskLevel] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('High');

  // Registration Progress Modal State
  const [progressModal, setProgressModal] = useState<{
    isOpen: boolean;
    title: string;
    stepMessage: string;
    percent: number;
    isError: boolean;
    errorMessage?: string;
    isComplete: boolean;
  }>({
    isOpen: false,
    title: 'Registering New Asset',
    stepMessage: '',
    percent: 0,
    isError: false,
    isComplete: false
  });

  // Pre-populate city with first available option in selected area
  useEffect(() => {
    const cities = PEA_AREA_CITIES[selectedArea] || [];
    if (cities.length > 0) {
      setCity(cities[0]);
    } else {
      setCity('');
    }
  }, [selectedArea]);

  // System Constraint: 33 kV is Southern Area 2-3 (S2, S3) only
  useEffect(() => {
    if (selectedArea !== 'S2' && selectedArea !== 'S3' && voltage === '33') {
      setVoltage('115');
    }
  }, [selectedArea, voltage]);

  // Voltage Level Constraint
  useEffect(() => {
    const availableTypes = getAvailableEquipmentTypes(voltage);
    if (!availableTypes.includes(eqType)) {
      setEqType(availableTypes[0]);
    }
  }, [voltage, eqType]);

  // Brand constraint
  useEffect(() => {
    const availableBrands = getManufacturersForEquipmentType(eqType);
    if (!brand || !availableBrands.includes(brand)) {
      setBrand(availableBrands[0] || 'Others');
    }
  }, [eqType]);

  // Pre-populate default brand and country
  useEffect(() => {
    const availableBrands = getManufacturersForEquipmentType(eqType);
    if (!brand && availableBrands.length > 0) {
      setBrand(availableBrands[0]);
    }
    if (!country && COUNTRIES_OF_ORIGIN.length > 0) {
      setCountry(COUNTRIES_OF_ORIGIN[0]);
    }
  }, []);

  // Handle GPS location finder
  const detectGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        position => {
          setGpsLat(position.coords.latitude.toFixed(6));
          setGpsLng(position.coords.longitude.toFixed(6));
          setStatusMessage('GPS Auto-detected successfully!');
          setTimeout(() => setStatusMessage(''), 3000);
        },
        error => {
          console.error(error);
          alert('GPS detection failed. Please check permissions or enter coordinates manually.');
        }
      );
    } else {
      alert('Geolocation API not supported in your browser.');
    }
  };

  // Unique Equipment ID generator helper
  const computedEquipmentId = useMemo(() => {
    const params = {
      area: selectedArea,
      voltage: String(voltage),
      year: regYear,
      locationType,
      equipmentType: eqType,
      city,
    };
    const latestNum = getLatestEquipmentRunningNumber(assets || [], params);
    return generateEquipmentId({
      ...params,
      cityIndex: latestNum + 1,
      peaNumber: (peaNumber || '').trim()
    });
  }, [selectedArea, voltage, regYear, locationType, eqType, city, peaNumber, assets]);

  // Image preview handlers for Step 3
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>, type: 'visual' | 'thermal') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'visual') {
        setVisualFile(file);
        setVisualPreview(reader.result as string);
      } else {
        setThermalFile(file);
        setThermalPreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Online PRPD Image Upload & Smart Analysis
  const handlePrpdImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOnlinePrpdFile(file);
    setIsAnalyzingPrpd(true);

    try {
      const result = await analyzePrpdImage(file, prpdPhase);
      setAnalyzedPrpd(result);
      setOnlinePrpdPreview(result.imageUrl);
      if (result.channel) setPrpdChannel(result.channel);
      if (result.phase) setPrpdPhase(result.phase as any);
      setPrpdPeakCharge(String(result.amplitude));
      if (result.avgAmplitude !== undefined) setPrpdAvgAmplitude(String(result.avgAmplitude));
      setPrpdPulseRate(String(result.repetitionRate));
      setPrpdDefectType(result.defectType);
    } catch (err) {
      console.warn("Failed to analyze PRPD image:", err);
    } finally {
      setIsAnalyzingPrpd(false);
    }
  };

  // Handle Offline PD PDF Report Upload & Smart Analysis
  const handleOfflinePdfChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOfflinePdfFile(file);
    setIsAnalyzingPdf(true);

    try {
      const result = await analyzeOfflinePdPdf(file);
      setAnalyzedOffline(result);
      setOfflineTestVoltage(result.testVoltage);
      setOfflineMaxCharge(String(result.maxDischarge));
      setOfflineDefectLocation(result.defectLocation);
      setOfflineIeeeVerdict(result.ieeeVerdict);
      setOfflineRiskLevel(result.riskLevel);
    } catch (err) {
      console.warn("Failed to parse Offline PD PDF:", err);
    } finally {
      setIsAnalyzingPdf(false);
    }
  };

  // Immediate Engineering warning calculation flags
  const alerts = useMemo(() => {
    const hasHighTemp = surfaceTemp !== '' && parseFloat(surfaceTemp) > 70;
    const hasHighDischarge = discharge !== '' && parseFloat(discharge) > 100;
    const hasLowInsulation = insulationRes !== '' && parseFloat(insulationRes) < 1.0;
    
    const load = parseFloat(loadCurrent) || 0;
    const sheath = parseFloat(sheathCurrent) || 0;
    const hasHighSheathRatio = load > 0 && (sheath / load) > 0.3;

    return {
      highTemp: hasHighTemp,
      highDischarge: hasHighDischarge,
      lowInsulation: hasLowInsulation,
      highSheathRatio: hasHighSheathRatio
    };
  }, [surfaceTemp, discharge, insulationRes, loadCurrent, sheathCurrent]);

  // Executive Combined Diagnostic Summary
  const liveDiagnosticSummary = useMemo(() => {
    return generateDiagnosticSummary(analyzedPrpd, analyzedOffline, computedEquipmentId);
  }, [analyzedPrpd, analyzedOffline, computedEquipmentId]);

  // Submit combined multi-page rows across 4 Google Sheets tabs
  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    
    if (step < 4) {
      setStep(prev => prev + 1);
      return;
    }

    if (!visualFile || !thermalFile) {
      setStatusMessage('Please upload both visual and thermal images before submitting.');
      setStep(3);
      return;
    }

    setLoading(true);
    setStatusMessage('Preparing database for selected area...');
    setProgressModal({
      isOpen: true,
      title: 'Registering New Asset with Diagnostic Logs',
      stepMessage: 'Preparing database connection & uploading attachments...',
      percent: 10,
      isError: false,
      isComplete: false
    });

    try {
      // 1. Get or Create Spreadsheet for selectedArea
      let currentSpreadsheetId = spreadsheetId;
      let currentFolderId = folderId;

      if (googleToken || !currentSpreadsheetId) {
        const sectorData = await getSectorSpreadsheet(selectedArea);
        if (sectorData && sectorData.spreadsheetId) {
          currentSpreadsheetId = sectorData.spreadsheetId;
          if (sectorData.folderId) currentFolderId = sectorData.folderId;
        } else {
          const masterMap = await getMasterSpreadsheetsMap(googleToken);
          if (masterMap.spreadsheets[selectedArea]) {
            currentSpreadsheetId = masterMap.spreadsheets[selectedArea];
            if (masterMap.folders[selectedArea]) currentFolderId = masterMap.folders[selectedArea];
          }
        }
      }

      setStatusMessage('Uploading inspection photos & diagnostic files...');
      setProgressModal(prev => ({
        ...prev,
        percent: 20,
        stepMessage: 'Uploading visual photo, thermogram scan, PRPD picture & offline PDF report...'
      }));
      
      let visualUrl = 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=400';
      let thermalUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400';
      let prpdUrl = onlinePrpdPreview || '';
      let offlinePdfUrl = '';

      // Upload files to user's Google Drive folder if connected
      if (googleToken && currentFolderId) {
        if (visualFile) {
          visualUrl = await uploadImageToDrive(googleToken, currentFolderId, visualFile);
        }
        if (thermalFile) {
          thermalUrl = await uploadImageToDrive(googleToken, currentFolderId, thermalFile);
        }
        if (onlinePrpdFile) {
          prpdUrl = await uploadFileToDrive(googleToken, currentFolderId, onlinePrpdFile);
        }
        if (offlinePdfFile) {
          offlinePdfUrl = await uploadFileToDrive(googleToken, currentFolderId, offlinePdfFile);
        }
      }

      setStatusMessage('Calculating sequential running index...');
      setProgressModal(prev => ({
        ...prev,
        percent: 35,
        stepMessage: 'Calculating sequential index & validating PEA registration fields...'
      }));

      const timestamp = getBangkokTimestamp();
      
      let rowNum = 1;
      if (googleToken && currentSpreadsheetId) {
        try {
          const lastSheetNum = await fetchLastSheetNumber(googleToken, currentSpreadsheetId);
          if (lastSheetNum > 0) {
            rowNum = lastSheetNum + 1;
          } else {
            const currentAssets = await fetchSheetsData(googleToken, currentSpreadsheetId);
            if (currentAssets && currentAssets.length > 0) {
              const validNumbers = currentAssets.map(a => Number(a.number) || 0).filter(n => n > 0 && n < 50000);
              rowNum = validNumbers.length > 0 ? Math.max(...validNumbers) + 1 : currentAssets.length + 1;
            }
          }
        } catch (err) {
          console.error("Failed to fetch target spreadsheet data for row number, using fallback:", err);
          if (assets && assets.length > 0) {
            const validNumbers = assets.map(a => Number(a.number) || 0).filter(n => n > 0 && n < 50000);
            rowNum = validNumbers.length > 0 ? Math.max(...validNumbers) + 1 : assets.length + 1;
          }
        }
      } else {
        if (assets && assets.length > 0) {
          const validNumbers = assets.map(a => Number(a.number) || 0).filter(n => n > 0 && n < 50000);
          rowNum = validNumbers.length > 0 ? Math.max(...validNumbers) + 1 : assets.length + 1;
        }
      }

      const finalPeaNumber = (peaNumber || '').trim();
      const finalAssetNumber = (assetNumber || '').trim() || (finalPeaNumber ? finalPeaNumber : '');
      const finalAdsNumber = (adsNumber || '').trim() || (finalPeaNumber ? finalPeaNumber : '');

      // Tab 1: General Information
      const generalRow = [
        rowNum, timestamp, user.name, voltage, city, eqType, 
        brand || 'Prysmian Group', country || 'Thailand', locationType, substation || 'Main Station', 
        landmark || 'No landmarks', `${gpsLat || '13.7563'}, ${gpsLng || '100.5018'}`, regYear, 
        finalPeaNumber, finalAssetNumber, finalAdsNumber,
        productionMonth || 'N/A', installationDate || 'N/A', wbs || 'N/A', businessType || 'N/A',
        costCenter || 'N/A', gistag || 'N/A', assetClass || 'N/A', contractNumber || 'N/A',
        feeder || 'N/A', substationId || 'N/A', operateId || 'N/A', serialNumber || 'N/A',
        model || 'N/A', workOrder || 'N/A', size || 'N/A', 'N/A',
        computedEquipmentId, (qrDocument || '').trim()
      ];

      // Tab 2: Engineering Information
      const engineeringRow = [
        rowNum, timestamp, user.name, computedEquipmentId, 
        parseFloat(loadCurrent) || 120, parseFloat(sheathCurrent) || 8, parseFloat(surfaceTemp) || 35, 
        parseFloat(discharge) || 5, pdResult,
        parseFloat(onlinePdAmplitude) || (parseFloat(prpdPeakCharge) || 0),
        parseFloat(insulationRes) || 15.0, tanDelta,
        parseFloat(tanDeltaAmplitude) || 0
      ];

      // Tab 3: Visual & Thermal Images
      const visualRow = [
        rowNum, timestamp, user.name, computedEquipmentId, visualUrl, thermalUrl
      ];

      // Tab 4: PD & Diagnostic Data (Aligned with 27-column schema)
      const pdDiagnosticRow = [
        rowNum,
        timestamp,
        user.name,
        computedEquipmentId,
        finalPeaNumber,
        voltage,
        city,
        eqType,
        locationType,
        substation || 'Main Station',
        prpdUrl,
        prpdPhase,
        parseFloat(prpdPeakCharge) || 0,
        parseFloat(prpdPulseRate) || 0,
        analyzedPrpd?.phaseRange || '85°-145° & 265°-325°',
        prpdDefectType,
        analyzedPrpd?.severity || 'Critical',
        offlinePdfUrl,
        offlinePdfFile?.name || (analyzedOffline ? 'VLF_PD_Report.pdf' : 'N/A'),
        offlineTestVoltage,
        parseFloat(offlineMaxCharge) || 0,
        offlineDefectLocation,
        analyzedOffline?.inceptionVoltage || 6.4,
        analyzedOffline?.defectClassification || 'Surface Discharges',
        offlineIeeeVerdict,
        offlineRiskLevel,
        liveDiagnosticSummary
      ];

      const pdDiagInfo: PDDiagnosticInformation = {
        onlinePrpdImageUrl: prpdUrl,
        onlinePrpdChannel: prpdChannel,
        onlinePrpdPhase: prpdPhase,
        onlinePrpdPeakCharge: parseFloat(prpdPeakCharge) || 0,
        onlinePrpdAmplitude: parseFloat(prpdPeakCharge) || 0,
        onlinePrpdAvgAmplitude: parseFloat(prpdAvgAmplitude) || 35.8,
        onlinePrpdPulseRate: parseFloat(prpdPulseRate) || 0,
        onlinePrpdRepetitionRate: parseFloat(prpdPulseRate) || 0,
        onlinePrpdPhaseRange: analyzedPrpd?.phaseRange || '85°-145° & 265°-325°',
        onlinePrpdDefectType: prpdDefectType,
        onlinePrpdSeverity: analyzedPrpd?.severity || 'Critical',
        offlinePdfUrl: offlinePdfUrl,
        offlinePdfReportName: offlinePdfFile?.name || 'Offline_PD_Report.pdf',
        offlineTestVoltage: offlineTestVoltage,
        offlineMaxApparentCharge: parseFloat(offlineMaxCharge) || 0,
        offlineDefectLocation: offlineDefectLocation,
        offlineInceptionVoltage: analyzedOffline?.inceptionVoltage || 6.4,
        offlineDefectClassification: analyzedOffline?.defectClassification || 'Surface Discharges',
        offlineIeeeVerdict: offlineIeeeVerdict,
        offlineRiskLevel: offlineRiskLevel,
        summaryAnalysis: liveDiagnosticSummary
      };

      const combinedAsset: CableAsset = {
        number: rowNum, timestamp, operatorName: user.name, voltageLevel: voltage, city, 
        equipmentType: eqType, manufacturer: brand || 'Prysmian Group', country: country || 'Thailand',
        locationType, substationName: substation || 'Main Station', landmark: landmark || 'No landmarks',
        gps: { lat: parseFloat(gpsLat) || 13.7563, lng: parseFloat(gpsLng) || 100.5018 },
        yearOfRegistration: regYear, peaNumber: finalPeaNumber, assetNumber: finalAssetNumber, adsNumber: finalAdsNumber,
        productionMonth, installationDate, wbs, businessType, costCenter, gistag, class: assetClass,
        contractNumber, feeder, substationId, operateId, serialNumber, model, workOrder, size,
        equipmentId: computedEquipmentId,
        qrDocument: (qrDocument || '').trim(),
        loadCurrent: parseFloat(loadCurrent) || 120, sheathCurrent: parseFloat(sheathCurrent) || 8,
        surfaceTemperature: parseFloat(surfaceTemp) || 35, externalDischarge: parseFloat(discharge) || 5,
        pdResult, onlinePdAmplitude: parseFloat(onlinePdAmplitude) || (parseFloat(prpdPeakCharge) || 0),
        insulationResistance: parseFloat(insulationRes) || 15.0,
        tanDelta, tanDeltaAmplitude: parseFloat(tanDeltaAmplitude) || 0,
        visualPictureUrl: visualPreview || visualUrl, thermalImageUrl: thermalPreview || thermalUrl,
        pdDiagnostics: pdDiagInfo,
        pdDiagnosticSummary: liveDiagnosticSummary
      };

      if (googleToken && currentSpreadsheetId) {
        setProgressModal(prev => ({ ...prev, percent: 50, stepMessage: `Writing General Information for ${computedEquipmentId}...` }));
        await appendGeneralRow(googleToken, currentSpreadsheetId, generalRow);

        setProgressModal(prev => ({ ...prev, percent: 65, stepMessage: 'Writing Engineering Parameters row...' }));
        await appendEngineeringRow(googleToken, currentSpreadsheetId, engineeringRow);

        setProgressModal(prev => ({ ...prev, percent: 78, stepMessage: 'Writing Visual & Thermal image references...' }));
        await appendVisualRow(googleToken, currentSpreadsheetId, visualRow);

        setProgressModal(prev => ({ ...prev, percent: 88, stepMessage: 'Writing PD & Diagnostic Data sheet (Tab 4)...' }));
        await appendPdDiagnosticRow(googleToken, currentSpreadsheetId, pdDiagnosticRow);
      }

      setProgressModal(prev => ({ ...prev, percent: 95, stepMessage: 'Synchronizing central database cache & local storage...' }));

      try {
        const currentList = assets || [];
        const updatedList = [combinedAsset, ...currentList];
        await saveCentralAssetsCache(updatedList);
        localStorage.setItem('local_cable_assets', JSON.stringify(updatedList));

        // Log registration event for Admin Audit Monitor
        await logAssetActivity({
          type: 'registration',
          equipmentId: computedEquipmentId,
          equipmentType: combinedAsset.equipmentType,
          voltageLevel: combinedAsset.voltageLevel ? `${combinedAsset.voltageLevel} kV` : '115 kV',
          area: selectedArea,
          operatorName: combinedAsset.operatorName || user.name || 'Local Operator',
          userEmail: user.email,
          timestamp: getBangkokTimestamp(),
          details: `Registered ${combinedAsset.equipmentType} in ${combinedAsset.substationName || 'Substation'} (${selectedArea})`,
          gps: combinedAsset.gps,
          substationName: combinedAsset.substationName,
          landmark: combinedAsset.landmark,
          city: combinedAsset.city
        });
      } catch (e) {
        console.warn("Failed updating central assets cache:", e);
      }

      setStatusMessage('Asset successfully logged with full diagnostic data!');
      setProgressModal({
        isOpen: true,
        title: 'Asset Registered Successfully',
        stepMessage: `Asset Equipment ${computedEquipmentId} (PEA: ${finalPeaNumber || 'Assigned'}) registered across all 4 database sheets! (100%)`,
        percent: 100,
        isError: false,
        isComplete: true
      });

      setTimeout(() => {
        onSuccess();
      }, 1500);

    } catch (err: any) {
      setProgressModal({
        isOpen: true,
        title: 'Registration Failed',
        stepMessage: 'An error occurred during asset registration.',
        percent: 0,
        isError: true,
        errorMessage: err.message || 'Error occurred during registration.',
        isComplete: false
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden max-w-3xl mx-auto" id="input-form-card">
      {/* Wizard Header Progress */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white p-6 relative">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-black tracking-widest uppercase bg-purple-800/80 text-purple-200 px-2.5 py-0.5 rounded-md border border-purple-700/50">
            Asset Registration & Diagnostic Wizard
          </span>
          <span className="text-xs font-mono font-bold text-purple-200">
            Step {step} of 4
          </span>
        </div>
        <h3 className="text-base font-bold mt-1 uppercase">Log Cable System Equipment & Diagnostics</h3>
        <p className="text-xs text-purple-200 mt-0.5">PEA Area: {selectedArea} - {PEA_AREA_NAMES[selectedArea]}</p>

        {/* Dynamic Progress Bar */}
        <div className="absolute bottom-0 left-0 w-full h-1.5 bg-purple-950 flex">
          <div className={`h-full bg-emerald-400 transition-all duration-300 ${
            step === 1 ? 'w-1/4' : step === 2 ? 'w-2/4' : step === 3 ? 'w-3/4' : 'w-full'
          }`} />
        </div>
      </div>

      {/* Step Indicators Bar */}
      <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-100 text-center text-[10px] font-bold text-gray-500">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`py-2 px-1 border-b-2 transition-all cursor-pointer ${
            step === 1 ? 'border-purple-600 text-purple-900 bg-purple-50/50 font-black' : 'border-transparent hover:text-gray-900'
          }`}
        >
          1. General Registry
        </button>
        <button
          type="button"
          onClick={() => setStep(2)}
          className={`py-2 px-1 border-b-2 transition-all cursor-pointer ${
            step === 2 ? 'border-purple-600 text-purple-900 bg-purple-50/50 font-black' : 'border-transparent hover:text-gray-900'
          }`}
        >
          2. Engineering Logs
        </button>
        <button
          type="button"
          onClick={() => setStep(3)}
          className={`py-2 px-1 border-b-2 transition-all cursor-pointer ${
            step === 3 ? 'border-purple-600 text-purple-900 bg-purple-50/50 font-black' : 'border-transparent hover:text-gray-900'
          }`}
        >
          3. Visual & Thermal
        </button>
        <button
          type="button"
          onClick={() => setStep(4)}
          className={`py-2 px-1 border-b-2 transition-all cursor-pointer ${
            step === 4 ? 'border-purple-600 text-purple-900 bg-purple-50/50 font-black' : 'border-transparent hover:text-gray-900'
          }`}
        >
          4. Advanced PD Suite
        </button>
      </div>

      <div className="p-6">
        {statusMessage && (
          <div className="bg-purple-50 text-purple-700 border border-purple-100 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 mb-5">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmitForm} className="space-y-6">
          {/* STEP 1: GENERAL INFORMATION */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="border-b border-gray-100 pb-2 mb-3">
                <h4 className="text-xs font-bold text-gray-900 uppercase">Step 1: General Information Registry</h4>
                <p className="text-[10px] text-gray-400">Configure key identifying indicators of the cable or termination unit</p>
              </div>

              {/* Grid 1 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">PEA Operator Name</label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      disabled
                      value={user.name}
                      className="w-full bg-gray-100 border border-gray-200 rounded-lg py-2 pl-8 pr-3 text-xs font-semibold text-gray-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Voltage Level (kV)</label>
                  <select
                    value={voltage}
                    onChange={e => setVoltage(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
                  >
                    <option value="115">115 kV (Transmission)</option>
                    <option value="33">33 kV (Distribution)</option>
                    <option value="22">22 kV (Distribution)</option>
                    <option value="0.4">0.4 kV (Low Voltage)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">PEA Area</label>
                  <select
                    value={selectedArea}
                    onChange={e => setSelectedArea(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
                  >
                    {PEA_AREAS.map(area => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">PEA City / Province</label>
                  <select
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
                  >
                    {(PEA_AREA_CITIES[selectedArea] || []).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Equipment Type</label>
                  <select
                    value={eqType}
                    onChange={e => setEqType(e.target.value as EquipmentType)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
                  >
                    {getAvailableEquipmentTypes(voltage).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Manufacturer Brand</label>
                  <select
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
                  >
                    {getManufacturersForEquipmentType(eqType).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Country of Origin</label>
                  <select
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
                  >
                    {COUNTRIES_OF_ORIGIN.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grid 2 */}
              <div className="grid grid-cols-3 gap-4 border-t border-gray-50 pt-4">
                <div className="flex flex-col gap-1.5 col-span-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Location Type</label>
                  <select
                    value={locationType}
                    onChange={e => setLocationType(e.target.value as LocationType)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
                  >
                    <option value="Substation">Substation</option>
                    <option value="Transmission Line">Transmission Line</option>
                    <option value="Distribution Line">Distribution Line</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Substation Name / Segment</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chiang Mai 2 Substation"
                    value={substation}
                    onChange={e => setSubstation(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Landmark / Geographic details</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Opposite BigC Main Expressway Highway Room 107"
                  value={landmark}
                  onChange={e => setLandmark(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                />
              </div>

              {/* GPS Auto-detector */}
              <div className="grid grid-cols-2 gap-4 border-t border-gray-50 pt-4">
                <div className="flex flex-col gap-1.5 col-span-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">GPS Coordinates</label>
                    <button
                      type="button"
                      onClick={detectGPS}
                      className="text-[10px] text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Auto-detect Location
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="Latitude (e.g. 18.7883)"
                      value={gpsLat}
                      onChange={e => setGpsLat(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                    />
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="Longitude (e.g. 98.9853)"
                      value={gpsLng}
                      onChange={e => setGpsLng(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Registration Year</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 2018"
                    value={regYear}
                    onChange={e => setRegYear(parseInt(e.target.value) || new Date().getFullYear())}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    PEA Number (ID) {eqType === 'Distribution Circuit' && <span className="text-purple-600 font-normal text-[9px]">(Blank for Distribution Circuit)</span>}
                  </label>
                  <input
                    type="text"
                    required={eqType !== 'Distribution Circuit'}
                    disabled={eqType === 'Distribution Circuit'}
                    placeholder={eqType === 'Distribution Circuit' ? 'Leave blank for Distribution Circuit' : 'e.g. PEA-N1-UG01'}
                    value={eqType === 'Distribution Circuit' ? '' : peaNumber}
                    onChange={e => setPeaNumber(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 disabled:opacity-50 disabled:bg-gray-100"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Equipment Number ADS</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EQ-9081234"
                    value={assetNumber}
                    onChange={e => setAssetNumber(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Account Asset Number (AA)</label>
                  <input
                    type="text"
                    placeholder="e.g. AA-1001"
                    value={adsNumber}
                    onChange={e => setAdsNumber(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Expandable Advanced General Fields */}
              <div className="border-t border-gray-100 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs font-black text-purple-900 hover:text-purple-950 cursor-pointer transition-all uppercase tracking-wider"
                >
                  <span className="text-[9px]">{showAdvanced ? '▼' : '▶'}</span>
                  <span>Advanced Cable Specification ({15} Optional Fields)</span>
                </button>

                {showAdvanced && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-3 mt-1 animate-fadeIn">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Production Month</label>
                      <input
                        type="month"
                        value={productionMonth}
                        onChange={e => setProductionMonth(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Installation Date</label>
                      <input
                        type="date"
                        value={installationDate}
                        onChange={e => setInstallationDate(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">WBS Code</label>
                      <input
                        type="text"
                        placeholder="e.g. WBS-N1-998"
                        value={wbs}
                        onChange={e => setWbs(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Business Type</label>
                      <input
                        type="text"
                        placeholder="e.g. Government / Utility"
                        value={businessType}
                        onChange={e => setBusinessType(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Cost Center</label>
                      <input
                        type="text"
                        placeholder="e.g. CC-7041"
                        value={costCenter}
                        onChange={e => setCostCenter(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">GIS Tag</label>
                      <input
                        type="text"
                        placeholder="e.g. GIS-CM2-881"
                        value={gistag}
                        onChange={e => setGistag(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Asset Class</label>
                      <input
                        type="text"
                        placeholder="e.g. Class 1 High Voltage"
                        value={assetClass}
                        onChange={e => setAssetClass(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Contract Number</label>
                      <input
                        type="text"
                        placeholder="e.g. CN-88219"
                        value={contractNumber}
                        onChange={e => setContractNumber(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Feeder</label>
                      <input
                        type="text"
                        placeholder="e.g. FDR-09"
                        value={feeder}
                        onChange={e => setFeeder(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Substation ID</label>
                      <input
                        type="text"
                        placeholder="e.g. SUB-CM2"
                        value={substationId}
                        onChange={e => setSubstationId(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Operate ID</label>
                      <input
                        type="text"
                        placeholder="e.g. OP-991"
                        value={operateId}
                        onChange={e => setOperateId(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Serial Number</label>
                      <input
                        type="text"
                        placeholder="e.g. SN-882180"
                        value={serialNumber}
                        onChange={e => setSerialNumber(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Model</label>
                      <input
                        type="text"
                        placeholder="e.g. MOD-XL-9"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Work Order</label>
                      <input
                        type="text"
                        placeholder="e.g. WO-77621"
                        value={workOrder}
                        onChange={e => setWorkOrder(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Size</label>
                      <input
                        type="text"
                        placeholder="e.g. 400 sq.mm"
                        value={size}
                        onChange={e => setSize(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-[9px] font-bold text-amber-700 uppercase flex items-center justify-between">
                        <span>Engineering Cloud Storage QR Document Link (Col AH)</span>
                      </label>
                      <input
                        type="url"
                        placeholder="e.g. https://drive.google.com/... (As-built drawings, catalog)"
                        value={qrDocument}
                        onChange={e => setQrDocument(e.target.value)}
                        className="bg-amber-50/50 border border-amber-200 rounded-lg py-1.5 px-2.5 text-xs font-mono text-gray-800 focus:outline-hidden focus:border-amber-500 focus:bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Computed ID Preview */}
              <div className="bg-purple-50/50 border border-purple-100 rounded-lg p-3 text-xs mt-3 flex justify-between items-center">
                <div>
                  <span className="text-[9px] font-black text-purple-700 uppercase block tracking-wider">Auto-Compiled unique Equipment ID</span>
                  <span className="font-mono font-bold text-purple-900 mt-0.5 block">{computedEquipmentId}</span>
                </div>
                <Sparkles className="w-5 h-5 text-purple-700" />
              </div>
            </div>
          )}

          {/* STEP 2: ENGINEERING PARAMETERS */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="border-b border-gray-100 pb-2 mb-3">
                <h4 className="text-xs font-bold text-gray-900 uppercase">Step 2: Engineering Information & Field Measurements</h4>
                <p className="text-[10px] text-gray-400">Provide real field test results to compute the Health Index accurately</p>
              </div>

              {/* Grid 1 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Load Current (Amps)</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 180"
                    value={loadCurrent}
                    onChange={e => setLoadCurrent(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Sheath Current (Amps)</label>
                    {alerts.highSheathRatio && (
                      <span className="text-[9px] font-bold text-orange-500 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> Ratio &gt; 30%
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 12"
                    value={sheathCurrent}
                    onChange={e => setSheathCurrent(e.target.value)}
                    className={`bg-gray-50 border rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:bg-white ${
                      alerts.highSheathRatio ? 'border-orange-300 focus:border-orange-600' : 'border-gray-200 focus:border-purple-600'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Surface Temperature (°C)</label>
                    {alerts.highTemp && (
                      <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> Hotspot &gt; 70°C
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 45"
                    value={surfaceTemp}
                    onChange={e => setSurfaceTemp(e.target.value)}
                    className={`bg-gray-50 border rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:bg-white ${
                      alerts.highTemp ? 'border-red-300 focus:border-red-600' : 'border-gray-200 focus:border-purple-600'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">External PD Discharge (pC)</label>
                    {alerts.highDischarge && (
                      <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> PD Elevated
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 8"
                    value={discharge}
                    onChange={e => setDischarge(e.target.value)}
                    className={`bg-gray-50 border rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:bg-white ${
                      alerts.highDischarge ? 'border-red-300 focus:border-red-600' : 'border-gray-200 focus:border-purple-600'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Online PD Result Pattern</label>
                  <select
                    value={pdResult}
                    onChange={e => setPdResult(e.target.value as PDResultType)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
                  >
                    <option value="None">None (Normal)</option>
                    <option value="Corona">Corona Discharge</option>
                    <option value="Surface">Surface Discharge</option>
                    <option value="Void">Void (Cavity) Discharge</option>
                    <option value="Internal">Internal (Insulation) PD</option>
                    <option value="Treeing">Treeing (Severe Degradation)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Online PD amplitude (pC / mV)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 150"
                    value={onlinePdAmplitude}
                    onChange={e => setOnlinePdAmplitude(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Insulation Resistance (G-Ohm)</label>
                    {alerts.lowInsulation && (
                      <span className="text-[9px] font-bold text-red-500 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> Low Res &lt; 1 GOhm
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 12.5"
                    value={insulationRes}
                    onChange={e => setInsulationRes(e.target.value)}
                    className={`bg-gray-50 border rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:bg-white ${
                      alerts.lowInsulation ? 'border-red-300 focus:border-red-600' : 'border-gray-200 focus:border-purple-600'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Tan Delta Result</label>
                  <select
                    value={tanDelta}
                    onChange={e => setTanDelta(e.target.value as TanDeltaResult)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600"
                  >
                    <option value="No Action Required">No Action Required</option>
                    <option value="Further Study Advised">Further Study Advised</option>
                    <option value="Action Required">Action Required (Unstable)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Tan delta amplitude</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 0.0025"
                    value={tanDeltaAmplitude}
                    onChange={e => setTanDeltaAmplitude(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Warning flags callout */}
              {(alerts.highTemp || alerts.highDischarge || alerts.highSheathRatio || alerts.lowInsulation) && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3.5 space-y-2 mt-4 text-[11px] text-red-800">
                  <div className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    High Operational Risk Factors Highlighted!
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    {alerts.highTemp && <li>Joint or cable surface temperature is {surfaceTemp}°C. Hotspots can lead to rapid catastrophic thermal breakdown.</li>}
                    {alerts.highDischarge && <li>Partial discharge magnitude is {discharge} pC. Severe dielectric degradation alert.</li>}
                    {alerts.highSheathRatio && <li>Circulating sheath current ratio is excessive, inducing heat and operational loss.</li>}
                    {alerts.lowInsulation && <li>Insulation resistance is dangerously low at {insulationRes} GOhm. High risk of ground leakage.</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: IMAGES */}
          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="border-b border-gray-100 pb-2 mb-3">
                <h4 className="text-xs font-bold text-gray-900 uppercase">Step 3: Field Inspection Imaging</h4>
                <p className="text-[10px] text-gray-400">Take or upload visual photos and thermal thermograms linked to your Google Drive</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Visual */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Visual Asset Picture</label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-purple-300 relative min-h-[160px] overflow-hidden bg-gray-50/50">
                    {visualPreview ? (
                      <>
                        <img src={visualPreview} alt="Visual Preview" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 cursor-pointer" onClick={() => { setVisualFile(null); setVisualPreview(''); }}>
                          <span className="text-[9px] font-black uppercase px-1">Clear</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Camera className="w-8 h-8 text-gray-300 mb-2" />
                        <span className="text-[11px] text-gray-700 font-bold block">Upload Field Photo</span>
                        <span className="text-[9px] text-gray-400 block mt-0.5">Drag & drop or Click</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageChange(e, 'visual')}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </div>

                {/* Thermal */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Thermal Thermogram Scan</label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-purple-300 relative min-h-[160px] overflow-hidden bg-gray-50/50">
                    {thermalPreview ? (
                      <>
                        <img src={thermalPreview} alt="Thermal Preview" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 cursor-pointer" onClick={() => { setThermalFile(null); setThermalPreview(''); }}>
                          <span className="text-[9px] font-black uppercase px-1">Clear</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Camera className="w-8 h-8 text-gray-300 mb-2" />
                        <span className="text-[11px] text-gray-700 font-bold block">Upload Thermogram Scan</span>
                        <span className="text-[9px] text-gray-400 block mt-0.5">Drag & drop or Click</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageChange(e, 'thermal')}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </div>
              </div>

              {/* Connected Google Drive Status Badge */}
              {googleToken && folderId ? (
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg p-3 flex justify-between items-center text-xs mt-4">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Google Account Verified & Active
                  </div>
                  <span className="text-[9px] font-black tracking-widest uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                    Linked to Drive File Storage
                  </span>
                </div>
              ) : (
                <div className="bg-orange-50 text-orange-700 border border-orange-100 rounded-lg p-3 text-[11px] mt-4 leading-relaxed">
                  ⚠️ Google Account is currently disconnected. Uploaded files will be stored inside local browser memory, and fallback URLs will be saved in the sheet database.
                </div>
              )}
            </div>
          )}

          {/* STEP 4: ADVANCED ONLINE PARTIAL DISCHARGE (PRPD) DIAGNOSTICS */}
          {step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="border-b border-gray-100 pb-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="bg-purple-100 text-purple-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-sm">
                    Step 4 : Online PRPD Diagnostic
                  </span>
                  <h4 className="text-xs font-bold text-gray-900 uppercase">
                    High-Voltage Online HFCT PRPD Diagnostic Input
                  </h4>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Upload HFCT PRPD pattern image to trigger real-time AI/heuristic analysis and populate the asset's health record.
                </p>
              </div>

              {/* SECTION A: ONLINE HFCT PRPD PATTERN DIAGNOSTICS */}
              <div className="bg-purple-50/40 border border-purple-100 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-purple-100/80 pb-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-purple-900 font-bold text-xs uppercase tracking-wide">
                      <Radio className="w-4 h-4 text-purple-700 animate-pulse" />
                      <span>Online HFCT PRPD Pattern Input</span>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Phase Resolved Partial Discharge image from HFCT online sensor
                    </p>
                  </div>

                  {/* Template Download Links */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={downloadPrpdCsvTemplate}
                      className="bg-white border border-purple-200 text-purple-800 hover:bg-purple-50 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                      title="Download standard CSV PRPD data input template"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                      <span>CSV Template</span>
                    </button>
                    <button
                      type="button"
                      onClick={downloadPrpdJsonTemplate}
                      className="bg-white border border-purple-200 text-purple-800 hover:bg-purple-50 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                      title="Download standard JSON sensor schema template"
                    >
                      <FileCode className="w-3 h-3 text-amber-600" />
                      <span>JSON Template</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* PRPD Image Upload Box */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-600 uppercase block">
                      PRPD Pattern Image (.png, .jpg)
                    </label>
                    <div className="border-2 border-dashed border-purple-200 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-purple-400 relative min-h-[160px] overflow-hidden bg-white group">
                      {onlinePrpdPreview ? (
                        <>
                          <img src={onlinePrpdPreview} alt="PRPD Pattern" className="absolute inset-0 w-full h-full object-contain p-2 bg-slate-900" />
                          <div className="absolute top-2 right-2 bg-black/70 text-white rounded-md p-1 px-2 text-[9px] font-bold cursor-pointer" onClick={(e) => { e.stopPropagation(); setOnlinePrpdFile(null); setOnlinePrpdPreview(''); setAnalyzedPrpd(null); }}>
                            Clear
                          </div>
                        </>
                      ) : (
                        <>
                          <Activity className="w-8 h-8 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-xs text-purple-900 font-bold block">Upload PRPD Capture</span>
                          <span className="text-[9px] text-gray-400 block mt-0.5">Drag & drop or Click to choose PRPD image</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePrpdImageChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                  </div>

                  {/* PRPD Parameters & Analysis */}
                  <div className="space-y-3 bg-white p-3.5 rounded-xl border border-purple-100">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-purple-900 uppercase">Analysis Parameters</span>
                      {isAnalyzingPrpd ? (
                        <span className="text-[9px] text-purple-600 flex items-center gap-1 font-bold">
                          <Loader2 className="w-3 h-3 animate-spin" /> Analyzing Image...
                        </span>
                      ) : analyzedPrpd ? (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                          analyzedPrpd.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                          analyzedPrpd.severity === 'Warning' ? 'bg-orange-100 text-orange-800' :
                          analyzedPrpd.severity === 'Advisory' ? 'bg-amber-100 text-amber-800' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {analyzedPrpd.severity} ({analyzedPrpd.confidence}% Match)
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Phase Channel</label>
                        <select
                          value={prpdChannel}
                          onChange={e => {
                            const val = e.target.value;
                            setPrpdChannel(val);
                            if (val === 'Channel 1' || val === 'Channel 4') setPrpdPhase('Phase A');
                            else if (val === 'Channel 2' || val === 'Channel 5') setPrpdPhase('Phase B');
                            else if (val === 'Channel 3' || val === 'Channel 6') setPrpdPhase('Phase C');
                            else setPrpdPhase('3-Phase');
                          }}
                          className="bg-gray-50 border border-purple-200 rounded-lg py-1.5 px-2 text-xs font-semibold text-purple-950"
                        >
                          <option value="Channel 1">Channel 1 (Phase A)</option>
                          <option value="Channel 2">Channel 2 (Phase B)</option>
                          <option value="Channel 3">Channel 3 (Phase C)</option>
                          <option value="Channel 4">Channel 4 (Phase A)</option>
                          <option value="Channel 5">Channel 5 (Phase B)</option>
                          <option value="Channel 6">Channel 6 (Phase C)</option>
                          <option value="3-Phase">3-Phase (All Channels)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Peak Amplitude (mV / pC)</label>
                        <input
                          type="number"
                          step="any"
                          value={prpdPeakCharge}
                          onChange={e => setPrpdPeakCharge(e.target.value)}
                          className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2 text-xs font-medium text-gray-700"
                          placeholder="e.g. 812.8"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Pulses / Sec (pps)</label>
                        <input
                          type="number"
                          step="any"
                          value={prpdPulseRate}
                          onChange={e => setPrpdPulseRate(e.target.value)}
                          className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2 text-xs font-medium text-gray-700"
                          placeholder="e.g. 263.73"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Average Amplitude (mV / pC)</label>
                        <input
                          type="number"
                          step="any"
                          value={prpdAvgAmplitude}
                          onChange={e => setPrpdAvgAmplitude(e.target.value)}
                          className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2 text-xs font-medium text-gray-700"
                          placeholder="e.g. 35.8"
                        />
                      </div>

                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Identified Defect Type</label>
                        <select
                          value={prpdDefectType}
                          onChange={e => setPrpdDefectType(e.target.value)}
                          className="bg-gray-50 border border-gray-200 rounded-lg py-1.5 px-2 text-xs font-medium text-gray-700"
                        >
                          <option value="Surface Tracking / Bad Contacts">Surface Tracking / Bad Contacts</option>
                          <option value="Internal Void / Cavity">Internal Void / Cavity</option>
                          <option value="Corona / External Glow">Corona / External Glow</option>
                          <option value="Treeing Breakdown">Treeing Breakdown</option>
                          <option value="Background Noise / No Active Defect">Background Noise</option>
                        </select>
                      </div>
                    </div>

                    {analyzedPrpd && analyzedPrpd.findings.length > 0 && (
                      <div className="text-[10px] text-purple-900 bg-purple-50/70 p-2 rounded-lg space-y-0.5">
                        <span className="font-bold block">Smart Vision Diagnosis:</span>
                        {analyzedPrpd.findings.map((f, idx) => (
                          <div key={idx} className="flex items-start gap-1">
                            <span className="text-purple-600">•</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION C: AUTO-GENERATED EXECUTIVE DIAGNOSTIC SUMMARY */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-emerald-950 uppercase tracking-wide">
                  <Sparkles className="w-4 h-4 text-emerald-700" />
                  <span>Auto-Generated Diagnostic Executive Summary (Saved into Asset Record)</span>
                </div>
                <p className="text-gray-700 leading-relaxed font-mono text-[11px] bg-white p-3 rounded-lg border border-emerald-100">
                  {liveDiagnosticSummary}
                </p>
              </div>
            </div>
          )}

          {/* Controls Navigation Footer */}
          <div className="flex justify-between items-center border-t border-gray-100 pt-5 mt-6">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(prev => prev - 1)}
                className="flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900 font-bold uppercase transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Previous Step
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(prev => prev + 1)}
                className="bg-purple-900 hover:bg-purple-950 text-white rounded-lg py-2.5 px-6 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              >
                Next Step
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !visualFile || !thermalFile}
                className={`text-white rounded-lg py-2.5 px-6 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${(loading || !visualFile || !thermalFile) ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer shadow-md'}`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting & Uploading...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Submit Inspection & Diagnostic Record
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Registration Progress Popup */}
      <RegistrationProgressModal
        isOpen={progressModal.isOpen}
        title={progressModal.title}
        currentStepMessage={progressModal.stepMessage}
        progressPercent={progressModal.percent}
        isError={progressModal.isError}
        errorMessage={progressModal.errorMessage}
        isComplete={progressModal.isComplete}
        onClose={() => setProgressModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

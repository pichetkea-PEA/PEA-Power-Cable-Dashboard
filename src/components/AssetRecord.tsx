import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { jsPDF } from 'jspdf';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { exportAssetToPDF } from '../utils/pdfGenerator';
import { 
  CableAsset, 
  PEAUser, 
  EquipmentType, 
  LocationType, 
  PDResultType, 
  TanDeltaResult 
} from '../types';
import { 
  PEA_AREAS, 
  PEA_AREA_NAMES, 
  PEA_AREA_CITIES, 
  EQUIPMENT_TYPES, 
  MANUFACTURERS, 
  COUNTRIES_OF_ORIGIN, 
  VOLTAGE_LEVELS,
  calculateHealth,
  generateEquipmentId,
  getAvailableEquipmentTypes,
  getManufacturersForEquipmentType
} from '../utils/peaData';
import { 
  fetchSheetsData, 
  updateSheetRow, 
  appendGeneralRow, 
  appendEngineeringRow, 
  appendVisualRow,
  fetchSheetsRowIndices,
  uploadImageToDrive
} from '../utils/googleSheets';
import { getSectorSpreadsheet, saveSectorSpreadsheet } from '../utils/firestore';
import { 
  Search, 
  Database, 
  FilePenLine, 
  Sparkles, 
  Check, 
  X, 
  AlertCircle, 
  Save, 
  Calendar, 
  Landmark, 
  MapPin, 
  Eye, 
  Loader2, 
  Wrench,
  Camera,
  Activity,
  History,
  TrendingUp,
  ExternalLink,
  Edit,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface AssetRecordProps {
  user: PEAUser;
  googleToken: string | null;
  spreadsheetId: string | null;
  folderId: string | null;
  assets?: CableAsset[];
  onRefresh?: () => void;
}

export default function AssetRecord({ 
  user, 
  googleToken, 
  spreadsheetId, 
  folderId,
  assets,
  onRefresh
}: AssetRecordProps) {
  // --- Filter State ---
  const [filterArea, setFilterArea] = useState<string>((user.role === 'Admin' || user.role === 'Manager') ? 'All' : user.interestArea);
  const [filterCity, setFilterCity] = useState<string>('All');
  const [filterVoltage, setFilterVoltage] = useState<string>('All');
  const [filterEqType, setFilterEqType] = useState<string>('All');
  const [filterYear, setFilterYear] = useState<string>('All');
  const [searchType, setSearchType] = useState<'PEA Number' | 'Equipment Number ADS' | 'Account Asset Number (AA)' | 'Equipment ID'>('PEA Number');
  const [searchValue, setSearchValue] = useState<string>('');

  // --- Database State ---
  const [allAssets, setAllAssets] = useState<CableAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingAI, setLoadingAI] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

  // --- Selected Asset & Edit Forms ---
  const [selectedAsset, setSelectedAsset] = useState<CableAsset | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Derived state: keep only the latest revision of each unique equipment ID for general browsing & search
  const latestAssets = useMemo(() => {
    const map = new Map<string, CableAsset>();
    
    // Sort allAssets chronologically so the latest entry overrides previous ones
    const sorted = [...allAssets].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp.replace(/-/g, '/')).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp.replace(/-/g, '/')).getTime() : 0;
      return aTime - bTime;
    });

    for (const asset of sorted) {
      if (asset.equipmentId) {
        map.set(asset.equipmentId, asset);
      }
    }
    return Array.from(map.values());
  }, [allAssets]);

  // Derived state: find all revisions (edit history) of the selected equipment ID
  const selectedAssetHistory = useMemo(() => {
    if (!selectedAsset) return [];
    return allAssets
      .filter(a => a.equipmentId === selectedAsset.equipmentId)
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp.replace(/-/g, '/')).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp.replace(/-/g, '/')).getTime() : 0;
        return aTime - bTime;
      });
  }, [selectedAsset, allAssets]);

  const editCount = useMemo(() => {
    return Math.max(0, selectedAssetHistory.length - 1);
  }, [selectedAssetHistory]);

  // --- Admin Diagnostics & PDF State ---
  const [activeAdminTab, setActiveAdminTab] = useState<'load' | 'sheath' | 'pd' | 'insulation' | 'tanDelta'>('load');
  const [generatingPDF, setGeneratingPDF] = useState<boolean>(false);

  const parametricTrendData = useMemo(() => {
    if (!selectedAsset) return [];
    
    // If we have actual historical logs, use them!
    if (selectedAssetHistory.length > 1) {
      return selectedAssetHistory.map((h, index) => {
        const datePart = h.timestamp ? h.timestamp.split(' ')[0] : `Log #${index + 1}`;
        return {
          index: index + 1,
          date: datePart,
          timestamp: h.timestamp || '',
          operator: h.operatorName || 'System',
          loadCurrent: h.loadCurrent ?? 120,
          sheathCurrent: h.sheathCurrent ?? 8,
          surfaceTemperature: h.surfaceTemperature ?? 35,
          externalDischarge: h.externalDischarge ?? 5,
          insulationResistance: h.insulationResistance ?? 15,
          tanDelta: h.tanDelta === 'Action Required' ? 3 : h.tanDelta === 'Further Study Advised' ? 2 : h.tanDelta === 'No Action Required' ? 1 : 0
        };
      });
    }

    // Fallback: Generate a high-fidelity 5-point monthly simulation trend leading up to the current value
    const current = selectedAsset;
    const points = [];
    const baseLoad = current.loadCurrent ?? 120;
    const baseSheath = current.sheathCurrent ?? 8;
    const baseTemp = current.surfaceTemperature ?? 35;
    const baseDischarge = current.externalDischarge ?? 5;
    const baseInsulation = current.insulationResistance ?? 15;
    const baseTd = current.tanDelta === 'Action Required' ? 3 : current.tanDelta === 'Further Study Advised' ? 2 : current.tanDelta === 'No Action Required' ? 1 : 0;

    for (let i = 4; i >= 0; i--) {
      const factor = 1 - (i * 0.05); // slightly lower load/PD/temp in the past
      const noise = (Math.sin(i) * 0.03);
      const date = new Date();
      date.setDate(date.getDate() - (i * 30)); // 30-day interval
      const dateStr = date.toISOString().split('T')[0];

      points.push({
        index: 5 - i,
        date: i === 0 ? (current.timestamp ? current.timestamp.split(' ')[0] : dateStr) : dateStr,
        timestamp: i === 0 ? (current.timestamp || dateStr) : `${dateStr} 12:00:00`,
        operator: i === 0 ? (current.operatorName || 'System') : 'PEA Simulator',
        loadCurrent: Math.round(baseLoad * factor * (1 + noise)),
        sheathCurrent: Math.round(baseSheath * factor * (1 + noise * 1.5)),
        surfaceTemperature: Math.round(baseTemp * factor),
        externalDischarge: Math.round(baseDischarge * factor),
        insulationResistance: parseFloat((baseInsulation / (factor * (1 + noise))).toFixed(2)),
        tanDelta: i === 0 ? baseTd : Math.max(1, Math.round(baseTd))
      });
    }
    return points;
  }, [selectedAsset, selectedAssetHistory]);

  const handleDownloadExecutivePDF = async () => {
    if (!selectedAsset) return;
    setGeneratingPDF(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const docWidth = doc.internal.pageSize.getWidth();
      
      // 1. Header Banner
      doc.setFillColor(74, 20, 140); // Deep royal purple
      doc.rect(0, 0, docWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PROVINCIAL ELECTRICITY AUTHORITY OF THAILAND', 15, 18);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('CABLE INTEGRITY INTELLIGENCE DIVISION  |  EXECUTIVE REPORT', 15, 25);
      
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.setFontSize(8);
      doc.text(`REPORT GENERATED: ${today.toUpperCase()}`, docWidth - 15, 25, { align: 'right' });

      // 2. Document Details
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('EXECUTIVE ASSET DIAGNOSTIC SUMMARY', 15, 52);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`This document compiles active diagnostic telemetry, historical parametric patterns, and AI predictive analysis for the grid transmission asset registered under identifier:`, 15, 58);
      
      doc.setFont('helvetica', 'bold');
      doc.text(`Equipment ID: ${selectedAsset.equipmentId}`, 15, 63);

      // Draw a neat bounding box for General details
      doc.setFillColor(250, 250, 250);
      doc.rect(15, 68, docWidth - 30, 48, 'F');
      doc.setDrawColor(230, 230, 230);
      doc.rect(15, 68, docWidth - 30, 48, 'S');

      // Left Column details
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('GENERAL PROPERTIES', 20, 75);
      
      doc.setFont('helvetica', 'normal');
      doc.text(`PEA Identifier: ${selectedAsset.peaNumber || 'N/A'}`, 20, 81);
      doc.text(`SAP Asset Number: ${selectedAsset.assetNumber || 'N/A'}`, 20, 86);
      doc.text(`ADS Line Number: ${selectedAsset.adsNumber || 'N/A'}`, 20, 91);
      doc.text(`Voltage Level: ${selectedAsset.voltageLevel || 'N/A'} kV`, 20, 96);
      doc.text(`Installation Year: ${selectedAsset.yearOfRegistration || 'N/A'}`, 20, 101);
      doc.text(`Location City: ${selectedAsset.city || 'N/A'}`, 20, 106);

      // Right Column details
      doc.setFont('helvetica', 'bold');
      doc.text('INTEGRITY TELEMETRY', docWidth / 2 + 10, 75);
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Calculated Health Score: ${selectedAsset.healthScore || '100'} / 100`, docWidth / 2 + 10, 81);
      doc.text(`Health Band Classification: ${selectedAsset.healthStatus || 'Green'}`, docWidth / 2 + 10, 86);
      doc.text(`Measured Surface Temp: ${selectedAsset.surfaceTemperature || '35'} C`, docWidth / 2 + 10, 91);
      doc.text(`Partial Discharge Level: ${selectedAsset.externalDischarge || '0'} pC`, docWidth / 2 + 10, 96);
      doc.text(`Insulation Resistance: ${selectedAsset.insulationResistance || '15.0'} GOhm`, docWidth / 2 + 10, 101);
      doc.text(`Tan Delta Loss Result: ${selectedAsset.tanDelta || 'No Record'}`, docWidth / 2 + 10, 106);

      // 3. Historical parametric overview
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('HISTORICAL PARAMETRIC AUDIT TRAIL', 15, 126);

      // Draw a table for past audits
      doc.setFillColor(245, 245, 245);
      doc.rect(15, 131, docWidth - 30, 8, 'F');
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('INDEX', 18, 136);
      doc.text('DATE', 32, 136);
      doc.text('OPERATOR', 58, 136);
      doc.text('LOAD (A)', 90, 136);
      doc.text('SHEATH (A)', 110, 136);
      doc.text('TEMP (C)', 132, 136);
      doc.text('PD (pC)', 152, 136);
      doc.text('INSULATION (GOhm)', 170, 136);

      doc.setFont('helvetica', 'normal');
      let currentY = 143;
      // Draw rows from history data
      const limitHistory = parametricTrendData.slice(-5); // take latest 5 entries
      limitHistory.forEach((h) => {
        doc.line(15, currentY - 4, docWidth - 15, currentY - 4);
        doc.text(String(h.index), 18, currentY);
        doc.text(String(h.date), 32, currentY);
        doc.text(String(h.operator).substring(0, 15), 58, currentY);
        doc.text(String(h.loadCurrent), 90, currentY);
        doc.text(String(h.sheathCurrent), 110, currentY);
        doc.text(String(h.surfaceTemperature), 132, currentY);
        doc.text(String(h.externalDischarge), 152, currentY);
        doc.text(String(h.insulationResistance), 170, currentY);
        currentY += 6;
      });
      doc.line(15, currentY - 4, docWidth - 15, currentY - 4);

      // 4. AI Lifecycle Recommendation Box
      currentY += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('AI DIAGNOSTIC INTEGRITY RECOMMENDATION', 15, currentY);
      
      currentY += 4;
      doc.setFillColor(253, 244, 255); // light purple
      doc.rect(15, currentY, docWidth - 30, 48, 'F');
      doc.setDrawColor(243, 232, 255);
      doc.rect(15, currentY, docWidth - 30, 48, 'S');

      doc.setTextColor(112, 26, 117);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('EXECUTIVE LIFECYCLE DECISION MAKER GUIDANCE:', 20, currentY + 6);
      
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      
      // Determine recommendation text
      let pdfRecText1 = '';
      let pdfRecText2 = '';
      let pdfRecText3 = '';
      let pdfRecText4 = '';
      
      const isCritical = selectedAsset.healthStatus === 'Red' || selectedAsset.healthStatus === 'Orange';
      if (isCritical) {
        pdfRecText1 = "CRITICAL ADVISORY: Telemetry thresholds cross maximum baseline operating safety boundaries.";
        pdfRecText2 = "1. Immediate field dispatch is requested within 48 hours for contact tension mapping and thermal scanning.";
        pdfRecText3 = "2. Execute high-frequency shield grounding test to identify solid-bonding or earth-rod contact anomalies.";
        pdfRecText4 = "3. Coordinate with regional logistics to procure replacement joints/elbows prior to system dielectric failure.";
      } else {
        pdfRecText1 = "BASELINE SAFE: Operational parameters are within acceptable thermal and dielectric limits.";
        pdfRecText2 = "1. Keep alive directives: Continue standard scheduled quarterly visual inspections and thermal sweeps.";
        pdfRecText3 = "2. Standard maintenance guidelines: Verify silicone sealant grease and clean termination surface bushings.";
        pdfRecText4 = "3. Check shield wire contacts to verify standard earth grounding remains below 5 Ohms.";
      }
      
      doc.text(pdfRecText1, 20, currentY + 14);
      doc.text(pdfRecText2, 20, currentY + 22);
      doc.text(pdfRecText3, 20, currentY + 30);
      doc.text(pdfRecText4, 20, currentY + 38);

      // 5. Sign-off Footer
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.text('CONFIDENTIALITY NOTICE: THIS REPORT CONTROLS PROVINCIAL ELECTRICITY AUTHORITY CRITICAL POWER INFRASTRUCTURE. DATA REDISTRIBUTION IS FORBIDDEN.', docWidth / 2, 275, { align: 'center' });
      
      doc.setFillColor(112, 26, 117);
      doc.rect(0, 285, docWidth, 12, 'F');

      doc.save(`PEA_Asset_Report_${selectedAsset.equipmentId}.pdf`);
    } catch (err: any) {
      alert(`PDF Generation Failed: ${err.message || 'Unknown error.'}`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  // Style inputs based on editing state
  const getInputClassName = (isSelect = false) => {
    return `w-full border rounded-lg py-1.5 ${isSelect ? 'px-2' : 'px-3'} text-xs font-semibold focus:outline-hidden transition-all ${
      isEditing 
        ? 'bg-white text-gray-800 border-purple-200 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-xs' 
        : 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed select-none'
    }`;
  };
  
  // Edit variables mapping to the chosen asset
  const [editPeaNumber, setEditPeaNumber] = useState<string>('');
  const [editAssetNumber, setEditAssetNumber] = useState<string>('');
  const [editAdsNumber, setEditAdsNumber] = useState<string>('');
  const [editVoltage, setEditVoltage] = useState<string>('');
  const [editCity, setEditCity] = useState<string>('');
  const [editEqType, setEditEqType] = useState<EquipmentType>('Underground Cable');
  const [editManufacturer, setEditManufacturer] = useState<string>('');
  const [editCountry, setEditCountry] = useState<string>('');
  const [editLocationType, setEditLocationType] = useState<LocationType>('Substation');
  const [editSubstation, setEditSubstation] = useState<string>('');
  const [editLandmark, setEditLandmark] = useState<string>('');
  const [editLat, setEditLat] = useState<string>('');
  const [editLng, setEditLng] = useState<string>('');
  const [editRegYear, setEditRegYear] = useState<number>(new Date().getFullYear());

  const [editLoadCurrent, setEditLoadCurrent] = useState<string>('');
  const [editSheathCurrent, setEditSheathCurrent] = useState<string>('');
  const [editTemp, setEditTemp] = useState<string>('');
  const [editDischarge, setEditDischarge] = useState<string>('');
  const [editPdResult, setEditPdResult] = useState<PDResultType>('None');
  const [editInsulation, setEditInsulation] = useState<string>('');
  const [editTanDelta, setEditTanDelta] = useState<TanDeltaResult>('No Action Required');

  // 15 New General Info columns
  const [editProductionMonth, setEditProductionMonth] = useState<string>('');
  const [editInstallationDate, setEditInstallationDate] = useState<string>('');
  const [editWbs, setEditWbs] = useState<string>('');
  const [editBusinessType, setEditBusinessType] = useState<string>('');
  const [editCostCenter, setEditCostCenter] = useState<string>('');
  const [editGistag, setEditGistag] = useState<string>('');
  const [editClass, setEditClass] = useState<string>('');
  const [editContractNumber, setEditContractNumber] = useState<string>('');
  const [editFeeder, setEditFeeder] = useState<string>('');
  const [editSubstationId, setEditSubstationId] = useState<string>('');
  const [editOperateId, setEditOperateId] = useState<string>('');
  const [editSerialNumber, setEditSerialNumber] = useState<string>('');
  const [editModel, setEditModel] = useState<string>('');
  const [editWorkOrder, setEditWorkOrder] = useState<string>('');
  const [editSize, setEditSize] = useState<string>('400 sq.mm');
  const [showAdvancedEdit, setShowAdvancedEdit] = useState<boolean>(false);

  // 2 New Engineering columns
  const [editOnlinePdAmplitude, setEditOnlinePdAmplitude] = useState<string>('');
  const [editTanDeltaAmplitude, setEditTanDeltaAmplitude] = useState<string>('');

  const [editVisualUrl, setEditVisualUrl] = useState<string>('');
  const [editThermalUrl, setEditThermalUrl] = useState<string>('');
  const [visualFile, setVisualFile] = useState<File | null>(null);
  const [thermalFile, setThermalFile] = useState<File | null>(null);
  const [visualPreview, setVisualPreview] = useState<string>('');
  const [thermalPreview, setThermalPreview] = useState<string>('');

  const currentAssetArea = useMemo(() => {
    if (!selectedAsset) return 'N1';
    return selectedAsset.equipmentId.split('-')[0];
  }, [selectedAsset]);

  // System Constraint: 33 kV is Southern Area 2-3 (S2, S3) only
  useEffect(() => {
    if (selectedAsset) {
      const area = selectedAsset.equipmentId.split('-')[0];
      if (area !== 'S2' && area !== 'S3' && editVoltage === '33') {
        setEditVoltage('115');
      }
    }
  }, [selectedAsset, editVoltage]);

  // System Constraint: Submarine Cable is only in [C2], [S2], [S3]
  useEffect(() => {
    if (selectedAsset) {
      const area = selectedAsset.equipmentId.split('-')[0];
      if (!['C2', 'S2', 'S3'].includes(area) && editEqType === 'Submarine Cable') {
        setEditEqType('Underground Cable');
      }
    }
  }, [selectedAsset, editEqType]);

  // Sync editEqType when editVoltage changes during editing
  useEffect(() => {
    if (isEditing && editVoltage) {
      const availableTypes = getAvailableEquipmentTypes(editVoltage);
      if (!availableTypes.includes(editEqType)) {
        setEditEqType(availableTypes[0]);
      }
    }
  }, [editVoltage, isEditing]);

  // Sync editManufacturer when editEqType changes during editing
  useEffect(() => {
    if (isEditing && editEqType) {
      const availableBrands = getManufacturersForEquipmentType(editEqType);
      if (!editManufacturer || !availableBrands.includes(editManufacturer)) {
        setEditManufacturer(availableBrands[0] || 'Others');
      }
    }
  }, [editEqType, isEditing]);

  // AI Guidance text
  const [aiRecommendation, setAiRecommendation] = useState<string>('');

  // --- Popup Modals State ---
  const [showNoEquipmentPopup, setShowNoEquipmentPopup] = useState<boolean>(false);
  const [showSaveChoiceModal, setShowSaveChoiceModal] = useState<boolean>(false);

  // Auto-restrict area for standard single-area users
  useEffect(() => {
    if (user.role !== 'Admin' && user.role !== 'Manager' && user.interestArea !== 'ALL' && user.interestArea !== 'All') {
      setFilterArea(user.interestArea);
    }
  }, [user]);

  // Load database rows on mount or spreadsheetId change
  const loadDatabase = async () => {
    if (onRefresh) {
      setLoading(true);
      setSyncStatus('Fetching real-time asset registry...');
      try {
        await onRefresh();
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
        setSyncStatus('');
      }
      return;
    }

    setLoading(true);
    setSyncStatus('Fetching real-time asset registry...');
    try {
      if (googleToken && spreadsheetId) {
        const data = await fetchSheetsData(googleToken, spreadsheetId);
        
        // Calculate dynamic health metrics for each fetched asset
        const processed = data.map(asset => {
          const { score, status } = calculateHealth({
            equipmentId: asset.equipmentId,
            surfaceTemperature: asset.surfaceTemperature || 35,
            externalDischarge: asset.externalDischarge || 0,
            insulationResistance: asset.insulationResistance || 15.0,
            loadCurrent: asset.loadCurrent || 120,
            sheathCurrent: asset.sheathCurrent || 8,
            pdResult: asset.pdResult || 'None',
            tanDelta: asset.tanDelta || 'No record'
          });
          return {
            ...asset,
            healthScore: score,
            healthStatus: status
          };
        });

        setAllAssets(processed);
        setSyncStatus('');
      } else {
        // Fallback to local storage if offline
        const localData = localStorage.getItem('local_cable_assets');
        if (localData) {
          const parsed = JSON.parse(localData);
          const processed = parsed.map((asset: any) => {
            const { score, status } = calculateHealth({
              equipmentId: asset.equipmentId,
              surfaceTemperature: asset.surfaceTemperature || 35,
              externalDischarge: asset.externalDischarge || 0,
              insulationResistance: asset.insulationResistance || 15.0,
              loadCurrent: asset.loadCurrent || 120,
              sheathCurrent: asset.sheathCurrent || 8,
              pdResult: asset.pdResult || 'None',
              tanDelta: asset.tanDelta || 'No record'
            });
            return {
              ...asset,
              healthScore: score,
              healthStatus: status
            };
          });
          setAllAssets(processed);
        }
        setSyncStatus('');
      }
    } catch (err: any) {
      console.error(err);
      setSyncStatus(`Database load failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (assets && assets.length > 0) {
      const processed = assets.map(asset => {
        const { score, status } = calculateHealth({
          equipmentId: asset.equipmentId,
          surfaceTemperature: asset.surfaceTemperature || 35,
          externalDischarge: asset.externalDischarge || 0,
          insulationResistance: asset.insulationResistance || 15.0,
          loadCurrent: asset.loadCurrent || 120,
          sheathCurrent: asset.sheathCurrent || 8,
          pdResult: asset.pdResult || 'None',
          tanDelta: asset.tanDelta || 'No record'
        });
        return {
          ...asset,
          healthScore: score,
          healthStatus: status
        };
      });
      setAllAssets(processed);
    } else {
      loadDatabase();
    }
  }, [assets, googleToken, spreadsheetId]);

  // Reset filterCity when filterArea changes
  useEffect(() => {
    setFilterCity('All');
  }, [filterArea]);

  // Auto-run initial lookup when assets finish loading if no asset is selected
  useEffect(() => {
    if (!selectedAsset && latestAssets.length > 0) {
      handleSearch();
    }
  }, [latestAssets]);

  // Get list of available cities based on area filter
  const availableCities = useMemo(() => {
    if (filterArea === 'All') {
      const allRawCities = Object.values(PEA_AREA_CITIES).flat();
      return Array.from(new Set(allRawCities));
    }
    return PEA_AREA_CITIES[filterArea] || [];
  }, [filterArea]);

  // Handle asset search submission
  const handleSearch = () => {
    let list = latestAssets;

    if (searchValue.trim()) {
      // 1. Direct Lookup Mode: Ignore dropdown filters (City, Voltage, EqType) to avoid conflicts when searching specific identifiers.
      // We only enforce the user interest area check for regular non-Admin/non-Manager single-area users.
      if (user.role !== 'Admin' && user.role !== 'Manager' && user.interestArea !== 'ALL' && user.interestArea !== 'All') {
        const userArea = user.interestArea;
        list = list.filter(a => {
          const part = a.equipmentId?.split('-')[0]?.trim();
          return part === userArea;
        });
      }

      // 2. Filter list based on matching the precise search criteria
      const normalizedSearch = searchValue.trim().toLowerCase();
      let matchedList = list.filter(a => {
        if (searchType === 'PEA Number') {
          return a.peaNumber?.trim().toLowerCase().includes(normalizedSearch);
        }
        if (searchType === 'Equipment Number ADS' || (searchType as string) === 'Asset Number (AA)') {
          return a.assetNumber?.trim().toLowerCase().includes(normalizedSearch);
        }
        if (searchType === 'Account Asset Number (AA)' || (searchType as string) === 'ADS Number') {
          return a.adsNumber?.trim().toLowerCase().includes(normalizedSearch);
        }
        if (searchType === 'Equipment ID') {
          return a.equipmentId?.trim().toLowerCase().includes(normalizedSearch);
        }
        return false;
      });

      // 3. Smart Fallback: If no exact matches were found for the chosen search type, search across all possible identifier fields.
      if (matchedList.length === 0) {
        matchedList = list.filter(a => {
          return (
            a.peaNumber?.trim().toLowerCase().includes(normalizedSearch) ||
            a.assetNumber?.trim().toLowerCase().includes(normalizedSearch) ||
            a.adsNumber?.trim().toLowerCase().includes(normalizedSearch) ||
            a.equipmentId?.trim().toLowerCase().includes(normalizedSearch)
          );
        });
      }

      list = matchedList;
    } else {
      // 3. General Browsing Mode: Apply all hierarchical structural and dropdown filters when search input is empty.
      if (user.role !== 'Admin' && user.role !== 'Manager' && user.interestArea !== 'ALL' && user.interestArea !== 'All') {
        const userArea = user.interestArea;
        list = list.filter(a => {
          const part = a.equipmentId?.split('-')[0]?.trim();
          return part === userArea;
        });
      } else if (filterArea !== 'All' && filterArea !== 'ALL') {
        list = list.filter(a => {
          const part = a.equipmentId?.split('-')[0]?.trim();
          return part === filterArea;
        });
      }

      if (filterCity !== 'All') {
        list = list.filter(a => a.city === filterCity);
      }
      if (filterVoltage !== 'All') {
        list = list.filter(a => a.voltageLevel === filterVoltage);
      }
      if (filterEqType !== 'All') {
        list = list.filter(a => a.equipmentType === filterEqType);
      }
      if (filterYear !== 'All') {
        list = list.filter(a => String(a.yearOfRegistration) === filterYear);
      }
    }

    // 4. Evaluate Search Results
    if (list.length === 0) {
      setShowNoEquipmentPopup(true);
      setSelectedAsset(null);
    } else {
      // Automatically select first matching equipment and populate forms
      selectAsset(list[0]);
    }
  };

  // Populate edit fields when an asset is selected
  const selectAsset = (asset: CableAsset) => {
    setSelectedAsset(asset);
    setIsEditing(false);
    setAiRecommendation(''); // clear stale advisor text

    // General
    setEditPeaNumber(asset.peaNumber || '');
    setEditAssetNumber(asset.assetNumber || '');
    setEditAdsNumber(asset.adsNumber || '');
    setEditVoltage(asset.voltageLevel || '115');
    setEditCity(asset.city || '');
    setEditEqType(asset.equipmentType || 'Underground Cable');
    setEditManufacturer(asset.manufacturer || '');
    setEditCountry(asset.country || '');
    setEditLocationType(asset.locationType || 'Substation');
    setEditSubstation(asset.substationName || '');
    setEditLandmark(asset.landmark || '');
    setEditLat(asset.gps?.lat?.toString() || '');
    setEditLng(asset.gps?.lng?.toString() || '');
    setEditRegYear(asset.yearOfRegistration || new Date().getFullYear());

    // 15 New General Info columns
    setEditProductionMonth(asset.productionMonth || '');
    setEditInstallationDate(asset.installationDate || '');
    setEditWbs(asset.wbs || '');
    setEditBusinessType(asset.businessType || '');
    setEditCostCenter(asset.costCenter || '');
    setEditGistag(asset.gistag || '');
    setEditClass(asset.class || '');
    setEditContractNumber(asset.contractNumber || '');
    setEditFeeder(asset.feeder || '');
    setEditSubstationId(asset.substationId || '');
    setEditOperateId(asset.operateId || '');
    setEditSerialNumber(asset.serialNumber || '');
    setEditModel(asset.model || '');
    setEditWorkOrder(asset.workOrder || '');
    setEditSize(asset.size || '400 sq.mm');

    // Engineering
    setEditLoadCurrent(asset.loadCurrent?.toString() || '');
    setEditSheathCurrent(asset.sheathCurrent?.toString() || '');
    setEditTemp(asset.surfaceTemperature?.toString() || '');
    setEditDischarge(asset.externalDischarge?.toString() || '');
    setEditPdResult(asset.pdResult || 'None');
    setEditOnlinePdAmplitude(asset.onlinePdAmplitude?.toString() || '');
    setEditInsulation(asset.insulationResistance?.toString() || '');
    setEditTanDelta(asset.tanDelta || 'No Action Required');
    setEditTanDeltaAmplitude(asset.tanDeltaAmplitude?.toString() || '');

    // Visuals
    setEditVisualUrl(asset.visualPictureUrl || '');
    setEditThermalUrl(asset.thermalImageUrl || '');
    setVisualFile(null);
    setThermalFile(null);
    setVisualPreview('');
    setThermalPreview('');
  };

  // Image change handlers inside edit panel
  const handleEditImageChange = (e: ChangeEvent<HTMLInputElement>, type: 'visual' | 'thermal') => {
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

  // Trigger custom AI Integrity analysis
  const handleGetAIAdvisory = async () => {
    if (!selectedAsset) return;

    setLoadingAI(true);
    setAiRecommendation('');
    
    // Construct mock model using current states
    const { score: activeScore, status: activeStatus } = calculateHealth({
      equipmentId: selectedAsset.equipmentId,
      surfaceTemperature: parseFloat(editTemp) || 35,
      externalDischarge: parseFloat(editDischarge) || 0,
      insulationResistance: parseFloat(editInsulation) || 15.0,
      loadCurrent: parseFloat(editLoadCurrent) || 120,
      sheathCurrent: parseFloat(editSheathCurrent) || 8,
      pdResult: editPdResult,
      tanDelta: editTanDelta
    });

    const checkAsset = {
      equipmentId: selectedAsset.equipmentId,
      equipmentType: editEqType,
      voltageLevel: editVoltage,
      city: editCity,
      substationName: editSubstation,
      healthScore: activeScore,
      healthStatus: activeStatus,
      surfaceTemperature: parseFloat(editTemp) || 35,
      externalDischarge: parseFloat(editDischarge) || 0,
      insulationResistance: parseFloat(editInsulation) || 15.0,
      loadCurrent: parseFloat(editLoadCurrent) || 120,
      sheathCurrent: parseFloat(editSheathCurrent) || 8
    };

    try {
      const res = await fetch('/api/ai-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset: checkAsset })
      });
      if (res.ok) {
        const body = await res.json();
        setAiRecommendation(body.recommendation || '');
      } else {
        throw new Error('Server returned error status');
      }
    } catch (err) {
      // Dynamic fallback recommendation
      const fallbackAdvisory = `
# PEA Diagnostic Advisory Report - ${checkAsset.equipmentId} (Offline Fallback)
  
## 1. Dynamic Health Overview
- **Equipment ID**: \`${checkAsset.equipmentId}\`
- **Equipment Type**: **${checkAsset.equipmentType}** (Voltage: **${checkAsset.voltageLevel} kV**)
- **Location**: **${checkAsset.substationName || 'N/A'}**, ${checkAsset.city}
- **Calculated Health Score**: **${checkAsset.healthScore}/100**
- **Status Classification**: **${checkAsset.healthStatus}**

## 2. Engineering Parameters Diagnostic
- **Operating Temp**: **${checkAsset.surfaceTemperature}°C** (Limit: 70°C)
- **PD Activity**: **${checkAsset.externalDischarge} pC** (Limit: 100 pC)
- **Insulation Value**: **${checkAsset.insulationResistance} GΩ** (Limit: >1.0 GΩ)
- **Current Ratio**: **${checkAsset.loadCurrent ? ((checkAsset.sheathCurrent / checkAsset.loadCurrent) * 100).toFixed(1) : '0.0'}%** (Limit: <30%)

## 3. Recommended Field Engineering Directives
1. **Regular Inspection Patrol**: Verify contact interfaces and grease levels.
2. **Contact Tension Mapping**: Scan high current contact splices with infrared handheld sweepers.
3. **Moisture Ingress Safeguard**: Audit seal rings and silicone joints on the cable jackets.
`;
      setAiRecommendation(fallbackAdvisory);
    } finally {
      setLoadingAI(false);
    }
  };

  // Helper to resolve the correct spreadsheetId and folderId based on an asset's area
  const resolveAssetSpreadsheet = async (asset: CableAsset): Promise<{ spreadsheetId: string | null; folderId: string | null }> => {
    // CRITICAL: If the asset was loaded from a specific Google Sheet, we MUST preserve it
    // so any edits or save-as-new-record operations are stored in that same Google Sheet.
    if (asset.spreadsheetId) {
      return { spreadsheetId: asset.spreadsheetId, folderId: folderId };
    }

    let targetSpreadsheetId = spreadsheetId;
    let targetFolderId = folderId;

    if (googleToken) {
      let assetArea = '';
      if (asset.equipmentId && asset.equipmentId.includes('-')) {
        assetArea = asset.equipmentId.split('-')[0].trim().toUpperCase();
      }
      // If extracted area is not a valid PEA area, map via city
      if (!assetArea || !PEA_AREAS.includes(assetArea as any)) {
        const city = editCity || asset.city;
        if (city) {
          for (const [area, cities] of Object.entries(PEA_AREA_CITIES)) {
            if (area !== 'ALL' && cities.includes(city)) {
              assetArea = area;
              break;
            }
          }
        }
      }
      if (!assetArea || !PEA_AREAS.includes(assetArea as any)) {
        assetArea = 'N1'; // Default fallback
      }

      try {
        // Fetch sector-specific spreadsheet from Firestore
        const sectorData = await getSectorSpreadsheet(assetArea);
        if (sectorData) {
          targetSpreadsheetId = sectorData.spreadsheetId;
          targetFolderId = sectorData.folderId;
        } else {
          throw new Error(`Google Spreadsheet for Area ${assetArea} was not found or mapped in your Drive. Please make sure you have an existing spreadsheet named "PEA Cable Asset Database - ${assetArea}" in your Google Drive.`);
        }
      } catch (err: any) {
        console.error(`Failed to resolve spreadsheet for area ${assetArea}:`, err);
        throw err;
      }
    }

    return { spreadsheetId: targetSpreadsheetId, folderId: targetFolderId };
  };

  // Execution: Save by Overwriting Existing Rows in Google Sheets
  const handleSaveOverwrite = async () => {
    if (!selectedAsset) return;
    setSaving(true);
    setShowSaveChoiceModal(false);
    setSyncStatus('Resolving database connection for the asset\'s area...');

    try {
      // Resolve correct spreadsheet and folder based on asset's area
      const { spreadsheetId: targetSpreadsheetId, folderId: targetFolderId } = await resolveAssetSpreadsheet(selectedAsset);

      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      
      let finalVisualUrl = editVisualUrl;
      let finalThermalUrl = editThermalUrl;

      // 1. Photo uploads to Google Drive folder if logged in and chosen
      if (googleToken && targetFolderId) {
        if (visualFile) {
          setSyncStatus('Uploading new general photos...');
          finalVisualUrl = await uploadImageToDrive(googleToken, targetFolderId, visualFile);
        }
        if (thermalFile) {
          setSyncStatus('Uploading new thermographic snaps...');
          finalThermalUrl = await uploadImageToDrive(googleToken, targetFolderId, thermalFile);
        }
      }

      // 2. Fetch row indexes from sheets
      if (googleToken && targetSpreadsheetId) {
        setSyncStatus('Locating asset coordinates in Google Sheets...');
        const { genRowIndex, engRowIndex, visRowIndex } = await fetchSheetsRowIndices(
          googleToken,
          targetSpreadsheetId,
          selectedAsset.equipmentId
        );

        if (genRowIndex === -1) {
          throw new Error('Could not find General Information row for this asset in the sheet.');
        }

        setSyncStatus('Updating Google Sheets database records...');

        const finalPeaNumber = (editPeaNumber || '').trim();
        const finalAssetNumber = (editAssetNumber || '').trim() || (finalPeaNumber ? finalPeaNumber : '');
        const finalAdsNumber = (editAdsNumber || '').trim() || (finalPeaNumber ? finalPeaNumber : '');

        const assetArea = selectedAsset.equipmentId.split('-')[0];
        const updatedEquipmentId = generateEquipmentId(
          assetArea,
          editVoltage,
          editRegYear,
          editEqType,
          finalPeaNumber,
          finalAssetNumber,
          finalAdsNumber
        );

        // Compile rows matching specified structure: Column N (13): PEA Number (ID), Column O (14): Equipment Number ADS, Column P (15): Account Asset Number (AA), Column Q-AE (16-30): 15 new columns, Column AF (31): Equipment ID
        const generalRow = [
          selectedAsset.number, timestamp, user.name, editVoltage, editCity, editEqType,
          editManufacturer || 'Prysmian Group', editCountry || 'Thailand', editLocationType,
          editSubstation || 'Main Station', editLandmark || 'No landmarks',
          `${editLat || '13.7563'}, ${editLng || '100.5018'}`, editRegYear,
          finalPeaNumber, finalAssetNumber, finalAdsNumber,
          editProductionMonth || 'N/A', editInstallationDate || 'N/A', editWbs || 'N/A', editBusinessType || 'N/A',
          editCostCenter || 'N/A', editGistag || 'N/A', editClass || 'N/A', editContractNumber || 'N/A',
          editFeeder || 'N/A', editSubstationId || 'N/A', editOperateId || 'N/A', editSerialNumber || 'N/A',
          editModel || 'N/A', editWorkOrder || 'N/A', editSize || 'N/A',
          updatedEquipmentId
        ];

        const engineeringRow = [
          selectedAsset.number, timestamp, user.name, updatedEquipmentId,
          parseFloat(editLoadCurrent) || 120, parseFloat(editSheathCurrent) || 8,
          parseFloat(editTemp) || 35, parseFloat(editDischarge) || 5, editPdResult,
          parseFloat(editOnlinePdAmplitude) || 0,
          parseFloat(editInsulation) || 15.0, editTanDelta,
          parseFloat(editTanDeltaAmplitude) || 0
        ];

        const visualRow = [
          selectedAsset.number, timestamp, user.name, updatedEquipmentId,
          finalVisualUrl, finalThermalUrl
        ];

        // Execute batch row overwrites
        await updateSheetRow(googleToken, targetSpreadsheetId, 'General Information', genRowIndex, generalRow, 'A:AF');
        if (engRowIndex !== -1) {
          await updateSheetRow(googleToken, targetSpreadsheetId, 'Engineering Information', engRowIndex, engineeringRow, 'A:M');
        } else {
          // If asset is general-only, append missing parameters
          await appendEngineeringRow(googleToken, targetSpreadsheetId, engineeringRow);
        }
        if (visRowIndex !== -1) {
          await updateSheetRow(googleToken, targetSpreadsheetId, 'Visual & Thermal Images', visRowIndex, visualRow, 'A:F');
        } else {
          // Append missing visual assets
          await appendVisualRow(googleToken, targetSpreadsheetId, visualRow);
        }

      } else {
        // Fallback local storage update
        const localData = localStorage.getItem('local_cable_assets');
        const parsed = localData ? JSON.parse(localData) : [];
        const index = parsed.findIndex((a: any) => a.equipmentId === selectedAsset.equipmentId);
        
        if (index !== -1) {
          parsed[index] = {
            ...parsed[index],
            timestamp,
            operatorName: user.name,
            voltageLevel: editVoltage,
            city: editCity,
            equipmentType: editEqType,
            manufacturer: editManufacturer || 'Prysmian Group',
            country: editCountry || 'Thailand',
            locationType: editLocationType,
            substationName: editSubstation || 'Main Station',
            landmark: editLandmark || 'No landmarks',
            gps: { lat: parseFloat(editLat) || 13.7563, lng: parseFloat(editLng) || 100.5018 },
            yearOfRegistration: editRegYear,
            peaNumber: editPeaNumber,
            assetNumber: editAssetNumber,
            adsNumber: editAdsNumber,
            productionMonth: editProductionMonth,
            installationDate: editInstallationDate,
            wbs: editWbs,
            businessType: editBusinessType,
            costCenter: editCostCenter,
            gistag: editGistag,
            class: editClass,
            contractNumber: editContractNumber,
            feeder: editFeeder,
            substationId: editSubstationId,
            operateId: editOperateId,
            serialNumber: editSerialNumber,
            model: editModel,
            workOrder: editWorkOrder,
            size: editSize,
            loadCurrent: parseFloat(editLoadCurrent) || 120,
            sheathCurrent: parseFloat(editSheathCurrent) || 8,
            surfaceTemperature: parseFloat(editTemp) || 35,
            externalDischarge: parseFloat(editDischarge) || 5,
            pdResult: editPdResult,
            onlinePdAmplitude: parseFloat(editOnlinePdAmplitude) || 0,
            insulationResistance: parseFloat(editInsulation) || 15.0,
            tanDelta: editTanDelta,
            tanDeltaAmplitude: parseFloat(editTanDeltaAmplitude) || 0,
            visualPictureUrl: visualPreview || finalVisualUrl,
            thermalImageUrl: thermalPreview || finalThermalUrl
          };
          localStorage.setItem('local_cable_assets', JSON.stringify(parsed));
        }
      }

      setSyncStatus('Changes saved successfully!');
      setTimeout(() => {
        setSyncStatus('');
        loadDatabase();
        setSelectedAsset(null);
        setIsEditing(false);
      }, 1500);

    } catch (err: any) {
      alert(`Overwrite Error: ${err.message || 'Could not sync updates.'}`);
    } finally {
      setSaving(false);
    }
  };

  // Execution: Save as New Record with Same Equipment ID
  const handleSaveAsNewRecord = async () => {
    if (!selectedAsset) return;
    setSaving(true);
    setShowSaveChoiceModal(false);
    setSyncStatus('Resolving database connection for the asset\'s area...');

    try {
      // Resolve correct spreadsheet and folder based on asset's area
      const { spreadsheetId: targetSpreadsheetId, folderId: targetFolderId } = await resolveAssetSpreadsheet(selectedAsset);

      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

      // Calculate next sequential running number
      let rowNum = 1;
      if (googleToken && targetSpreadsheetId) {
        try {
          setSyncStatus('Retrieving latest records to calculate running number...');
          const currentAssets = await fetchSheetsData(googleToken, targetSpreadsheetId);
          if (currentAssets && currentAssets.length > 0) {
            // Filter out any massive timestamp values (e.g., >= 100000) so they don't corrupt the sequential counter
            const validNumbers = currentAssets.map(a => Number(a.number) || 0).filter(n => n > 0 && n < 100000);
            rowNum = validNumbers.length > 0 ? Math.max(...validNumbers) + 1 : currentAssets.length + 1;
          }
        } catch (err) {
          console.error("Failed to fetch target spreadsheet data for row number, using fallback:", err);
          if (allAssets && allAssets.length > 0) {
            const validNumbers = allAssets.map(a => Number(a.number) || 0).filter(n => n > 0 && n < 100000);
            rowNum = validNumbers.length > 0 ? Math.max(...validNumbers) + 1 : allAssets.length + 1;
          } else {
            rowNum = 1;
          }
        }
      } else {
        if (allAssets && allAssets.length > 0) {
          const validNumbers = allAssets.map(a => Number(a.number) || 0).filter(n => n > 0 && n < 100000);
          rowNum = validNumbers.length > 0 ? Math.max(...validNumbers) + 1 : allAssets.length + 1;
        } else {
          rowNum = 1;
        }
      }
      
      let finalVisualUrl = editVisualUrl;
      let finalThermalUrl = editThermalUrl;

      // 1. Photo uploads to Google Drive folder if logged in and chosen
      if (googleToken && targetFolderId) {
        if (visualFile) {
          setSyncStatus('Uploading new general photos...');
          finalVisualUrl = await uploadImageToDrive(googleToken, targetFolderId, visualFile);
        }
        if (thermalFile) {
          setSyncStatus('Uploading new thermographic snaps...');
          finalThermalUrl = await uploadImageToDrive(googleToken, targetFolderId, thermalFile);
        }
      }

      const finalPeaNumber = (editPeaNumber || '').trim();
      const finalAssetNumber = (editAssetNumber || '').trim() || (finalPeaNumber ? finalPeaNumber : '');
      const finalAdsNumber = (editAdsNumber || '').trim() || (finalPeaNumber ? finalPeaNumber : '');

      const assetArea = selectedAsset.equipmentId.split('-')[0];
      const updatedEquipmentId = generateEquipmentId(
        assetArea,
        editVoltage,
        editRegYear,
        editEqType,
        finalPeaNumber,
        finalAssetNumber,
        finalAdsNumber
      );

      // 2. Write as Appended Rows: Column N (13): PEA Number (ID), Column O (14): Equipment Number ADS, Column P (15): Account Asset Number (AA), Column Q (16): Equipment ID
      const generalRow = [
        rowNum, timestamp, user.name, editVoltage, editCity, editEqType,
        editManufacturer || 'Prysmian Group', editCountry || 'Thailand', editLocationType,
        editSubstation || 'Main Station', editLandmark || 'No landmarks',
        `${editLat || '13.7563'}, ${editLng || '100.5018'}`, editRegYear,
        finalPeaNumber, finalAssetNumber, finalAdsNumber, updatedEquipmentId
      ];

      const engineeringRow = [
        rowNum, timestamp, user.name, updatedEquipmentId,
        parseFloat(editLoadCurrent) || 120, parseFloat(editSheathCurrent) || 8,
        parseFloat(editTemp) || 35, parseFloat(editDischarge) || 5, editPdResult,
        parseFloat(editInsulation) || 15.0, editTanDelta
      ];

      const visualRow = [
        rowNum, timestamp, user.name, updatedEquipmentId,
        finalVisualUrl, finalThermalUrl
      ];

      if (googleToken && targetSpreadsheetId) {
        setSyncStatus('Adding new log entry rows to Google Sheets...');
        await appendGeneralRow(googleToken, targetSpreadsheetId, generalRow);
        await appendEngineeringRow(googleToken, targetSpreadsheetId, engineeringRow);
        await appendVisualRow(googleToken, targetSpreadsheetId, visualRow);
      } else {
        // Local storage append fallback
        const localData = localStorage.getItem('local_cable_assets');
        const parsed = localData ? JSON.parse(localData) : [];
        const combinedAsset = {
          number: rowNum,
          timestamp,
          operatorName: user.name,
          voltageLevel: editVoltage,
          city: editCity,
          equipmentType: editEqType,
          manufacturer: editManufacturer || 'Prysmian Group',
          country: editCountry || 'Thailand',
          locationType: editLocationType,
          substationName: editSubstation || 'Main Station',
          landmark: editLandmark || 'No landmarks',
          gps: { lat: parseFloat(editLat) || 13.7563, lng: parseFloat(editLng) || 100.5018 },
          yearOfRegistration: editRegYear,
          peaNumber: editPeaNumber,
          assetNumber: editAssetNumber,
          adsNumber: editAdsNumber,
          equipmentId: selectedAsset.equipmentId,
          loadCurrent: parseFloat(editLoadCurrent) || 120,
          sheathCurrent: parseFloat(editSheathCurrent) || 8,
          surfaceTemperature: parseFloat(editTemp) || 35,
          externalDischarge: parseFloat(editDischarge) || 5,
          pdResult: editPdResult,
          insulationResistance: parseFloat(editInsulation) || 15.0,
          tanDelta: editTanDelta,
          visualPictureUrl: visualPreview || finalVisualUrl,
          thermalImageUrl: thermalPreview || finalThermalUrl
        };
        parsed.push(combinedAsset);
        localStorage.setItem('local_cable_assets', JSON.stringify(parsed));
      }

      setSyncStatus('New inspection entry successfully logged!');
      setTimeout(() => {
        setSyncStatus('');
        loadDatabase();
        setSelectedAsset(null);
        setIsEditing(false);
      }, 1500);

    } catch (err: any) {
      alert(`New Entry Save Error: ${err.message || 'Could not sync new entry.'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" id="asset-record-view">
      {/* 1. Header Banner */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4" id="asset-record-header">
        <div>
          <span className="text-[10px] font-black text-purple-700 tracking-wider uppercase block">
            Grid Asset Intelligence Panel
          </span>
          <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mt-1">
            Asset Registry Database
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Search, filter, update, and review historical diagnostic telemetry across localized electrical networks.
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={loadDatabase} 
            disabled={loading}
            className="bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5 text-purple-700" />}
            Refresh DB
          </button>
        </div>
      </div>

      {/* 2. Filter & Search Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4" id="asset-search-filters">
        <div className="flex items-center gap-1.5 border-b border-gray-100 pb-3">
          <Search className="w-4 h-4 text-purple-700" />
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">Search Database Query</h3>
        </div>

        {/* Filters Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Area Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">PEA Area Coverage</label>
            <select
              value={filterArea}
              onChange={e => setFilterArea(e.target.value)}
              disabled={user.role !== 'Admin' && user.role !== 'Manager'}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden disabled:bg-gray-100 disabled:text-gray-400"
            >
              {(user.role === 'Admin' || user.role === 'Manager') && <option value="All">All Regions (Executive Mode)</option>}
              {PEA_AREAS.map(area => (
                <option key={area} value={area}>Area {area} - {PEA_AREA_NAMES[area]}</option>
              ))}
            </select>
          </div>

          {/* City Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">City / Province</label>
            <select
              value={filterCity}
              onChange={e => setFilterCity(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
            >
              <option value="All">All Cities</option>
              {availableCities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Voltage Level */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Voltage Level (kV)</label>
            <select
              value={filterVoltage}
              onChange={e => setFilterVoltage(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
            >
              <option value="All">All Voltages</option>
              {VOLTAGE_LEVELS.map(v => (
                <option key={v} value={v}>{v} kV</option>
              ))}
            </select>
          </div>

          {/* Equipment Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Equipment Type</label>
            <select
              value={filterEqType}
              onChange={e => setFilterEqType(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
            >
              <option value="All">All Types</option>
              {EQUIPMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Year of Register */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Year of Register</label>
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
            >
              <option value="All">All Years</option>
              {Array.from({ length: 25 }, (_, i) => {
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

        {/* Search Parameter & Dynamic Search Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-50 pt-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Search Condition Selector</label>
            <select
              value={searchType}
              onChange={e => setSearchType(e.target.value as any)}
              className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden"
            >
              <option value="PEA Number">PEA Number (ID)</option>
              <option value="Equipment Number ADS">Equipment Number ADS</option>
              <option value="Account Asset Number (AA)">Account Asset Number (AA)</option>
              <option value="Equipment ID">Equipment ID</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase">Search Query Value</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`Type the ${searchType} to look up...`}
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                className="bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-xs font-medium text-gray-700 focus:outline-hidden focus:border-purple-600 focus:bg-white grow"
              />
              <button
                onClick={handleSearch}
                className="bg-purple-900 text-white hover:bg-purple-950 px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Eye className="w-4 h-4" />
                Show Detail
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className="bg-purple-50 text-purple-700 border border-purple-100 p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* 3. Detail Panel / Editor (Visible only when an asset matches search) */}
      {selectedAsset ? (
        <div className="space-y-6" id="selected-asset-panel">
          {/* Panel Card */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xl" id="asset-detail-card">
            {/* Card Header Banner */}
            <div className="bg-gradient-to-r from-purple-950 to-purple-900 text-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-sm uppercase tracking-wider ${
                    selectedAsset.healthStatus === 'Green' ? 'bg-emerald-500/20 text-emerald-300' :
                    selectedAsset.healthStatus === 'Yellow' ? 'bg-amber-500/20 text-amber-300' :
                    selectedAsset.healthStatus === 'Orange' ? 'bg-orange-500/20 text-orange-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    {selectedAsset.healthStatus} Status - Health Index: {selectedAsset.healthScore}/100
                  </span>
                  
                  {selectedAsset.adsNumber && (
                    <span className="text-[9px] font-bold bg-purple-800 text-purple-200 px-2 py-0.5 rounded-sm">
                      ADS: {selectedAsset.adsNumber}
                    </span>
                  )}
                </div>
                
                <h3 className="text-lg font-black uppercase mt-1 tracking-tight">
                  {editEqType} Registry Detail
                </h3>
                <p className="text-xs text-purple-200 font-mono mt-0.5">
                  ID: {selectedAsset.equipmentId}
                </p>
                {(user.role === 'Admin' || user.role === 'Manager') && (
                  <p className="text-[10px] text-purple-200 font-semibold mt-1">
                    Current Version Editor: {selectedAsset.operatorName || 'System'} at {selectedAsset.timestamp || 'No Timestamp'}
                  </p>
                )}
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleGetAIAdvisory}
                  disabled={loadingAI}
                  className="bg-purple-800 text-purple-100 hover:bg-purple-750 border border-purple-700 px-3.5 py-1.5 rounded-lg text-[11px] font-black flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  {loadingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-yellow-300" />}
                  AI Advisor Analysis
                </button>
              </div>
            </div>

            {/* Telemetry History Engine Control Bar */}
            <div className="bg-purple-50/70 border-b border-purple-100/60 p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-purple-900 uppercase tracking-wider text-[10px]">
                  Telemetry History Engine:
                </span>
                <span className="bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-extrabold text-[10px]">
                  {editCount === 0 ? 'No edits (Original)' : `Edited ${editCount} times`}
                </span>
              </div>

              {(user.role === 'Admin' || user.role === 'Manager') ? (
                <div className="flex items-center gap-2">
                  <label className="font-bold text-gray-700">Jump to Version/Edit Time:</label>
                  <select
                    value={selectedAssetHistory.findIndex(h => h.number === selectedAsset.number && h.timestamp === selectedAsset.timestamp)}
                    onChange={e => {
                      const idx = parseInt(e.target.value);
                      const histRecord = selectedAssetHistory[idx];
                      if (histRecord) {
                        selectAsset(histRecord);
                        // Maintain isEditing to false when choosing historical record
                        setIsEditing(false);
                      }
                    }}
                    className="bg-white border border-gray-200 rounded-lg py-1 px-3.5 text-xs font-semibold text-gray-800 focus:outline-hidden cursor-pointer"
                  >
                    {selectedAssetHistory.map((rec, idx) => {
                      const isLatest = idx === selectedAssetHistory.length - 1;
                      return (
                        <option key={idx} value={idx}>
                          {rec.timestamp || 'Initial'} {rec.operatorName ? `- by ${rec.operatorName}` : ''} {isLatest ? '(Latest)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div className="text-gray-500 text-[10px] font-semibold italic">
                  * Showing latest inspection telemetry. Historical edit logs restricted to Administrative role.
                </div>
              )}
            </div>

            {/* Editing Work area */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* COLUMN 1: GENERAL INFORMATION */}
                <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-xl space-y-4">
                  <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2 mb-1">
                    <Database className="w-4 h-4 text-purple-700" />
                    <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">
                      1. General Details
                    </h4>
                  </div>

                  {/* PEA, Asset & ADS Numbers */}
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-500 uppercase">PEA Number (ID) [Read-Only]</label>
                      <input
                        type="text"
                        value={editPeaNumber}
                        onChange={e => setEditPeaNumber(e.target.value)}
                        disabled={true}
                        className="w-full bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-3 text-xs font-semibold text-gray-500 cursor-not-allowed select-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Equipment Number ADS</label>
                      <input
                        type="text"
                        value={editAssetNumber}
                        onChange={e => setEditAssetNumber(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Account Asset Number (AA)</label>
                      <input
                        type="text"
                        value={editAdsNumber}
                        onChange={e => setEditAdsNumber(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Voltage Level (kV)</label>
                        <select
                          value={editVoltage}
                          onChange={e => setEditVoltage(e.target.value)}
                          disabled={!isEditing}
                          className={getInputClassName(true)}
                        >
                          <option value="115">115 kV</option>
                          {(currentAssetArea === 'S2' || currentAssetArea === 'S3') && (
                            <option value="33">33 kV</option>
                          )}
                          <option value="22">22 kV</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">Registration Year</label>
                        <input
                          type="number"
                          value={editRegYear}
                          onChange={e => setEditRegYear(parseInt(e.target.value) || new Date().getFullYear())}
                          disabled={!isEditing}
                          className={getInputClassName()}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">City</label>
                      <select
                        value={editCity}
                        onChange={e => setEditCity(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName(true)}
                      >
                        {(PEA_AREA_CITIES[currentAssetArea] || []).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Equipment Type</label>
                      <select
                        value={editEqType}
                        onChange={e => setEditEqType(e.target.value as EquipmentType)}
                        disabled={!isEditing}
                        className={getInputClassName(true)}
                      >
                        {getAvailableEquipmentTypes(editVoltage || '115').map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Manufacturer</label>
                      <select
                        value={editManufacturer}
                        onChange={e => setEditManufacturer(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName(true)}
                      >
                        {getManufacturersForEquipmentType(editEqType).map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Country of Origin</label>
                      <select
                        value={editCountry}
                        onChange={e => setEditCountry(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName(true)}
                      >
                        {COUNTRIES_OF_ORIGIN.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Location Type</label>
                      <select
                        value={editLocationType}
                        onChange={e => setEditLocationType(e.target.value as LocationType)}
                        disabled={!isEditing}
                        className={getInputClassName(true)}
                      >
                        <option value="Substation">Substation</option>
                        <option value="Transmission Line">Transmission Line</option>
                        <option value="Distribution Line">Distribution Line</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Substation Name / Section</label>
                      <input
                        type="text"
                        value={editSubstation}
                        onChange={e => setEditSubstation(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Landmark Location</label>
                      <textarea
                        rows={2}
                        value={editLandmark}
                        onChange={e => setEditLandmark(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">GPS Latitude</label>
                        <input
                          type="text"
                          value={editLat}
                          onChange={e => setEditLat(e.target.value)}
                          disabled={!isEditing}
                          className={getInputClassName()}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase">GPS Longitude</label>
                        <input
                          type="text"
                          value={editLng}
                          onChange={e => setEditLng(e.target.value)}
                          disabled={!isEditing}
                          className={getInputClassName()}
                        />
                      </div>
                    </div>

                    {/* Advanced Fields Toggle inside edit workspace */}
                    <div className="pt-2 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedEdit(!showAdvancedEdit)}
                        className="w-full flex items-center justify-between text-[10px] font-bold text-purple-700 uppercase tracking-wider py-1 hover:text-purple-900"
                      >
                        <span>Advanced Cable Specifications ({showAdvancedEdit ? 'Hide' : 'Show'})</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvancedEdit ? 'rotate-180' : ''}`} />
                      </button>
                      
                      {showAdvancedEdit && (
                        <div className="mt-3 space-y-3 pt-3 border-t border-dashed border-gray-100">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Production Month</label>
                              <input
                                type="text"
                                placeholder="e.g. 07/2018"
                                value={editProductionMonth}
                                onChange={e => setEditProductionMonth(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Installation Date</label>
                              <input
                                type="date"
                                value={editInstallationDate}
                                onChange={e => setEditInstallationDate(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">WBS Code</label>
                              <input
                                type="text"
                                placeholder="WBS..."
                                value={editWbs}
                                onChange={e => setEditWbs(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Business Type</label>
                              <input
                                type="text"
                                placeholder="e.g. Transmission or N/A"
                                value={editBusinessType}
                                onChange={e => setEditBusinessType(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Cost Center</label>
                              <input
                                type="text"
                                placeholder="CC..."
                                value={editCostCenter}
                                onChange={e => setEditCostCenter(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">GISTAG</label>
                              <input
                                type="text"
                                placeholder="GIS..."
                                value={editGistag}
                                onChange={e => setEditGistag(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Class</label>
                              <input
                                type="text"
                                placeholder="e.g. High Voltage or N/A"
                                value={editClass}
                                onChange={e => setEditClass(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Contract Number</label>
                              <input
                                type="text"
                                placeholder="CN-..."
                                value={editContractNumber}
                                onChange={e => setEditContractNumber(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Feeder ID</label>
                              <input
                                type="text"
                                placeholder="FDR-..."
                                value={editFeeder}
                                onChange={e => setEditFeeder(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Substation ID</label>
                              <input
                                type="text"
                                placeholder="SUB-..."
                                value={editSubstationId}
                                onChange={e => setEditSubstationId(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Operate ID</label>
                              <input
                                type="text"
                                placeholder="OP-..."
                                value={editOperateId}
                                onChange={e => setEditOperateId(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Serial Number</label>
                              <input
                                type="text"
                                placeholder="S/N..."
                                value={editSerialNumber}
                                onChange={e => setEditSerialNumber(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Model</label>
                              <input
                                type="text"
                                placeholder="Model..."
                                value={editModel}
                                onChange={e => setEditModel(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-gray-400 uppercase">Work Order</label>
                              <input
                                type="text"
                                placeholder="WO-..."
                                value={editWorkOrder}
                                onChange={e => setEditWorkOrder(e.target.value)}
                                disabled={!isEditing}
                                className={getInputClassName()}
                              />
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-gray-400 uppercase">Size (Cross Section)</label>
                            <input
                              type="text"
                              placeholder="e.g. 1x400 sq.mm"
                              value={editSize}
                              onChange={e => setEditSize(e.target.value)}
                              disabled={!isEditing}
                              className={getInputClassName()}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: ENGINEERING PARAMETERS */}
                <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-xl space-y-4">
                  <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2 mb-1">
                    <Activity className="w-4 h-4 text-purple-700" />
                    <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">
                      2. Engineering Telemetry
                    </h4>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Load Current (Amps)</label>
                      <input
                        type="number"
                        value={editLoadCurrent}
                        onChange={e => setEditLoadCurrent(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Sheath Current (Amps)</label>
                      <input
                        type="number"
                        value={editSheathCurrent}
                        onChange={e => setEditSheathCurrent(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Surface Temperature (°C)</label>
                      <input
                        type="number"
                        value={editTemp}
                        onChange={e => setEditTemp(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">External PD Discharge (pC)</label>
                      <input
                        type="number"
                        value={editDischarge}
                        onChange={e => setEditDischarge(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Online PD Result Pattern</label>
                      <select
                        value={editPdResult}
                        onChange={e => setEditPdResult(e.target.value as PDResultType)}
                        disabled={!isEditing}
                        className={getInputClassName(true)}
                      >
                        <option value="None">None (Stable Waveform)</option>
                        <option value="Corona">Corona Discharge</option>
                        <option value="Surface">Surface Tracking</option>
                        <option value="Internal">Internal Void Discharge</option>
                        <option value="Floating">Floating Potential</option>
                        <option value="Void">Insulation Void</option>
                        <option value="Treeing">Electrical Treeing</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Online PD amplitude (pC)</label>
                      <input
                        type="number"
                        step="any"
                        value={editOnlinePdAmplitude}
                        onChange={e => setEditOnlinePdAmplitude(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                        placeholder="e.g. 150"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Insulation Resistance (GΩ)</label>
                      <input
                        type="number"
                        step="any"
                        value={editInsulation}
                        onChange={e => setEditInsulation(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Tan Delta Loss Result</label>
                      <select
                        value={editTanDelta}
                        onChange={e => setEditTanDelta(e.target.value as TanDeltaResult)}
                        disabled={!isEditing}
                        className={getInputClassName(true)}
                      >
                        <option value="No Action Required">No Action Required (Safe)</option>
                        <option value="Action Required">Action Required (Urgent)</option>
                        <option value="Further Study Advised">Further Study Advised</option>
                        <option value="No record">No record</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Tan delta amplitude</label>
                      <input
                        type="number"
                        step="any"
                        value={editTanDeltaAmplitude}
                        onChange={e => setEditTanDeltaAmplitude(e.target.value)}
                        disabled={!isEditing}
                        className={getInputClassName()}
                        placeholder="e.g. 0.0025"
                      />
                    </div>
                  </div>
                </div>

                {/* COLUMN 3: PHOTO ARCHIVES & PREVIEW SUMMARY */}
                <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-xl space-y-4">
                  <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2 mb-1">
                    <Camera className="w-4 h-4 text-purple-700" />
                    <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">
                      3. Visual & Thermal Records
                    </h4>
                  </div>

                  <div className="space-y-4">
                    {/* Visual Photo Block */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase block">Visual Light Photograph</label>
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white p-1">
                        <img
                          src={visualPreview || editVisualUrl || 'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?w=400'}
                          alt="Visual Light Capture"
                          referrerPolicy="no-referrer"
                          className="w-full h-28 object-cover rounded-md"
                        />
                      </div>
                      {isEditing && (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => handleEditImageChange(e, 'visual')}
                          className="text-[10px] text-gray-500 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 animate-fadeIn mt-1.5"
                        />
                      )}
                    </div>

                    {/* Thermal Photo Block */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase block">Thermal / Infrared Snapshot</label>
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white p-1">
                        <img
                          src={thermalPreview || editThermalUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400'}
                          alt="Thermography Diagnostic"
                          referrerPolicy="no-referrer"
                          className="w-full h-28 object-cover rounded-md"
                        />
                      </div>
                      {isEditing && (
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => handleEditImageChange(e, 'thermal')}
                          className="text-[10px] text-gray-500 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 animate-fadeIn mt-1.5"
                        />
                      )}
                    </div>

                    {/* Satellite Location Block */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-gray-400 uppercase block">Equipment Satellite Location</label>
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white p-1">
                        <img
                          src={selectedAsset?.gps ? `/api/map-image?lat=${selectedAsset.gps.lat}&lng=${selectedAsset.gps.lng}` : ''}
                          alt="Equipment Satellite Location"
                          referrerPolicy="no-referrer"
                          className="w-full h-28 object-cover rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* AI Recommendation Panel Insert */}
              {aiRecommendation && (
                <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-xl p-5 mt-4 space-y-3" id="ai-advisory-panel">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-700 animate-pulse" />
                    <span className="text-xs font-black text-purple-900 uppercase tracking-wider">AI Diagnostic Guidance Advisor</span>
                  </div>
                  
                  <div className="bg-white/80 border border-purple-50 rounded-lg p-4">
                    <MarkdownAdvisory content={aiRecommendation} />
                  </div>
                </div>
              )}

              {/* Card Footer Actions */}
              <div className="border-t border-gray-100 pt-5 flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) {
                      selectAsset(selectedAsset);
                      setIsEditing(false);
                    } else {
                      setSelectedAsset(null);
                    }
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {isEditing ? 'Cancel Edit' : 'Close'}
                </button>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={() => setShowSaveChoiceModal(true)}
                    disabled={saving}
                    className="bg-purple-900 hover:bg-purple-950 text-white px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md disabled:bg-purple-800/50 animate-fadeIn"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Asset Changes
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => exportAssetToPDF(selectedAsset!)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md animate-fadeIn"
                    >
                      <FileText className="w-4 h-4" />
                      Generate Field PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="bg-purple-900 hover:bg-purple-950 text-white px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md animate-fadeIn"
                    >
                      <Edit className="w-4 h-4" />
                      Edit Data
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>

          {/* ADMIN & MANAGER ENGINEERING DIAGNOSTICS */}
          {(user.role === 'Admin' || user.role === 'Manager') && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6 mt-6 animate-fadeIn" id="admin-diagnostics-card">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-100 pb-4 gap-4">
                <div>
                  <span className="text-[10px] font-black text-purple-700 tracking-wider uppercase block">
                    Admin Advanced Diagnostic Suite
                  </span>
                  <h3 className="text-md font-black text-gray-900 uppercase tracking-tight mt-0.5">
                    Individual Parametric Diagnostic Trend Charts
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Select a key parameter below to view its specific historical performance logs, along with targeted AI determination recommendations.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadExecutivePDF}
                  disabled={generatingPDF}
                  className="bg-purple-900 text-white hover:bg-purple-950 disabled:bg-purple-800/50 px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  {generatingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePenLine className="w-3.5 h-3.5" />}
                  Download Executive PDF Summary
                </button>
              </div>

              {/* Individual Parameters Pills */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'load', label: 'Load Current (Amps)' },
                  { id: 'sheath', label: 'Sheath Current (Amps)' },
                  { id: 'pd', label: 'PD Trend (pC)' },
                  { id: 'insulation', label: 'Insulation Resistance (GΩ)' },
                  { id: 'tanDelta', label: 'Tan Delta Loss Status' }
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setActiveAdminTab(pill.id as any)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                      activeAdminTab === pill.id
                        ? 'bg-purple-50 text-purple-700 border-purple-200 shadow-xs'
                        : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Chart Stage */}
              <div className="bg-gray-50/50 border border-gray-150 rounded-xl p-4 min-h-[300px] flex flex-col justify-between">
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {activeAdminTab === 'load' ? (
                      <AreaChart data={parametricTrendData}>
                        <defs>
                          <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" fontSize={10} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" fontSize={10} label={{ value: 'Amps', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="loadCurrent" stroke="#8b5cf6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLoad)" name="Load Current" />
                      </AreaChart>
                    ) : activeAdminTab === 'sheath' ? (
                      <LineChart data={parametricTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" fontSize={10} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" fontSize={10} label={{ value: 'Amps', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Line type="monotone" dataKey="loadCurrent" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" name="Load Current" />
                        <Line type="monotone" dataKey="sheathCurrent" stroke="#ec4899" strokeWidth={2.5} name="Sheath Current" />
                      </LineChart>
                    ) : activeAdminTab === 'pd' ? (
                      <AreaChart data={parametricTrendData}>
                        <defs>
                          <linearGradient id="colorPd" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" fontSize={10} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" fontSize={10} label={{ value: 'pC', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="externalDischarge" stroke="#ec4899" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPd)" name="PD Activity" />
                      </AreaChart>
                    ) : activeAdminTab === 'insulation' ? (
                      <LineChart data={parametricTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" fontSize={10} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" fontSize={10} label={{ value: 'GΩ', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="insulationResistance" stroke="#059669" strokeWidth={2.5} name="Insulation Resistance" />
                      </LineChart>
                    ) : (
                      <BarChart data={parametricTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" fontSize={10} stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v) => v === 3 ? 'Action' : v === 2 ? 'Study' : v === 1 ? 'Safe' : 'No Rec'} />
                        <Tooltip formatter={(value) => value === 3 ? 'Action Required' : value === 2 ? 'Further Study Advised' : value === 1 ? 'No Action Required' : 'No Record'} />
                        <Bar dataKey="tanDelta" fill="#d946ef" radius={[4, 4, 0, 0]} name="Tan Delta Severity" maxBarSize={40} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>

                {/* AI recommendation box below the chart */}
                <div className="bg-purple-50/70 border border-purple-100 rounded-lg p-4 mt-4 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-purple-900 font-bold uppercase tracking-wide">
                    <Sparkles className="w-4 h-4 text-purple-700 animate-pulse" />
                    <span>AI Determination Advisory ({
                      activeAdminTab === 'load' ? 'Load Management' :
                      activeAdminTab === 'sheath' ? 'Ground-Shield Shielding' :
                      activeAdminTab === 'pd' ? 'PD Discharge Propagation' :
                      activeAdminTab === 'insulation' ? 'Polymer Dielectric Preservation' :
                      'Tan Delta Loss Factor'
                    })</span>
                  </div>
                  
                  <div className="text-gray-700 leading-relaxed font-medium">
                    {activeAdminTab === 'load' && (
                      <p>
                        <strong>Keep Asset Alive Directive:</strong> Standardize load monitoring and ensure operational loads remain below <strong>80% capacity (limit: 250A)</strong> to avoid thermal overload and expansion strain.
                        <br />
                        <strong className="text-purple-900">Situation Handle:</strong> If peak loading triggers hot-spots, dispatch a crew to perform infrared thermal inspection of connector points at cable bays and transition frames immediately.
                      </p>
                    )}
                    {activeAdminTab === 'sheath' && (
                      <p>
                        <strong>Keep Asset Alive Directive:</strong> The sheath-to-load current ratio should strictly remain <strong>below 20%</strong>. Highly elevated sheath current points directly to grounding loop decay, causing copper-screen overheating.
                        <br />
                        <strong className="text-purple-900">Situation Handle:</strong> If anomalous sheath currents are recorded, schedule a grounding resistance sweep of the local termination cabinets. Check all bonding links and solidify connections.
                      </p>
                    )}
                    {activeAdminTab === 'pd' && (
                      <p>
                        <strong>Keep Asset Alive Directive:</strong> Progressive partial discharge activity signals localized void ionization within cable joints. Keep levels strictly <strong>below 100 pC</strong> to preserve core integrity.
                        <br />
                        <strong className="text-purple-900">Situation Handle:</strong> For assets showing severe PD trend peaks, execute online acoustic-UHF localization scans immediately to isolate joints and replace them prior to a disruptive line fault.
                      </p>
                    )}
                    {activeAdminTab === 'insulation' && (
                      <p>
                        <strong>Keep Asset Alive Directive:</strong> Dielectric resistance should remain well <strong>above 1.0 GΩ</strong>. Moisture ingress and mechanical stress promote dielectric degradation and polymer micro-treeing.
                        <br />
                        <strong className="text-purple-900">Situation Handle:</strong> In case of critically low insulation values (below 1.0 GΩ), isolate the line section and carry out a Very Low Frequency (VLF) AC withstand diagnostic series.
                      </p>
                    )}
                    {activeAdminTab === 'tanDelta' && (
                      <p>
                        <strong>Keep Asset Alive Directive:</strong> Maintain proper moisture barrier seals at all junction boxes to prevent polar moisture contamination which accelerates dielectric tangent loss.
                        <br />
                        <strong className="text-purple-900">Situation Handle:</strong> If Tan Delta loss results are marked as 'Action Required', perform vacuum-drying nitrogen injection inside the termination chamber or plan section accessory replacement.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      ) : (
        /* Empty / Instructions State */
        <div className="bg-white rounded-2xl border border-gray-100 py-16 px-6 text-center shadow-xs" id="empty-database-view">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-4 stroke-1" />
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Pending Query Lookup
          </h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-2">
            Configure your area coverage, set search parameters (PEA Number, Equipment Number ADS, or Account Asset Number (AA)), and click **Show Detail** to pull engineering logs from Google Sheets.
          </p>
        </div>
      )}

      {/* --- MODAL 1: NO EQUIPMENT POPUP DIALOG --- */}
      {showNoNoEquipmentPopup()}

      {/* --- MODAL 2: SAVE CHOICE MODAL DIALOG --- */}
      {showSaveChoiceDialog()}
    </div>
  );

  // Modal 1 helper function
  function showNoNoEquipmentPopup() {
    if (!showNoEquipmentPopup) return null;
    return (
      <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          
          <div className="space-y-1">
            <h3 className="text-sm font-black text-gray-900 uppercase">Search Alert</h3>
            <p className="text-xs text-gray-500">
              No equipment found in database matching your selection and search query.
            </p>
          </div>

          <button
            onClick={() => setShowNoEquipmentPopup(false)}
            className="w-full bg-gray-900 hover:bg-gray-950 text-white py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Acknowledge
          </button>
        </div>
      </div>
    );
  }

  // Modal 2 helper function
  function showSaveChoiceDialog() {
    if (!showSaveChoiceModal || !selectedAsset) return null;
    return (
      <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl max-w-md w-full p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                <FilePenLine className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                Database Write Target Selection
              </h3>
            </div>
            <button
              onClick={() => setShowSaveChoiceModal(false)}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">
            Choose how you would like to persist your telemetry edits back to the system sheet database:
          </p>

          <div className="space-y-3">
            {/* Choice A: Save as New Record (Append) */}
            <button
              onClick={handleSaveAsNewRecord}
              className="w-full text-left bg-purple-50 hover:bg-purple-100 border border-purple-150 p-4 rounded-xl space-y-1 transition-all flex flex-col cursor-pointer"
            >
              <span className="text-xs font-black text-purple-900 uppercase tracking-tight flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-500" />
                Save as New Record (Audit Entry)
              </span>
              <span className="text-[10px] text-purple-700 leading-normal">
                This keeps the original record intact and appends a new inspection entry under the same **Equipment ID** (\`{selectedAsset.equipmentId}\`). Your operator name (**{user.name}**) and the current timestamp will be logged for this moment.
              </span>
            </button>

            {/* Choice B: Overwrite (Modify Row) */}
            <button
              onClick={handleSaveOverwrite}
              className="w-full text-left bg-gray-50 hover:bg-gray-100 border border-gray-200 p-4 rounded-xl space-y-1 transition-all flex flex-col cursor-pointer"
            >
              <span className="text-xs font-black text-gray-900 uppercase tracking-tight flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Overwrite Existing Record
              </span>
              <span className="text-[10px] text-gray-600 leading-normal">
                This replaces the existing values in the specific spreadsheet row for this asset in Google Sheets. It updates the core asset parameters directly.
              </span>
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setShowSaveChoiceModal(false)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// Custom simple Markdown formatting component to avoid npm installation
function MarkdownAdvisory({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-3 font-sans text-xs text-gray-700 leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          return <h2 key={idx} className="text-sm font-black text-purple-900 border-b border-purple-100 pb-1 mt-4">{trimmed.replace('# ', '')}</h2>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={idx} className="text-xs font-black text-purple-800 mt-3">{trimmed.replace('## ', '')}</h3>;
        }
        if (trimmed.startsWith('### ')) {
          return <h4 key={idx} className="text-xs font-black text-purple-700 mt-2">{trimmed.replace('### ', '')}</h4>;
        }
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          return (
            <li key={idx} className="ml-4 list-disc text-gray-600 mt-1">
              {parseBold(trimmed.substring(2))}
            </li>
          );
        }
        if (/^\d+\./.test(trimmed)) {
          const match = trimmed.match(/^(\d+)\.\s*(.*)/);
          return (
            <div key={idx} className="ml-4 flex gap-1.5 mt-1 text-gray-600">
              <span className="font-bold text-purple-700">{match?.[1]}.</span>
              <span>{parseBold(match?.[2] || '')}</span>
            </div>
          );
        }
        if (trimmed === '') {
          return <div key={idx} className="h-2" />;
        }
        return <p key={idx} className="text-gray-600">{parseBold(trimmed)}</p>;
      })}
    </div>
  );
}

function parseBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|\`.*?\`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-purple-50 border border-purple-100 px-1 py-0.5 rounded font-mono text-[10px] text-purple-800">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

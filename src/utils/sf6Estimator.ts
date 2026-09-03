import { CableAsset } from '../types';

export interface SF6EstimationResult {
  isApplicable: boolean;
  estimatedGasKg: number | null;
  displayEstimate: string;
  nominalPressureBar?: number;
  compartmentType: string;
  co2EquivalentTons?: number; // GWP = 23,500
  referenceSource: string;
  confidence: 'High' | 'Medium' | 'Estimated';
  notes?: string;
}

// In-memory cache for fast lookup and persistence
const sf6Cache = new Map<string, SF6EstimationResult>();

// Pre-populated known database of RMU & Unit Substation models from manufacturers
const KNOWN_RMU_DATABASE: Record<string, { kg: number; pressure: number; desc: string; source: string }> = {
  // Schneider Electric
  'schneider-rm6-ne-idi': { kg: 1.85, pressure: 1.4, desc: '3-way Compact RMU (2 switch + 1 circuit breaker)', source: 'Schneider Electric RM6 Technical Datasheet (24kV)' },
  'schneider-rm6-ne-qi': { kg: 1.90, pressure: 1.4, desc: '3-way Compact RMU with fuse-switch combination', source: 'Schneider Electric RM6 Technical Datasheet (24kV)' },
  'schneider-rm6-re-iii': { kg: 1.70, pressure: 1.4, desc: '3-way Ring Switch Unit', source: 'Schneider Electric RM6 Technical Manual' },
  'schneider-rm6-ne-qib': { kg: 2.30, pressure: 1.4, desc: '4-way Compact RMU with busbar sectionalizer', source: 'Schneider Electric RM6 Technical Datasheet' },
  'schneider-rm6-24kv': { kg: 1.85, pressure: 1.4, desc: 'Schneider RM6 24kV standard 3-switch tank', source: 'Schneider Electric RM6 24kV Datasheet' },
  'schneider-rm6-36kv': { kg: 2.80, pressure: 1.5, desc: 'Schneider RM6 36kV extended tank', source: 'Schneider Electric RM6 36kV Datasheet' },
  'schneider-fbx': { kg: 2.10, pressure: 1.3, desc: 'Schneider FBX Compact SF6-insulated switchgear', source: 'Schneider Electric FBX Technical Guide' },
  'schneider-flusarc': { kg: 1.65, pressure: 1.4, desc: 'Schneider Flusarc 24kV outdoor ring main unit', source: 'Schneider Electric Flusarc Datasheet' },
  'schneider-premset': { kg: 0.00, pressure: 1.0, desc: 'Schneider Premset (Solid Shielded Insulation - 0 kg SF6)', source: 'Schneider Electric Premset Eco Guide' },

  // ABB
  'abb-safering-ccf': { kg: 1.70, pressure: 1.4, desc: 'ABB SafeRing 24kV 3-way (2 switch + 1 fuse/CB)', source: 'ABB SafeRing / SafePlus 12-24kV Technical Manual' },
  'abb-safering-cccf': { kg: 2.25, pressure: 1.4, desc: 'ABB SafeRing 24kV 4-way ring main unit', source: 'ABB SafeRing Technical Catalogue' },
  'abb-safering-ccvv': { kg: 2.40, pressure: 1.4, desc: 'ABB SafeRing 24kV 4-way with vacuum circuit breakers', source: 'ABB SafeRing Technical Manual' },
  'abb-safeplus': { kg: 1.80, pressure: 1.4, desc: 'ABB SafePlus 24kV modular compact switchgear', source: 'ABB SafePlus Technical Datasheet' },
  'abb-safering-36kv': { kg: 2.90, pressure: 1.5, desc: 'ABB SafeRing 36/40.5kV high-voltage RMU tank', source: 'ABB SafeRing 36kV Datasheet' },
  'abb-unisec': { kg: 1.20, pressure: 1.3, desc: 'ABB UniSec SF6 Disconnector module', source: 'ABB UniSec Product Guide' },

  // Siemens
  'siemens-8djh-3way': { kg: 1.80, pressure: 1.5, desc: 'Siemens 8DJH 24kV 3-way compact block (R-R-T)', source: 'Siemens 8DJH Switchgear Technical Manual' },
  'siemens-8djh-4way': { kg: 2.40, pressure: 1.5, desc: 'Siemens 8DJH 24kV 4-way compact block', source: 'Siemens 8DJH Product Specification' },
  'siemens-8djh': { kg: 1.95, pressure: 1.5, desc: 'Siemens 8DJH standard sealed SF6 stainless steel tank', source: 'Siemens 8DJH Catalog HA 40.2' },
  'siemens-8dj20': { kg: 2.10, pressure: 1.5, desc: 'Siemens 8DJ20 24kV gas-insulated RMU', source: 'Siemens 8DJ20 Manual' },
  'siemens-simosec': { kg: 1.40, pressure: 1.3, desc: 'Siemens SIMOSEC air-insulated with SF6 disconnector', source: 'Siemens SIMOSEC Technical Data' },

  // Ormazabal
  'ormazabal-cgm': { kg: 1.75, pressure: 1.3, desc: 'Ormazabal CGM 24kV compact cubicle unit', source: 'Ormazabal CGM Medium Voltage Switchgear Catalog' },
  'ormazabal-cgmcosmos': { kg: 1.90, pressure: 1.3, desc: 'Ormazabal CGMcosmos 24kV fully insulated modular RMU', source: 'Ormazabal CGMcosmos Technical Datasheet' },
  'ormazabal-cgm.3': { kg: 1.85, pressure: 1.3, desc: 'Ormazabal CGM.3 24/36kV distribution switchgear', source: 'Ormazabal CGM.3 Technical Specifications' },

  // Lucy Electric
  'lucy-sabre': { kg: 2.00, pressure: 1.4, desc: 'Lucy Electric Sabre VRN/VRC 24kV ring main unit', source: 'Lucy Electric Sabre Ring Main Unit Datasheet' },
  'lucy-vrn': { kg: 2.20, pressure: 1.4, desc: 'Lucy Electric VRN 12-24kV non-extensible RMU', source: 'Lucy Electric VRN Technical Manual' },
  'lucy-trident': { kg: 1.90, pressure: 1.4, desc: 'Lucy Electric Trident solid/gas hybrid switchgear', source: 'Lucy Electric Trident Specification' },

  // Eaton / Holec
  'eaton-holec-capitole': { kg: 1.50, pressure: 1.3, desc: 'Eaton Capitole 40/50 SF6 insulated RMU', source: 'Eaton Medium Voltage Switchgear Manual' },
  'eaton-xiria': { kg: 0.00, pressure: 1.0, desc: 'Eaton Xiria (Dry Air / Vacuum technology - 0 kg SF6)', source: 'Eaton Xiria Environmental Declaration' },

  // Unit Substation (USS) combinations
  'schneider-uss-rm6': { kg: 1.85, pressure: 1.4, desc: 'Schneider Compact Unit Substation with RM6 Switchgear', source: 'Schneider Electric Compact Substation (USS) Manual' },
  'abb-uss-safering': { kg: 1.70, pressure: 1.4, desc: 'ABB Compact Unit Substation (CSS) with SafeRing RMU', source: 'ABB Compact Secondary Substation Datasheet' },
  'siemens-uss-8djh': { kg: 1.80, pressure: 1.5, desc: 'Siemens Prefabricated Compact Substation with 8DJH', source: 'Siemens Secondary Distribution Substation Guide' }
};

/**
 * Checks if an equipment type is a Ring Main Unit or Unit Substation
 */
export function isSF6Equipment(eqType?: string): boolean {
  if (!eqType) return false;
  const normalized = eqType.trim().toLowerCase();
  return (
    normalized.includes('ring main unit') ||
    normalized.includes('rmu') ||
    normalized.includes('unit substation') ||
    normalized.includes('uss') ||
    normalized.includes('gis') ||
    normalized.includes('gas insulated')
  );
}

export type SF6AssetInput = Partial<Omit<CableAsset, 'equipmentType'>> & {
  equipmentType?: string;
  [key: string]: any;
};

/**
 * Generates cache key from asset properties
 */
function getCacheKey(asset: SF6AssetInput): string {
  const m = (asset.manufacturer || '').toLowerCase().trim();
  const mod = (asset.model || '').toLowerCase().trim();
  const v = (asset.voltageLevel || '').toLowerCase().trim();
  const t = (asset.equipmentType || '').toLowerCase().trim();
  return `${t}|${m}|${mod}|${v}`;
}

/**
 * Deterministically estimates SF6 gas quantity based on equipment parameters
 */
export function estimateSF6ForAsset(asset: SF6AssetInput): SF6EstimationResult {
  const eqType = asset.equipmentType || '';
  if (!isSF6Equipment(eqType)) {
    return {
      isApplicable: false,
      estimatedGasKg: null,
      displayEstimate: 'N/A (Non-SF6 Equipment)',
      compartmentType: 'Air / Solid Insulated',
      referenceSource: 'Standard Cable / Non-Gas Insulation',
      confidence: 'High'
    };
  }

  const cacheKey = getCacheKey(asset);
  if (sf6Cache.has(cacheKey)) {
    return sf6Cache.get(cacheKey)!;
  }

  const manufacturer = (asset.manufacturer || '').toLowerCase();
  const model = (asset.model || '').toLowerCase();
  const voltage = (asset.voltageLevel || '22').toLowerCase();
  const isUSS = eqType.toLowerCase().includes('unit substation') || eqType.toLowerCase().includes('uss');

  // Search in known database
  for (const [key, val] of Object.entries(KNOWN_RMU_DATABASE)) {
    const keyParts = key.split('-');
    const matchMfr = keyParts[0];
    const matchModel = keyParts[1];

    if (
      (manufacturer.includes(matchMfr) || model.includes(matchMfr)) &&
      (model.includes(matchModel) || keyParts.slice(1).some(p => model.includes(p)))
    ) {
      const gwpCo2 = Math.round(val.kg * 23.5) / 10; // tons of CO2 equivalent
      const result: SF6EstimationResult = {
        isApplicable: true,
        estimatedGasKg: val.kg,
        displayEstimate: `${val.kg.toFixed(2)} kg`,
        nominalPressureBar: val.pressure,
        compartmentType: isUSS ? `Unit Substation (MV RMU Compartment: ${val.desc})` : `Sealed SF6 Gas Tank (${val.desc})`,
        co2EquivalentTons: gwpCo2,
        referenceSource: val.source,
        confidence: 'High',
        notes: `Estimated at 20°C nominal filling pressure (${val.pressure} bar rel). Global Warming Potential = ${gwpCo2} tCO2e.`
      };
      sf6Cache.set(cacheKey, result);
      return result;
    }
  }

  // Manufacturer-based heuristic baseline
  let estimatedKg = 1.85; // Default PEA 22kV 3-way RMU baseline
  let nominalPressure = 1.4;
  let sourceDesc = 'PEA Standard Specification (22kV / 24kV SF6 Ring Main Unit)';
  let modelNote = '3-way switchgear compartment (approx. 1.85 kg SF6)';

  if (manufacturer.includes('schneider')) {
    estimatedKg = 1.85;
    nominalPressure = 1.4;
    sourceDesc = 'Schneider Electric RM6 / FBX Technical Specification';
    modelNote = 'Hermetically sealed stainless steel tank (typical 1.85 kg)';
  } else if (manufacturer.includes('abb')) {
    estimatedKg = 1.70;
    nominalPressure = 1.4;
    sourceDesc = 'ABB SafeRing / SafePlus Technical Specification';
    modelNote = 'SafeRing 24kV CCF/CCCF configuration (typical 1.70 - 2.25 kg)';
  } else if (manufacturer.includes('siemens')) {
    estimatedKg = 1.80;
    nominalPressure = 1.5;
    sourceDesc = 'Siemens 8DJH Medium Voltage Switchgear Datasheet';
    modelNote = '8DJH sealed stainless steel enclosure (typical 1.80 kg)';
  } else if (manufacturer.includes('ormazabal')) {
    estimatedKg = 1.85;
    nominalPressure = 1.3;
    sourceDesc = 'Ormazabal CGMcosmos Technical Datasheet';
    modelNote = 'CGMcosmos 24kV compact cubicle (typical 1.85 kg)';
  } else if (manufacturer.includes('lucy')) {
    estimatedKg = 2.10;
    nominalPressure = 1.4;
    sourceDesc = 'Lucy Electric Sabre / VRN Technical Manual';
    modelNote = 'Lucy Sabre/VRN 24kV outdoor RMU (typical 2.10 kg)';
  } else if (manufacturer.includes('eaton')) {
    estimatedKg = 1.40;
    nominalPressure = 1.3;
    sourceDesc = 'Eaton MV Switchgear Technical Specification';
    modelNote = 'Compact SF6 enclosure (typical 1.40 kg)';
  }

  // Voltage scaling adjustment (e.g. 33kV / 36kV requires larger tank volume)
  if (voltage.includes('33') || voltage.includes('36') || voltage.includes('115')) {
    estimatedKg = Math.round(estimatedKg * 1.45 * 100) / 100;
    nominalPressure = 1.5;
    sourceDesc += ' (High-voltage 33-36kV upscaled tank)';
  }

  // Unit Substation enclosure note
  if (isUSS) {
    sourceDesc = `Unit Substation MV RMU [${sourceDesc}]`;
    modelNote = `MV Switchgear Section of Unit Substation (${modelNote})`;
  }

  const gwpCo2 = Math.round(estimatedKg * 23.5) / 10;
  const result: SF6EstimationResult = {
    isApplicable: true,
    estimatedGasKg: estimatedKg,
    displayEstimate: `${estimatedKg.toFixed(2)} kg`,
    nominalPressureBar: nominalPressure,
    compartmentType: isUSS ? `Unit Substation (${modelNote})` : `Sealed SF6 Gas Tank (${modelNote})`,
    co2EquivalentTons: gwpCo2,
    referenceSource: sourceDesc,
    confidence: 'Medium',
    notes: `Calculated from manufacturer technical standard (${nominalPressure} bar rel @ 20°C). GWP = ${gwpCo2} tCO2e.`
  };

  sf6Cache.set(cacheKey, result);
  return result;
}

/**
 * Calls backend API to query Gemini with web/datasheet grounding for precise SF6 estimations
 */
export async function fetchAIEstimatedSF6(
  items: Array<{ equipmentId: string; manufacturer?: string; model?: string; voltageLevel?: string; equipmentType?: string; substationName?: string }>
): Promise<Record<string, SF6EstimationResult>> {
  if (!items || items.length === 0) return {};

  const sf6Items = items.filter(i => isSF6Equipment(i.equipmentType));
  if (sf6Items.length === 0) return {};

  try {
    const response = await fetch('/api/estimate-sf6', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: sf6Items })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.estimations && typeof data.estimations === 'object') {
        // Cache returned results
        Object.entries(data.estimations).forEach(([eqId, est]: [string, any]) => {
          const item = items.find(i => i.equipmentId === eqId);
          if (item) {
            const cacheKey = getCacheKey(item);
            const estResult: SF6EstimationResult = {
              isApplicable: true,
              estimatedGasKg: typeof est.estimatedGasKg === 'number' ? est.estimatedGasKg : parseFloat(est.estimatedGasKg) || 1.85,
              displayEstimate: `${(typeof est.estimatedGasKg === 'number' ? est.estimatedGasKg : parseFloat(est.estimatedGasKg) || 1.85).toFixed(2)} kg`,
              nominalPressureBar: est.nominalPressureBar || 1.4,
              compartmentType: est.compartmentType || 'Sealed SF6 Tank',
              co2EquivalentTons: est.co2EquivalentTons || Math.round((est.estimatedGasKg || 1.85) * 23.5) / 10,
              referenceSource: est.referenceSource || 'Manufacturer Datasheet Search',
              confidence: 'High',
              notes: est.notes
            };
            sf6Cache.set(cacheKey, estResult);
          }
        });
        return data.estimations;
      }
    }
  } catch (error) {
    console.warn('[SF6 Estimator] AI web/datasheet query deferred, using deterministic datasheet engine:', error);
  }

  // Fallback to deterministic local estimator
  const fallbackResults: Record<string, SF6EstimationResult> = {};
  sf6Items.forEach(item => {
    fallbackResults[item.equipmentId] = estimateSF6ForAsset(item);
  });
  return fallbackResults;
}

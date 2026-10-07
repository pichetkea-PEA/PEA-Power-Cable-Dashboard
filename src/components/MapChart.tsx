import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

// Robust Prototype Patch for Leaflet.heat to prevent IndexSizeError when canvas dimension is 0
if (typeof L !== 'undefined') {
  const HeatLayerClass = (L as any).HeatLayer;
  if (HeatLayerClass && HeatLayerClass.prototype) {
    const heatProto = HeatLayerClass.prototype;
    if (!heatProto._safePatched) {
      const origReset = heatProto._reset;
      heatProto._reset = function () {
        if (!this._map || !this._canvas) return;
        const size = this._map.getSize();
        if (!size || size.x <= 0 || size.y <= 0) {
          return;
        }
        try {
          if (origReset) origReset.apply(this);
        } catch (e: any) {
          // Suppress canvas 0-dimension drawing errors
        }
      };

      const origRedraw = heatProto._redraw;
      heatProto._redraw = function (...args: any[]) {
        if (!this._map || !this._canvas) return this;
        const size = this._map.getSize();
        if (!size || size.x <= 0 || size.y <= 0 || this._canvas.width <= 0 || this._canvas.height <= 0) {
          return this;
        }
        try {
          if (origRedraw) return origRedraw.apply(this, args);
        } catch (e: any) {
          return this;
        }
        return this;
      };
      heatProto._safePatched = true;
    }
  }
}
import { CableAsset, HealthStatus } from '../types';
import { 
  Flame, 
  Layers, 
  MapPin, 
  Sliders, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Zap,
  Eye, 
  EyeOff,
  Sparkles,
  Info,
  RotateCcw,
  Filter
} from 'lucide-react';

export type HeatmapMode = 'all' | 'critical' | 'severe_pd' | 'warning' | 'healthy';
export type MapViewMode = 'hybrid' | 'heatmap' | 'markers';
export type MarkerFilterCategory = 'all' | 'severe_pd' | 'Red' | 'Orange' | 'Yellow' | 'Green';

export interface SeverePdDetails {
  isSevere: boolean;
  defectType: string;
  rawDefect: string;
  amplitude: number;
  severity: 'Critical' | 'Warning';
}

/**
 * Identify if an asset has active severe online partial discharge
 * e.g., Internal PD, Surface PD, Void (Cavity), Floating PD, Treeing
 */
export function getAssetSeverePd(asset: CableAsset): SeverePdDetails {
  const pdRes = (asset.pdResult || '').trim();
  const onlineDefect = (asset.onlinePrpdDefectType || asset.pdDiagnostics?.onlinePrpdDefectType || '').trim();
  const onlineSev = (asset.onlinePrpdSeverity || asset.pdDiagnostics?.onlinePrpdSeverity || '').trim();
  const extDischarge = Number(asset.externalDischarge || asset.onlinePdAmplitude || asset.onlinePrpdAmplitude || asset.onlinePrpdPeakCharge || 0);

  const isInternal = pdRes === 'Internal' || /internal/i.test(onlineDefect);
  const isSurface = pdRes === 'Surface' || /surface/i.test(onlineDefect);
  const isVoid = pdRes === 'Void' || /void|cavity/i.test(onlineDefect);
  const isFloating = pdRes === 'Floating' || /floating/i.test(onlineDefect);
  const isTreeing = pdRes === 'Treeing' || /treeing/i.test(onlineDefect);

  if (isInternal || isSurface || isVoid || isFloating || isTreeing) {
    let defectType = 'Internal PD';
    if (isInternal) defectType = 'Internal PD';
    else if (isSurface) defectType = 'Surface PD';
    else if (isVoid) defectType = 'Void (Cavity) PD';
    else if (isFloating) defectType = 'Floating PD';
    else if (isTreeing) defectType = 'Treeing PD';

    const isCrit = isInternal || isTreeing || onlineSev.toLowerCase() === 'critical' || extDischarge >= 250;
    return {
      isSevere: true,
      defectType,
      rawDefect: onlineDefect || pdRes,
      amplitude: extDischarge,
      severity: isCrit ? 'Critical' : 'Warning'
    };
  }

  if (onlineDefect && onlineDefect !== 'None' && !/normal|no discharge|background/i.test(onlineDefect)) {
    return {
      isSevere: true,
      defectType: onlineDefect,
      rawDefect: onlineDefect,
      amplitude: extDischarge,
      severity: onlineSev.toLowerCase() === 'critical' ? 'Critical' : 'Warning'
    };
  }

  if (extDischarge >= 50) {
    return {
      isSevere: true,
      defectType: `High Amplitude PD (${extDischarge} pC)`,
      rawDefect: `${extDischarge} pC`,
      amplitude: extDischarge,
      severity: extDischarge >= 250 ? 'Critical' : 'Warning'
    };
  }

  return {
    isSevere: false,
    defectType: '',
    rawDefect: '',
    amplitude: extDischarge,
    severity: 'Warning'
  };
}

interface MapChartProps {
  assets: CableAsset[];
  onSelectAsset?: (asset: CableAsset) => void;
  initialHeatmapEnabled?: boolean;
  initialHeatmapMode?: HeatmapMode;
}

export default function MapChart({ 
  assets, 
  onSelectAsset,
  initialHeatmapEnabled = true,
  initialHeatmapMode = 'all'
}: MapChartProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<any>(null);

  // Heatmap and View Mode States
  const [viewMode, setViewMode] = useState<MapViewMode>('hybrid');
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>(initialHeatmapMode);
  const [selectedMarkerCategory, setSelectedMarkerCategory] = useState<MarkerFilterCategory>('all');
  const [showControls, setShowControls] = useState<boolean>(false);
  const [heatRadius, setHeatRadius] = useState<number>(30);
  const [heatBlur, setHeatBlur] = useState<number>(20);
  const [heatOpacity, setHeatOpacity] = useState<number>(0.85);

  // Initialize base Leaflet map once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (!mapRef.current) {
      const map = L.map(container, {
        preferCanvas: true,
        center: [13.7563, 100.5018],
        zoom: 6,
        zoomControl: false, // We'll add custom top-right zoom control
        scrollWheelZoom: true
      });

      // Add zoom control in top-right to avoid clashing with bottom legend
      L.control.zoom({ position: 'topright' }).addTo(map);

      // 100% Free OpenStreetMap tile layer (No API key required, no watermarks)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      markerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver(() => {
        if (mapRef.current && container && container.clientWidth > 0 && container.clientHeight > 0) {
          try {
            mapRef.current.invalidateSize();
          } catch (err) {
            console.warn('Map invalidateSize skipped:', err);
          }
        }
      });
      resizeObserver.observe(container);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  // Update Heatmap and Markers layer when assets or settings change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markerGroup = markerGroupRef.current;
    if (markerGroup) {
      markerGroup.clearLayers();
    }

    // Remove previous heat layer if it exists
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    // Filter valid GPS assets
    const validAssets = assets.filter(asset => {
      if (!asset || !asset.gps) return false;
      const lat = typeof asset.gps.lat === 'number' ? asset.gps.lat : parseFloat(asset.gps.lat as any);
      const lng = typeof asset.gps.lng === 'number' ? asset.gps.lng : parseFloat(asset.gps.lng as any);
      return !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
    }).map(asset => ({
      ...asset,
      gps: {
        lat: typeof asset.gps.lat === 'number' ? asset.gps.lat : parseFloat(asset.gps.lat as any),
        lng: typeof asset.gps.lng === 'number' ? asset.gps.lng : parseFloat(asset.gps.lng as any)
      }
    }));

    if (validAssets.length === 0) return;

    const bounds: L.LatLngTuple[] = [];

    // 1. Build and Mount Heatmap Layer if viewMode is 'hybrid' or 'heatmap'
    if (viewMode === 'hybrid' || viewMode === 'heatmap') {
      // Filter assets and assign heat intensity weights based on health status & severe PD
      let heatDataPoints: [number, number, number][] = [];
      let customGradient: Record<number, string> = {};

      if (heatmapMode === 'critical') {
        // Red (Danger) & Orange (Alert) Hotspots
        const criticalAssets = validAssets.filter(
          a => a.healthStatus === 'Red' || a.healthStatus === 'Orange'
        );
        heatDataPoints = criticalAssets.map(a => [
          a.gps.lat,
          a.gps.lng,
          a.healthStatus === 'Red' ? 1.0 : 0.75
        ]);
        // Fiery red-orange warning gradient
        customGradient = {
          0.1: '#fed7aa', // Light Orange
          0.3: '#fb923c', // Vivid Orange
          0.6: '#ef4444', // Danger Red
          0.9: '#b91c1c', // Deep Crimson Red
          1.0: '#7f1d1d'  // Intense Hazard Dark Red
        };
      } else if (heatmapMode === 'severe_pd') {
        // Severe Online Partial Discharge (Internal, Surface, Void, Floating PD) Hotspots
        const severePdAssets = validAssets.filter(a => getAssetSeverePd(a).isSevere);
        heatDataPoints = severePdAssets.map(a => {
          const pd = getAssetSeverePd(a);
          const weight = pd.severity === 'Critical' ? 1.0 : 0.75;
          return [a.gps.lat, a.gps.lng, weight];
        });
        // Electric Violet / Neon Magenta / Fiery Crimson PD Gradient
        customGradient = {
          0.1: '#f3e8ff', // Light Lavender
          0.3: '#c084fc', // Bright Violet
          0.6: '#a855f7', // Electric Purple
          0.85: '#d946ef', // Neon Magenta
          1.0: '#dc2626'  // Hazard Red Alert
        };
      } else if (heatmapMode === 'warning') {
        // Yellow & Orange Assets
        const warningAssets = validAssets.filter(
          a => a.healthStatus === 'Yellow' || a.healthStatus === 'Orange'
        );
        heatDataPoints = warningAssets.map(a => [
          a.gps.lat,
          a.gps.lng,
          a.healthStatus === 'Orange' ? 0.9 : 0.6
        ]);
        // Amber-Yellow monitor gradient
        customGradient = {
          0.1: '#fef08a', // Light Yellow
          0.4: '#facc15', // Vibrant Yellow
          0.7: '#f59e0b', // Amber
          1.0: '#d97706'  // Deep Amber
        };
      } else if (heatmapMode === 'healthy') {
        // Green (Normal / Healthy) Assets
        const healthyAssets = validAssets.filter(
          a => a.healthStatus === 'Green' || !a.healthStatus
        );
        heatDataPoints = healthyAssets.map(a => [
          a.gps.lat,
          a.gps.lng,
          0.8
        ]);
        // Emerald Green lush health gradient
        customGradient = {
          0.1: '#bbf7d0', // Light Mint
          0.3: '#4ade80', // Fresh Green
          0.6: '#10b981', // Emerald
          0.9: '#059669', // Deep Emerald
          1.0: '#064e3b'  // Dark Forest Green
        };
      } else {
        // 'all': Comprehensive Health-Risk Weighted Density Heatmap
        // Red = Highest Intensity (1.0), Orange = 0.75, Yellow = 0.5, Green = 0.25
        heatDataPoints = validAssets.map(a => {
          let weight = 0.3;
          if (a.healthStatus === 'Red') weight = 1.0;
          else if (a.healthStatus === 'Orange') weight = 0.75;
          else if (a.healthStatus === 'Yellow') weight = 0.5;
          else if (a.healthStatus === 'Green') weight = 0.25;
          return [a.gps.lat, a.gps.lng, weight];
        });
        // Multi-spectrum health risk gradient (Green -> Amber -> Orange -> Fiery Red)
        customGradient = {
          0.15: '#34d399', // Emerald Green (Healthy)
          0.35: '#60a5fa', // Blue (Transition)
          0.55: '#facc15', // Yellow (Monitor)
          0.75: '#f97316', // Orange (Alert)
          1.0: '#ef4444'   // Crimson Red (Critical Hazard)
        };
      }

      if (heatDataPoints.length > 0 && (L as any).heatLayer) {
        try {
          const heatLayer = (L as any).heatLayer(heatDataPoints, {
            radius: heatRadius,
            blur: heatBlur,
            maxZoom: 16,
            max: 1.0,
            minOpacity: Math.max(heatOpacity * 0.4, 0.3),
            gradient: customGradient
          });
          // Direct safety wrapping on instance
          if (heatLayer) {
            const origReset = heatLayer._reset;
            heatLayer._reset = function () {
              if (!this._map || !this._canvas) return;
              const size = this._map.getSize();
              if (!size || size.x <= 0 || size.y <= 0) return;
              try {
                if (origReset) origReset.apply(this);
              } catch (err) {}
            };
            const origRedraw = heatLayer._redraw;
            heatLayer._redraw = function (...args: any[]) {
              if (!this._map || !this._canvas) return this;
              const size = this._map.getSize();
              if (!size || size.x <= 0 || size.y <= 0 || this._canvas.width <= 0 || this._canvas.height <= 0) return this;
              try {
                if (origRedraw) return origRedraw.apply(this, args);
              } catch (err) {
                return this;
              }
              return this;
            };
          }
          heatLayer.addTo(map);
          heatLayerRef.current = heatLayer;
        } catch (e) {
          console.warn('Leaflet heatLayer error:', e);
        }
      }
    }

    // 2. Build and Mount Markers Layer if viewMode is 'hybrid' or 'markers'
    if ((viewMode === 'hybrid' || viewMode === 'markers') && markerGroup) {
      const statusColors: Record<string, string> = {
        Green: '#10B981',  // Emerald Green: Normal
        Yellow: '#EAB308', // Yellow: Monitor
        Orange: '#F97316', // Orange: Alert
        Red: '#EF4444'     // Red: Dangerous
      };

      // Group assets by exact GPS location coordinates (5 decimal precision ~1 meter)
      interface LocationGroup {
        gpsKey: string;
        lat: number;
        lng: number;
        assets: CableAsset[];
        worstHealthStatus: HealthStatus;
        lowestHealthScore: number;
        substationName: string;
        city: string;
        hasSeverePd: boolean;
        severePdCount: number;
        severePdTypes: string[];
        maxPdAmplitude: number;
      }

      const locationGroupsMap = new Map<string, LocationGroup>();

      validAssets.forEach(asset => {
        const lat = Number(asset.gps.lat.toFixed(5));
        const lng = Number(asset.gps.lng.toFixed(5));
        const key = `${lat},${lng}`;

        if (!locationGroupsMap.has(key)) {
          locationGroupsMap.set(key, {
            gpsKey: key,
            lat,
            lng,
            assets: [],
            worstHealthStatus: 'Green',
            lowestHealthScore: 100,
            substationName: asset.substationName || '',
            city: asset.city || '',
            hasSeverePd: false,
            severePdCount: 0,
            severePdTypes: [],
            maxPdAmplitude: 0
          });
        }

        const group = locationGroupsMap.get(key)!;
        group.assets.push(asset);

        // Check severe PD for this asset
        const pdInfo = getAssetSeverePd(asset);
        if (pdInfo.isSevere) {
          group.hasSeverePd = true;
          group.severePdCount += 1;
          if (!group.severePdTypes.includes(pdInfo.defectType)) {
            group.severePdTypes.push(pdInfo.defectType);
          }
          if (pdInfo.amplitude > group.maxPdAmplitude) {
            group.maxPdAmplitude = pdInfo.amplitude;
          }
        }

        if (!group.substationName && asset.substationName) {
          group.substationName = asset.substationName;
        }
        if (!group.city && asset.city) {
          group.city = asset.city;
        }

        const currentStatus = group.worstHealthStatus;
        const assetStatus = asset.healthStatus || 'Green';
        const severityRank: Record<string, number> = { Red: 4, Orange: 3, Yellow: 2, Green: 1 };
        if ((severityRank[assetStatus] || 1) > (severityRank[currentStatus] || 1)) {
          group.worstHealthStatus = assetStatus;
        }

        if (typeof asset.healthScore === 'number' && asset.healthScore < group.lowestHealthScore) {
          group.lowestHealthScore = asset.healthScore;
        }
      });

      const escapeHtml = (str?: string) => {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      locationGroupsMap.forEach(group => {
        const isMultiple = group.assets.length > 1;
        const color = statusColors[group.worstHealthStatus] || '#10B981';
        const isCritical = group.worstHealthStatus === 'Red';
        const isOrange = group.worstHealthStatus === 'Orange';
        const hasSeverePd = group.hasSeverePd;

        // Filtering logic based on selectedMarkerCategory
        let isMatch = true;
        if (selectedMarkerCategory === 'severe_pd') {
          isMatch = hasSeverePd;
        } else if (selectedMarkerCategory === 'Red') {
          isMatch = group.worstHealthStatus === 'Red' || group.assets.some(a => a.healthStatus === 'Red');
        } else if (selectedMarkerCategory === 'Orange') {
          isMatch = group.worstHealthStatus === 'Orange' || group.assets.some(a => a.healthStatus === 'Orange');
        } else if (selectedMarkerCategory === 'Yellow') {
          isMatch = group.worstHealthStatus === 'Yellow' || group.assets.some(a => a.healthStatus === 'Yellow');
        } else if (selectedMarkerCategory === 'Green') {
          isMatch = group.worstHealthStatus === 'Green' || group.assets.some(a => a.healthStatus === 'Green' || !a.healthStatus);
        }

        const isDimmed = selectedMarkerCategory !== 'all' && !isMatch;

        let marker: L.Layer;

        if (hasSeverePd) {
          // Thunder Symbol Marker for Severe Online Partial Discharge
          if (!isDimmed) {
            // Vivid Active Thunder Symbol Icon
            const thunderIcon = L.divIcon({
              className: 'custom-thunder-div-icon',
              html: `
                <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                  <div class="thunder-aura-pulse" style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: radial-gradient(circle, rgba(234, 179, 8, 0.45) 0%, rgba(168, 85, 247, 0.25) 60%, transparent 100%);"></div>
                  <div style="position: relative; width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #581c87 0%, #7e22ce 40%, #eab308 100%); border: 2.2px solid #ffffff; box-shadow: 0 3px 10px rgba(0,0,0,0.35), 0 0 12px rgba(234, 179, 8, 0.7); display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="#fef08a" stroke="#ca8a04" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    ${isMultiple ? `
                      <span style="position: absolute; top: -5px; right: -5px; background: #dc2626; color: white; font-size: 8.5px; font-weight: 900; border-radius: 9999px; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); font-family: monospace;">${group.assets.length}</span>
                    ` : ''}
                  </div>
                </div>
              `,
              iconSize: [34, 34],
              iconAnchor: [17, 17],
              popupAnchor: [0, -18]
            });
            marker = L.marker([group.lat, group.lng], { icon: thunderIcon, zIndexOffset: 1000 });
          } else {
            // Dimmed Gray Thunder Symbol
            const dimmedThunderIcon = L.divIcon({
              className: 'custom-thunder-div-icon',
              html: `
                <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.35; filter: grayscale(100%);">
                  <div style="width: 20px; height: 20px; border-radius: 50%; background: #9ca3af; border: 1.5px solid #6b7280; display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="#d1d5db" stroke="#4b5563" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -14]
            });
            marker = L.marker([group.lat, group.lng], { icon: dimmedThunderIcon, zIndexOffset: 100 });
          }
        } else {
          // Standard circle marker for normal / non-severe PD assets
          let radius = isMultiple 
            ? (isCritical ? 10 : isOrange ? 9 : 8) 
            : (isCritical ? 8 : isOrange ? 7 : 5.5);

          if (!isDimmed) {
            marker = L.circleMarker([group.lat, group.lng], {
              radius,
              fillColor: color,
              color: isCritical ? '#7f1d1d' : (isMultiple ? '#4c1d95' : '#ffffff'),
              weight: isMultiple ? 2.5 : (isCritical ? 2.5 : 1.5),
              opacity: 1,
              fillOpacity: viewMode === 'hybrid' ? 0.92 : 0.98
            });
          } else {
            marker = L.circleMarker([group.lat, group.lng], {
              radius: Math.max(radius - 1.5, 4.5),
              fillColor: '#9ca3af',
              color: '#6b7280',
              weight: 1,
              opacity: 0.4,
              fillOpacity: 0.25
            });
          }
        }

        // Tooltip hint on hover
        let tooltipHtml = `📍 <b>${escapeHtml(group.substationName || group.city || 'Location')}</b> (${group.assets.length} assets)`;
        if (hasSeverePd) {
          tooltipHtml += `<br/><span style="color:#d946ef; font-weight:bold;">⚡ Severe Online PD: ${escapeHtml(group.severePdTypes.join(', '))}</span>`;
        } else {
          tooltipHtml += `<br/><span style="color:${color}; font-weight:bold;">Status: ${group.worstHealthStatus} (${group.lowestHealthScore}%)</span>`;
        }
        if (isMultiple) {
          tooltipHtml += `<br/><span style="font-size:10px; color:#6b7280;">Click or hover to pick asset</span>`;
        }
        if (isDimmed) {
          tooltipHtml += `<br/><span style="font-size:9.5px; color:#9ca3af;">(Filtered out - Gray)</span>`;
        }

        marker.bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -8], opacity: 0.95 });

        // Popup Content
        let popupContent = '';

        if (!isMultiple) {
          // Single asset view
          const asset = group.assets[0];
          const currentYear = new Date().getFullYear();
          const regYear = asset.yearOfRegistration || currentYear;
          const age = currentYear - regYear;
          const pdDetails = getAssetSeverePd(asset);

          popupContent = `
            <div class="p-3 font-sans text-xs text-gray-800 leading-tight min-w-[240px]">
              <div class="font-bold border-b border-gray-100 pb-1.5 mb-2 text-gray-900 flex items-center justify-between gap-2">
                <span class="truncate font-bold">${escapeHtml(asset.equipmentType || 'Cable Asset')}</span>
                <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                  asset.healthStatus === 'Red' ? 'bg-red-100 text-red-700' :
                  asset.healthStatus === 'Orange' ? 'bg-orange-100 text-orange-700' :
                  asset.healthStatus === 'Yellow' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-emerald-100 text-emerald-700'
                }">${asset.healthStatus || 'Green'}</span>
              </div>
              <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <span class="text-gray-400 font-medium">Equipment ID:</span>
                <span class="font-mono text-gray-900 font-bold truncate">${escapeHtml(asset.equipmentId || 'N/A')}</span>
                <span class="text-gray-400 font-medium">Manufacturer:</span>
                <span class="text-gray-900 truncate">${escapeHtml(asset.manufacturer || 'N/A')}</span>
                <span class="text-gray-400 font-medium">Voltage Level:</span>
                <span class="text-gray-900 font-bold">${escapeHtml(asset.voltageLevel || '22')} kV</span>
                <span class="text-gray-400 font-medium">Operational Age:</span>
                <span class="text-gray-900">${age} Yrs (${regYear})</span>
                <span class="text-gray-400 font-medium">Health Index:</span>
                <span class="font-bold" style="color: ${
                  asset.healthStatus === 'Red' ? '#EF4444' : 
                  asset.healthStatus === 'Orange' ? '#F97316' : 
                  asset.healthStatus === 'Yellow' ? '#D97706' : '#10B981'
                }">${asset.healthScore ?? 100}%</span>
              </div>

              ${pdDetails.isSevere ? `
                <!-- Severe Online PD High-Visibility Banner -->
                <div class="mt-2.5 p-2 rounded-lg bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-950">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-[9px] font-black uppercase tracking-wider text-fuchsia-800 flex items-center gap-1">
                      ⚡ Severe Online PD
                    </span>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-fuchsia-200/90 text-fuchsia-900">
                      ${pdDetails.amplitude > 0 ? pdDetails.amplitude + ' pC' : 'Active Defect'}
                    </span>
                  </div>
                  <div class="text-[11px] font-bold text-fuchsia-900 mt-0.5 truncate">
                    ${escapeHtml(pdDetails.defectType)}
                  </div>
                </div>
              ` : ''}

              <div class="mt-2.5 text-[10px] text-gray-500 border-t border-gray-100 pt-2 flex justify-between items-center">
                <span class="truncate max-w-[130px] font-medium">${escapeHtml(asset.city || '')}</span>
                <span class="text-purple-700 hover:text-purple-900 font-bold uppercase tracking-wider cursor-pointer">Open Details &rarr;</span>
              </div>
            </div>
          `;
        } else {
          // Multiple assets at this coordinate
          popupContent = `
            <div class="p-3 font-sans text-xs text-gray-800 leading-tight min-w-[290px] max-w-[340px]">
              <!-- Location Header -->
              <div class="border-b border-gray-100 pb-2 mb-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-bold text-gray-900 text-sm truncate">
                    📍 ${escapeHtml(group.substationName || group.city || 'Asset Location')}
                  </span>
                  <div class="flex items-center gap-1">
                    ${group.hasSeverePd ? `
                      <span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">
                        ⚡ ${group.severePdCount} SEVERE PD
                      </span>
                    ` : ''}
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                      ${group.assets.length} ASSETS
                    </span>
                  </div>
                </div>
                <div class="text-[10px] text-gray-400 font-mono mt-0.5 flex items-center justify-between">
                  <span>GPS: ${group.lat.toFixed(5)}, ${group.lng.toFixed(5)}</span>
                  <span class="font-semibold text-gray-600 truncate max-w-[120px]">${escapeHtml(group.city || '')}</span>
                </div>
              </div>

              <!-- Asset Selection Header -->
              <div class="text-[11px] font-medium text-gray-500 mb-1.5 flex items-center justify-between">
                <span>Select asset at this location:</span>
                <span class="text-[10px] text-purple-700 font-semibold">Click to open</span>
              </div>

              <!-- Scrollable Asset List -->
              <div class="max-h-[220px] overflow-y-auto space-y-1.5 pr-1" style="scrollbar-width: thin;">
                ${group.assets.map((asset, idx) => {
                  const assetPd = getAssetSeverePd(asset);
                  return `
                    <div 
                      class="asset-select-row p-2 rounded-lg border ${assetPd.isSevere ? 'border-fuchsia-300 bg-fuchsia-50/40 hover:bg-fuchsia-100/60' : 'border-gray-200 bg-white hover:border-purple-400 hover:bg-purple-50/70'} transition-all cursor-pointer shadow-2xs flex flex-col gap-1"
                      data-asset-index="${idx}"
                    >
                      <div class="flex items-center justify-between gap-1">
                        <span class="font-mono font-bold text-gray-900 text-[11px] truncate">
                          ${escapeHtml(asset.equipmentId || asset.peaNumber || 'Asset #' + (idx + 1))}
                        </span>
                        <div class="flex items-center gap-1">
                          ${assetPd.isSevere ? `
                            <span class="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase bg-fuchsia-600 text-white shadow-2xs">
                              ⚡ ${escapeHtml(assetPd.defectType)}
                            </span>
                          ` : ''}
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                            asset.healthStatus === 'Red' ? 'bg-red-100 text-red-700' :
                            asset.healthStatus === 'Orange' ? 'bg-orange-100 text-orange-700' :
                            asset.healthStatus === 'Yellow' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-emerald-100 text-emerald-700'
                          }">
                            ${asset.healthStatus || 'Green'} (${asset.healthScore ?? 100}%)
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center justify-between text-[10px] text-gray-500">
                        <span class="truncate max-w-[170px]">${escapeHtml(asset.equipmentType || 'Cable')} • ${escapeHtml(asset.voltageLevel || '22')} kV</span>
                        <span class="text-purple-700 font-bold hover:underline">Select &rarr;</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        marker.bindPopup(popupContent, {
          closeButton: false,
          minWidth: isMultiple ? 290 : 240,
          className: 'custom-leaflet-popup cursor-pointer'
        });

        // Open popup on hover
        marker.on('mouseover', function () {
          this.openPopup();
        });

        // Click marker logic
        marker.on('click', () => {
          if (!isMultiple && onSelectAsset) {
            onSelectAsset(group.assets[0]);
          } else {
            marker.openPopup();
          }
        });

        // Popup interactive selection
        marker.on('popupopen', () => {
          const popupEl = marker.getPopup()?.getElement();
          if (!popupEl) return;

          if (!isMultiple) {
            popupEl.onclick = () => {
              if (onSelectAsset) {
                onSelectAsset(group.assets[0]);
              }
            };
          } else {
            const rows = popupEl.querySelectorAll('.asset-select-row');
            rows.forEach(row => {
              const idxStr = row.getAttribute('data-asset-index');
              const idx = idxStr !== null ? parseInt(idxStr, 10) : -1;
              const targetAsset = group.assets[idx];
              if (targetAsset) {
                (row as HTMLElement).onclick = (e) => {
                  e.stopPropagation();
                  if (onSelectAsset) {
                    onSelectAsset(targetAsset);
                  }
                };
              }
            });
          }
        });

        markerGroup.addLayer(marker);
        bounds.push([group.lat, group.lng]);
      });
    } else {
      validAssets.forEach(a => {
        bounds.push([a.gps.lat, a.gps.lng]);
      });
    }

    // Fit map bounds to encompass visible assets
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
    }
  }, [assets, viewMode, heatmapMode, heatRadius, heatBlur, heatOpacity, onSelectAsset, selectedMarkerCategory]);

  // Statistics calculation for the badge
  const validGpsAssets = assets.filter(a => {
    if (!a || !a.gps) return false;
    const lat = typeof a.gps.lat === 'number' ? a.gps.lat : parseFloat(a.gps.lat as any);
    const lng = typeof a.gps.lng === 'number' ? a.gps.lng : parseFloat(a.gps.lng as any);
    return !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
  });
  const validGpsCount = validGpsAssets.length;
  const uniqueCoordinatesCount = new Set(
    validGpsAssets.map(a => {
      const lat = typeof a.gps.lat === 'number' ? a.gps.lat : parseFloat(a.gps.lat as any);
      const lng = typeof a.gps.lng === 'number' ? a.gps.lng : parseFloat(a.gps.lng as any);
      return `${lat.toFixed(5)},${lng.toFixed(5)}`;
    })
  ).size;

  const redCount = assets.filter(a => a.healthStatus === 'Red').length;
  const orangeCount = assets.filter(a => a.healthStatus === 'Orange').length;
  const criticalCount = redCount + orangeCount;
  const severePdCount = assets.filter(a => getAssetSeverePd(a).isSevere).length;
  const healthyCount = assets.filter(a => a.healthStatus === 'Green' || !a.healthStatus).length;
  const warningCount = assets.filter(a => a.healthStatus === 'Yellow').length;

  const handleLegendClick = (category: MarkerFilterCategory) => {
    setSelectedMarkerCategory(prev => (prev === category ? 'all' : category));
  };

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-gray-200/80 shadow-xs bg-slate-50 flex flex-col">
      {/* Top Map Interactive Controls Bar */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-2 max-w-[calc(100%-80px)]">
        {/* View Mode Pill Switcher */}
        <div className="bg-white/95 backdrop-blur-md px-1.5 py-1 rounded-xl shadow-md border border-gray-200/90 flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('hybrid')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'hybrid'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
            title="Show both heatmap density overlay and individual asset pins"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Hybrid</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('heatmap')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'heatmap'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
            title="Show density heatmap only without pin clutter"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Heatmap Only</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('markers')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'markers'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
            title="Show standard pin markers only"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Markers Only</span>
          </button>
        </div>

        {/* Heatmap Health & Severe PD Filter Mode (Visible when heatmap is active) */}
        {viewMode !== 'markers' && (
          <div className="bg-white/95 backdrop-blur-md px-1.5 py-1 rounded-xl shadow-md border border-gray-200/90 flex items-center gap-1 text-xs animate-fadeIn">
            <span className="text-[10px] font-bold text-gray-400 uppercase px-1.5 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-500" />
              Density:
            </span>

            <button
              type="button"
              onClick={() => setHeatmapMode('all')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-all cursor-pointer ${
                heatmapMode === 'all'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              title="Overall health-risk density: Red & Orange highlighted with highest glow intensity"
            >
              All (Risk Weighted)
            </button>

            <button
              type="button"
              onClick={() => setHeatmapMode('critical')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                heatmapMode === 'critical'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-red-700 hover:bg-red-50'
              }`}
              title="Highlight critical condition (Red & Orange) emergency hazard clusters"
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Critical ({criticalCount})</span>
            </button>

            {/* Severe Online PD Filter Mode Button */}
            <button
              type="button"
              onClick={() => setHeatmapMode('severe_pd')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                heatmapMode === 'severe_pd'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-purple-700 hover:bg-purple-50'
              }`}
              title="Highlight severe online partial discharge hotspots: Internal PD, Surface PD, Void, Floating PD"
            >
              <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
              <span>Severe PD ({severePdCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setHeatmapMode('warning')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                heatmapMode === 'warning'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
              title="Highlight warning / monitor condition (Yellow & Orange) clusters"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Warning ({warningCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setHeatmapMode('healthy')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                heatmapMode === 'healthy'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
              title="Highlight healthy condition (Green) equipment distribution"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Healthy ({healthyCount})</span>
            </button>

            {/* Slider Settings Button */}
            <button
              type="button"
              onClick={() => setShowControls(!showControls)}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                showControls
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="Tune Heatmap Radius & Blur"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Heatmap Parameter Tuning Floating Dropdown */}
      {showControls && viewMode !== 'markers' && (
        <div className="absolute top-16 left-3 z-[1000] bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-gray-200 w-72 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 uppercase">
              <Sliders className="w-3.5 h-3.5 text-purple-700" />
              Heatmap Intensity Tuning
            </span>
            <button
              type="button"
              onClick={() => setShowControls(false)}
              className="text-gray-400 hover:text-gray-600 text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-600 font-medium">Dispersion Radius:</span>
                <span className="font-mono font-bold text-purple-700">{heatRadius}px</span>
              </div>
              <input
                type="range"
                min="15"
                max="55"
                step="5"
                value={heatRadius}
                onChange={e => setHeatRadius(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-700"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-600 font-medium">Blur Smoothness:</span>
                <span className="font-mono font-bold text-purple-700">{heatBlur}px</span>
              </div>
              <input
                type="range"
                min="10"
                max="40"
                step="5"
                value={heatBlur}
                onChange={e => setHeatBlur(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-700"
              />
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <span className="text-[11px] text-gray-500">Preset:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setHeatRadius(20); setHeatBlur(15); }}
                  className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-700"
                >
                  Sharp Focus
                </button>
                <button
                  type="button"
                  onClick={() => { setHeatRadius(30); setHeatBlur(20); }}
                  className="px-2 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-[10px] font-bold text-purple-800"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => { setHeatRadius(45); setHeatBlur(30); }}
                  className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-700"
                >
                  Wide Glow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[480px] z-1" />

      {/* Bottom Floating Legend & Health Status Density Bar */}
      <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-gray-200/90 z-[1000] text-[11px] space-y-2.5 max-w-md">
        <div className="flex items-center justify-between border-b border-gray-100 pb-1.5 gap-2">
          <span className="font-bold text-gray-900 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            {viewMode === 'markers' ? 'Marker Health & PD Legend' : (
              heatmapMode === 'critical' ? 'Critical Hazard Density' :
              heatmapMode === 'severe_pd' ? 'Severe Online PD Density' :
              heatmapMode === 'warning' ? 'Monitoring Density' :
              heatmapMode === 'healthy' ? 'Healthy Assets Density' :
              'Health-Risk Density Heatmap'
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 font-mono">
              {validGpsCount} Assets ({uniqueCoordinatesCount} Locs)
            </span>
            {selectedMarkerCategory !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedMarkerCategory('all')}
                className="px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                title="Reset marker isolation"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Heatmap Density Spectrum Bar (shown when heatmap is enabled) */}
        {viewMode !== 'markers' && (
          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500">
              <span>Low Density</span>
              <span>Moderate</span>
              <span className="font-bold text-gray-800">High Density Hotspot</span>
            </div>
            {/* Dynamic CSS Gradient Bar matching active mode */}
            <div 
              className="w-full h-2.5 rounded-full border border-gray-200 shadow-2xs"
              style={{
                background: heatmapMode === 'critical'
                  ? 'linear-gradient(to right, #fed7aa, #fb923c, #ef4444, #991b1b)'
                  : heatmapMode === 'severe_pd'
                  ? 'linear-gradient(to right, #f3e8ff, #c084fc, #a855f7, #d946ef, #dc2626)'
                  : heatmapMode === 'warning'
                  ? 'linear-gradient(to right, #fef08a, #facc15, #f59e0b, #d97706)'
                  : heatmapMode === 'healthy'
                  ? 'linear-gradient(to right, #bbf7d0, #4ade80, #10b981, #064e3b)'
                  : 'linear-gradient(to right, #34d399 15%, #60a5fa 35%, #facc15 55%, #f97316 75%, #ef4444 100%)'
              }}
            />
          </div>
        )}

        {/* Heatmap Density Mode Filter Buttons in Legend (shown when viewMode === 'heatmap') */}
        {viewMode === 'heatmap' && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center justify-between">
              <span>Select Heatmap Density Filter:</span>
              <span className="text-purple-700 font-semibold">{
                heatmapMode === 'all' ? 'All Assets' :
                heatmapMode === 'critical' ? 'Critical Hazards' :
                heatmapMode === 'severe_pd' ? 'Severe PD Hotspots' :
                heatmapMode === 'warning' ? 'Monitoring' : 'Healthy'
              }</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              {/* All Risk-Weighted */}
              <button
                type="button"
                onClick={() => setHeatmapMode('all')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer col-span-2 ${
                  heatmapMode === 'all'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-300 font-bold'
                    : 'bg-amber-50/60 hover:bg-amber-100 text-amber-950 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Flame className="w-3.5 h-3.5" />
                  <span className="truncate">All Density (Risk-Weighted)</span>
                </div>
                <span className="font-bold font-mono shrink-0">({validGpsCount})</span>
              </button>

              {/* Severe Online PD */}
              <button
                type="button"
                onClick={() => setHeatmapMode('severe_pd')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer col-span-2 ${
                  heatmapMode === 'severe_pd'
                    ? 'bg-purple-900 text-white border-purple-900 shadow-xs ring-2 ring-purple-400 font-bold'
                    : 'bg-purple-50/70 hover:bg-purple-100 text-purple-950 border-purple-200'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
                  <span className="truncate">⚡ Severe Online PD Hotspots</span>
                </div>
                <span className="font-bold font-mono shrink-0">({severePdCount})</span>
              </button>

              {/* Critical Hazards */}
              <button
                type="button"
                onClick={() => setHeatmapMode('critical')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                  heatmapMode === 'critical'
                    ? 'bg-red-600 text-white border-red-700 shadow-xs ring-2 ring-red-300 font-bold'
                    : 'bg-red-50/60 hover:bg-red-100 text-red-900 border-red-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <ShieldAlert className="w-3 h-3 text-red-500 shrink-0" />
                  <span className="truncate">Critical Hotspots</span>
                </div>
                <span className="font-bold font-mono shrink-0">({criticalCount})</span>
              </button>

              {/* Warning / Monitoring */}
              <button
                type="button"
                onClick={() => setHeatmapMode('warning')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                  heatmapMode === 'warning'
                    ? 'bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-300 font-bold'
                    : 'bg-yellow-50/60 hover:bg-yellow-100 text-yellow-900 border-yellow-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="truncate">Warning Clusters</span>
                </div>
                <span className="font-bold font-mono shrink-0">({warningCount})</span>
              </button>

              {/* Healthy */}
              <button
                type="button"
                onClick={() => setHeatmapMode('healthy')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer col-span-2 ${
                  heatmapMode === 'healthy'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300 font-bold'
                    : 'bg-emerald-50/60 hover:bg-emerald-100 text-emerald-900 border-emerald-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="truncate">Healthy Assets Distribution</span>
                </div>
                <span className="font-bold font-mono shrink-0">({healthyCount})</span>
              </button>
            </div>

            <div className="text-[9.5px] text-gray-500 italic text-center pt-0.5">
              💡 Click any category above to re-render heatmap density for that subset
            </div>
          </div>
        )}

        {/* Individual Status Markers & Severe PD Selectable Legend (shown in Hybrid or Markers mode) */}
        {viewMode !== 'heatmap' && (
          <div className="space-y-2 pt-0.5">
            {/* Active isolation alert banner if a marker type is isolated */}
            {selectedMarkerCategory !== 'all' && (
              <div className="px-2 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 text-[10.5px] flex items-center justify-between gap-1">
                <span className="flex items-center gap-1 font-semibold truncate">
                  <Filter className="w-3 h-3 text-purple-700 shrink-0" />
                  Showing only: <b>{
                    selectedMarkerCategory === 'severe_pd' ? '⚡ Severe Online PD' :
                    selectedMarkerCategory === 'Red' ? 'Critical (Red)' :
                    selectedMarkerCategory === 'Orange' ? 'Alert (Orange)' :
                    selectedMarkerCategory === 'Yellow' ? 'Monitor (Yellow)' :
                    'Healthy (Green)'
                  }</b>
                </span>
                <span className="text-[9.5px] text-gray-500 italic shrink-0">Others in gray</span>
              </div>
            )}

            {/* Severe Online PD Selectable Chip / Button (Thunder Symbol) */}
            <button
              type="button"
              onClick={() => handleLegendClick('severe_pd')}
              className={`w-full p-1.5 rounded-xl border transition-all text-left flex items-center justify-between gap-2 cursor-pointer ${
                selectedMarkerCategory === 'severe_pd'
                  ? 'bg-purple-900 text-white border-purple-900 shadow-md ring-2 ring-purple-400'
                  : 'bg-purple-50/70 hover:bg-purple-100 text-purple-950 border-purple-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="relative w-6 h-6 rounded-full bg-linear-to-br from-purple-800 to-amber-500 border border-white flex items-center justify-center shrink-0 shadow-xs">
                  <Zap className={`w-3.5 h-3.5 ${selectedMarkerCategory === 'severe_pd' ? 'fill-yellow-300 text-yellow-300' : 'fill-yellow-300 text-yellow-400'}`} />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-[11px] leading-tight flex items-center gap-1">
                    Severe Online PD (⚡ Thunder)
                  </span>
                  <span className={`text-[9.5px] leading-tight ${selectedMarkerCategory === 'severe_pd' ? 'text-purple-200' : 'text-purple-700'}`}>
                    Internal, Surface, Void, Floating
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  selectedMarkerCategory === 'severe_pd'
                    ? 'bg-yellow-400 text-purple-950'
                    : 'bg-purple-200/90 text-purple-950'
                }`}>
                  {severePdCount}
                </span>
              </div>
            </button>

            {/* Health Status Selectable Buttons Grid */}
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              {/* Red: Critical */}
              <button
                type="button"
                onClick={() => handleLegendClick('Red')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                  selectedMarkerCategory === 'Red'
                    ? 'bg-red-600 text-white border-red-700 shadow-xs ring-2 ring-red-300 font-bold'
                    : selectedMarkerCategory !== 'all'
                    ? 'bg-gray-50/70 opacity-60 hover:opacity-100 text-gray-700 border-gray-200'
                    : 'bg-red-50/60 hover:bg-red-100 text-red-900 border-red-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-700 shrink-0" />
                  <span className="truncate">Red: Critical</span>
                </div>
                <span className="font-bold font-mono shrink-0">({redCount})</span>
              </button>

              {/* Orange: Alert */}
              <button
                type="button"
                onClick={() => handleLegendClick('Orange')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                  selectedMarkerCategory === 'Orange'
                    ? 'bg-orange-600 text-white border-orange-700 shadow-xs ring-2 ring-orange-300 font-bold'
                    : selectedMarkerCategory !== 'all'
                    ? 'bg-gray-50/70 opacity-60 hover:opacity-100 text-gray-700 border-gray-200'
                    : 'bg-orange-50/60 hover:bg-orange-100 text-orange-900 border-orange-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-500 border border-orange-700 shrink-0" />
                  <span className="truncate">Orange: Alert</span>
                </div>
                <span className="font-bold font-mono shrink-0">({orangeCount})</span>
              </button>

              {/* Yellow: Monitor */}
              <button
                type="button"
                onClick={() => handleLegendClick('Yellow')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                  selectedMarkerCategory === 'Yellow'
                    ? 'bg-yellow-500 text-white border-yellow-600 shadow-xs ring-2 ring-yellow-200 font-bold'
                    : selectedMarkerCategory !== 'all'
                    ? 'bg-gray-50/70 opacity-60 hover:opacity-100 text-gray-700 border-gray-200'
                    : 'bg-yellow-50/60 hover:bg-yellow-100 text-yellow-900 border-yellow-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 border border-yellow-600 shrink-0" />
                  <span className="truncate">Yellow: Monitor</span>
                </div>
                <span className="font-bold font-mono shrink-0">({warningCount})</span>
              </button>

              {/* Green: Healthy */}
              <button
                type="button"
                onClick={() => handleLegendClick('Green')}
                className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                  selectedMarkerCategory === 'Green'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300 font-bold'
                    : selectedMarkerCategory !== 'all'
                    ? 'bg-gray-50/70 opacity-60 hover:opacity-100 text-gray-700 border-gray-200'
                    : 'bg-emerald-50/60 hover:bg-emerald-100 text-emerald-900 border-emerald-200 font-medium'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-700 shrink-0" />
                  <span className="truncate">Green: Healthy</span>
                </div>
                <span className="font-bold font-mono shrink-0">({healthyCount})</span>
              </button>
            </div>

            <div className="text-[9.5px] text-gray-500 italic text-center pt-0.5">
              💡 Click any legend item to isolate markers (other types will be grayed out)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CableAsset } from '../types';
import { Globe, Flag, Layers } from 'lucide-react';

interface WorldMapChartProps {
  assets: CableAsset[];
}

// Geographical centroids for countries of origin
const COUNTRY_COORDINATES: Record<string, { lat: number; lng: number; code: string }> = {
  'Thailand': { lat: 15.8700, lng: 100.9925, code: 'TH' },
  'China': { lat: 35.8617, lng: 104.1954, code: 'CN' },
  'Germany': { lat: 51.1657, lng: 10.4515, code: 'DE' },
  'United States': { lat: 37.0902, lng: -95.7129, code: 'US' },
  'United State of America': { lat: 37.0902, lng: -95.7129, code: 'US' },
  'Switzerland': { lat: 46.8182, lng: 8.2275, code: 'CH' },
  'Russia': { lat: 61.5240, lng: 105.3188, code: 'RU' },
  'Sweden': { lat: 60.1282, lng: 18.6435, code: 'SE' },
  'Denmark': { lat: 56.2639, lng: 9.5018, code: 'DK' },
  'India': { lat: 20.5937, lng: 78.9629, code: 'IN' },
  'France': { lat: 46.2276, lng: 2.2137, code: 'FR' },
  'United Kingdom': { lat: 55.3781, lng: -3.4360, code: 'GB' },
  'Japan': { lat: 36.2048, lng: 138.2529, code: 'JP' },
  'South Korea': { lat: 35.9078, lng: 127.7669, code: 'KR' },
  'Italy': { lat: 41.8719, lng: 12.5674, code: 'IT' },
  'Austria': { lat: 47.5162, lng: 14.5501, code: 'AT' },
  'Spain': { lat: 40.4637, lng: -3.7492, code: 'ES' },
  'Canada': { lat: 56.1304, lng: -106.3468, code: 'CA' },
  'Australia': { lat: -25.2744, lng: 133.7751, code: 'AU' },
  'Singapore': { lat: 1.3521, lng: 103.8198, code: 'SG' },
  'Malaysia': { lat: 4.2105, lng: 101.9758, code: 'MY' },
  'Vietnam': { lat: 14.0583, lng: 108.2772, code: 'VN' },
  'Indonesia': { lat: -0.7893, lng: 113.9213, code: 'ID' },
  'Taiwan': { lat: 23.6978, lng: 120.9605, code: 'TW' },
  'Turkey': { lat: 38.9637, lng: 35.2433, code: 'TR' },
  'Netherlands': { lat: 52.1326, lng: 5.2913, code: 'NL' },
  'Belgium': { lat: 50.5039, lng: 4.4699, code: 'BE' },
  'Poland': { lat: 51.9194, lng: 19.1451, code: 'PL' },
  'Czech Republic': { lat: 49.8175, lng: 15.4730, code: 'CZ' },
  'Mexico': { lat: 23.6345, lng: -102.5528, code: 'MX' },
  'Brazil': { lat: -14.2350, lng: -51.9253, code: 'BR' },
  'Argentina': { lat: -38.4161, lng: -63.6167, code: 'AR' },
  'Egypt': { lat: 26.8206, lng: 30.8025, code: 'EG' },
  'South Africa': { lat: -30.5595, lng: 22.9375, code: 'ZA' },
  'Israel': { lat: 31.0461, lng: 34.8516, code: 'IL' },
  'Saudi Arabia': { lat: 23.8859, lng: 45.0792, code: 'SA' },
  'United Arab Emirates': { lat: 23.4241, lng: 53.8478, code: 'AE' },
  'Philippines': { lat: 12.8797, lng: 121.7740, code: 'PH' },
  'New Zealand': { lat: -40.9006, lng: 174.8860, code: 'NZ' },
  'Norway': { lat: 60.4720, lng: 8.4689, code: 'NO' },
  'Finland': { lat: 61.9241, lng: 25.7482, code: 'FI' },
  'Portugal': { lat: 39.3999, lng: -8.2245, code: 'PT' },
  'Greece': { lat: 39.0742, lng: 21.8243, code: 'GR' },
  'Hungary': { lat: 47.1625, lng: 19.5033, code: 'HU' },
  'Romania': { lat: 45.9432, lng: 24.9668, code: 'RO' },
  'Ukraine': { lat: 48.3794, lng: 31.1656, code: 'UA' },
  'Ireland': { lat: 53.4129, lng: -8.2439, code: 'IE' },
  'Chile': { lat: -35.6751, lng: -71.5430, code: 'CL' },
  'Colombia': { lat: 4.5709, lng: -74.2973, code: 'CO' },
  'Peru': { lat: -9.1900, lng: -75.0152, code: 'PE' },
  'Pakistan': { lat: 30.3753, lng: 69.3451, code: 'PK' },
  'Bangladesh': { lat: 23.6850, lng: 90.3563, code: 'BD' },
  'Sri Lanka': { lat: 7.8731, lng: 80.7718, code: 'LK' }
};

export default function WorldMapChart({ assets }: WorldMapChartProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Group assets by Country of Origin
  const countryStats = useMemo(() => {
    const stats: Record<string, { count: number; eqTypes: Record<string, number> }> = {};
    let totalWithCountry = 0;

    assets.forEach(asset => {
      const country = asset.country || 'Unknown';
      if (!stats[country]) {
        stats[country] = { count: 0, eqTypes: {} };
      }
      stats[country].count++;
      totalWithCountry++;

      const eqType = asset.equipmentType || 'Other';
      stats[country].eqTypes[eqType] = (stats[country].eqTypes[eqType] || 0) + 1;
    });

    const list = Object.entries(stats).map(([country, data]) => ({
      country,
      count: data.count,
      percentage: totalWithCountry > 0 ? Math.round((data.count / totalWithCountry) * 100) : 0,
      eqTypes: data.eqTypes
    })).sort((a, b) => b.count - a.count);

    return { list, total: totalWithCountry };
  }, [assets]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        preferCanvas: true,
        center: [20, 10],
        zoom: 2,
        minZoom: 1,
        maxZoom: 6,
        zoomControl: true,
        attributionControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
      }).addTo(mapRef.current);

      layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Markers when assets change
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;

    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const maxCount = Math.max(...countryStats.list.map(c => c.count), 1);

    countryStats.list.forEach(item => {
      const coords = COUNTRY_COORDINATES[item.country];
      if (!coords) return; // Skip countries without valid lat/lng coordinates (e.g. "Others")

      // Scale marker radius: 6px to 24px
      const radius = Math.max(6, Math.min(26, 6 + Math.sqrt(item.count / maxCount) * 18));

      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius,
        fillColor: '#7e22ce', // Deep Purple
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.75
      });

      // Top 3 equipment types summary
      const topEqTypes = Object.entries(item.eqTypes)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([type, count]) => `${type}: ${count}`)
        .join('<br/>');

      marker.bindPopup(`
        <div style="font-family: sans-serif; padding: 4px; min-width: 170px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f3e8ff; padding-bottom: 5px; margin-bottom: 6px;">
            <div style="display: flex; items-center: center; gap: 6px;">
              <img src="https://flagcdn.com/w40/${coords.code.toLowerCase()}.png" alt="${item.country}" style="width: 20px; height: 14px; object-fit: cover; border-radius: 2px; border: 1px solid #e5e7eb;" />
              <strong style="color: #581c87; font-size: 13px;">${item.country}</strong>
            </div>
            <span style="background-color: #f3e8ff; color: #6b21a8; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${coords.code}</span>
          </div>
          <div style="font-size: 11px; color: #374151; margin-bottom: 6px;">
            Total Assets: <strong style="color: #7e22ce;">${item.count}</strong> (${item.percentage}%)
          </div>
          ${topEqTypes ? `
            <div style="font-size: 10px; color: #6b7280; border-top: 1px dashed #e5e7eb; padding-top: 4px; margin-top: 4px;">
              <strong style="color: #4b5563;">Equipment Types:</strong><br/>
              ${topEqTypes}
            </div>
          ` : ''}
        </div>
      `);

      layerGroup.addLayer(marker);
    });
  }, [countryStats]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 space-y-4" id="world-map-chart-card">
      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Country of Origin Global Map</h3>
            <p className="text-[11px] text-gray-400">Distribution of equipment manufacturers across global countries of origin</p>
          </div>
        </div>
        <span className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
          {countryStats.list.length} Countries Identified ({countryStats.total} Assets)
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Leaflet World Map Container */}
        <div className="lg:col-span-2 relative bg-gray-50 rounded-xl overflow-hidden border border-gray-100 h-[320px] shadow-inner">
          <div ref={mapContainerRef} className="w-full h-full z-0" />
          <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-[10px] text-gray-600 font-medium z-[1000] flex items-center gap-2 shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-700 inline-block"></span>
            <span>Marker size represents asset volume per country</span>
          </div>
        </div>

        {/* Country Breakdown List */}
        <div className="flex flex-col h-[320px]">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Origin Ranking & Share</span>
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
            {countryStats.list.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                No matching country data available.
              </div>
            ) : (
              countryStats.list.map((item, idx) => {
                const maxCount = Math.max(...countryStats.list.map(c => c.count), 1);
                const barWidth = Math.round((item.count / maxCount) * 100);
                const coords = COUNTRY_COORDINATES[item.country];

                return (
                  <div key={item.country} className="space-y-1 bg-gray-50/60 p-2 rounded-lg border border-gray-100/80 hover:bg-purple-50/40 transition-colors">
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100/60 px-1.5 py-0.5 rounded-md shrink-0">
                          #{idx + 1}
                        </span>
                        {coords ? (
                          <img 
                            src={`https://flagcdn.com/w40/${coords.code.toLowerCase()}.png`} 
                            alt={item.country} 
                            className="w-5 h-3.5 object-cover rounded-xs border border-gray-200 shrink-0 shadow-2xs" 
                          />
                        ) : (
                          <Flag className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        )}
                        <span className="truncate max-w-[120px] font-bold text-gray-800">{item.country}</span>
                      </div>
                      <span className="font-bold text-gray-900 shrink-0">
                        {item.count} <span className="text-[10px] font-normal text-gray-400">({item.percentage}%)</span>
                      </span>
                    </div>

                    <div className="w-full bg-gray-200/70 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-purple-700 h-full rounded-full transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  QrCode, 
  MapPin, 
  Camera, 
  Compass, 
  CheckCircle, 
  RotateCw, 
  ShieldCheck, 
  ChevronRight,
  Database,
  Plus
} from 'lucide-react';
import { ParcelRecord } from '../../types/anagu';

interface Props {
  parcels: ParcelRecord[];
  onEmitMqtt: (topic: any, payload: any) => void;
}

export const ScreenMobileFieldApp: React.FC<Props> = ({ parcels, onEmitMqtt }) => {
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(3);
  const [activeTab, setActiveTab] = useState<'survey' | 'verify' | 'queue'>('survey');
  const [gpsLocked, setGpsLocked] = useState<boolean>(true);
  const [currentLat, setCurrentLat] = useState<number>(9.0825);
  const [currentLng, setCurrentLng] = useState<number>(7.4915);
  const [beaconName, setBeaconName] = useState<string>('PB-FIELD-09');
  const [capturedBeacons, setCapturedBeacons] = useState<any[]>([
    { name: 'PB-FIELD-01', lat: 9.0820, lng: 7.4910, acc: '±0.4m', time: '10:14:02' },
    { name: 'PB-FIELD-02', lat: 9.0835, lng: 7.4925, acc: '±0.3m', time: '10:22:18' },
    { name: 'PB-FIELD-03', lat: 9.0828, lng: 7.4942, acc: '±0.4m', time: '10:35:45' }
  ]);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [scannedResult, setScannedResult] = useState<ParcelRecord | null>(parcels[0]);

  const handleCaptureBeacon = () => {
    const nextIdx = capturedBeacons.length + 1;
    const newBeacon = {
      name: `PB-FIELD-0${nextIdx}`,
      lat: Number((currentLat + (Math.random() * 0.001 - 0.0005)).toFixed(5)),
      lng: Number((currentLng + (Math.random() * 0.001 - 0.0005)).toFixed(5)),
      acc: '±0.4m',
      time: new Date().toLocaleTimeString()
    };
    setCapturedBeacons([...capturedBeacons, newBeacon]);
    if (!isOnline) {
      setOfflineQueueCount(prev => prev + 1);
    }
  };

  const handleToggleNetwork = () => {
    const nextState = !isOnline;
    setIsOnline(nextState);
    if (nextState && offlineQueueCount > 0) {
      // Reconnect and flush buffer
      setSyncing(true);
      setTimeout(() => {
        setSyncing(false);
        setOfflineQueueCount(0);
        onEmitMqtt('land/registration/status', {
          device: 'MOBILE_FIELD_EXPO_01',
          event: 'OFFLINE_BUFFER_FLUSHED',
          syncedCount: offlineQueueCount,
          timestamp: new Date().toISOString()
        });
      }, 1200);
    }
  };

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      {/* Smartphone Device Mockup (iPhone Frame 390px x 844px) */}
      <div className="w-[380px] h-[780px] bg-slate-900 rounded-[48px] border-4 border-slate-700 shadow-2xl flex flex-col overflow-hidden relative ring-1 ring-slate-600/50">
        {/* Dynamic Island / Notch */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-40 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-800 ml-auto mr-2" />
        </div>

        {/* Mobile Status Bar */}
        <div className="pt-3 px-6 pb-2 flex items-center justify-between text-[11px] font-mono text-slate-400 z-30 shrink-0">
          <span>09:41</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleToggleNetwork}
              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                isOnline ? 'text-emerald-400 bg-emerald-950/60' : 'text-amber-400 bg-amber-950/60'
              }`}
              title="Click to toggle Network Online/Offline"
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? '4G Connected' : 'Offline Mode'}</span>
            </button>
            <div className="w-4 h-2 border border-slate-400 rounded-xs p-0.5">
              <div className="w-full h-full bg-slate-300 rounded-2xs" />
            </div>
          </div>
        </div>

        {/* App Bar */}
        <div className="px-5 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              A
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-tight">Anagu Field Surveyor</div>
              <div className="text-[10px] text-slate-400">React Native / Expo Client</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('survey')}
              className={`px-2 py-1 text-[11px] font-medium rounded ${
                activeTab === 'survey' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              Survey
            </button>
            <button
              onClick={() => setActiveTab('verify')}
              className={`px-2 py-1 text-[11px] font-medium rounded ${
                activeTab === 'verify' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              Scan QR
            </button>
          </div>
        </div>

        {/* Mobile Screen Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'survey' && (
            <>
              {/* Offline buffer alert banner */}
              <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                isOnline 
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' 
                  : 'bg-amber-950/40 border-amber-700/60 text-amber-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  <span className="text-[11px]">
                    {isOnline 
                      ? 'Local SQLite synced with backend' 
                      : `${offlineQueueCount} submissions buffered locally`}
                  </span>
                </div>
                {syncing && (
                  <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                )}
              </div>

              {/* GNSS GPS Fix Card */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-emerald-400" />
                    GNSS Satellite Lock
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    RTK FIX (18 Sats)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-xs text-slate-200">
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 font-sans">Latitude</div>
                    <div className="text-emerald-400 font-bold">{currentLat.toFixed(5)}° N</div>
                  </div>
                  <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 font-sans">Longitude</div>
                    <div className="text-emerald-400 font-bold">{currentLng.toFixed(5)}° E</div>
                  </div>
                </div>

                <button
                  onClick={handleCaptureBeacon}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Log Beacon at Current Coordinates
                </button>
              </div>

              {/* Captured Beacons list */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                  <span className="font-semibold text-slate-300">Logged Boundary Beacons</span>
                  <span className="font-mono text-[10px] text-slate-400">{capturedBeacons.length} Points</span>
                </div>

                <div className="space-y-1.5 font-mono text-xs">
                  {capturedBeacons.map((b, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg text-[11px] text-slate-300 border border-slate-800/40">
                      <span className="font-bold text-emerald-400">{b.name}</span>
                      <span className="text-slate-400">{b.lat}, {b.lng}</span>
                      <span className="text-slate-500">{b.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'verify' && scannedResult && (
            <div className="space-y-4">
              {/* QR Scanner Simulation */}
              <div className="relative h-44 bg-black rounded-2xl border border-slate-800 overflow-hidden flex flex-col items-center justify-center">
                <div className="w-32 h-32 border-2 border-emerald-400 border-dashed rounded-xl flex items-center justify-center relative">
                  <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse" />
                </div>
                <div className="absolute bottom-2 text-[10px] text-slate-400 font-mono">
                  Align Title Deed QR with Camera
                </div>
              </div>

              {/* Verified Title Card */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    Token ID #{scannedResult.tokenId}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified On-Chain
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white">{scannedResult.cadastralRef}</h3>
                  <div className="text-[11px] text-slate-400 mt-0.5">{scannedResult.district}</div>
                </div>

                <div className="p-2.5 bg-slate-900 rounded-lg text-[11px] space-y-1 font-mono">
                  <div className="text-slate-400">Owner: <span className="text-white">{scannedResult.applicantName}</span></div>
                  <div className="text-slate-400">Area: <span className="text-white">{scannedResult.areaSqm} m²</span></div>
                  <div className="text-slate-400 truncate">TxHash: <span className="text-emerald-400">{scannedResult.txHash}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-around text-slate-400 text-[10px] shrink-0">
          <button onClick={() => setActiveTab('survey')} className={`flex flex-col items-center gap-1 ${activeTab === 'survey' ? 'text-emerald-400 font-semibold' : ''}`}>
            <MapPin className="w-4 h-4" />
            <span>Survey</span>
          </button>
          <button onClick={() => setActiveTab('verify')} className={`flex flex-col items-center gap-1 ${activeTab === 'verify' ? 'text-emerald-400 font-semibold' : ''}`}>
            <QrCode className="w-4 h-4" />
            <span>Verify</span>
          </button>
          <button onClick={handleToggleNetwork} className="flex flex-col items-center gap-1 text-slate-400 hover:text-white">
            <Wifi className="w-4 h-4" />
            <span>Network</span>
          </button>
        </div>
      </div>
    </div>
  );
};

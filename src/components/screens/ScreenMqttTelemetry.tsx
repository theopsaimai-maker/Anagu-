import React, { useState } from 'react';
import { 
  Radio, 
  Wifi, 
  Layers, 
  Send, 
  Activity, 
  Clock, 
  Database, 
  Sliders, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { MqttMessage } from '../../types/anagu';

interface Props {
  messages: MqttMessage[];
  onSendMessage: (topic: any, payload: any, qos: 1 | 2) => void;
}

export const ScreenMqttTelemetry: React.FC<Props> = ({ messages, onSendMessage }) => {
  const [networkCondition, setNetworkCondition] = useState<'normal' | 'moderate' | 'severe' | 'offline'>('normal');
  const [testTopic, setTestTopic] = useState<MqttMessage['topic']>('land/registration/status');
  const [testPayloadStr, setTestPayloadStr] = useState<string>('{\n  "applicationId": "PAR-2026-0902",\n  "status": "spatial_verified",\n  "timestamp": "2026-09-24T10:14:00Z"\n}');
  const [qosLevel, setQosLevel] = useState<1 | 2>(1);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  const handlePublish = () => {
    setIsPublishing(true);
    setTimeout(() => {
      try {
        const parsed = JSON.parse(testPayloadStr);
        onSendMessage(testTopic, parsed, qosLevel);
      } catch (err) {
        onSendMessage(testTopic, { raw: testPayloadStr }, qosLevel);
      }
      setIsPublishing(false);
    }, networkCondition === 'severe' ? 500 : networkCondition === 'moderate' ? 200 : 45);
  };

  const conditionProfiles = {
    normal: { latency: '42ms', loss: '0.0%', rate: '100.0%', desc: 'Fiber / High-speed 4G' },
    moderate: { latency: '210ms', loss: '9.8%', rate: '98.6%', desc: 'tc qdisc: 200ms delay, 10% loss' },
    severe: { latency: '540ms', loss: '24.6%', rate: '94.2%', desc: 'tc qdisc: 500ms delay, 25% loss' },
    offline: { latency: '∞', loss: '100%', rate: 'Local Queue', desc: 'SQLite device buffer active' },
  };

  return (
    <div className="w-full h-full bg-slate-900 text-slate-100 flex flex-col overflow-y-auto">
      {/* Top Header */}
      <div className="bg-slate-950 border-b border-slate-800 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center font-bold text-lg">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Mosquitto MQTT Event Bus & Telemetry Broker
              <span className="text-xs font-mono font-normal text-cyan-400">Port 1883 · TCP/WebSocket</span>
            </div>
            <div className="text-xs text-slate-400">
              Component 3B: Real-time Multi-Client Synchronisation & Degraded Network Buffer
            </div>
          </div>
        </div>

        {/* Network Degradation Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Network Profile:</span>
          {(['normal', 'moderate', 'severe', 'offline'] as const).map((cond) => (
            <button
              key={cond}
              onClick={() => setNetworkCondition(cond)}
              className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-lg transition-colors ${
                networkCondition === cond 
                  ? 'bg-cyan-600 text-white shadow-xs' 
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cond.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Network Degradation Benchmarking Status */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-xs">Simulated Latency</div>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
              {conditionProfiles[networkCondition].latency}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{conditionProfiles[networkCondition].desc}</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-xs">Simulated Packet Loss</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">
              {conditionProfiles[networkCondition].loss}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Kernel Netem Injection</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-xs">Delivery Rate</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
              {conditionProfiles[networkCondition].rate}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">QoS 1/2 Retransmission</div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-xs">Active Subscribed Nodes</div>
            <div className="text-xl font-bold font-mono text-white mt-1">
              24 Clients
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">NestJS, Web, Mobile, Besu Oracle</div>
          </div>
        </div>

        {/* Live MQTT Event Feed & Publisher */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Live Event Stream (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3 flex flex-col min-h-[440px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-semibold uppercase tracking-wider">
                <Activity className="w-4 h-4 text-cyan-400" />
                Live Subscribed Message Stream
              </div>
              <span className="text-[11px] font-mono text-slate-400">Total Events: {messages.length}</span>
            </div>

            <div className="space-y-2.5 overflow-y-auto flex-1 font-mono text-xs">
              {messages.map((msg) => (
                <div key={msg.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-400 font-bold">{msg.topic}</span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500">QoS {msg.qos}</span>
                      <span className="text-slate-400">{msg.timestamp}</span>
                      <span className="text-emerald-400 font-bold">{msg.deliveryLatencyMs}ms</span>
                    </div>
                  </div>
                  <pre className="text-slate-300 bg-slate-950 p-2 rounded text-[11px] overflow-x-auto">
                    {JSON.stringify(msg.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Topic Schema & Message Publisher (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Publisher Box */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                <span className="text-slate-300 font-semibold uppercase tracking-wider">Publish Transaction Event</span>
                <span className="text-[11px] font-mono text-cyan-400">Mosquitto Client</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Target Topic</label>
                  <select 
                    value={testTopic}
                    onChange={(e) => setTestTopic(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg font-mono text-cyan-300 text-xs focus:outline-cyan-500"
                  >
                    <option value="land/registration/status">land/registration/status</option>
                    <option value="land/title/issued">land/title/issued</option>
                    <option value="land/title/revoked">land/title/revoked</option>
                    <option value="land/verification/oracle">land/verification/oracle</option>
                    <option value="land/notification/titleholder">land/notification/titleholder</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-slate-400">Quality of Service:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQosLevel(1)}
                      className={`px-3 py-1 rounded text-xs font-mono font-semibold ${
                        qosLevel === 1 ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      QoS 1 (At least once)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQosLevel(2)}
                      className={`px-3 py-1 rounded text-xs font-mono font-semibold ${
                        qosLevel === 2 ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      QoS 2 (Exactly once)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">JSON Payload</label>
                  <textarea 
                    rows={4}
                    value={testPayloadStr}
                    onChange={(e) => setTestPayloadStr(e.target.value)}
                    className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg font-mono text-xs text-slate-200 focus:outline-cyan-500"
                  />
                </div>

                <button
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Publish to Broker ({conditionProfiles[networkCondition].latency})
                </button>
              </div>
            </div>

            {/* Official Schema Table Card */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-sm space-y-3">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider pb-2 border-b border-slate-800">
                Specification: MQTT Topic Schema
              </div>

              <div className="space-y-2 text-[11px] font-mono text-slate-400">
                <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                  <div className="text-cyan-400 font-bold">land/registration/status (QoS 1)</div>
                  <div>Fields: applicationId, status, timestamp</div>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                  <div className="text-emerald-400 font-bold">land/title/issued (QoS 1)</div>
                  <div>Fields: tokenId, ownerId, parcelId, txHash</div>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800/80">
                  <div className="text-red-400 font-bold">land/title/revoked (QoS 2)</div>
                  <div>Fields: tokenId, ground, revokedBy, timestamp</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

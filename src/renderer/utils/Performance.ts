import type { PluginRendererFacade } from '../../utils/sceneHelpers';

type PerfRecord = { label: string; duration: number; timestamp: number };

export type PerfStopHandler = () => void;

function pushPerfRecord(plugin: PluginRendererFacade, record: PerfRecord): void {
    const host = plugin as unknown as { _perfMeasurements?: PerfRecord[] };
    if (!host._perfMeasurements) {
        host._perfMeasurements = [];
    }
    host._perfMeasurements.push(record);
    if (host._perfMeasurements.length > 200) {
        host._perfMeasurements.shift();
    }
}

export function startPerfSegment(plugin: PluginRendererFacade, label: string): PerfStopHandler {
    const canMeasure = typeof performance !== 'undefined' && typeof performance.now === 'function';
    const start = canMeasure ? performance.now() : Date.now();
    return () => {
        const end = canMeasure ? performance.now() : Date.now();
        const duration = end - start;
        const record: PerfRecord = { label, duration, timestamp: Date.now() };
        pushPerfRecord(plugin, record);
    };
}

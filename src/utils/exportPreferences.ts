export interface ExportPreferences {
  outputPath: string;
  filenameEditorMode: 'simple' | 'advanced';
  filenameTemplate: 'default' | 'timestamp' | 'unix' | 'custom';
  customFilename: string;
  simpleCustomFilename: string;
  advancedCustomFilename: string;
  exportQuality: 'fast' | 'balance' | 'high';
  exportHardware: 'auto' | 'gpu' | 'cpu';
  exportParallelSegments: boolean;
  exportFormat: 'mp4' | 'mov-alpha' | 'webm-alpha';
  exportLogEnabled: boolean;
}

export const DEFAULT_EXPORT_PREFERENCES: ExportPreferences = {
  outputPath: '',
  filenameEditorMode: 'simple',
  filenameTemplate: 'default',
  customFilename: '',
  simpleCustomFilename: '',
  advancedCustomFilename: '',
  exportQuality: 'balance',
  exportHardware: 'auto',
  exportParallelSegments: false,
  exportFormat: 'mp4',
  exportLogEnabled: true,
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Machine preferences take precedence; the old project fields migrate on the first load. */
export function readExportPreferences(config: unknown): ExportPreferences {
  const legacy = record(config);
  const ui = record(legacy.ui);
  const saved = record(ui.exportPreferences);
  const source = { ...legacy, ...saved };
  const customFilename = typeof source.customFilename === 'string' ? source.customFilename : '';
  const filenameTemplate = source.filenameTemplate === 'timestamp' || source.filenameTemplate === 'unix'
    || source.filenameTemplate === 'custom' ? source.filenameTemplate : 'default';
  const mode = saved.filenameEditorMode ?? ui.exportFilenameEditorMode;
  const filenameEditorMode = mode === 'advanced' || (mode !== 'simple'
    && filenameTemplate === 'custom' && /\{\$[A-Za-z0-9-]+\}/.test(customFilename)) ? 'advanced' : 'simple';
  return {
    outputPath: typeof saved.outputPath === 'string' ? saved.outputPath : '',
    filenameEditorMode,
    filenameTemplate,
    customFilename,
    simpleCustomFilename: typeof saved.simpleCustomFilename === 'string'
      ? saved.simpleCustomFilename : filenameEditorMode === 'simple' ? customFilename : '',
    advancedCustomFilename: typeof saved.advancedCustomFilename === 'string'
      ? saved.advancedCustomFilename : filenameEditorMode === 'advanced' ? customFilename : '',
    exportQuality: source.exportQuality === 'fast' || source.exportQuality === 'high' ? source.exportQuality : 'balance',
    exportHardware: source.exportHardware === 'gpu' || source.exportHardware === 'cpu' ? source.exportHardware : 'auto',
    exportParallelSegments: source.exportParallelSegments === true,
    exportFormat: source.exportFormat === 'mov-alpha' || source.exportFormat === 'webm-alpha' ? source.exportFormat : 'mp4',
    exportLogEnabled: typeof source.exportLogEnabled === 'boolean' ? source.exportLogEnabled : true,
  };
}

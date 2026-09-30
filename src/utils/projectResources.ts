export function isProjectAssetResource(resource: { id: string }): boolean {
  // Font presets are machine-wide preferences, not portable project assets.
  // They still participate in font inspection and global remote caching.
  return !resource.id.startsWith('ui.fontPresets.');
}

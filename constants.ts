import { Home, FolderOpen, Wrench, User } from 'lucide-react';

export const APP_NAME = "CamScannerX";

export const NAV_ITEMS = [
  { id: 'HOME', label: 'Home', icon: Home },
  { id: 'FILES', label: 'Files', icon: FolderOpen },
  { id: 'TOOLS', label: 'Tools', icon: Wrench },
  { id: 'SETTINGS', label: 'Me', icon: User },
];

export const FILTERS = [
  { id: 'original', label: 'Original' },
  { id: 'grayscale', label: 'Gray' },
  { id: 'bw', label: 'B&W' },
  { id: 'magic', label: 'Auto' },
];
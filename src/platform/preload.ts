// Preload bridge: exposes the typed API from shared/api.ts as window.tome.

import { contextBridge, ipcRenderer } from 'electron';
import type { PowerEvent, TomeApi } from '../shared/api';

// Channel names are inlined (not imported) so the sandboxed preload stays a single file.
const api: TomeApi = {
  bootstrap: () => ipcRenderer.invoke('tome:bootstrap'),
  scanLibrary: () => ipcRenderer.invoke('tome:scanLibrary'),
  setBookMeta: (id, meta, stages) => ipcRenderer.invoke('tome:setBookMeta', id, meta, stages),
  saveThumb: (id, data) => ipcRenderer.invoke('tome:saveThumb', id, data),
  saveReadingState: (s) => ipcRenderer.invoke('tome:saveReadingState', s),
  markOpened: (id) => ipcRenderer.invoke('tome:markOpened', id),
  addBookmark: (b) => ipcRenderer.invoke('tome:addBookmark', b),
  removeBookmark: (id) => ipcRenderer.invoke('tome:removeBookmark', id),
  saveSession: (s) => ipcRenderer.invoke('tome:saveSession', s),
  setSettings: (patch) => ipcRenderer.invoke('tome:setSettings', patch),
  listDir: (path) => ipcRenderer.invoke('tome:listDir', path),
  quit: () => ipcRenderer.invoke('tome:quit'),
  onPower: (cb) => {
    const listener = (_e: unknown, ev: PowerEvent) => cb(ev);
    ipcRenderer.on('tome:power', listener);
    return () => ipcRenderer.removeListener('tome:power', listener);
  },
};

contextBridge.exposeInMainWorld('tome', api);

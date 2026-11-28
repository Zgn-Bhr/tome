// Preload bridge: exposes the typed API from shared/api.ts as window.tome.

import { contextBridge, ipcRenderer } from 'electron';
import type { PowerEvent, TomeApi, UpdateState } from '../shared/api';

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
  pageProgress: (id) => ipcRenderer.invoke('tome:pageProgress', id),
  recordGame: (batch) => ipcRenderer.invoke('tome:recordGame', batch),
  saveCollection: (c) => ipcRenderer.invoke('tome:saveCollection', c),
  deleteCollection: (id) => ipcRenderer.invoke('tome:deleteCollection', id),
  setSettings: (patch) => ipcRenderer.invoke('tome:setSettings', patch),
  listDir: (path) => ipcRenderer.invoke('tome:listDir', path),
  quit: () => ipcRenderer.invoke('tome:quit'),
  onPower: (cb) => {
    const listener = (_e: unknown, ev: PowerEvent) => cb(ev);
    ipcRenderer.on('tome:power', listener);
    return () => ipcRenderer.removeListener('tome:power', listener);
  },
  updateState: () => ipcRenderer.invoke('tome:updateState'),
  checkForUpdates: () => ipcRenderer.invoke('tome:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('tome:downloadUpdate'),
  restartToUpdate: () => ipcRenderer.invoke('tome:restartToUpdate'),
  onUpdate: (cb) => {
    const listener = (_e: unknown, s: UpdateState) => cb(s);
    ipcRenderer.on('tome:update', listener);
    return () => ipcRenderer.removeListener('tome:update', listener);
  },
};

contextBridge.exposeInMainWorld('tome', api);

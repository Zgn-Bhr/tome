import type { TomeApi } from '../shared/api';

declare global {
  interface Window {
    tome: TomeApi;
  }
}

export const api: TomeApi = window.tome;

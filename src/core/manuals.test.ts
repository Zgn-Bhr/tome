import { describe, expect, it } from 'vitest';
import { gameManual, isMediaSystemDir, manualTitle, systemName } from './manuals';

describe('game manuals (ES-DE)', () => {
  it('recognises manuals in the usual ES-DE media folders', () => {
    expect(gameManual('/run/media/deck/SD/Emulation/tools/downloaded_media/snes/manuals/Super Mario World (USA).pdf')).toEqual({ system: 'snes' });
    expect(gameManual('/home/deck/ES-DE/downloaded_media/psx/manuals/Final Fantasy VII (USA) (Disc 1).pdf')).toEqual({ system: 'psx' });
    expect(gameManual('/home/deck/retrodeck/downloaded_media/MegaDrive/Manuals/Sonic.pdf')).toEqual({ system: 'megadrive' });
    // Subfolders mirror the ROM folders.
    expect(gameManual('/home/deck/ES-DE/downloaded_media/psx/manuals/Final Fantasy VII/FF7.pdf')).toEqual({ system: 'psx' });
    expect(gameManual('D:\\ES-DE\\downloaded_media\\n64\\manuals\\Mario Kart 64.pdf')).toEqual({ system: 'n64' });
  });

  it('leaves other PDFs alone', () => {
    expect(gameManual('/home/deck/Documents/manuals/Dishwasher.pdf')).toBeUndefined();
    expect(gameManual('/home/deck/ES-DE/downloaded_media/snes/covers/Super Mario World.pdf')).toBeUndefined();
    expect(gameManual('/home/deck/ES-DE/downloaded_media/manuals.pdf')).toBeUndefined();
    expect(gameManual('/home/deck/Documents/Origin of Species.pdf')).toBeUndefined();
  });

  it('knows which folders are system folders inside the media folder', () => {
    expect(isMediaSystemDir('/home/deck/ES-DE/downloaded_media/snes')).toBe(true);
    expect(isMediaSystemDir('/home/deck/ES-DE/downloaded_media/snes/')).toBe(true);
    expect(isMediaSystemDir('/home/deck/ES-DE/downloaded_media')).toBe(false);
    expect(isMediaSystemDir('/home/deck/ES-DE/downloaded_media/snes/manuals')).toBe(false);
  });

  it('turns ROM file names into titles', () => {
    expect(manualTitle('/m/snes/manuals/Super Mario World (USA).pdf')).toBe('Super Mario World');
    expect(manualTitle('/m/snes/manuals/Legend of Zelda, The - A Link to the Past (USA) [!].pdf')).toBe('The Legend of Zelda - A Link to the Past');
    expect(manualTitle('/m/gb/manuals/Pokemon - Red Version (USA, Europe) (SGB Enhanced).pdf')).toBe('Pokemon - Red Version');
    expect(manualTitle('/m/psx/manuals/Final_Fantasy_VII.pdf')).toBe('Final Fantasy VII');
    expect(manualTitle('/m/snes/manuals/(USA).pdf')).toBe('(USA)');
  });

  it('names systems, falling back to the folder name', () => {
    expect(systemName('snes')).toBe('Super Nintendo');
    expect(systemName('PSX')).toBe('PlayStation');
    expect(systemName('pico8')).toBe('PICO8');
  });
});

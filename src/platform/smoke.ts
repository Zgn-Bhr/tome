// Development-only UI driver: TOME_SMOKE=steps.json runs a scripted sequence
// of key presses and screenshots against the real window (spec §14 UI shots).
//
// { "out": "/abs/dir", "steps": [ {"wait": 800}, {"shot": "home"}, {"key": "Right"},
//   {"down": "c"}, {"wait": 400}, {"up": "c"}, {"waitFor": "<js expression>"} ] }

import { app, type BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Step =
  | { wait: number }
  | { shot: string }
  | { key: string; hold?: number }
  | { down: string }
  | { up: string }
  | { waitFor: string; timeout?: number }
  | { eval: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSmoke(win: BrowserWindow, file: string): Promise<void> {
  const spec = JSON.parse(readFileSync(file, 'utf8')) as { out: string; steps: Step[]; quit?: boolean };
  mkdirSync(spec.out, { recursive: true });
  const wc = win.webContents;
  const log: string[] = [];
  for (const [i, step] of spec.steps.entries()) {
    try {
      if ('wait' in step) await sleep(step.wait);
      else if ('shot' in step) {
        const img = await wc.capturePage();
        writeFileSync(join(spec.out, `${step.shot}.png`), img.toPNG());
        log.push(`shot ${step.shot}`);
      } else if ('key' in step) {
        wc.sendInputEvent({ type: 'keyDown', keyCode: step.key });
        await sleep(step.hold ?? 60);
        wc.sendInputEvent({ type: 'keyUp', keyCode: step.key });
        await sleep(40);
      } else if ('down' in step) wc.sendInputEvent({ type: 'keyDown', keyCode: step.down });
      else if ('up' in step) wc.sendInputEvent({ type: 'keyUp', keyCode: step.up });
      else if ('waitFor' in step) {
        const until = Date.now() + (step.timeout ?? 10_000);
        let ok = false;
        while (Date.now() < until) {
          if (await wc.executeJavaScript(`Boolean(${step.waitFor})`)) {
            ok = true;
            break;
          }
          await sleep(100);
        }
        log.push(`waitFor ${ok ? 'ok' : 'TIMEOUT'}: ${step.waitFor}`);
      } else if ('eval' in step) {
        log.push(`eval ${step.eval} = ${JSON.stringify(await wc.executeJavaScript(step.eval))}`);
      }
    } catch (e) {
      log.push(`step ${i} failed: ${String(e)}`);
    }
  }
  writeFileSync(join(spec.out, 'smoke-log.txt'), log.join('\n') + '\n');
  if (spec.quit !== false) app.quit();
}

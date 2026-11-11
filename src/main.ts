import './ui/styles.css';
import { ALL_CARDS } from './engine/cards';
import { setVolumes, unlockAudio } from './game/audio';
import { cloudInit } from './game/cloud';
import { P } from './game/profile';
import { animCfg, runTicks } from './render/anim';
import { voxelGeometry } from './render/mesh';
import { Stage } from './render/stage';
import { setStage } from './ui/app';
import { cardArt } from './ui/cardview';
import { $ } from './ui/dom';
import { titleScreen } from './ui/screens';

function webglOk() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}

async function boot() {
  if (!webglOk()) {
    $('#boot').innerHTML = '<div class="boot-text" style="max-width:420px">Stackbound needs WebGL 2. Try a current version of Chrome, Edge, Firefox or Safari.</div>';
    return;
  }
  animCfg.speed = P.settings.speed;
  animCfg.reduceMotion = P.settings.reduceMotion;
  setVolumes(P.settings.sfx, P.settings.music);
  const stage = new Stage($('#stage'));
  stage.setQuality(P.settings.quality);
  setStage(stage);
  await document.fonts?.ready.catch(() => {});
  titleScreen();
  setTimeout(() => $('#boot').classList.add('gone'), 250);
  setTimeout(() => $('#boot').remove(), 1000);
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  cloudInit();
  // warm the card art + meshes in idle time so the collection and first battle open instantly
  const ids = ALL_CARDS.map(c => c.id);
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(cb) : setTimeout(cb, 30));
  const step = () => {
    const id = ids.shift();
    if (!id) return;
    cardArt(id);
    voxelGeometry(id);
    idle(step);
  };
  idle(step);
}
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).SBturbo = (on = true) => {
  const w = window as unknown as { __turbo?: number };
  if (w.__turbo) clearInterval(w.__turbo);
  w.__turbo = on ? window.setInterval(() => runTicks(0.1), 10) : 0;
};
boot();

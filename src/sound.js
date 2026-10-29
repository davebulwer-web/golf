// Sound: the strike of each shot, the ball landing, the splash, the drop into
// the cup, applause, and birdsong behind it all, played through Web Audio.
// Browsers keep a page quiet until it's clicked or a key is pressed, so the
// sounds are set up then (unlockSound). The sound button and `V` step the
// volume through loud, quiet and off, remembered in the browser.

import { SOUND_MP3S } from './sound-assets.js';

export const SOUND_LEVELS = [{ name: 'LOUD', gain: 1 }, { name: 'QUIET', gain: 0.35 }, { name: 'OFF', gain: 0 }];
const SOUND_KEY = 'fairway-pixels-sound';
const BIRDSONG = 0.3; // the birdsong sits well under the shots

// How loud each sound is against the others.
const SOUND_MIX = { driver: 0.9, iron: 0.8, chip: 0.7, bunker: 0.8, putt: 0.6, bounce: 0.45, water: 0.7, tree: 0.7, cup: 0.9, flag: 0.7, clap: 0.5, rattle: 0.45, club: 0.5 };

let soundLevel = 0;
try { soundLevel = Math.max(0, SOUND_LEVELS.findIndex((l) => l.name === localStorage.getItem(SOUND_KEY))); } catch { /* no storage: start loud */ }

let audio = null, audioOut = null, birdsGain = null;
const soundBuffers = {};

// Turn a data URL into the bytes the audio decoder wants.
function dataBytes(url) {
  const s = atob(url.slice(url.indexOf(',') + 1)), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b.buffer;
}

// Called on every click and key press: the first sets the sounds up.
export function unlockSound() {
  if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audio = new Ctx();
  audioOut = audio.createGain();
  audioOut.gain.value = SOUND_LEVELS[soundLevel].gain;
  audioOut.connect(audio.destination);
  for (const [name, url] of Object.entries(SOUND_MP3S)) {
    audio.decodeAudioData(dataBytes(url), (buf) => {
      soundBuffers[name] = buf;
      if (name === 'birdsong') startBirdsong(buf);
    }, () => {});
  }
}

function startBirdsong(buf) {
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  birdsGain = audio.createGain();
  birdsGain.gain.value = BIRDSONG;
  src.connect(birdsGain).connect(audioOut);
  src.start();
}

// Play one of the takes of a sound ('driver' picks driver1, driver2...), at
// `volume` (0 to 1) after `delay` seconds.
export function playSound(kind, volume = 1, delay = 0) {
  if (!audio || audio.state !== 'running' || soundLevel === SOUND_LEVELS.length - 1) return;
  const takes = Object.keys(soundBuffers).filter((n) => n.replace(/\d+$/, '') === kind);
  if (!takes.length) return;
  const src = audio.createBufferSource();
  src.buffer = soundBuffers[takes[Math.floor(Math.random() * takes.length)]];
  src.playbackRate.value = 0.95 + Math.random() * 0.1; // no two quite the same
  const g = audio.createGain();
  g.gain.value = Math.max(0, Math.min(1, volume)) * (SOUND_MIX[kind] ?? 0.7);
  src.connect(g).connect(audioOut);
  src.start(audio.currentTime + delay);
}

export const soundLevelName = () => SOUND_LEVELS[soundLevel].name;

// The sound button: loud, quiet, off, and round again.
export function stepSoundLevel() {
  soundLevel = (soundLevel + 1) % SOUND_LEVELS.length;
  try { localStorage.setItem(SOUND_KEY, SOUND_LEVELS[soundLevel].name); } catch { /* not remembered */ }
  if (audioOut) audioOut.gain.setTargetAtTime(SOUND_LEVELS[soundLevel].gain, audio.currentTime, 0.05);
}

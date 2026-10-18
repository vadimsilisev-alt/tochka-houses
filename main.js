import { heroAssets } from './hero-assets.mjs';
import { heroStagePlan } from './hero-stage-plan.mjs';
import { setupApplicationForm } from './application-form.js';

// A fixed public build cannot expose V1 via query. Local comparison stays 1/2.
// Set before measuring the final scene rect so intro travels to either column.
const requestedVersion = new URLSearchParams(location.search).get('version');
const defaultVersion = document.documentElement.dataset.defaultLayoutVersion === '2' ? '2' : '1';
document.documentElement.dataset.layoutVersion = document.documentElement.dataset.fixedLayoutVersion === '2'
  ? '2' : ['1', '2'].includes(requestedVersion) ? requestedVersion : defaultVersion;

const dialog = document.querySelector('#discussion-dialog');
const fallback = document.querySelector('#discussion');
let discussionTrigger = null;
const applicationForm = setupApplicationForm(dialog);

if (typeof dialog.showModal === 'function') {
  fallback.hidden = true;
  document.querySelectorAll('[data-discussion]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      discussionTrigger = trigger;
      applicationForm?.prepareOpen(trigger);
      dialog.showModal();
      document.body.classList.add('dialog-open');
    });
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    if (discussionTrigger?.closest('[inert]')) document.querySelector('.skip-link').focus({ preventScroll: true });
    else discussionTrigger?.focus({ preventScroll: true });
  });
  // Explicit containment also covers browsers that let Tab leave a native modal.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
      .filter((element) => !element.disabled && !element.closest('[hidden]') && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

const controls = document.querySelector('.layer-controls');
const buttons = [...controls.querySelectorAll('button')];
const section = document.querySelector('.hero-scroll');
const stage = document.querySelector('.hero-stage');
const figure = document.querySelector('.house-figure');
const scene = document.querySelector('.house-scene');
const intro = document.querySelector('.hero-intro');
const caption = figure.querySelector('figcaption');
const skipLink = document.querySelector('.skip-link');
const stack = document.querySelector('.scene-stack');
const line = document.querySelector('.scan-line');
const hint = document.querySelector('.scene-hint');
const number = document.querySelector('#state-number');
const title = document.querySelector('#state-title');
const description = document.querySelector('#state-description');
const engineeringNote = document.querySelector('#engineering-note');
const pinnedMedia = matchMedia('(min-width: 1024px) and (min-height: 700px)');
const reducedMedia = matchMedia('(prefers-reduced-motion: reduce)');
const names = heroStagePlan.states.map((state) => state.title);
const descriptions = heroStagePlan.states.map((state) => state.description);
const plateaus = heroStagePlan.states.map((state) => state.plateau);
const transitions = heroStagePlan.transitions;
let layers = [document.querySelector('[data-layer="0"]')];
let ready = false;
let pinned = false;
let selected = 0;
let progress = 0;
let introDistance = 0;
let scanDistance = 0;
let totalDistance = 0;
let finalScene = null;
let headerHeight = 72;
let frame = 0;
let resizeFrame = 0;
const clamp = (value) => Math.max(0, Math.min(1, value));

function showCopy(index) {
  if (index === selected && section.dataset.state !== undefined) return;
  selected = index;
  section.dataset.state = String(index);
  number.textContent = `${String(index + 1).padStart(2, '0')} / ${String(heroAssets.length).padStart(2, '0')}`;
  title.textContent = names[index];
  description.textContent = descriptions[index];
  engineeringNote.hidden = !heroStagePlan.states[index].engineering;
  buttons.forEach((button, position) => button.setAttribute('aria-pressed', String(position === index)));
}

function showStatic(index) {
  layers.slice(1).forEach((layer, position) => {
    layer.style.clipPath = position + 1 === index ? 'inset(0)' : 'inset(0 0 100% 0)';
  });
  line.hidden = true;
  showCopy(index);
}

function paintProgress(value) {
  progress = clamp(value);
  let boundary = null;
  transitions.forEach(([start, end], position) => {
    const q = clamp((progress - start) / (end - start));
    layers[position + 1].style.clipPath = `inset(0 0 ${100 * (1 - q)}% 0)`;
    if (q > 0 && q < 1) boundary = q;
  });
  line.hidden = boundary === null;
  if (boundary !== null) line.style.top = `${boundary * 100}%`;
  const stateIndex = transitions.reduce((index, [start, end], position) =>
    progress >= (start + end) / 2 ? position + 1 : index, 0);
  showCopy(stateIndex);
}

function clearIntroEffects() {
  scene.style.removeProperty('transform');
  scene.style.removeProperty('will-change');
  intro.style.removeProperty('opacity');
  intro.style.removeProperty('transform');
  caption.style.removeProperty('opacity');
  intro.inert = false;
  caption.inert = false;
}

function paintIntro(travel) {
  const t = travel / introDistance;
  const leftU = clamp((t - .60) / .25);
  const leftE = 3 * leftU * leftU - 2 * leftU * leftU * leftU;
  const captionU = clamp((t - .85) / .15);
  const captionE = 3 * captionU * captionU - 2 * captionU * captionU * captionU;
  const u = clamp((travel / introDistance - .10) / .75);
  const e = 3 * u * u - 2 * u * u * u;
  const hiddenActions = e < 1;
  const introInert = t < .85;
  const captionInert = captionE < 1;
  if ((introInert && intro.contains(document.activeElement))
    || (captionInert && caption.contains(document.activeElement))) {
    skipLink.focus({ preventScroll: true });
  }
  intro.inert = introInert;
  caption.inert = captionInert;
  intro.style.opacity = String(leftE);
  caption.style.opacity = String(captionE);
  intro.style.transform = leftE === 1 ? 'none' : `translateY(${12 * (1 - leftE)}px)`;
  scene.style.willChange = hiddenActions ? 'transform' : '';
  if (e === 1) {
    scene.style.transform = 'none';
  } else {
    const scale = finalScene.startScale + (1 - finalScene.startScale) * e;
    scene.style.transform = `translate(${finalScene.dx * (1 - e)}px, ${finalScene.dy * (1 - e)}px) scale(${scale})`;
  }
}

function renderScroll() {
  frame = 0;
  if (!pinned || !ready) return;
  const travel = Math.max(0, Math.min(totalDistance, headerHeight - section.getBoundingClientRect().top));
  paintIntro(travel);
  paintProgress(travel < introDistance ? 0 : (travel - introDistance) / scanDistance);
}

function requestPaint() {
  if (pinned && ready && !frame) frame = requestAnimationFrame(renderScroll);
}

function configureMode(initial = false) {
  if (!ready) return;
  const wasPinned = pinned;
  const previousTravel = headerHeight - section.getBoundingClientRect().top;
  const wasActive = wasPinned && previousTravel >= 0 && previousTravel <= totalDistance;
  const previousPhase = previousTravel < introDistance ? 'intro' : 'scan';
  const phaseProgress = wasPinned ? (previousPhase === 'intro'
    ? clamp(previousTravel / introDistance)
    : clamp((previousTravel - introDistance) / scanDistance)) : 0;
  const oldSceneTop = figure.getBoundingClientRect().top;
  const sceneInView = oldSceneTop < innerHeight && figure.getBoundingClientRect().bottom > headerHeight;
  // All measurements below refer to the existing final grid, not to the large
  // transformed scene. Clearing and repainting happen synchronously in one frame.
  clearIntroEffects();
  headerHeight = document.querySelector('.site-header').getBoundingClientRect().height;
  const height = innerHeight - headerHeight;
  introDistance = height;
  scanDistance = heroStagePlan.scanHeightMultiplier * height;
  totalDistance = introDistance + scanDistance;
  section.style.setProperty('--header-height', `${headerHeight}px`);
  section.style.setProperty('--stage-height', `${height}px`);
  section.style.setProperty('--intro-distance', `${introDistance}px`);
  section.style.setProperty('--scan-distance', `${scanDistance}px`);
  section.style.setProperty('--scroll-distance', `${totalDistance}px`);
  const candidate = pinnedMedia.matches && !reducedMedia.matches;
  section.classList.toggle('is-pinned', candidate);
  // Reserve actual caption/control height; if the real viewport cannot fit it,
  // use the ordinary flow instead of clipping content in a nominal breakpoint.
  const room = height - caption.getBoundingClientRect().height - 48;
  section.style.setProperty('--scene-room', `${Math.max(0, room)}px`);
  const introHeight = intro.getBoundingClientRect().height;
  pinned = candidate && room >= 280 && introHeight <= height - 48;
  section.classList.toggle('is-pinned', pinned);
  section.dataset.mode = pinned ? 'pinned' : 'static';
  hint.textContent = pinned ? 'Прокрутите, чтобы рассмотреть дом' : 'Выберите, что рассмотреть';
  if (pinned) {
    const rect = scene.getBoundingClientRect();
    const stageCorrection = headerHeight - stage.getBoundingClientRect().top;
    finalScene = {
      startScale: Math.min(.96 * innerWidth / rect.width, .94 * height / rect.height),
      dx: innerWidth / 2 - (rect.left + rect.width / 2),
      dy: headerHeight + height / 2 - (rect.top + stageCorrection + rect.height / 2),
    };
    if (wasActive) {
      const sectionTop = section.getBoundingClientRect().top + scrollY;
      const restored = previousPhase === 'intro' ? phaseProgress * introDistance : introDistance + phaseProgress * scanDistance;
      window.scrollTo({ top: sectionTop - headerHeight + restored, behavior: 'instant' });
    } else if (!initial && !wasPinned && sceneInView) {
      const sectionTop = section.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: sectionTop - headerHeight + introDistance + plateaus[selected] * scanDistance, behavior: 'instant' });
    }
    renderScroll();
  } else {
    showStatic(selected);
    if (wasActive && sceneInView) {
      window.scrollTo({ top: scrollY + figure.getBoundingClientRect().top - oldSceneTop, behavior: 'instant' });
    }
  }
}

function requestResize() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    configureMode();
  });
}

function engineeringRoutes() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1391 1131');
  svg.setAttribute('class', 'engineering-routes');
  svg.setAttribute('aria-hidden', 'true');
  // Separate schematic segments on each storey's right service wall. They stop
  // before the floor slab and stay left of the door/stairs; no structural route
  // or penetration is claimed by this UI annotation.
  [
    ['route-olive', 'M 690 226 V 344 L 708 346 M 690 449 V 550 L 708 553'],
    ['route-blue', 'M 701 242 V 335 L 717 338 M 701 464 V 541 L 717 544'],
    ['route-grey', 'M 678 220 L 711 224 V 286 M 678 441 L 711 446 V 509'],
  ].forEach(([className, d]) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', d);
    svg.append(path);
  });
  return svg;
}

async function prepareScene() {
  try {
    if (heroAssets.length !== buttons.length || plateaus.length !== heroAssets.length || transitions.length !== heroAssets.length - 1
      || !buttons.every((button, index) => button.dataset.note === heroStagePlan.states[index].noteId)) {
      throw new Error('Hero manifest, controls and timeline must have the same approved state count');
    }
    const decodedImages = await Promise.all(heroAssets.slice(1).map(async ({ path }) => {
      const image = new Image(1391, 1131);
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.src = `./${path.split('/').at(-1)}`;
      await image.decode();
      if (image.naturalWidth !== 1391 || image.naturalHeight !== 1131) throw new Error(`${path}: unexpected dimensions`);
      return image;
    }));
    await Promise.all([document.querySelector('[data-layer="0"] img').decode(), document.fonts.ready]);
    decodedImages.forEach((image, position) => {
      const layer = document.createElement('div');
      layer.className = 'house-layer';
      layer.dataset.layer = String(position + 1);
      layer.append(image);
      if (heroStagePlan.states[position + 1].engineering) layer.append(engineeringRoutes());
      stack.append(layer);
      layers.push(layer);
    });
    ready = true;
    section.dataset.sceneStatus = 'ready';
    controls.hidden = false;
    hint.hidden = false;
    showCopy(0);
    configureMode(true);
  } catch (error) {
    section.dataset.sceneStatus = 'fallback';
    section.dataset.mode = 'static';
    console.warn('Hero layers unavailable. Keeping master and all descriptions.', error);
  }
}

buttons.forEach((button, index) => {
  button.addEventListener('click', () => {
    if (!ready) return;
    if (pinned) {
      const sectionTop = section.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: sectionTop - headerHeight + introDistance + plateaus[index] * scanDistance, behavior: 'smooth' });
    } else {
      showStatic(index);
    }
  });
});
window.addEventListener('scroll', requestPaint, { passive: true });
window.addEventListener('resize', requestResize, { passive: true });
pinnedMedia.addEventListener('change', requestResize);
reducedMedia.addEventListener('change', requestResize);
prepareScene();

document.querySelectorAll('a[href="#hero-end"], a[href="#main"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link === skipLink && pinned) {
      event.preventDefault();
      const sectionTop = section.getBoundingClientRect().top + scrollY;
      window.scrollTo({ top: sectionTop - headerHeight + introDistance, behavior: 'instant' });
      renderScroll();
      document.querySelector('#hero-title').focus({ preventScroll: true });
    } else {
      document.querySelector(link.getAttribute('href')).focus({ preventScroll: true });
    }
  });
});

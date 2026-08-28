/**
 * ORVO cinematic demo — sequential scene playback
 */
(function () {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/gh/danielmenparan-lang/orvo@main';

  const SCENES = [
    {
      id: 'meeting',
      title: 'The pitch',
      caption: 'Your team needs an AI agent. Where do you start?',
      src: `${CDN}/assets/videos/meeting.mp4`,
    },
    {
      id: 'leave',
      title: 'She has the answer',
      caption: 'Someone on the team already found ORVO.',
      src: `${CDN}/assets/videos/leave.mp4`,
    },
    {
      id: 'guy',
      title: 'Wait — what\'s ORVO?',
      caption: 'Sound familiar? Most teams don\'t know where to find vetted builders.',
      src: `${CDN}/assets/videos/guy.mp4`,
    },
    {
      id: 'phone',
      title: 'Show, don\'t tell',
      caption: 'Post a request. Vetted builders send quotes. Pay securely.',
      src: `${CDN}/assets/videos/phone.mp4`,
      phoneOverlay: true,
    },
    {
      id: 'nods',
      title: 'Everyone\'s in',
      caption: 'One marketplace for AI agents — clients and builders.',
      src: `${CDN}/assets/videos/nods.mp4`,
    },
  ];

  const root = document.getElementById('cinematic-demo');
  if (!root) return;

  const video = document.getElementById('demo-video');
  const titleEl = document.getElementById('demo-scene-title');
  const captionEl = document.getElementById('demo-scene-caption');
  const progressEl = document.getElementById('demo-progress');
  const dotsEl = document.getElementById('demo-dots');
  const phoneFrame = document.getElementById('demo-phone-frame');
  const playBtn = document.getElementById('demo-play');
  const muteBtn = document.getElementById('demo-mute');

  let index = 0;
  let playing = false;

  function setScene(i) {
    index = i;
    const scene = SCENES[i];
    titleEl.textContent = scene.title;
    captionEl.textContent = scene.caption;
    video.src = scene.src;
    video.load();
    phoneFrame.classList.toggle('visible', !!scene.phoneOverlay);
    [...dotsEl.children].forEach((dot, j) => {
      dot.classList.toggle('active', j === i);
      dot.setAttribute('aria-current', j === i ? 'step' : 'false');
    });
    progressEl.style.width = `${((i + 1) / SCENES.length) * 100}%`;
  }

  function nextScene() {
    if (index < SCENES.length - 1) {
      setScene(index + 1);
      if (playing) video.play().catch(() => {});
    } else {
      playing = false;
      playBtn.textContent = 'Replay story';
      playBtn.dataset.state = 'replay';
    }
  }

  SCENES.forEach((scene, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'demo-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', scene.title);
    dot.addEventListener('click', () => {
      setScene(i);
      if (playing) video.play().catch(() => {});
    });
    dotsEl.appendChild(dot);
  });

  video.addEventListener('ended', nextScene);

  playBtn.addEventListener('click', () => {
    if (playBtn.dataset.state === 'replay') {
      setScene(0);
      playBtn.dataset.state = '';
    }
    playing = true;
    playBtn.textContent = 'Playing…';
    video.play().catch(() => {
      playing = false;
      playBtn.textContent = 'Play story';
    });
  });

  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    muteBtn.textContent = video.muted ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-pressed', String(!video.muted));
  });

  setScene(0);
})();

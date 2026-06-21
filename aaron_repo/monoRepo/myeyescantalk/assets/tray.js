// Draw the menu-bar "audio bars" indicator frames (orange, Siri-like) on a
// canvas and hand them to the main process, which animates the Tray icon.
(function () {
  const S = 44; // canvas size (drawn at 2x, resized to 22 in main)
  const N = 4;  // number of bars
  const COLOR = '#FF7A1A';
  const IDLE = '#7A4E2E';

  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBars(heights, color) {
    ctx.clearRect(0, 0, S, S);
    const barW = 5;
    const gap = (S - N * barW) / (N + 1);
    ctx.fillStyle = color;
    for (let i = 0; i < N; i++) {
      const bh = S * 0.18 + heights[i] * S * 0.64;
      const x = gap + i * (barW + gap);
      const y = (S - bh) / 2;
      roundRect(x, y, barW, bh, barW / 2);
      ctx.fill();
    }
  }

  const NF = 10;
  const frames = [];
  for (let f = 0; f < NF; f++) {
    const hs = [];
    for (let i = 0; i < N; i++) {
      hs.push(0.5 + 0.5 * Math.sin((f / NF) * Math.PI * 2 + i * 1.1));
    }
    drawBars(hs, COLOR);
    frames.push(canvas.toDataURL('image/png'));
  }
  drawBars([0.22, 0.3, 0.26, 0.22], IDLE);
  const idle = canvas.toDataURL('image/png');

  if (window.mect && window.mect.trayFrames) window.mect.trayFrames(frames, idle);
})();

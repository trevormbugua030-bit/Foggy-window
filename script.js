(() => {
  const scene = document.querySelector('.view');
  const fog = document.querySelector('.fog');
  const wipeSize = document.querySelector('#wipe-size');
  const wipeSizeValue = document.querySelector('.wipe-size-value');
  const reset = document.querySelector('.reset');
  const cameraToggle = document.querySelector('.camera-toggle');
  const edition = document.querySelector('.edition');
  const instructionCopy = document.querySelector('.instruction-copy');
  const sceneCtx = scene.getContext('2d', { alpha: false });
  const fogCtx = fog.getContext('2d');
  const sceneImage = new Image();
  sceneImage.src = 'assets/city-sunset.png';
  sceneImage.addEventListener('load', () => drawScene());
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let drawing = false;
  let previous = null;
  let droplets = [];
  let wipeWidth = Number(wipeSize.value);
  let cameraStream = null;
  let cameraVideo = null;
  let cameraFrame = 0;
  let lastCameraVideoTime = -1;
  let handLandmarker = null;
  let lastHandVideoTime = -1;
  let trackedHandPoint = null;
  let previousWipePoint = null;
  let handPinching = false;

  function setEditionStatus(message) {
    if (edition.textContent !== message) edition.textContent = message;
  }

  // Draw the local fallback landscape, shown until the visitor opts into their camera.
  function drawScene() {
    const w = width;
    const h = height;
    if (sceneImage.complete && sceneImage.naturalWidth) {
      // Crop the top edge to keep browser overlay controls from the supplied screenshot out of the scene.
      const sourceX = 0;
      const sourceY = Math.round(sceneImage.naturalHeight * .07);
      const sourceWidth = sceneImage.naturalWidth;
      const sourceHeight = sceneImage.naturalHeight - sourceY;
      const scale = Math.max(w / sourceWidth, h / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      sceneCtx.drawImage(sceneImage, sourceX, sourceY, sourceWidth, sourceHeight,
        (w - drawWidth) / 2, (h - drawHeight) / 2, drawWidth, drawHeight);
      return;
    }
    const sky = sceneCtx.createLinearGradient(0, 0, 0, h * .73);
    sky.addColorStop(0, '#81999b');
    sky.addColorStop(.48, '#c6c6b7');
    sky.addColorStop(1, '#e2c9a7');
    sceneCtx.fillStyle = sky;
    sceneCtx.fillRect(0, 0, w, h);

    const glow = sceneCtx.createRadialGradient(w * .72, h * .34, 0, w * .72, h * .34, Math.max(w, h) * .42);
    glow.addColorStop(0, 'rgba(255,232,188,.75)');
    glow.addColorStop(.16, 'rgba(255,225,184,.28)');
    glow.addColorStop(1, 'rgba(255,225,184,0)');
    sceneCtx.fillStyle = glow;
    sceneCtx.fillRect(0, 0, w, h);

    // Distant ridges use broad translucent silhouettes to create atmospheric depth.
    const ridge = (points, color) => {
      sceneCtx.beginPath();
      sceneCtx.moveTo(0, h);
      points.forEach(([x, y]) => sceneCtx.lineTo(w * x, h * y));
      sceneCtx.lineTo(w, h);
      sceneCtx.closePath();
      sceneCtx.fillStyle = color;
      sceneCtx.fill();
    };
    ridge([[0, .48], [.14, .39], [.27, .46], [.4, .34], [.57, .47], [.73, .36], [.88, .44], [1, .38]], 'rgba(102,126,125,.42)');
    ridge([[0, .55], [.13, .47], [.29, .53], [.44, .44], [.59, .52], [.76, .43], [.9, .51], [1, .46]], 'rgba(71,101,99,.57)');

    const horizon = h * .53;
    const lake = sceneCtx.createLinearGradient(0, horizon, 0, h);
    lake.addColorStop(0, '#829a94');
    lake.addColorStop(.4, '#718a85');
    lake.addColorStop(1, '#3e5b59');
    sceneCtx.fillStyle = lake;
    sceneCtx.fillRect(0, horizon, w, h - horizon);

    // Fine, broken horizontal glints suggest a still lake without a stock-photo asset.
    for (let i = 0; i < 46; i++) {
      const y = horizon + (i / 46) * h * .45;
      const center = w * (.7 + Math.sin(i * 1.7) * .035);
      const lineW = w * (.025 + ((i * 13) % 9) * .012);
      sceneCtx.beginPath();
      sceneCtx.moveTo(center - lineW, y);
      sceneCtx.lineTo(center + lineW, y);
      sceneCtx.strokeStyle = `rgba(238,220,183,${.035 + (i % 4) * .012})`;
      sceneCtx.lineWidth = i % 5 === 0 ? 1.5 : 1;
      sceneCtx.stroke();
    }

    // Dark shoreline trees frame the distant view and make the glass feel like a window.
    const tree = (x, base, size, color) => {
      sceneCtx.fillStyle = color;
      sceneCtx.beginPath();
      sceneCtx.moveTo(x, base - size);
      sceneCtx.lineTo(x - size * .31, base - size * .35);
      sceneCtx.lineTo(x - size * .16, base - size * .35);
      sceneCtx.lineTo(x - size * .43, base);
      sceneCtx.lineTo(x + size * .43, base);
      sceneCtx.lineTo(x + size * .17, base - size * .35);
      sceneCtx.lineTo(x + size * .32, base - size * .35);
      sceneCtx.closePath();
      sceneCtx.fill();
      sceneCtx.fillRect(x - size * .035, base - size * .12, size * .07, size * .18);
    };
    for (let i = 0; i < 17; i++) {
      const side = i < 9 ? -1 : 1;
      const n = i < 9 ? i : i - 9;
      const x = side < 0 ? w * (.015 + n * .035) : w * (.98 - n * .035);
      const size = h * (.12 + ((i * 17) % 9) * .021);
      tree(x, horizon + h * (.12 + (i % 4) * .025), size, `rgba(30,54,53,${.42 + (i % 3) * .08})`);
    }
    const foreground = sceneCtx.createLinearGradient(0, h * .72, 0, h);
    foreground.addColorStop(0, 'rgba(28,51,49,0)');
    foreground.addColorStop(1, 'rgba(23,42,41,.48)');
    sceneCtx.fillStyle = foreground;
    sceneCtx.fillRect(0, h * .65, w, h * .35);
  }

  function makeDroplets() {
    // Seeded distribution keeps the fine condensation pattern stable on resize/reset.
    let seed = 8128;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    droplets = [];
    const count = Math.round((width * height) / 4200);
    for (let i = 0; i < count; i++) {
      const radius = .35 + Math.pow(random(), 3) * 2.4;
      droplets.push({ x: random() * width, y: random() * height, radius, stretch: 1 + random() * 2.3, opacity: .10 + random() * .23 });
    }
  }

  function drawFog() {
    const w = width;
    const h = height;
    fogCtx.globalCompositeOperation = 'source-over';
    fogCtx.clearRect(0, 0, w, h);
    const mist = fogCtx.createLinearGradient(0, 0, w, h);
    mist.addColorStop(0, 'rgba(191,204,202,.92)');
    mist.addColorStop(.36, 'rgba(190,204,202,.82)');
    mist.addColorStop(.72, 'rgba(179,196,196,.88)');
    mist.addColorStop(1, 'rgba(167,185,187,.92)');
    fogCtx.fillStyle = mist;
    fogCtx.fillRect(0, 0, w, h);

    // Soft clouds and broad veils add irregular density while keeping the canvas lightweight.
    for (let i = 0; i < 23; i++) {
      const x = (i * 197.3 % w);
      const y = (i * 311.7 % h);
      const radius = Math.max(w, h) * (.07 + (i % 5) * .018);
      const cloud = fogCtx.createRadialGradient(x, y, 0, x, y, radius);
      cloud.addColorStop(0, i % 2 ? 'rgba(246,249,245,.16)' : 'rgba(112,139,143,.10)');
      cloud.addColorStop(1, 'rgba(212,225,223,0)');
      fogCtx.fillStyle = cloud;
      fogCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    // Droplets are painted as tiny convex highlights and shadows directly onto the fog layer.
    for (const drop of droplets) {
      const r = drop.radius;
      fogCtx.beginPath();
      fogCtx.ellipse(drop.x, drop.y, r * .64, r * drop.stretch, 0, 0, Math.PI * 2);
      fogCtx.fillStyle = `rgba(239,248,246,${drop.opacity * .34})`;
      fogCtx.fill();
      fogCtx.beginPath();
      fogCtx.ellipse(drop.x + r * .18, drop.y + r * .25, r * .43, r * drop.stretch * .7, 0, 0, Math.PI * 2);
      fogCtx.fillStyle = `rgba(73,104,110,${drop.opacity * .24})`;
      fogCtx.fill();
      fogCtx.beginPath();
      fogCtx.arc(drop.x - r * .18, drop.y - r * .32, Math.max(.25, r * .14), 0, Math.PI * 2);
      fogCtx.fillStyle = `rgba(255,255,255,${drop.opacity * .7})`;
      fogCtx.fill();
    }
    fogCtx.globalCompositeOperation = 'source-over';
  }

  function resize() {
    const rect = fog.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    for (const canvas of [scene, fog]) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.getContext('2d').setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }
    makeDroplets();
    drawScene();
    drawFog();
  }

  function paintCameraFrame() {
    if (!cameraStream || !cameraVideo || cameraVideo.readyState < 2) return;
    if (cameraVideo.currentTime === lastCameraVideoTime) return;
    lastCameraVideoTime = cameraVideo.currentTime;
    const videoWidth = cameraVideo.videoWidth;
    const videoHeight = cameraVideo.videoHeight;
    if (!videoWidth || !videoHeight) return;

    // Cover-crop the live video into the window and mirror it like a familiar selfie preview.
    const scale = Math.max(width / videoWidth, height / videoHeight);
    const drawWidth = videoWidth * scale;
    const drawHeight = videoHeight * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    sceneCtx.save();
    sceneCtx.translate(width, 0);
    sceneCtx.scale(-1, 1);
    sceneCtx.drawImage(cameraVideo, x, y, drawWidth, drawHeight);
    sceneCtx.restore();

    if (handLandmarker && cameraVideo.currentTime !== lastHandVideoTime) {
      lastHandVideoTime = cameraVideo.currentTime;
      try {
        const result = handLandmarker.detectForVideo(cameraVideo, performance.now());
        updateTrackedHand(result, { x, y, drawWidth, drawHeight });
      } catch {
        try { handLandmarker.close(); } catch { /* The tracker may already be unavailable. */ }
        handLandmarker = null;
        trackedHandPoint = null;
        previousWipePoint = null;
        instructionCopy.textContent = 'Restart hand tracking to try again.';
        setEditionStatus('Tracking paused · restart camera');
      }
    }
  }

  function updateTrackedHand(result, crop) {
    const landmarks = result.landmarks?.[0];
    if (!landmarks) {
      trackedHandPoint = null;
      previousWipePoint = null;
      handPinching = false;
      setEditionStatus('Show one hand to the camera');
      return;
    }

    // Index fingertip follows the mirrored, cover-cropped preview shown in the window.
    const tip = landmarks[8];
    const rawPoint = {
      x: width - (tip.x * crop.drawWidth + crop.x),
      y: tip.y * crop.drawHeight + crop.y,
    };
    // A light exponential average filters camera jitter without making the cursor feel heavy.
    const point = trackedHandPoint
      ? { x: trackedHandPoint.x * .45 + rawPoint.x * .55, y: trackedHandPoint.y * .45 + rawPoint.y * .55 }
      : rawPoint;
    trackedHandPoint = point;

    // Pinching thumb and index finger is the deliberate, contact-free "wipe" gesture.
    const thumb = landmarks[4];
    const wrist = landmarks[0];
    const middleBase = landmarks[9];
    const pinchDistance = Math.hypot(thumb.x - tip.x, thumb.y - tip.y);
    const palmScale = Math.max(.001, Math.hypot(wrist.x - middleBase.x, wrist.y - middleBase.y));
    const pinchRatio = pinchDistance / palmScale;
    // Use separate engage/release values so small landmark changes do not flicker the wipe.
    const pinching = handPinching ? pinchRatio < .43 : pinchRatio < .33;
    handPinching = pinching;
    const distanceFromWrist = (landmark) => Math.hypot(landmark.x - wrist.x, landmark.y - wrist.y);
    const isExtended = (tipIndex, jointIndex) => distanceFromWrist(landmarks[tipIndex]) > distanceFromWrist(landmarks[jointIndex]) * 1.12;
    const pointing = isExtended(8, 6) && !isExtended(12, 10) && !isExtended(16, 14) && !isExtended(20, 18);
    const wiping = pinching || pointing;

    if (wiping) {
      wipe(point.x, point.y, previousWipePoint);
      previousWipePoint = point;
      setEditionStatus('Wiping · move your hand');
    } else {
      previousWipePoint = null;
      setEditionStatus('Point or pinch to wipe');
    }
  }

  async function createHandLandmarker() {
    setEditionStatus('Loading hand tracking');
    instructionCopy.textContent = 'Point with one finger or pinch, then move to wipe.';
    const visionModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs');
    const vision = await visionModule.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm',
    );
    handLandmarker = await visionModule.HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: .55,
      minHandPresenceConfidence: .55,
      minTrackingConfidence: .5,
    });
  }

  function animateCamera() {
    if (!cameraStream) return;
    paintCameraFrame();
    cameraFrame = window.requestAnimationFrame(animateCamera);
  }

  function stopCamera() {
    const stream = cameraStream;
    cameraStream = null;
    if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (handLandmarker) handLandmarker.close();
    handLandmarker = null;
    cameraVideo = null;
    lastCameraVideoTime = -1;
    lastHandVideoTime = -1;
    trackedHandPoint = null;
    previousWipePoint = null;
    handPinching = false;
    instructionCopy.textContent = 'Drag your finger to wipe the fog away.';
    cameraToggle.setAttribute('aria-pressed', 'false');
    cameraToggle.querySelector('span').textContent = 'Enable hand tracking';
    edition.textContent = 'A little quiet, please';
    drawScene();
  }

  async function startCamera() {
    cameraToggle.disabled = true;
    cameraToggle.querySelector('span').textContent = 'Waiting for permission';
    setEditionStatus('Waiting for camera permission');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires localhost or a secure HTTPS page.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user' },
      });
      // If the visitor turned the camera off while permission was pending, release the new stream.
      if (!cameraToggle.isConnected) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStream = stream;
      cameraVideo = document.createElement('video');
      cameraVideo.muted = true;
      cameraVideo.playsInline = true;
      cameraVideo.srcObject = stream;
      await cameraVideo.play();
      await createHandLandmarker();
      cameraToggle.setAttribute('aria-pressed', 'true');
      cameraToggle.querySelector('span').textContent = 'Turn off hand tracking';
      setEditionStatus('Show one hand to the camera');
      animateCamera();
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (!cameraStream) return;
          stopCamera();
          setEditionStatus('Camera ended · tap to restart');
        }, { once: true });
      });
    } catch (error) {
      if (cameraStream) stopCamera();
      const message = error.name === 'NotAllowedError'
        ? 'Allow camera access in your browser'
        : error.name === 'NotFoundError'
          ? 'No camera found'
          : 'Hand tracking failed · check connection';
      setEditionStatus(message);
      cameraToggle.querySelector('span').textContent = 'Try camera again';
    } finally {
      cameraToggle.disabled = false;
    }
  }

  function wipe(x, y, from = null) {
    fogCtx.save();
    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.lineCap = 'round';
    fogCtx.lineJoin = 'round';
    fogCtx.lineWidth = wipeWidth;
    if (from) {
      fogCtx.beginPath();
      fogCtx.moveTo(from.x, from.y);
      fogCtx.lineTo(x, y);
      fogCtx.stroke();
    }
    // A soft radial edge blends the clear stroke into the remaining condensation.
    const radius = fogCtx.lineWidth * .52;
    const edge = fogCtx.createRadialGradient(x, y, radius * .15, x, y, radius);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(.72, 'rgba(0,0,0,.92)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    fogCtx.fillStyle = edge;
    fogCtx.beginPath();
    fogCtx.arc(x, y, radius, 0, Math.PI * 2);
    fogCtx.fill();
    fogCtx.restore();
  }

  fog.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    drawing = true;
    fog.setPointerCapture(event.pointerId);
    const rect = fog.getBoundingClientRect();
    previous = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    wipe(previous.x, previous.y);
    event.preventDefault();
  });
  fog.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const rect = fog.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    wipe(point.x, point.y, previous);
    previous = point;
    event.preventDefault();
  });
  const stopDrawing = () => { drawing = false; previous = null; };
  fog.addEventListener('pointerup', stopDrawing);
  fog.addEventListener('pointercancel', stopDrawing);
  fog.addEventListener('lostpointercapture', stopDrawing);

  // Older touch browsers without Pointer Events use this equivalent single-finger path.
  if (!('PointerEvent' in window)) {
    fog.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      const rect = fog.getBoundingClientRect();
      drawing = true;
      previous = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      wipe(previous.x, previous.y);
      event.preventDefault();
    }, { passive: false });
    fog.addEventListener('touchmove', (event) => {
      if (!drawing) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const rect = fog.getBoundingClientRect();
      const point = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      wipe(point.x, point.y, previous);
      previous = point;
      event.preventDefault();
    }, { passive: false });
    fog.addEventListener('touchend', stopDrawing, { passive: true });
    fog.addEventListener('touchcancel', stopDrawing, { passive: true });
  }

  reset.addEventListener('click', () => { drawFog(); stopDrawing(); });
  wipeSize.addEventListener('input', () => {
    wipeWidth = Number(wipeSize.value);
    wipeSizeValue.value = `${wipeWidth} px`;
    wipeSizeValue.textContent = `${wipeWidth} px`;
  });
  cameraToggle.addEventListener('click', () => {
    if (cameraStream) stopCamera();
    else startCamera();
  });
  window.addEventListener('resize', resize, { passive: true });

  resize();
})();

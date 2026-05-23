(function () {
  "use strict";

  if (typeof Matter === "undefined") {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif">物理引擎加载失败，请用本地服务器打开（见 README），或检查 matter.min.js 是否存在。</p>';
    return;
  }

  const { Engine, World, Bodies, Body, Composite, Events, Collision } = Matter;

  const FRUIT_DEFS = [
    { name: "1级", radius: 22, color: "#e84393", score: 2 },
    { name: "2级", radius: 26, color: "#ff6b6b", score: 4 },
    { name: "3级", radius: 30, color: "#a29bfe", score: 6 },
    { name: "4级", radius: 34, color: "#fdcb6e", score: 8 },
    { name: "5级", radius: 38, color: "#f39c12", score: 10 },
    { name: "6级", radius: 42, color: "#e74c3c", score: 12 },
    { name: "7级", radius: 46, color: "#b2bec3", score: 14 },
    { name: "8级", radius: 50, color: "#fab1a0", score: 16 },
    { name: "9级", radius: 56, color: "#e17055", score: 18 },
    { name: "10级", radius: 64, color: "#55efc4", score: 20 },
    { name: "11级", radius: 74, color: "#00b894", score: 22 },
  ];
  const MANIFEST = window.ASSET_MANIFEST || {};
  const DEFAULT_FRUIT_SRCS =
    MANIFEST.fruits ||
    Array.from({ length: FRUIT_DEFS.length }, (_, i) => "assets/小球图片/level-" + (i + 1) + ".png");

  const DROP_LEVELS = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5];
  const WALL_THICK = 24;
  const DANGER_Y_RATIO = 0.14;
  const DROP_Y = 82;
  const DROP_COOLDOWN = 500;
  /** 合并判定：贴住容差（px），负值表示需嵌入的最小重叠 */
  const MERGE_TOUCH_SLACK = 4;
  const MERGE_MIN_OVERLAP = 2;
  const MAX_REVIVES = 5;
  const BGM_VOLUME = 0.03;
  const MERGE_VOLUME = 0.1;

  let fruitImages = [];
  let mergeSoundPending = false;
  let bgmEl = null;
  let score = 0;
  let bestScore = parseInt(localStorage.getItem("suika_best") || "0", 10);
  let gameOver = false;
  let nextLevel = 0;
  let pendingLevel = null;
  let dropX = 0;
  let canDrop = true;
  let loopRunning = false;
  let animId = null;
  let dangerTimer = 0;
  let mergeQueue = new Set();
  let revivesLeft = MAX_REVIVES;
  let usedQuizIds = new Set();
  let currentQuiz = null;
  let bgmStarted = false;

  let engine, world, canvas, ctx, width, height;
  let wallLeft, wallRight, floor;
  let dangerY = 0;

  const bgLayer = document.getElementById("bg-layer");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best-score");
  const previewCanvas = document.getElementById("preview-canvas");
  const previewCtx = previewCanvas.getContext("2d");

  bestEl.textContent = bestScore;

  function assetUrl(path) {
    if (!path) return "";
    return path.split("/").map((part, i) => (i === 0 ? part : encodeURIComponent(part))).join("/");
  }

  function pickRandom(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** 每次随机选一张背景，铺满整页 */
  function applyRandomBackground() {
    const url = pickRandom(MANIFEST.backgrounds || []);
    if (url) {
      bgLayer.style.backgroundImage = "url(" + JSON.stringify(assetUrl(url)) + ")";
    } else {
      bgLayer.style.backgroundImage = "";
    }
  }

  function initBgm() {
    bgmEl = document.getElementById("bgm-audio");
    if (!bgmEl) return;

    const sources = [MANIFEST.bgm, MANIFEST.bgmFlac].filter(Boolean);
    let idx = 0;

    function loadNext() {
      if (idx >= sources.length) return;
      bgmEl.src = assetUrl(sources[idx++]);
      bgmEl.load();
    }

    function tryPlayMuted() {
      bgmEl.muted = true;
      return bgmEl.play().then(() => {
        bgmStarted = true;
        setTimeout(() => {
          bgmEl.muted = false;
        }, 400);
      }).catch(err => {
        console.warn("静音播放失败:", err);
        return Promise.reject(err);
      });
    }

    function tryPlayNormal() {
      bgmEl.muted = false;
      return bgmEl.play().then(() => {
        bgmStarted = true;
      }).catch(err => {
        console.warn("正常播放失败:", err);
        return Promise.reject(err);
      });
    }

    bgmEl.volume = BGM_VOLUME;
    bgmEl.loop = true;

    loadNext();

    bgmEl.addEventListener("error", () => {
      console.warn("音乐加载出错，尝试下一个源");
      loadNext();
    });

    // 一旦可以播放，立即静音自动播放
    bgmEl.addEventListener("canplaythrough", () => {
      if (!bgmStarted) {
        tryPlayMuted().catch(() => {
          console.log("静音自动播放失败，等待用户交互");
        });
      }
    }, { once: true });

    // 预留降级方案：如果加载完成但还未开始播放
    setTimeout(() => {
      if (!bgmStarted && bgmEl.readyState >= 2) {
        tryPlayMuted().catch(() => {
          console.log("延迟尝试静音播放也失败");
        });
      }
    }, 200);

    // 用户交互时解锁音乐
    const unlock = () => {
      if (bgmStarted && bgmEl.muted) {
        bgmEl.muted = false;
        console.log("用户交互，背景音乐已取消静音");
      } else if (!bgmStarted) {
        tryPlayNormal().catch(() => {
          console.log("用户交互播放也失败");
        });
      }
    };
    ["click", "touchstart", "keydown"].forEach((ev) => {
      document.addEventListener(ev, unlock, { passive: true });
    });
  }

  function playMergeSound() {
    if (!mergeSoundPending) return;
    mergeSoundPending = false;

    const pool = MANIFEST.mergeSounds || [];
    const url = pickRandom(pool);
    if (!url) return;
    const audio = new Audio(assetUrl(url));
    audio.volume = MERGE_VOLUME;
    audio.play().catch(() => {});
  }

  function getFruitSrc(level) {
    return DEFAULT_FRUIT_SRCS[level];
  }

  function loadFruitImages() {
    fruitImages = FRUIT_DEFS.map((_, i) => {
      const img = new Image();
      img.src = getFruitSrc(i);
      return img;
    });
  }

  function randomDropLevel() {
    return DROP_LEVELS[Math.floor(Math.random() * DROP_LEVELS.length)];
  }

  function createFruitBody(level, x, y) {
    const def = FRUIT_DEFS[level];
    const r = def.radius;
    const body = Bodies.circle(x, y, r, {
      restitution: 0.15,
      friction: 0.05,
      frictionAir: 0.01,
      density: 0.002 + level * 0.0004,
      label: "fruit",
      slop: 0.05,
      sleepThreshold: Infinity,
    });
    body.fruitLevel = level;
    body._mergeCooldown = false;
    body.isSleeping = false;
    World.add(world, body);
    return body;
  }

  function drawImageCover(img, r) {
    const size = r * 2;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  }

  function lighten(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    if (Number.isNaN(num)) return hex;
    const r = Math.min(255, ((num >> 16) & 0xff) + percent);
    const g = Math.min(255, ((num >> 8) & 0xff) + percent);
    const b = Math.min(255, (num & 0xff) + percent);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawFruitAt(level, x, y, angle, alpha) {
    const def = FRUIT_DEFS[level];
    const r = def.radius;
    const img = fruitImages[level];

    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);

    if (img && img.complete && img.naturalWidth) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawImageCover(img, r);
    } else {
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
      grad.addColorStop(0, lighten(def.color, 35));
      grad.addColorStop(1, def.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawScene() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(165,156,91,0.2)";
    ctx.fillRect(0, 0, width, height);

    Composite.allBodies(world).forEach((b) => {
      if (b.label === "fruit") {
        drawFruitAt(b.fruitLevel, b.position.x, b.position.y, b.angle, 1);
      }
    });

    if (pendingLevel !== null && canDrop && !gameOver) {
      drawFruitAt(pendingLevel, dropX, DROP_Y, 0, 0.85);
    }

    drawPreview();
  }

  function drawPreview() {
    const def = FRUIT_DEFS[nextLevel];
    const r = Math.min(24, def.radius * 0.55);
    previewCtx.clearRect(0, 0, 56, 56);
    previewCtx.save();
    previewCtx.translate(28, 28);
    const img = fruitImages[nextLevel];
    if (img && img.complete && img.naturalWidth) {
      previewCtx.beginPath();
      previewCtx.arc(0, 0, r, 0, Math.PI * 2);
      previewCtx.clip();
      const size = r * 2;
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      previewCtx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      const grad = previewCtx.createRadialGradient(-6, -6, 0, 0, 0, r);
      grad.addColorStop(0, lighten(def.color, 35));
      grad.addColorStop(1, def.color);
      previewCtx.fillStyle = grad;
      previewCtx.beginPath();
      previewCtx.arc(0, 0, r, 0, Math.PI * 2);
      previewCtx.fill();
    }
    previewCtx.restore();
  }

  function setupPhysics() {
    engine = Engine.create({
      gravity: { x: 0, y: 1 },
      positionIterations: 12,
      velocityIterations: 8,
      enableSleeping: false,
    });
    world = engine.world;

    rebuildWalls();
    Events.on(engine, "collisionStart", onCollisionStart);
    Events.on(engine, "collisionActive", onCollisionActive);
  }

  function rebuildWalls() {
    if (wallLeft) World.remove(world, [wallLeft, wallRight, floor]);

    wallLeft = Bodies.rectangle(
      WALL_THICK / 2,
      height / 2,
      WALL_THICK,
      height * 2,
      { isStatic: true, label: "wall", friction: 0.2 }
    );
    wallRight = Bodies.rectangle(
      width - WALL_THICK / 2,
      height / 2,
      WALL_THICK,
      height * 2,
      { isStatic: true, label: "wall", friction: 0.2 }
    );
    floor = Bodies.rectangle(
      width / 2,
      height + 20,
      width - WALL_THICK * 2,
      40,
      { isStatic: true, label: "floor", friction: 0.6 }
    );

    World.add(world, [wallLeft, wallRight, floor]);
  }

  function pairKey(idA, idB) {
    return idA < idB ? idA + "-" + idB : idB + "-" + idA;
  }

  function fruitRadius(body) {
    return body.circleRadius || FRUIT_DEFS[body.fruitLevel].radius;
  }

  /** 判定可合并：须明显重叠或贴住（避免隔空相消） */
  function shouldMergeContact(a, b) {
    const ra = fruitRadius(a);
    const rb = fruitRadius(b);
    const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
    const touchDist = ra + rb;
    const gap = dist - touchDist;

    if (gap <= -MERGE_MIN_OVERLAP) return true;
    if (gap > MERGE_TOUCH_SLACK) return false;

    const hit = Collision.collides(a, b);
    return hit != null;
  }

  function tryMergePair(a, b) {
    if (a.label !== "fruit" || b.label !== "fruit") return false;
    if (a.id === b.id) return false;
    if (a.fruitLevel !== b.fruitLevel) return false;

    const level = a.fruitLevel;
    if (level >= FRUIT_DEFS.length - 1) return false;

    if (!shouldMergeContact(a, b)) return false;

    const key = pairKey(a.id, b.id);
    if (mergeQueue.has(key)) return false;

    mergeQueue.add(key);
    const ok = mergeFruits(a, b, level);
    mergeQueue.delete(key);
    return ok;
  }

  function onCollisionPair(bodyA, bodyB) {
    tryMergePair(bodyA, bodyB);
  }

  function onCollisionStart(event) {
    for (const pair of event.pairs) {
      onCollisionPair(pair.bodyA, pair.bodyB);
    }
  }

  function onCollisionActive(event) {
    for (const pair of event.pairs) {
      onCollisionPair(pair.bodyA, pair.bodyB);
    }
  }

  /** 每帧扫描可合并对；多轮以处理同帧连锁 */
  function checkMerges() {
    for (let round = 0; round < 4; round++) {
      let merged = false;
      const fruits = Composite.allBodies(world).filter((b) => b.label === "fruit");
      for (let i = 0; i < fruits.length; i++) {
        for (let j = i + 1; j < fruits.length; j++) {
          if (tryMergePair(fruits[i], fruits[j])) merged = true;
        }
      }
      if (!merged) break;
    }
  }

  function mergeFruits(a, b, level) {
    const all = Composite.allBodies(world);
    if (!all.includes(a) || !all.includes(b)) return false;
    if (a.fruitLevel !== b.fruitLevel || a.fruitLevel !== level) return false;

    const mx = (a.position.x + b.position.x) / 2;
    const my = (a.position.y + b.position.y) / 2;
    const newLevel = level + 1;
    const def = FRUIT_DEFS[newLevel];

    World.remove(world, [a, b]);

    const newBody = createFruitBody(newLevel, mx, my);
    Body.setVelocity(newBody, {
      x: (a.velocity.x + b.velocity.x) * 0.5,
      y: (a.velocity.y + b.velocity.y) * 0.5 - 0.5,
    });

    score += def.score;
    if (newLevel === FRUIT_DEFS.length - 1) score += 50;
    scoreEl.textContent = score;
    if (score > bestScore) {
      bestScore = score;
      bestEl.textContent = bestScore;
      localStorage.setItem("suika_best", String(bestScore));
    }
    playMergeSound();
    return true;
  }

  function clampDropX(level) {
    const r = FRUIT_DEFS[level].radius;
    const minX = WALL_THICK + r;
    const maxX = width - WALL_THICK - r;
    return Math.max(minX, Math.min(maxX, dropX));
  }

  function dropFruit() {
    if (!canDrop || gameOver || pendingLevel === null) return;

    const level = pendingLevel;
    const x = clampDropX(level);
    createFruitBody(level, x, DROP_Y + FRUIT_DEFS[level].radius);

    mergeSoundPending = true;
    canDrop = false;
    pendingLevel = null;

    setTimeout(() => {
      if (gameOver) return;
      pendingLevel = nextLevel;
      nextLevel = randomDropLevel();
      canDrop = true;
    }, DROP_COOLDOWN);
  }

  function isFruitSettled(body) {
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    const angular = Math.abs(body.angularVelocity);
    return speed < 0.35 && angular < 0.08;
  }

  function checkGameOver() {
    if (gameOver) return;

    let danger = false;
    const fruits = Composite.allBodies(world).filter((b) => b.label === "fruit");

    for (const b of fruits) {
      const top = b.position.y - FRUIT_DEFS[b.fruitLevel].radius;
      if (top < dangerY && isFruitSettled(b)) {
        danger = true;
        break;
      }
    }

    if (danger) {
      dangerTimer++;
      if (dangerTimer > 120) endGame();
    } else {
      dangerTimer = 0;
    }
  }

  function remainingQuizCount() {
    const bank = window.DIANXUE_QUIZ || [];
    return bank.filter((q) => !usedQuizIds.has(q.id)).length;
  }

  function updateReviveUI() {
    const el = document.getElementById("revives-left");
    if (el) el.textContent = revivesLeft;
    const btn = document.getElementById("btn-revive");
    const leftQ = remainingQuizCount();
    if (btn) {
      btn.disabled = revivesLeft <= 0 || leftQ <= 0;
      if (revivesLeft <= 0) btn.textContent = "复活次数已用完";
      else if (leftQ <= 0) btn.textContent = "本轮题目已用完";
      else btn.textContent = "答题复活（剩 " + leftQ + " 题）";
    }
  }

  const GAMEOVER_SLOGANS = ["老大别孝了我害怕", "zryy赔钱"];

  function endGame() {
    gameOver = true;
    document.getElementById("final-score").textContent = score;
    const sloganEl = document.getElementById("gameover-slogan");
    if (sloganEl) {
      sloganEl.textContent =
        GAMEOVER_SLOGANS[Math.floor(Math.random() * GAMEOVER_SLOGANS.length)];
    }
    updateReviveUI();
    document.getElementById("overlay-gameover").classList.remove("hidden");
  }

  function clearBottomThird() {
    const threshold = height * (2 / 3);
    const toRemove = Composite.allBodies(world).filter(
      (b) => b.label === "fruit" && b.position.y >= threshold
    );
    if (toRemove.length) World.remove(world, toRemove);
    dangerTimer = 0;
  }

  function buildQuizQuestion() {
    const bank = window.DIANXUE_QUIZ || [];
    const available = bank.filter((q) => !usedQuizIds.has(q.id));
    if (!available.length) return null;

    const item = available[Math.floor(Math.random() * available.length)];
    usedQuizIds.add(item.id);

    return {
      id: item.id,
      question: item.question,
      options: item.options.map((o) => ({
        label: o.label,
        text: o.text,
        correct: !!o.correct,
      })),
    };
  }

  function showQuizOverlay() {
    currentQuiz = buildQuizQuestion();
    if (!currentQuiz) {
      alert("本局 5 道复活题已全部出现，无法继续答题复活。");
      return;
    }

    const qEl = document.getElementById("quiz-question");
    qEl.textContent = currentQuiz.question;
    qEl.style.whiteSpace = "pre-line";
    const feedback = document.getElementById("quiz-feedback");
    feedback.textContent = "";
    feedback.className = "quiz-feedback";

    const container = document.getElementById("quiz-options");
    container.innerHTML = "";

    currentQuiz.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-option";
      btn.textContent = opt.label + ". " + opt.text;
      btn.addEventListener("click", () => onQuizAnswer(btn, opt));
      container.appendChild(btn);
    });

    document.getElementById("overlay-quiz").classList.remove("hidden");
  }

  function hideQuizOverlay() {
    document.getElementById("overlay-quiz").classList.add("hidden");
    currentQuiz = null;
  }

  function onQuizAnswer(btn, opt) {
    const feedback = document.getElementById("quiz-feedback");
    const allBtns = document.querySelectorAll(".quiz-option");
    allBtns.forEach((b) => (b.disabled = true));

    if (opt.correct) {
      btn.classList.add("correct");
      feedback.textContent = "回答正确！已清除下方 1/3 区域的小球";
      feedback.className = "quiz-feedback ok";

      setTimeout(() => {
        clearBottomThird();
        revivesLeft--;
        updateReviveUI();
        gameOver = false;
        hideQuizOverlay();
        document.getElementById("overlay-gameover").classList.add("hidden");
        if (pendingLevel === null && !canDrop) {
          pendingLevel = nextLevel;
          canDrop = true;
        }
        if (!loopRunning) startLoop();
      }, 900);
    } else {
      btn.classList.add("wrong");
      const right = currentQuiz.options.find((o) => o.correct);
      allBtns.forEach((b) => {
        if (b.textContent.includes(right.label + ".")) b.classList.add("correct");
      });
      feedback.textContent = "答错了，正确答案已标绿，可再试一次";
      feedback.className = "quiz-feedback err";
      setTimeout(() => {
        allBtns.forEach((b) => {
          b.disabled = false;
          b.classList.remove("wrong", "correct");
        });
        feedback.textContent = "";
      }, 1600);
    }
  }

  function startReviveQuiz() {
    if (revivesLeft <= 0) return;
    if (remainingQuizCount() <= 0) {
      alert("本局题目已全部用完。");
      return;
    }
    showQuizOverlay();
  }

  function stopLoop() {
    loopRunning = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function startLoop() {
    if (loopRunning) return;
    loopRunning = true;

    function tick() {
      if (!loopRunning) return;
      Engine.update(engine, 1000 / 60);
      checkMerges();
      drawScene();
      checkGameOver();
      animId = requestAnimationFrame(tick);
    }
    tick();
  }

  function resize() {
    const maxW = Math.min(400, window.innerWidth - 32);
    const maxH = Math.min(window.innerHeight * 0.58, 520);
    width = Math.max(280, maxW);
    height = Math.max(360, maxH);
    dangerY = height * DANGER_Y_RATIO;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    if (world) rebuildWalls();
    dropX = width / 2;
  }

  function clearFruits() {
    const fruits = Composite.allBodies(world).filter((b) => b.label === "fruit");
    if (fruits.length) World.remove(world, fruits);
  }

  function resetGame() {
    stopLoop();
    clearFruits();
    mergeQueue.clear();
    dangerTimer = 0;
    revivesLeft = MAX_REVIVES;
    usedQuizIds.clear();
    score = 0;
    gameOver = false;
    canDrop = true;
    scoreEl.textContent = "0";
    updateReviveUI();
    hideQuizOverlay();
    document.getElementById("overlay-gameover").classList.add("hidden");

    nextLevel = randomDropLevel();
    pendingLevel = nextLevel;
    dropX = width / 2;

    applyRandomBackground();
    mergeSoundPending = false;
    startLoop();
  }

  function setDropFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    dropX = ratio * width;
    if (pendingLevel !== null) dropX = clampDropX(pendingLevel);
  }

  function initGame() {
    canvas = document.getElementById("game-canvas");
    ctx = canvas.getContext("2d");

    loadFruitImages();
    applyRandomBackground();
    initBgm();
    resize();
    window.addEventListener("resize", resize);

    nextLevel = randomDropLevel();
    pendingLevel = nextLevel;
    dropX = width / 2;

    setupPhysics();
    updateReviveUI();
    startLoop();

    canvas.addEventListener("mousemove", (e) => setDropFromClientX(e.clientX));
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches[0]) setDropFromClientX(e.touches[0].clientX);
      },
      { passive: true }
    );
    canvas.addEventListener("touchmove", (e) => {
      if (e.touches[0]) setDropFromClientX(e.touches[0].clientX);
    }, { passive: true });

    canvas.addEventListener("click", (e) => {
      setDropFromClientX(e.clientX);
      if (bgmEl && (bgmEl.paused || bgmEl.muted)) {
        bgmEl.muted = false;
        bgmEl.play().catch(() => {});
      }
      dropFruit();
    });

    let touchDropped = false;
    canvas.addEventListener("touchend", (e) => {
      if (touchDropped) return;
      touchDropped = true;
      setTimeout(() => {
        touchDropped = false;
      }, 300);
      e.preventDefault();
      dropFruit();
    });
  }

  document.getElementById("btn-restart").addEventListener("click", () => {
    document.getElementById("overlay-gameover").classList.add("hidden");
    hideQuizOverlay();
    resetGame();
  });

  document.getElementById("btn-revive").addEventListener("click", startReviveQuiz);

  document.getElementById("btn-quiz-cancel").addEventListener("click", () => {
    hideQuizOverlay();
  });

  document.getElementById("btn-revive-hint").addEventListener("click", () => {
    if (gameOver && revivesLeft > 0) {
      startReviveQuiz();
    } else {
      alert(
        "游戏结束后可答「店学小知识」复活，每局 " +
          MAX_REVIVES +
          " 次，5 道题不重复。答对清除画面下方 1/3 的小球。"
      );
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGame);
  } else {
    initGame();
  }
})();

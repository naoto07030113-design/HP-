(() => {
  "use strict";

  /* ---------------------------------------------------------
     スタイルテンプレート定義
     色調 / トランジション / テンポ / テキストの自動設定
  --------------------------------------------------------- */
  const TEMPLATES = [
    {
      id: "cinematic",
      name: "シネマティック",
      desc: "深みのある色調と、ゆったりとした映像送り。",
      swatch: "linear-gradient(135deg,#1b2a2e,#caa06c)",
      filter: "contrast(1.12) saturate(0.85) brightness(0.94) sepia(0.06)",
      clipDuration: 3.4,
      transition: 0.9,
      kenBurns: { from: 1.0, to: 1.12 },
      font: '500 46px "Cormorant Garamond", serif',
      textColor: "#f3e9d2",
      vignette: 0.38,
    },
    {
      id: "natural",
      name: "ナチュラル",
      desc: "明るく爽やかな色調で軽快に繋ぐ。",
      swatch: "linear-gradient(135deg,#eef0e6,#bcd9c4)",
      filter: "brightness(1.08) saturate(1.12) contrast(1.02)",
      clipDuration: 2.6,
      transition: 0.6,
      kenBurns: { from: 1.0, to: 1.08 },
      font: '400 38px "Noto Sans JP", sans-serif',
      textColor: "#ffffff",
      vignette: 0.12,
    },
    {
      id: "dynamic",
      name: "ダイナミック",
      desc: "コントラスト強めでテンポの速いカット編集。",
      swatch: "linear-gradient(135deg,#101010,#e0483c)",
      filter: "contrast(1.35) saturate(1.3) brightness(0.98)",
      clipDuration: 1.3,
      transition: 0.25,
      kenBurns: { from: 1.05, to: 1.2 },
      font: '700 42px "Noto Sans JP", sans-serif',
      textColor: "#ffffff",
      vignette: 0.42,
    },
    {
      id: "minimal",
      name: "ミニマル",
      desc: "彩度を抑えた、上質で落ち着いた仕上がり。",
      swatch: "linear-gradient(135deg,#d9d6cd,#8c887d)",
      filter: "grayscale(0.25) contrast(1.05) brightness(1.03)",
      clipDuration: 2.9,
      transition: 0.7,
      kenBurns: { from: 1.0, to: 1.06 },
      font: '500 36px "Cormorant Garamond", serif',
      textColor: "#222222",
      vignette: 0.1,
    },
  ];

  const CANVAS_W = 1280;
  const CANVAS_H = 720;

  /* ---------------------------------------------------------
     状態
  --------------------------------------------------------- */
  const state = {
    materials: [],     // {id,file,type,url,el,name,duration,trimStart,trimEnd,caption}
    templateId: TEMPLATES[0].id,
    music: null,        // {file,url,el,volume}
    projectTitle: "",
    endText: "",
    timeline: { clips: [], total: 0 },
    currentTime: 0,
    playing: false,
    exporting: false,
  };

  let nextId = 1;
  let audioCtx = null;
  let musicGain = null;
  let musicStreamDest = null;
  let musicGraphReady = false;

  /* ---------------------------------------------------------
     DOM参照
  --------------------------------------------------------- */
  const el = (id) => document.getElementById(id);
  const dropzone = el("dropzone");
  const fileInput = el("fileInput");
  const materialList = el("materialList");
  const musicBtn = el("musicBtn");
  const musicInput = el("musicInput");
  const musicName = el("musicName");
  const musicVolume = el("musicVolume");
  const musicRemove = el("musicRemove");
  const templateGrid = el("templateGrid");
  const canvas = el("stageCanvas");
  const ctx = canvas.getContext("2d");
  const stageEmpty = el("stageEmpty");
  const playBtn = el("playBtn");
  const seekBar = el("seekBar");
  const timeNow = el("timeNow");
  const timeTotal = el("timeTotal");
  const projectTitleInput = el("projectTitle");
  const endTextInput = el("endText");
  const exportBtn = el("exportBtn");
  const exportProgress = el("exportProgress");
  const exportProgressFill = el("exportProgressFill");
  const exportProgressLabel = el("exportProgressLabel");
  const downloadLink = el("downloadLink");
  const headerStatus = el("headerStatus");

  /* ---------------------------------------------------------
     ユーティリティ
  --------------------------------------------------------- */
  function fmtTime(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function nameToCaption(filename) {
    return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  }

  function currentTemplate() {
    return TEMPLATES.find((t) => t.id === state.templateId) || TEMPLATES[0];
  }

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  /* ---------------------------------------------------------
     素材の追加・管理
  --------------------------------------------------------- */
  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    files.forEach((file) => {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) return;

      const url = URL.createObjectURL(file);
      const material = {
        id: nextId++,
        file,
        type: isVideo ? "video" : "image",
        url,
        name: file.name,
        duration: isVideo ? 0 : null,
        trimStart: 0,
        trimEnd: isVideo ? 0 : null,
        caption: nameToCaption(file.name),
      };

      if (isVideo) {
        const v = document.createElement("video");
        v.src = url;
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.addEventListener("loadedmetadata", () => {
          material.duration = v.duration || 0;
          material.trimEnd = Math.min(material.duration, currentTemplate().clipDuration);
          v.currentTime = Math.min(0.05, material.duration / 2);
          renderMaterialList();
          rebuildTimeline();
        });
        material.el = v;
      } else {
        const img = new Image();
        img.src = url;
        material.el = img;
      }

      state.materials.push(material);
    });
    renderMaterialList();
    rebuildTimeline();
  }

  function removeMaterial(id) {
    const idx = state.materials.findIndex((m) => m.id === id);
    if (idx === -1) return;
    state.materials.splice(idx, 1);
    renderMaterialList();
    rebuildTimeline();
  }

  function renderMaterialList() {
    materialList.innerHTML = "";
    state.materials.forEach((m) => {
      const li = document.createElement("li");
      li.className = "material-item";
      li.draggable = true;
      li.dataset.id = m.id;

      const thumb = document.createElement("div");
      thumb.className = "material-thumb";
      if (m.type === "video") {
        const v = document.createElement("video");
        v.src = m.url;
        v.muted = true;
        thumb.appendChild(v);
      } else {
        const img = document.createElement("img");
        img.src = m.url;
        thumb.appendChild(img);
      }

      const meta = document.createElement("div");
      meta.className = "material-meta";

      const name = document.createElement("div");
      name.className = "material-name";
      name.textContent = m.name;

      const caption = document.createElement("input");
      caption.className = "material-caption";
      caption.type = "text";
      caption.placeholder = "キャプション";
      caption.value = m.caption;
      caption.addEventListener("input", () => {
        m.caption = caption.value;
        rebuildTimeline();
      });

      meta.appendChild(name);
      meta.appendChild(caption);

      if (m.type === "video") {
        const trim = document.createElement("div");
        trim.className = "material-trim";
        const startInput = document.createElement("input");
        startInput.type = "number";
        startInput.min = "0";
        startInput.step = "0.1";
        startInput.value = m.trimStart.toFixed(1);
        const endInput = document.createElement("input");
        endInput.type = "number";
        endInput.min = "0";
        endInput.step = "0.1";
        endInput.value = (m.trimEnd || 0).toFixed(1);

        startInput.addEventListener("change", () => {
          let v = parseFloat(startInput.value) || 0;
          v = clamp(v, 0, Math.max(0, (m.trimEnd || 0) - 0.2));
          m.trimStart = v;
          startInput.value = v.toFixed(1);
          rebuildTimeline();
        });
        endInput.addEventListener("change", () => {
          let v = parseFloat(endInput.value) || 0;
          v = clamp(v, m.trimStart + 0.2, m.duration || v);
          m.trimEnd = v;
          endInput.value = v.toFixed(1);
          rebuildTimeline();
        });

        trim.appendChild(document.createTextNode("Trim"));
        trim.appendChild(startInput);
        trim.appendChild(document.createTextNode("〜"));
        trim.appendChild(endInput);
        trim.appendChild(document.createTextNode("秒"));
        meta.appendChild(trim);
      }

      const actions = document.createElement("div");
      actions.className = "material-actions";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "✕";
      delBtn.title = "削除";
      delBtn.addEventListener("click", () => removeMaterial(m.id));
      actions.appendChild(delBtn);

      li.appendChild(thumb);
      li.appendChild(meta);
      li.appendChild(actions);
      materialList.appendChild(li);
    });
  }

  // ドラッグ＆ドロップによる並び替え
  let dragSrcId = null;
  materialList.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".material-item");
    if (!li) return;
    dragSrcId = Number(li.dataset.id);
    li.classList.add("dragging");
  });
  materialList.addEventListener("dragend", (e) => {
    const li = e.target.closest(".material-item");
    if (li) li.classList.remove("dragging");
  });
  materialList.addEventListener("dragover", (e) => {
    e.preventDefault();
    const li = e.target.closest(".material-item");
    if (!li || dragSrcId === null) return;
    const targetId = Number(li.dataset.id);
    if (targetId === dragSrcId) return;
    const srcIdx = state.materials.findIndex((m) => m.id === dragSrcId);
    const tgtIdx = state.materials.findIndex((m) => m.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [moved] = state.materials.splice(srcIdx, 1);
    state.materials.splice(tgtIdx, 0, moved);
    renderMaterialList();
    rebuildTimeline();
  });

  /* ---------------------------------------------------------
     ファイル入力 / ドロップゾーン
  --------------------------------------------------------- */
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    addFiles(e.dataTransfer.files);
  });

  /* ---------------------------------------------------------
     BGM
  --------------------------------------------------------- */
  musicBtn.addEventListener("click", () => musicInput.click());
  musicInput.addEventListener("change", () => {
    const file = musicInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;
    audio.loop = false;
    audio.volume = parseFloat(musicVolume.value);
    state.music = { file, url, el: audio };
    musicGraphReady = false;
    musicName.textContent = file.name;
    musicRemove.hidden = false;
  });
  musicVolume.addEventListener("input", () => {
    if (state.music) state.music.el.volume = parseFloat(musicVolume.value);
    if (musicGain) musicGain.gain.value = parseFloat(musicVolume.value);
  });
  musicRemove.addEventListener("click", () => {
    if (state.music) {
      state.music.el.pause();
      URL.revokeObjectURL(state.music.url);
    }
    state.music = null;
    musicGraphReady = false;
    musicName.textContent = "未選択";
    musicRemove.hidden = true;
  });

  /* ---------------------------------------------------------
     テンプレート選択
  --------------------------------------------------------- */
  function renderTemplateGrid() {
    templateGrid.innerHTML = "";
    TEMPLATES.forEach((tpl) => {
      const card = document.createElement("div");
      card.className = "template-card" + (tpl.id === state.templateId ? " selected" : "");
      card.innerHTML = `
        <div class="template-swatch" style="background:${tpl.swatch}"></div>
        <h3>${tpl.name}</h3>
        <p>${tpl.desc}</p>
      `;
      card.addEventListener("click", () => {
        state.templateId = tpl.id;
        // 動画素材のデフォルトトリム長をテンプレートのテンポに合わせて更新
        state.materials.forEach((m) => {
          if (m.type === "video" && m.duration) {
            m.trimEnd = Math.min(m.duration, tpl.clipDuration);
            m.trimStart = Math.min(m.trimStart, Math.max(0, m.trimEnd - 0.2));
          }
        });
        renderMaterialList();
        renderTemplateGrid();
        rebuildTimeline();
      });
      templateGrid.appendChild(card);
    });
  }

  /* ---------------------------------------------------------
     タイムライン構築
  --------------------------------------------------------- */
  function rebuildTimeline() {
    const tpl = currentTemplate();
    const clips = [];
    let cursor = 0;

    state.materials.forEach((m, idx) => {
      const contentDuration =
        m.type === "video" ? Math.max(0.2, (m.trimEnd || tpl.clipDuration) - m.trimStart) : tpl.clipDuration;

      const transitionIn = idx === 0 ? 0 : Math.min(tpl.transition, contentDuration * 0.4);
      const start = idx === 0 ? 0 : cursor - transitionIn;
      const end = start + contentDuration;

      clips.push({
        material: m,
        index: idx,
        start,
        end,
        duration: contentDuration,
        transitionIn,
      });

      cursor = end;
    });

    state.timeline = { clips, total: cursor };

    const hasContent = clips.length > 0;
    stageEmpty.hidden = hasContent;
    playBtn.disabled = !hasContent;
    seekBar.disabled = !hasContent;
    exportBtn.disabled = !hasContent;
    timeTotal.textContent = fmtTime(state.timeline.total);

    if (state.currentTime > state.timeline.total) {
      state.currentTime = 0;
      seekBar.value = 0;
    }

    updateHeaderStatus();
    renderFrame(state.currentTime);
  }

  function updateHeaderStatus() {
    if (state.materials.length === 0) {
      headerStatus.textContent = "STEP 1 / 4 ｜ 素材を追加してください";
    } else if (!state.timeline.clips.length) {
      headerStatus.textContent = "STEP 2 / 4 ｜ スタイルを選択してください";
    } else {
      headerStatus.textContent = `準備完了 ｜ 合計 ${fmtTime(state.timeline.total)} ／ ${state.materials.length}素材`;
    }
  }

  /* ---------------------------------------------------------
     レンダリング（プレビュー & 書き出し共通）
  --------------------------------------------------------- */
  function findActiveClips(t) {
    const { clips } = state.timeline;
    const active = [];
    for (const c of clips) {
      if (t >= c.start - 0.001 && t < c.end + 0.001) active.push(c);
    }
    return active;
  }

  function drawCover(source, sw, sh) {
    const canvasRatio = CANVAS_W / CANVAS_H;
    const srcRatio = sw / sh;
    let dw, dh, dx, dy;
    if (srcRatio > canvasRatio) {
      dh = CANVAS_H;
      dw = dh * srcRatio;
    } else {
      dw = CANVAS_W;
      dh = dw / srcRatio;
    }
    dx = (CANVAS_W - dw) / 2;
    dy = (CANVAS_H - dh) / 2;
    return { dx, dy, dw, dh };
  }

  function drawClipVisual(clip, localT) {
    const tpl = currentTemplate();
    const m = clip.material;
    const progress = clamp(localT / clip.duration, 0, 1);

    ctx.save();
    ctx.filter = tpl.filter;

    let srcW, srcH, srcEl;
    if (m.type === "image") {
      srcEl = m.el;
      srcW = srcEl.naturalWidth || CANVAS_W;
      srcH = srcEl.naturalHeight || CANVAS_H;
    } else {
      srcEl = m.el;
      srcW = srcEl.videoWidth || CANVAS_W;
      srcH = srcEl.videoHeight || CANVAS_H;
    }

    const { dx, dy, dw, dh } = drawCover(srcEl, srcW, srcH);

    if (m.type === "image") {
      // Ken Burns: ゆっくりズーム＋パン
      const scale = tpl.kenBurns.from + (tpl.kenBurns.to - tpl.kenBurns.from) * progress;
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.drawImage(srcEl, dx, dy, dw, dh);
    } else {
      ctx.drawImage(srcEl, dx, dy, dw, dh);
    }
    ctx.restore();

    // ビネット
    if (tpl.vignette > 0) {
      const grad = ctx.createRadialGradient(
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.3,
        CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.75
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${tpl.vignette})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // キャプション（フェードイン・アウト）
    if (m.caption) {
      const fade = 0.4;
      let alpha = 1;
      if (localT < fade) alpha = localT / fade;
      else if (localT > clip.duration - fade) alpha = (clip.duration - localT) / fade;
      alpha = clamp(alpha, 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = tpl.font;
      ctx.fillStyle = tpl.textColor;
      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 12;
      ctx.fillText(m.caption, 64, CANVAS_H - 64);
      ctx.restore();
    }
  }

  function drawTitleCard() {
    if (!state.projectTitle) return;
    const t = state.currentTime;
    const span = 2.4;
    if (t > span) return;
    const tpl = currentTemplate();
    const alpha = t < 0.5 ? t / 0.5 : t > span - 0.6 ? (span - t) / 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.font = `600 64px "Cormorant Garamond", serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 18;
    ctx.fillText(state.projectTitle, CANVAS_W / 2, CANVAS_H / 2);
    ctx.restore();
  }

  function drawEndCard() {
    if (!state.endText) return;
    const total = state.timeline.total;
    const t = state.currentTime;
    const span = 2.4;
    if (t < total - span) return;
    const localT = t - (total - span);
    const alpha = localT < 0.6 ? localT / 0.6 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.font = `500 48px "Cormorant Garamond", serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 18;
    ctx.fillText(state.endText, CANVAS_W / 2, CANVAS_H / 2);
    ctx.restore();
  }

  function renderFrame(t) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const active = findActiveClips(t);
    if (active.length === 1) {
      const c = active[0];
      drawClipVisual(c, clamp(t - c.start, 0, c.duration));
    } else if (active.length >= 2) {
      const sorted = active.sort((a, b) => a.index - b.index);
      const prev = sorted[0];
      const next = sorted[1];
      drawClipVisual(prev, clamp(t - prev.start, 0, prev.duration));
      const overlapProgress = next.transitionIn > 0 ? (t - next.start) / next.transitionIn : 1;
      ctx.save();
      ctx.globalAlpha = clamp(overlapProgress, 0, 1);
      drawClipVisual(next, clamp(t - next.start, 0, next.duration));
      ctx.restore();
    }

    drawTitleCard();
    drawEndCard();
  }

  /* ---------------------------------------------------------
     再生制御
  --------------------------------------------------------- */
  const videoPlayState = new Map(); // material.id -> boolean(playing)

  function syncVideosTo(t, { play } = { play: false }) {
    const active = findActiveClips(t);
    const activeIds = new Set();

    active.forEach((c) => {
      if (c.material.type !== "video") return;
      activeIds.add(c.material.id);
      const v = c.material.el;
      const localT = clamp(t - c.start, 0, c.duration);
      const targetTime = c.material.trimStart + localT;

      if (play) {
        if (!videoPlayState.get(c.material.id)) {
          v.currentTime = targetTime;
          v.play().catch(() => {});
          videoPlayState.set(c.material.id, true);
        } else if (Math.abs(v.currentTime - targetTime) > 0.35) {
          v.currentTime = targetTime; // ドリフト補正
        }
      } else {
        v.pause();
        v.currentTime = targetTime;
        videoPlayState.set(c.material.id, false);
      }
    });

    // アクティブでなくなった動画を停止
    state.materials.forEach((m) => {
      if (m.type === "video" && !activeIds.has(m.id) && videoPlayState.get(m.id)) {
        m.el.pause();
        videoPlayState.set(m.id, false);
      }
    });
  }

  let rafId = null;
  let lastTs = null;

  function tick(ts) {
    if (!state.playing) return;
    if (lastTs === null) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    state.currentTime += dt;
    if (state.currentTime >= state.timeline.total) {
      state.currentTime = state.timeline.total;
      stop();
      renderFrame(state.currentTime);
      updateTransportUI();
      onPlaybackEnded();
      return;
    }

    syncVideosTo(state.currentTime, { play: true });
    renderFrame(state.currentTime);
    updateTransportUI();
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (state.timeline.clips.length === 0) return;
    if (state.currentTime >= state.timeline.total) state.currentTime = 0;
    state.playing = true;
    lastTs = null;
    playBtn.textContent = "❚❚";
    ensureMusicGraph();
    if (state.music) {
      state.music.el.currentTime = state.currentTime;
      state.music.el.play().catch(() => {});
    }
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    state.playing = false;
    playBtn.textContent = "▶";
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (state.music) state.music.el.pause();
    state.materials.forEach((m) => {
      if (m.type === "video") {
        m.el.pause();
        videoPlayState.set(m.id, false);
      }
    });
  }

  function onPlaybackEnded() {
    if (state.exporting) finishExport();
  }

  function updateTransportUI() {
    timeNow.textContent = fmtTime(state.currentTime);
    const ratio = state.timeline.total > 0 ? state.currentTime / state.timeline.total : 0;
    seekBar.value = Math.round(ratio * 1000);
  }

  playBtn.addEventListener("click", () => {
    if (state.playing) stop();
    else play();
  });

  seekBar.addEventListener("input", () => {
    if (state.playing) stop();
    const ratio = Number(seekBar.value) / 1000;
    state.currentTime = ratio * state.timeline.total;
    syncVideosTo(state.currentTime, { play: false });
    renderFrame(state.currentTime);
    updateTransportUI();
  });

  projectTitleInput.addEventListener("input", () => {
    state.projectTitle = projectTitleInput.value;
    renderFrame(state.currentTime);
  });
  endTextInput.addEventListener("input", () => {
    state.endText = endTextInput.value;
    renderFrame(state.currentTime);
  });

  /* ---------------------------------------------------------
     音声グラフ（Web Audio）
  --------------------------------------------------------- */
  function ensureMusicGraph() {
    if (!state.music || musicGraphReady) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(state.music.el);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = parseFloat(musicVolume.value);
    musicStreamDest = audioCtx.createMediaStreamDestination();
    source.connect(musicGain);
    musicGain.connect(audioCtx.destination);
    musicGain.connect(musicStreamDest);
    musicGraphReady = true;
  }

  /* ---------------------------------------------------------
     書き出し（MediaRecorder）
  --------------------------------------------------------- */
  let mediaRecorder = null;
  let recordedChunks = [];

  exportBtn.addEventListener("click", () => {
    if (state.exporting) return;
    startExport();
  });

  function pickMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    return candidates.find((c) => window.MediaRecorder && MediaRecorder.isTypeSupported(c)) || "video/webm";
  }

  function startExport() {
    if (state.timeline.clips.length === 0) return;
    state.exporting = true;
    recordedChunks = [];
    exportBtn.disabled = true;
    downloadLink.hidden = true;
    exportProgress.hidden = false;
    exportProgressFill.style.width = "0%";
    exportProgressLabel.textContent = "0%";

    stop();
    state.currentTime = 0;
    renderFrame(0);

    ensureMusicGraph();

    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (musicStreamDest) tracks.push(...musicStreamDest.stream.getAudioTracks());
    const combined = new MediaStream(tracks);

    mediaRecorder = new MediaRecorder(combined, { mimeType: pickMimeType() });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = onRecorderStopped;
    mediaRecorder.start();

    play();
    exportProgressTick();
  }

  function exportProgressTick() {
    if (!state.exporting) return;
    const ratio = state.timeline.total > 0 ? state.currentTime / state.timeline.total : 0;
    const pct = Math.round(clamp(ratio, 0, 1) * 100);
    exportProgressFill.style.width = pct + "%";
    exportProgressLabel.textContent = pct + "%";
    if (state.exporting) requestAnimationFrame(exportProgressTick);
  }

  function finishExport() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      onRecorderStopped();
    }
  }

  function onRecorderStopped() {
    state.exporting = false;
    exportBtn.disabled = false;
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.hidden = false;
    exportProgressFill.style.width = "100%";
    exportProgressLabel.textContent = "完了";
  }

  /* ---------------------------------------------------------
     初期化
  --------------------------------------------------------- */
  renderTemplateGrid();
  rebuildTimeline();
})();

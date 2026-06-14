/* ============================================================
   THE RESIDENCE — scroll-driven walkthrough
   ============================================================ */
(function () {
  "use strict";

  const video = document.getElementById("walkthrough");
  const film = document.getElementById("film");
  const loader = document.getElementById("loader");
  const loaderBar = document.getElementById("loaderBar");
  const header = document.getElementById("header");
  const captions = Array.from(document.querySelectorAll(".caption"));
  const progressItems = Array.from(document.querySelectorAll(".progress__list li"));

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Loader ---------- */
  let fakeProgress = 0;
  const fakeTimer = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 12, 92);
    if (loaderBar) loaderBar.style.width = fakeProgress + "%";
  }, 160);

  function hideLoader() {
    clearInterval(fakeTimer);
    if (loaderBar) loaderBar.style.width = "100%";
    setTimeout(() => loader.classList.add("is-hidden"), 350);
  }

  /* Hide loader once the video can play through (or fallback timeout) */
  let loaded = false;
  function onReady() {
    if (loaded) return;
    loaded = true;
    hideLoader();
    startScrub();
  }
  video.addEventListener("canplaythrough", onReady, { once: true });
  video.addEventListener("loadeddata", () => {
    // ensure first frame is painted
    try { video.currentTime = 0.001; } catch (e) {}
  });
  window.addEventListener("load", () => setTimeout(onReady, 1200));
  setTimeout(onReady, 4000); // hard fallback

  /* ---------- Scroll-driven video scrubbing ---------- */
  // Smooth scrubbing: lerp current time toward a scroll-derived target.
  let targetTime = 0;
  let currentTime = 0;
  let duration = 0;
  let rafId = null;

  function getProgress() {
    const rect = film.getBoundingClientRect();
    const scrollable = film.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    const scrolled = -rect.top;
    return Math.min(Math.max(scrolled / scrollable, 0), 1);
  }

  function updateScenes(progress) {
    // 5 evenly distributed scenes
    const n = captions.length;
    let idx = Math.floor(progress * n);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;

    captions.forEach((c, i) => c.classList.toggle("is-active", i === idx));
    progressItems.forEach((p, i) => p.classList.toggle("is-active", i === idx));
  }

  function tick() {
    const progress = getProgress();
    // Scrub across (almost) the full clip; small tail margin avoids end-stall.
    targetTime = progress * (duration * 0.999);

    // Smooth easing toward target for buttery scrubbing.
    currentTime += (targetTime - currentTime) * 0.12;
    if (Math.abs(targetTime - currentTime) < 0.0008) currentTime = targetTime;

    if (duration > 0 && video.readyState >= 2) {
      try { video.currentTime = currentTime; } catch (e) {}
    }

    updateScenes(progress);
    rafId = requestAnimationFrame(tick);
  }

  function startScrub() {
    duration = video.duration || 10;
    video.pause();
    if (reduceMotion) {
      // Reduced motion: jump per-scene instead of continuous scrub.
      currentTime = targetTime = 0;
      updateScenes(0);
      window.addEventListener("scroll", () => {
        const p = getProgress();
        const t = p * (duration * 0.999);
        try { video.currentTime = t; } catch (e) {}
        updateScenes(p);
      }, { passive: true });
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  /* ---------- Header state ---------- */
  function onScrollHeader() {
    if (window.scrollY > window.innerHeight * 0.6) {
      header.classList.add("is-solid");
    } else {
      header.classList.remove("is-solid");
    }
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- Anchor scrolling to scenes inside the film ---------- */
  // Captions live in a sticky section; map their anchors to scroll offsets.
  const sceneAnchors = {
    exterior: 0, entrance: 1, living: 2, kitchen: 3, courtyard: 4,
  };
  document.querySelectorAll('.header__nav a[href^="#"]').forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    if (id in sceneAnchors) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const n = captions.length;
        const scrollable = film.offsetHeight - window.innerHeight;
        // center of the scene band
        const p = (sceneAnchors[id] + 0.5) / n;
        const top = film.offsetTop + p * scrollable;
        window.scrollTo({ top, behavior: "smooth" });
      });
    }
  });

  /* Keep currentTime synced if the duration becomes available late */
  video.addEventListener("durationchange", () => {
    if (video.duration && isFinite(video.duration)) duration = video.duration;
  });
})();

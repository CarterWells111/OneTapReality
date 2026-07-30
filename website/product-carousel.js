(() => {
  const initializedCarousels = new WeakSet();
  const minimumSwipeDistance = 40;

  function initializeProductCarousel(carousel) {
    if (initializedCarousels.has(carousel)) {
      return;
    }

    const slides = [...carousel.querySelectorAll("[data-carousel-slide]")];
    const previous = carousel.querySelector("[data-carousel-previous]");
    const next = carousel.querySelector("[data-carousel-next]");
    const live = carousel.querySelector("[data-carousel-live]");

    if (slides.length === 0 || !previous || !next || !live) {
      return;
    }

    initializedCarousels.add(carousel);

    if (!carousel.getAttribute("tabindex")) {
      carousel.setAttribute("tabindex", "0");
    }

    const carouselId = carousel.getAttribute("id") || "product-carousel";
    carousel.setAttribute("id", carouselId);
    previous.setAttribute("aria-controls", carouselId);
    next.setAttribute("aria-controls", carouselId);
    live.setAttribute("aria-atomic", "true");

    slides.forEach((slide, index) => {
      slide.setAttribute("id", `${carouselId}-slide-${index + 1}`);
      slide.setAttribute("aria-roledescription", "slide");
    });

    let activeIndex = 0;
    let touchStart = null;

    function showSlide(index) {
      activeIndex = (index + slides.length) % slides.length;

      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === activeIndex;
        slide.hidden = !isActive;
        slide.setAttribute("aria-hidden", String(!isActive));
        slide.setAttribute("aria-label", `第 ${slideIndex + 1} 页，共 ${slides.length} 页`);

        if (isActive) {
          slide.classList.add("is-active");
        } else {
          slide.classList.remove("is-active");
        }
      });

      const previousIndex = (activeIndex + slides.length - 1) % slides.length;
      const nextIndex = (activeIndex + 1) % slides.length;
      live.textContent = `第 ${activeIndex + 1} 页，共 ${slides.length} 页`;
      previous.setAttribute("aria-label", `上一页，前往第 ${previousIndex + 1} 页`);
      next.setAttribute("aria-label", `下一页，前往第 ${nextIndex + 1} 页`);
    }

    previous.addEventListener("click", () => showSlide(activeIndex - 1));
    next.addEventListener("click", () => showSlide(activeIndex + 1));
    carousel.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showSlide(activeIndex - 1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        showSlide(activeIndex + 1);
      }
    });
    carousel.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    });
    carousel.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      if (!touchStart || !touch) {
        touchStart = null;
        return;
      }

      const distanceX = touch.clientX - touchStart.x;
      const distanceY = touch.clientY - touchStart.y;
      touchStart = null;

      if (Math.abs(distanceX) < minimumSwipeDistance || Math.abs(distanceX) <= Math.abs(distanceY)) {
        return;
      }

      showSlide(activeIndex + (distanceX < 0 ? 1 : -1));
    });

    showSlide(activeIndex);
  }

  function initializeProductCarousels() {
    document.querySelectorAll("[data-product-carousel]").forEach(initializeProductCarousel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeProductCarousels, { once: true });
  } else {
    initializeProductCarousels();
  }
})();

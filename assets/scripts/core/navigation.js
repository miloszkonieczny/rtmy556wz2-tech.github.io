const DESKTOP_QUERY = "(min-width: 1121px)";
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getHeader(root = document) {
  return root.querySelector("[data-site-header]");
}

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.offsetParent !== null,
  );
}

function normalizePath(pathname) {
  const path = pathname.replace(/\/index\.html$/, "/");
  return path.endsWith("/") ? path : `${path}`;
}

function isHomePath(pathname) {
  const normalized = normalizePath(pathname);
  return normalized === "/" || normalized.endsWith("/");
}

function isSameHomepageUrl(url) {
  const currentPath = normalizePath(window.location.pathname);
  const targetPath = normalizePath(url.pathname);
  const currentIsHome = currentPath === "/" || currentPath.endsWith("/");
  const targetIsHome = targetPath === "/" || targetPath.endsWith("/");
  return window.location.origin === url.origin && currentIsHome && targetIsHome;
}

function closeDesktopDropdown(header) {
  const button = header.querySelector("[data-legal-menu-button]");
  const menu = header.querySelector("[data-legal-menu]");
  const dropdown = header.querySelector("[data-nav-dropdown]");
  if (!button || !menu || !dropdown) return;

  dropdown.classList.remove("is-open");
  button.setAttribute("aria-expanded", "false");
  menu.hidden = true;
}

function openDesktopDropdown(header) {
  const button = header.querySelector("[data-legal-menu-button]");
  const menu = header.querySelector("[data-legal-menu]");
  const dropdown = header.querySelector("[data-nav-dropdown]");
  if (!button || !menu || !dropdown) return;

  dropdown.classList.add("is-open");
  button.setAttribute("aria-expanded", "true");
  menu.hidden = false;
}

function initializeDesktopDropdown(header) {
  const button = header.querySelector("[data-legal-menu-button]");
  const menu = header.querySelector("[data-legal-menu]");
  const dropdown = header.querySelector("[data-nav-dropdown]");
  if (!button || !menu || !dropdown) return;

  let closeTimer;
  menu.hidden = true;

  function scheduleClose() {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => closeDesktopDropdown(header), 130);
  }

  function cancelClose() {
    window.clearTimeout(closeTimer);
  }

  button.addEventListener("click", () => {
    openDesktopDropdown(header);
  });

  dropdown.addEventListener("mouseenter", () => {
    cancelClose();
    openDesktopDropdown(header);
  });
  dropdown.addEventListener("mouseleave", scheduleClose);
  dropdown.addEventListener("focusin", () => {
    cancelClose();
    openDesktopDropdown(header);
  });
  dropdown.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) closeDesktopDropdown(header);
    }, 0);
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.contains(event.target)) closeDesktopDropdown(header);
  });
}

function closeMobileMenu(header, options = {}) {
  const toggle = header.querySelector("[data-mobile-menu-toggle]");
  const drawer = header.querySelector("[data-mobile-menu]");
  const overlay = header.querySelector("[data-mobile-menu-overlay]");
  const legalButton = header.querySelector("[data-mobile-legal-button]");
  const legalPanel = header.querySelector("[data-mobile-legal-panel]");
  if (!toggle || !drawer || !overlay) return;

  const wasOpen = toggle.getAttribute("aria-expanded") === "true";
  document.body.classList.remove("is-mobile-nav-open");
  toggle.setAttribute("aria-expanded", "false");
  if (legalButton && legalPanel) {
    legalButton.setAttribute("aria-expanded", "false");
    legalPanel.hidden = true;
  }
  window.setTimeout(() => {
    if (!document.body.classList.contains("is-mobile-nav-open")) {
      drawer.hidden = true;
      overlay.hidden = true;
    }
  }, 220);
  if (wasOpen && options.returnFocus !== false) toggle.focus();
}

function openMobileMenu(header) {
  const toggle = header.querySelector("[data-mobile-menu-toggle]");
  const drawer = header.querySelector("[data-mobile-menu]");
  const overlay = header.querySelector("[data-mobile-menu-overlay]");
  const closeButton = header.querySelector("[data-mobile-menu-close]");
  if (!toggle || !drawer || !overlay) return;

  toggle.setAttribute("aria-expanded", "true");
  overlay.hidden = false;
  drawer.hidden = false;
  window.requestAnimationFrame(() => {
    document.body.classList.add("is-mobile-nav-open");
    closeButton?.focus();
  });
}

function initializeMobileMenu(header) {
  const toggle = header.querySelector("[data-mobile-menu-toggle]");
  const drawer = header.querySelector("[data-mobile-menu]");
  const overlay = header.querySelector("[data-mobile-menu-overlay]");
  const closeButton = header.querySelector("[data-mobile-menu-close]");
  const legalButton = header.querySelector("[data-mobile-legal-button]");
  const legalPanel = header.querySelector("[data-mobile-legal-panel]");
  if (!toggle || !drawer || !overlay) return;

  drawer.hidden = true;
  overlay.hidden = true;
  if (legalButton && legalPanel) legalPanel.hidden = true;

  toggle.addEventListener("click", () => openMobileMenu(header));
  closeButton?.addEventListener("click", () => closeMobileMenu(header));
  overlay.addEventListener("click", () => closeMobileMenu(header));

  legalButton?.addEventListener("click", () => {
    if (!legalPanel) return;
    const isExpanded = legalButton.getAttribute("aria-expanded") === "true";
    legalButton.setAttribute("aria-expanded", String(!isExpanded));
    legalPanel.hidden = isExpanded;
  });

  drawer.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) {
      closeMobileMenu(header, { returnFocus: false });
    }
  });

  drawer.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusableElements = getFocusableElements(drawer);
    if (!focusableElements.length) return;

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function clearActiveState(header) {
  header.querySelectorAll("[data-nav-link]").forEach((link) => {
    link.classList.remove("is-active");
    link.removeAttribute("aria-current");
  });
  header.querySelectorAll("[data-nav-legal-trigger]").forEach((button) => {
    button.classList.remove("is-active");
  });
}

function ensureAccountNavigation(header) {
  const homeLink = header.querySelector(".brand[href]");
  const headerActions = header.querySelector(".header-actions");
  const mobileList = header.querySelector(".mobile-nav-list");
  if (!homeLink) return;

  const accountUrl = new URL("./account.html", homeLink.href).href;

  if (headerActions && !headerActions.querySelector("[data-account-nav-link]")) {
    const accountLink = document.createElement("a");
    accountLink.className = "text-link header-account-link";
    accountLink.href = accountUrl;
    accountLink.textContent = "Account";
    accountLink.dataset.i18n = "nav.account";
    accountLink.dataset.navLink = "";
    accountLink.dataset.navPage = "account";
    accountLink.dataset.accountNavLink = "";
    headerActions.insertBefore(accountLink, headerActions.firstChild);
  }

  if (mobileList && !mobileList.querySelector("[data-account-nav-link]")) {
    const item = document.createElement("li");
    const accountLink = document.createElement("a");
    accountLink.className = "mobile-nav-link";
    accountLink.href = accountUrl;
    accountLink.textContent = "Account";
    accountLink.dataset.i18n = "nav.account";
    accountLink.dataset.navLink = "";
    accountLink.dataset.navPage = "account";
    accountLink.dataset.accountNavLink = "";
    item.appendChild(accountLink);
    mobileList.appendChild(item);
  }
}

function setActiveLink(header, selector, currentType = "page") {
  clearActiveState(header);
  header.querySelectorAll(selector).forEach((link) => {
    link.classList.add("is-active");
    link.setAttribute("aria-current", currentType);
  });
}

function updateActiveNavigation(header) {
  const page = document.body.dataset.page || "home";
  const path = normalizePath(window.location.pathname);

  if (page === "legal" || path.includes("/legal/")) {
    clearActiveState(header);
    header.querySelectorAll("[data-nav-legal-trigger]").forEach((button) => button.classList.add("is-active"));
    header.querySelectorAll('[data-nav-link][href*="/legal/"]').forEach((link) => {
      const linkPath = normalizePath(new URL(link.href, window.location.href).pathname);
      if (linkPath === path) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
    });
    return;
  }

  if (page === "builder" || page === "story" || path.endsWith("/story-builder.html") || path.endsWith("/story.html")) {
    setActiveLink(header, '[data-nav-page="builder"]');
    return;
  }

  if (page === "account" || path.endsWith("/account.html")) {
    setActiveLink(header, '[data-nav-page="account"]');
    return;
  }

  const hash = window.location.hash.replace("#", "");
  if (hash) {
    setActiveLink(header, `[data-nav-section="${hash}"]`, "location");
    return;
  }

  clearActiveState(header);
}

function initializeSamePageNavigation(header) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  header.querySelectorAll('a[href*="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const url = new URL(link.href, window.location.href);
      if (!url.hash || !isSameHomepageUrl(url)) return;

      const target = document.querySelector(url.hash);
      if (!target) return;

      event.preventDefault();
      closeMobileMenu(header, { returnFocus: false });
      window.history.pushState(null, "", url.hash);
      target.scrollIntoView({
        behavior: prefersReducedMotion.matches ? "auto" : "smooth",
        block: "start",
      });
      updateActiveNavigation(header);
    });
  });

  window.addEventListener("hashchange", () => updateActiveNavigation(header));
}

function initializeSectionTracking(header) {
  if (!isHomePath(window.location.pathname) || !("IntersectionObserver" in window)) return;

  const sectionIds = ["how-it-works", "language-learning", "about", "contact"];
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const activeHash = window.location.hash.replace("#", "");
      if (activeHash && sectionIds.includes(activeHash)) {
        setActiveLink(header, `[data-nav-section="${activeHash}"]`, "location");
        return;
      }

      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
      if (!visibleEntry) return;
      setActiveLink(header, `[data-nav-section="${visibleEntry.target.id}"]`, "location");
    },
    {
      rootMargin: "-25% 0px -55% 0px",
      threshold: [0.18, 0.35, 0.55],
    },
  );

  sections.forEach((section) => observer.observe(section));
}

export function initializeSiteNavigation(root = document) {
  const header = getHeader(root);
  if (!header || header.dataset.navigationInitialized === "true") return;

  header.dataset.navigationInitialized = "true";
  ensureAccountNavigation(header);
  initializeDesktopDropdown(header);
  initializeMobileMenu(header);
  initializeSamePageNavigation(header);
  initializeSectionTracking(header);
  updateActiveNavigation(header);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeDesktopDropdown(header);
    closeMobileMenu(header);
  });

  window.matchMedia(DESKTOP_QUERY).addEventListener("change", () => {
    closeMobileMenu(header, { returnFocus: false });
    closeDesktopDropdown(header);
  });
}

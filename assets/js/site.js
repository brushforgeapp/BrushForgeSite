(function () {
  'use strict';

  document.documentElement.classList.add('js');

  const mobileQuery = window.matchMedia('(max-width: 768px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function activateDeferredStylesheets() {
    document.querySelectorAll('link[data-deferred-stylesheet]').forEach((stylesheet) => {
      stylesheet.media = 'all';
      stylesheet.removeAttribute('data-deferred-stylesheet');
    });
  }

  function setupMobileNavigation(header, index) {
    const nav = header.querySelector('[data-nav-menu], [data-site-nav], .navlinks');
    if (!nav) return;

    if (!nav.id) nav.id = index === 0 ? 'primary-navigation' : `primary-navigation-${index + 1}`;
    nav.setAttribute('data-nav-menu', '');

    let toggle = header.querySelector('[data-nav-toggle]');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-toggle';
      toggle.setAttribute('data-nav-toggle', '');
      toggle.innerHTML = '<span class="nav-toggle-icon" aria-hidden="true"></span>';
      nav.parentNode.insertBefore(toggle, nav);
    }

    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');

    function focusFirstLink() {
      const firstLink = nav.querySelector('a[href]');
      if (firstLink) firstLink.focus();
    }

    function setOpen(open, options) {
      const shouldOpen = Boolean(open && mobileQuery.matches);
      nav.classList.toggle('is-open', shouldOpen);
      toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', shouldOpen ? 'Close navigation' : 'Open navigation');
      document.body.classList.toggle('nav-open', shouldOpen);

      if (shouldOpen && options?.focusMenu) {
        window.requestAnimationFrame(focusFirstLink);
      } else if (!shouldOpen && options?.returnFocus) {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      setOpen(open, { focusMenu: open });
    });

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a[href]')) setOpen(false);
    });

    header.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        setOpen(false, { returnFocus: true });
        return;
      }

      if (event.key === 'Tab' && toggle.getAttribute('aria-expanded') === 'true') {
        const focusable = [toggle, ...nav.querySelectorAll('a[href], button:not([disabled])')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    document.addEventListener('click', (event) => {
      if (!header.contains(event.target) && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
      }
    });

    mobileQuery.addEventListener?.('change', () => setOpen(false));
    setOpen(false);
  }

  function setupLegacyFaq() {
    document.querySelectorAll('.faq .q').forEach((trigger, index) => {
      const item = trigger.closest('.item');
      const answer = item?.querySelector('.a');
      if (!item || !answer) return;

      if (!answer.id) answer.id = `faq-answer-${index + 1}`;
      if (!trigger.hasAttribute('role')) trigger.setAttribute('role', 'button');
      if (!trigger.hasAttribute('tabindex')) trigger.setAttribute('tabindex', '0');
      trigger.setAttribute('aria-controls', answer.id);
      trigger.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
    });

    function toggleFaq(trigger) {
      const item = trigger.closest('.item');
      if (!item) return;
      const shouldOpen = !item.classList.contains('open');

      document.querySelectorAll('.faq .item').forEach((faqItem) => {
        faqItem.classList.remove('open');
        faqItem.querySelector('.q')?.setAttribute('aria-expanded', 'false');
      });

      item.classList.toggle('open', shouldOpen);
      trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('.faq .q');
      if (!trigger) return;
      event.preventDefault();
      toggleFaq(trigger);
    });

    document.addEventListener('keydown', (event) => {
      const trigger = event.target.closest('.faq .q');
      if (!trigger || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      toggleFaq(trigger);
    });
  }

  function setupShareButtons() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-share]');
      if (!button) return;
      event.preventDefault();

      const shareData = {
        title: 'BrushForge | Miniature Paint Converter & Painting Toolkit',
        text: 'Compare miniature paints and keep your painting projects organized with BrushForge.',
        url: 'https://brushforgeapp.com/'
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
          return;
        }
        if (!navigator.clipboard?.writeText) return;

        const originalLabel = button.textContent;
        await navigator.clipboard.writeText(shareData.url);
        button.textContent = 'Link copied';
        window.setTimeout(() => { button.textContent = originalLabel; }, 1500);
      } catch {
        // Share sheets can be dismissed; no error UI is needed in that case.
      }
    });
  }

  function setupMatchReports() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-match-report]');
      if (!link) return;

      const row = link.closest('tr');
      const chart = document.querySelector('[data-chart-source-brand][data-chart-target-brand]');
      if (!row || !chart || row.cells.length < 4) return;

      const sourceName = row.cells[0].querySelector('a.name')?.textContent.trim() || 'Unknown paint';
      const sourceDetails = row.cells[0].querySelector('div.meta')?.textContent.trim() || '';
      const targetName = row.cells[1].querySelector('a.name')?.textContent.trim() || 'No target';
      const targetCode = row.cells[1].querySelector('span.meta')?.textContent.trim() || '';
      const targetDetails = row.cells[2].textContent.replace(/\s+/g, ' ').trim();
      const delta = row.cells[3].querySelector('.bf-de')?.textContent.trim() || 'Not shown';
      const source = `${chart.dataset.chartSourceBrand} / ${sourceName}${sourceDetails ? ` / ${sourceDetails}` : ''}`;
      const target = `${chart.dataset.chartTargetBrand} / ${targetName}${targetDetails ? ` / ${targetDetails}` : ''}${targetCode ? ` / ${targetCode}` : ''}`;
      const body = [
        'I would like to report a catalogue match that may be inaccurate.',
        '',
        `Source: ${source}`,
        `Target: ${target}`,
        `Displayed Delta E 2000: ${delta}`,
        `Catalogue updated: ${chart.dataset.catalogueDate}`,
        '',
        'What looks inaccurate:',
        '',
      ].join('\n');
      const params = new URLSearchParams({
        subject: `BrushForge paint match report: ${chart.dataset.chartSourceBrand} ${sourceName}`,
        body,
      });
      link.href = `mailto:brushforgeapp@gmail.com?${params.toString()}`;
    });
  }

  function setupChartAnchors() {
    if (!document.querySelector('.bf-chart-group')) return;

    function chartTarget(hash) {
      if (!hash || hash === '#') return null;
      try {
        const target = document.getElementById(decodeURIComponent(hash.slice(1)));
        return target?.closest('.bf-chart-group') ? target : null;
      } catch {
        return null;
      }
    }

    function settleTarget(target) {
      // content-visibility can refine a long chart's geometry after the native
      // fragment jump. Re-align once the requested section has been rendered.
      window.setTimeout(() => target.scrollIntoView({ block: 'start' }), 80);
      window.setTimeout(() => target.scrollIntoView({ block: 'start' }), 320);
    }

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      const target = link ? chartTarget(link.getAttribute('href')) : null;
      if (target) settleTarget(target);
    });

    const initialTarget = chartTarget(window.location.hash);
    if (initialTarget) settleTarget(initialTarget);
  }

  function setupStorePriority() {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const isAndroid = /android/i.test(`${userAgent} ${platform}`);
    const isIOS = /iphone|ipad|ipod/i.test(`${userAgent} ${platform}`)
      || (/mac/i.test(platform) && navigator.maxTouchPoints > 1);
    const preferredPlatform = isAndroid ? 'android' : (isIOS ? 'ios' : '');
    if (!preferredPlatform) return;

    const storeLinks = document.querySelectorAll(
      'a[data-analytics-platform], a[data-store-platform], a[href*="play.google.com"], a[href*="apps.apple.com"]'
    );

    storeLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const linkPlatform = link.dataset.analyticsPlatform
        || link.dataset.storePlatform
        || (/play\.google\.com/i.test(href) ? 'android' : '')
        || (/apps\.apple\.com/i.test(href) ? 'ios' : '');

      if (linkPlatform !== preferredPlatform) return;
      link.classList.add('store-link-priority');
      link.closest('.store-card')?.classList.add('store-card-priority');
    });
  }

  function pageFamilyFromPath(pathname) {
    if (pathname === '/' || pathname === '/index.html') return 'homepage';
    if (pathname === '/convert/' || pathname === '/convert/index.html') return 'web_converter';
    if (pathname.startsWith('/convert/')) return 'conversion_chart';
    if (/^\/paints\/[^/]+\/[^/]+\.html$/.test(pathname)) return 'paint_detail';
    if (pathname === '/paints/' || /^\/paints\/[^/]+\/?$/.test(pathname)) return 'paint_hub';
    if (pathname.startsWith('/guides/')) return 'guide';
    if (pathname.startsWith('/features/')) return 'feature';
    if (pathname.startsWith('/methodology/')) return 'methodology';
    if (pathname.startsWith('/press/')) return 'press';
    if (pathname.startsWith('/download/')) return 'download';
    if (pathname === '/about.html') return 'about';
    if (pathname === '/the-story.html') return 'story';
    if (pathname === '/privacy.html') return 'privacy';
    if (pathname === '/terms.html') return 'terms';
    if (pathname === '/legal.html') return 'legal';
    if (pathname === '/support.html') return 'support';
    if (pathname === '/404.html') return 'not_found';
    if (pathname.startsWith('/auth/')) return 'auth';
    return 'core';
  }

  function installCampaignForPageFamily(pageFamily) {
    const configured = window.BRUSHFORGE_SITE_CONFIG?.pageFamilyCampaigns?.[pageFamily];
    if (configured) return configured;
    if (pageFamily === 'homepage') return 'homepage';
    if (pageFamily === 'web_converter') return 'web_converter';
    if (pageFamily === 'conversion_chart') return 'conversion_chart';
    if (pageFamily === 'paint_detail' || pageFamily === 'paint_hub') return 'paint_detail';
    if (pageFamily === 'press') return 'reviewer_or_creator';
    if (pageFamily === 'download') return 'download';
    return 'content';
  }

  function installDevice() {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const isAndroid = /android/i.test(`${userAgent} ${platform}`);
    const isIOS = /iphone|ipad|ipod/i.test(`${userAgent} ${platform}`)
      || (/mac/i.test(platform) && navigator.maxTouchPoints > 1);
    const alternateIOSBrowser = /crios|fxios|edgios|opios|duckduckgo|gsa/i.test(userAgent);
    const isIOSSafari = isIOS
      && /version\/[\d.]+.*safari/i.test(userAgent)
      && !alternateIOSBrowser;

    return {
      platform: isAndroid ? 'android' : (isIOS ? 'ios' : 'unknown'),
      isIOSSafari,
    };
  }

  function validInstallUrl(value, kind) {
    if (!value) return '';

    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      if ((kind === 'android' || kind === 'ios') && url.protocol !== 'https:') return '';
      if (kind === 'android' && url.hostname !== 'play.google.com') return '';
      if (kind === 'ios' && url.hostname !== 'apps.apple.com') return '';
      if (kind === 'download' && url.origin !== window.location.origin) return '';
      return url.toString();
    } catch {
      return '';
    }
  }

  function downloadUrlFor(sourceFamily, configuredUrl) {
    const configured = validInstallUrl(configuredUrl, 'download');
    if (configured) return configured;
    return `/download/?from=${encodeURIComponent(sourceFamily)}`;
  }

  function androidCampaignUrl(baseUrl, campaign, placement) {
    const validUrl = validInstallUrl(baseUrl, 'android');
    if (!validUrl) return '';

    const url = new URL(validUrl);
    if (!url.searchParams.has('referrer')) {
      const campaignConfig = window.BRUSHFORGE_SITE_CONFIG?.androidCampaign || {};
      const referrer = new URLSearchParams({
        utm_source: campaignConfig.source || 'brushforgeapp.com',
        utm_medium: campaignConfig.medium || 'web',
        utm_campaign: campaign,
        utm_content: placement,
      });
      url.searchParams.set('referrer', referrer.toString());
    }
    return url.toString();
  }

  function storeDestination(options) {
    const siteConfig = window.BRUSHFORGE_SITE_CONFIG || {};
    const stores = siteConfig.stores || {};
    const iosCampaigns = siteConfig.iosCampaigns || {};
    const source = options.source;
    const campaign = options.campaign;
    const placement = options.placement;

    if (options.platform === 'android') {
      const androidUrl = source?.dataset.androidUrl || options.androidUrl || stores.android;
      const href = androidCampaignUrl(androidUrl, campaign, placement);
      if (href) return { href, platform: 'android', isStore: true };
    }

    if (options.platform === 'ios') {
      const iosUrl = iosCampaigns[campaign]
        || source?.dataset.iosUrl
        || options.iosUrl
        || stores.ios;
      const href = validInstallUrl(iosUrl, 'ios');
      if (href) return { href, platform: 'ios', isStore: true };
    }

    return {
      href: downloadUrlFor(options.pageFamily, source?.dataset.downloadUrl || options.downloadUrl),
      platform: 'unknown',
      isStore: false,
    };
  }

  function setupStoreRouting() {
    const device = installDevice();

    document.querySelectorAll('a[data-store-route]').forEach((link) => {
      const pageFamily = link.dataset.analyticsPageFamily
        || link.dataset.installPageFamily
        || pageFamilyFromPath(window.location.pathname);
      const campaign = link.dataset.storeCampaign || installCampaignForPageFamily(pageFamily);
      const placement = link.dataset.analyticsPlacement || 'store_route';
      const destination = storeDestination({
        platform: device.platform,
        source: link,
        pageFamily,
        campaign,
        placement,
      });

      link.href = destination.href;
      link.dataset.analyticsPageFamily = pageFamily;

      if (destination.isStore) {
        link.dataset.analyticsEvent = 'app_store_click';
        link.dataset.analyticsPlatform = destination.platform;
        link.rel = 'noopener';
      } else {
        if (link.dataset.analyticsEvent === 'app_store_click') delete link.dataset.analyticsEvent;
        delete link.dataset.analyticsPlatform;
      }
    });
  }

  function setupAnalyticsConsentUI() {
    let panel = null;
    let settingsTrigger = null;
    let returnFocusAfterChoice = false;

    function consentState() {
      return window.BRUSHFORGE_CONSENT_STATE || {
        state: 'disabled',
        pending: false,
        enabled: false,
        settingsOpen: false,
      };
    }

    function addSettingsLinks() {
      document.querySelectorAll('.footer-links').forEach((links) => {
        if (links.querySelector('[data-analytics-settings]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bf-analytics-settings-link';
        button.textContent = 'Analytics settings';
        button.setAttribute('data-analytics-settings', '');
        button.addEventListener('click', () => {
          settingsTrigger = button;
        });
        links.appendChild(button);
      });
    }

    function removeSettingsLinks() {
      document.querySelectorAll('[data-analytics-settings]').forEach((link) => link.remove());
    }

    function buildPanel() {
      if (panel) return panel;

      panel = document.createElement('aside');
      panel.className = 'bf-consent-panel';
      panel.hidden = true;
      panel.setAttribute('data-consent-ui', '');
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', 'brushforge-consent-heading');
      panel.setAttribute('aria-live', 'polite');
      panel.innerHTML = [
        '<div class="bf-consent-panel-inner">',
        '<div class="bf-consent-copy">',
        '<h2 id="brushforge-consent-heading">Help improve BrushForge</h2>',
        '<p>Allow basic website analytics so I can see which pages and tools are useful. Paint names, search text, collection data, photos and account details are never sent. <a href="/privacy.html">Privacy</a></p>',
        '</div>',
        '<div class="bf-consent-actions">',
        '<button type="button" data-analytics-consent="grant">Allow analytics</button>',
        '<button type="button" data-analytics-consent="deny">No thanks</button>',
        '</div>',
        '<button class="bf-consent-close" type="button" data-analytics-settings-close aria-label="Close analytics settings" hidden>',
        '<span aria-hidden="true">&times;</span>',
        '</button>',
        '<p class="bf-consent-status" role="status" hidden></p>',
        '</div>',
      ].join('');
      document.body.appendChild(panel);

      panel.querySelectorAll('[data-analytics-consent]').forEach((button) => {
        button.addEventListener('click', () => {
          returnFocusAfterChoice = Boolean(consentState().settingsOpen && settingsTrigger);
        });
      });
      panel.querySelector('[data-analytics-settings-close]').addEventListener('click', () => {
        returnFocusAfterChoice = Boolean(settingsTrigger);
      });
      return panel;
    }

    function setPanelVisible(visible) {
      if (!panel) return;
      const currentlyVisible = !panel.hidden;
      if (visible === currentlyVisible) return;

      panel.hidden = !visible;
      document.body.classList.toggle('has-bf-consent-panel', visible);

      if (visible) {
        panel.classList.remove('is-visible');
        window.requestAnimationFrame(() => {
          if (panel.hidden) return;
          panel.classList.add('is-visible');
          const clearance = Math.ceil(panel.getBoundingClientRect().height + 28);
          document.documentElement.style.setProperty('--bf-consent-panel-clearance', `${clearance}px`);
        });
      } else {
        panel.classList.remove('is-visible');
        document.documentElement.style.removeProperty('--bf-consent-panel-clearance');
        if (returnFocusAfterChoice && settingsTrigger?.isConnected) {
          window.requestAnimationFrame(() => settingsTrigger.focus());
        }
        returnFocusAfterChoice = false;
      }
    }

    function render(nextState) {
      const state = nextState && typeof nextState === 'object' ? nextState : consentState();
      if (!state.enabled) {
        setPanelVisible(false);
        removeSettingsLinks();
        return;
      }

      addSettingsLinks();
      const consentPanel = buildPanel();
      const settingsOpen = state.settingsOpen === true;
      const shouldShow = state.state === 'pending' || settingsOpen;
      const close = consentPanel.querySelector('[data-analytics-settings-close]');
      const grant = consentPanel.querySelector('[data-analytics-consent="grant"]');
      const deny = consentPanel.querySelector('[data-analytics-consent="deny"]');
      const status = consentPanel.querySelector('.bf-consent-status');
      const privacySignal = Boolean(state.privacySignal);

      consentPanel.dataset.analyticsConsentState = state.state;
      consentPanel.classList.toggle('is-settings-open', settingsOpen);
      close.hidden = !settingsOpen;
      grant.disabled = privacySignal;
      grant.setAttribute('aria-pressed', state.choice === 'granted' ? 'true' : 'false');
      deny.setAttribute('aria-pressed', state.choice === 'denied' ? 'true' : 'false');
      status.hidden = !privacySignal;
      status.textContent = privacySignal
        ? 'Your browser privacy setting keeps website analytics off.'
        : '';
      setPanelVisible(shouldShow);
    }

    document.addEventListener('brushforge:consent-state', (event) => {
      render(event.detail);
    });
    document.addEventListener('brushforge:analytics-settings-open', () => {
      window.requestAnimationFrame(() => {
        panel?.querySelector('[data-analytics-consent="grant"]')?.focus();
      });
    });

    render(consentState());
  }

  function setupStoreCtaViewTracking() {
    if (!("IntersectionObserver" in window)) return;

    const selector = [
      'a[data-analytics-event="app_store_click"][data-analytics-platform]',
      'a[data-analytics-event="open_in_app"][data-analytics-platform]',
    ].join(',');
    const observed = new Set();
    const counted = new WeakSet();
    const timers = new Map();
    let consentGranted = window.BRUSHFORGE_CONSENT_STATE?.state === 'granted';

    function clearTimer(link) {
      const timer = timers.get(link);
      if (timer) window.clearTimeout(timer);
      timers.delete(link);
    }

    function trackAfterDelay(link) {
      if (!consentGranted || counted.has(link) || timers.has(link)) return;
      const timer = window.setTimeout(() => {
        timers.delete(link);
        if (!consentGranted || counted.has(link)) return;
        const rect = link.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const visibleArea = visibleWidth * visibleHeight;
        const totalArea = Math.max(1, rect.width * rect.height);
        if (visibleArea / totalArea < 0.5) return;
        const tracked = window.brushForgeTrack?.('store_cta_view', {
          platform: link.dataset.analyticsPlatform,
          placement: link.dataset.analyticsPlacement,
          page_family: link.dataset.analyticsPageFamily,
          source_brand: link.dataset.analyticsSourceBrand,
        });
        if (tracked) counted.add(link);
      }, 1000);
      timers.set(link, timer);
    }

    function atLeastHalfVisible(link) {
      const rect = link.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      return (visibleWidth * visibleHeight) / Math.max(1, rect.width * rect.height) >= 0.5;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio >= 0.5) trackAfterDelay(entry.target);
        else clearTimer(entry.target);
      });
    }, { threshold: [0, 0.5, 1] });

    function observe(root) {
      const links = [];
      if (root instanceof Element && root.matches(selector)) links.push(root);
      links.push(...Array.from(root.querySelectorAll?.(selector) || []));
      links.forEach((link) => {
        if (observed.has(link)) return;
        observed.add(link);
        observer.observe(link);
      });
    }

    observe(document);
    if ('MutationObserver' in window) {
      const mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) observe(node);
          });
        });
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('brushforge:consent-state', (event) => {
      consentGranted = event.detail?.state === 'granted';
      if (!consentGranted) timers.forEach((_timer, link) => clearTimer(link));
      else observed.forEach((link) => {
        if (atLeastHalfVisible(link)) trackAfterDelay(link);
      });
    });
  }

  function setupContextualInstallPrompt() {
    const promptQuery = window.matchMedia('(max-width: 768px)');
    const device = installDevice();
    const siteConfig = window.BRUSHFORGE_SITE_CONFIG || {};
    const configured = siteConfig.installPrompt || {};
    const configElement = document.querySelector('[data-install-prompt-config]') || document.body;
    const pageFamily = configElement.dataset.installPageFamily
      || configElement.dataset.analyticsPageFamily
      || configured.pageFamily
      || pageFamilyFromPath(window.location.pathname);
    const eligibleFamilies = new Set([
      'homepage',
      'web_converter',
      'conversion_chart',
      'paint_detail',
      'paint_hub',
      'guide',
      'feature',
      'methodology',
      'press',
      'about',
      'story',
    ]);
    const explicitlyEnabled = configElement.dataset.installPrompt === 'true' || configured.enabled === true;
    const explicitlyDisabled = configElement.dataset.installPrompt === 'false' || configured.enabled === false;

    document.querySelectorAll('.sticky-mobile-cta').forEach((legacyPrompt) => {
      legacyPrompt.hidden = true;
    });

    if (explicitlyDisabled || (!explicitlyEnabled && !eligibleFamilies.has(pageFamily)) || device.isIOSSafari) {
      return;
    }

    const defaultMessages = {
      homepage: 'Keep paints, recipes, and projects together.',
      web_converter: 'Keep your paint matches with you at the painting desk.',
      conversion_chart: 'Continue this paint comparison in BrushForge.',
      paint_detail: 'Keep this paint with your collection and projects.',
      paint_hub: 'Take the paint catalogue to your painting desk.',
      guide: 'Put this guide into practice with BrushForge.',
      feature: 'Continue this workflow in BrushForge.',
      methodology: 'Use catalogue matches in BrushForge.',
      press: 'Explore BrushForge on your device.',
      about: 'Try BrushForge at your painting desk.',
      story: 'Try BrushForge at your painting desk.',
    };
    const sessionKey = 'brushforge.installPrompt.dismissed';
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(sessionKey) === 'true';
    } catch {
      // The prompt still works when session storage is unavailable.
    }
    if (dismissed) return;

    const prompt = document.createElement('aside');
    const messageId = 'brushforge-install-prompt-message';
    prompt.className = 'bf-install-prompt';
    prompt.hidden = true;
    prompt.setAttribute('data-install-prompt-runtime', '');
    prompt.setAttribute('role', 'region');
    prompt.setAttribute('aria-label', 'Get BrushForge');
    prompt.setAttribute('aria-live', 'polite');
    prompt.setAttribute('aria-atomic', 'true');
    prompt.innerHTML = [
      '<div class="bf-install-prompt-inner">',
      `<p class="bf-install-prompt-message" id="${messageId}"></p>`,
      `<a class="bf-install-prompt-action" aria-describedby="${messageId}"></a>`,
      '<button class="bf-install-prompt-dismiss" type="button" aria-label="Dismiss install prompt">',
      '<span aria-hidden="true">&times;</span>',
      '</button>',
      '</div>',
    ].join('');
    document.body.appendChild(prompt);

    const message = prompt.querySelector('.bf-install-prompt-message');
    const action = prompt.querySelector('.bf-install-prompt-action');
    const dismissButton = prompt.querySelector('.bf-install-prompt-dismiss');
    action.href = downloadUrlFor(pageFamily);
    const registeredSuppressors = new Set();
    const visibleSuppressors = new Set();
    let engaged = false;
    let viewTracked = false;
    let viewTrackScheduled = false;
    let consentPending = Boolean(window.BRUSHFORGE_CONSENT_STATE?.pending);
    let currentOptions = {};
    let scrollFrame = 0;

    const suppressionSelector = [
      '.footer',
      'footer',
      '[data-install-inline]',
      '[data-install-zone]',
      '.home-final-cta',
      '.cta-final',
      '.bf-cta',
      '.content-cta',
      '.bfc',
      '.download-grid',
      '[data-consent-ui]',
      '[data-consent-panel]',
      '.bf-consent-panel',
      configured.suppressionSelector,
      configElement.dataset.installSuppressionSelector,
    ].filter(Boolean).join(',');

    function elementIsVisible(element) {
      if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function elementIntersectsViewport(element) {
      if (!elementIsVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    }

    function consentIsVisible() {
      return Array.from(document.querySelectorAll('[data-consent-ui], [data-consent-panel], .bf-consent-panel'))
        .some(elementIntersectsViewport);
    }

    function navigationIsOpen() {
      return document.body.classList.contains('nav-open')
        || Boolean(document.querySelector('[data-nav-toggle][aria-expanded="true"]'));
    }

    function analyticsTrack(name, props) {
      if (typeof window.brushForgeTrack === 'function') {
        window.brushForgeTrack(name, props);
      }
    }

    function optionsFrom(source, detail) {
      const sourceData = source?.dataset || {};
      const supplied = detail && typeof detail === 'object' ? detail : {};
      const resolvedPageFamily = supplied.pageFamily
        || sourceData.installPageFamily
        || pageFamily;
      const placement = supplied.placement
        || sourceData.analyticsPlacement
        || configElement.dataset.analyticsPlacement
        || configured.placement
        || 'mobile_install_prompt';

      return {
        pageFamily: resolvedPageFamily,
        campaign: supplied.campaign
          || sourceData.storeCampaign
          || configured.campaign
          || installCampaignForPageFamily(resolvedPageFamily),
        placement,
        message: supplied.message
          || sourceData.installMessage
          || configElement.dataset.installMessage
          || configured.message
          || defaultMessages[resolvedPageFamily]
          || 'Continue in BrushForge.',
        label: supplied.label
          || sourceData.installLabel
          || configElement.dataset.installLabel
          || configured.label,
        androidUrl: supplied.androidUrl
          || sourceData.androidUrl
          || configElement.dataset.androidUrl
          || configured.androidUrl,
        iosUrl: supplied.iosUrl
          || sourceData.iosUrl
          || configElement.dataset.iosUrl
          || configured.iosUrl,
        downloadUrl: supplied.downloadUrl
          || sourceData.downloadUrl
          || configElement.dataset.downloadUrl
          || configured.downloadUrl,
        sourceBrand: supplied.sourceBrand || sourceData.analyticsSourceBrand,
        targetBrand: supplied.targetBrand || sourceData.analyticsTargetBrand,
      };
    }

    function updatePromptContent(options) {
      const destination = storeDestination({
        platform: device.platform,
        source: null,
        pageFamily: options.pageFamily,
        campaign: options.campaign,
        placement: options.placement,
        androidUrl: options.androidUrl,
        iosUrl: options.iosUrl,
        downloadUrl: options.downloadUrl,
      });
      const defaultLabel = destination.platform === 'android'
        ? 'Open Google Play'
        : (destination.platform === 'ios' ? 'Open the App Store' : 'Choose your app');

      message.textContent = options.message;
      action.textContent = options.label || defaultLabel;
      action.href = destination.href;
      action.dataset.analyticsPlacement = options.placement;
      action.dataset.analyticsPageFamily = options.pageFamily;
      if (options.sourceBrand) action.dataset.analyticsSourceBrand = options.sourceBrand;
      else delete action.dataset.analyticsSourceBrand;
      if (options.targetBrand) action.dataset.analyticsTargetBrand = options.targetBrand;
      else delete action.dataset.analyticsTargetBrand;

      if (destination.isStore) {
        action.rel = 'noopener';
        action.dataset.analyticsEvent = 'app_store_click';
        action.dataset.analyticsPlatform = destination.platform;
      } else {
        action.removeAttribute('rel');
        delete action.dataset.analyticsEvent;
        delete action.dataset.analyticsPlatform;
      }

      return destination;
    }

    function setVisible(visible) {
      const currentlyVisible = !prompt.hidden;
      if (visible === currentlyVisible) return;

      prompt.hidden = !visible;
      document.body.classList.toggle('has-bf-install-prompt', visible);

      if (visible) {
        prompt.classList.remove('is-visible');
        window.requestAnimationFrame(() => {
          if (prompt.hidden) return;
          prompt.classList.add('is-visible');
          const clearance = Math.ceil(prompt.getBoundingClientRect().height + 24);
          document.documentElement.style.setProperty('--bf-install-prompt-clearance', `${clearance}px`);
        });
      } else {
        prompt.classList.remove('is-visible');
        document.documentElement.style.removeProperty('--bf-install-prompt-clearance');
      }
    }

    function updateVisibility() {
      registeredSuppressors.forEach((element) => {
        if (elementIntersectsViewport(element)) visibleSuppressors.add(element);
        else visibleSuppressors.delete(element);
      });

      const shouldShow = engaged
        && !dismissed
        && promptQuery.matches
        && !navigationIsOpen()
        && !consentPending
        && !consentIsVisible()
        && visibleSuppressors.size === 0;
      setVisible(shouldShow);

      if (shouldShow && !viewTracked && !viewTrackScheduled) {
        viewTrackScheduled = true;
        window.requestAnimationFrame(() => {
          viewTrackScheduled = false;
          if (prompt.hidden || viewTracked) return;
          viewTracked = true;
          analyticsTrack('install_prompt_view', {
            platform: device.platform,
            placement: currentOptions.placement,
            page_family: currentOptions.pageFamily,
          });
        });
      }
    }

    function engage(source, detail) {
      if (dismissed) return;
      currentOptions = optionsFrom(source, detail);
      updatePromptContent(currentOptions);
      engaged = true;
      updateVisibility();
    }

    action.addEventListener('click', (event) => {
      event.stopPropagation();
      const platform = action.dataset.analyticsPlatform;
      if (!platform) return;
      analyticsTrack('app_store_click', {
        platform,
        placement: currentOptions.placement,
        page_family: currentOptions.pageFamily,
        source_brand: currentOptions.sourceBrand,
        target_brand: currentOptions.targetBrand,
      });
    });

    dismissButton.addEventListener('click', () => {
      analyticsTrack('install_prompt_dismiss', {
        platform: device.platform,
        placement: currentOptions.placement,
        page_family: currentOptions.pageFamily,
      });
      dismissed = true;
      try {
        window.sessionStorage.setItem(sessionKey, 'true');
      } catch {
        // Dismissal still applies for this page when storage is unavailable.
      }
      setVisible(false);
    });

    const suppressionObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && elementIsVisible(entry.target)) visibleSuppressors.add(entry.target);
          else visibleSuppressors.delete(entry.target);
        });
        updateVisibility();
      }, { threshold: 0.01 })
      : null;

    const suppressionAttributeObserver = 'MutationObserver' in window
      ? new MutationObserver(updateVisibility)
      : null;

    function registerSuppressors(root) {
      if (!suppressionSelector) return;
      let elements = [];
      try {
        if (root instanceof Element && root.matches(suppressionSelector)) elements.push(root);
        elements = elements.concat(Array.from(root.querySelectorAll?.(suppressionSelector) || []));
      } catch {
        return;
      }

      elements.forEach((element) => {
        if (element === prompt || registeredSuppressors.has(element)) return;
        registeredSuppressors.add(element);
        suppressionObserver?.observe(element);
        suppressionAttributeObserver?.observe(element, {
          attributes: true,
          attributeFilter: ['class', 'hidden', 'aria-hidden'],
        });
      });
    }

    registerSuppressors(document);

    if ('MutationObserver' in window) {
      const bodyObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) registerSuppressors(node);
          });
        });
        updateVisibility();
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });

      const navObserver = new MutationObserver(updateVisibility);
      navObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      document.querySelectorAll('[data-nav-toggle]').forEach((toggle) => {
        navObserver.observe(toggle, { attributes: true, attributeFilter: ['aria-expanded'] });
      });
    }

    function explicitTriggerElements() {
      const elements = Array.from(document.querySelectorAll(
        '[data-install-prompt-trigger], [data-install-trigger]'
      ));
      const familyTriggerSelectors = {
        homepage: '.toolkit-section',
        conversion_chart: '.bf-chart-group',
        paint_detail: '.bf-answer',
        paint_hub: '.bf-hubgrid',
      };
      const familyTrigger = familyTriggerSelectors[pageFamily];
      if (familyTrigger) {
        const firstFamilyTrigger = document.querySelector(familyTrigger);
        if (firstFamilyTrigger) elements.push(firstFamilyTrigger);
      }
      const configuredSelector = configElement.dataset.installTriggerSelector || configured.triggerSelector;
      if (!configuredSelector) return elements;
      try {
        return elements.concat(Array.from(document.querySelectorAll(configuredSelector)));
      } catch {
        return elements;
      }
    }

    const triggerElements = [...new Set(explicitTriggerElements())];
    if (triggerElements.length && 'IntersectionObserver' in window) {
      const triggerObserver = new IntersectionObserver((entries) => {
        const entry = entries.find((candidate) => candidate.isIntersecting);
        if (!entry) return;
        engage(entry.target);
        triggerObserver.disconnect();
      }, { threshold: 0.2 });
      triggerElements.forEach((element) => triggerObserver.observe(element));
    }

    function handleScroll() {
      scrollFrame = 0;
      if (!engaged) {
        const explicitTrigger = triggerElements.find(elementIntersectsViewport);
        if (explicitTrigger) {
          engage(explicitTrigger);
        } else {
          const scrollable = document.documentElement.scrollHeight - window.innerHeight;
          const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
          if (progress >= 0.35) engage(null, { placement: 'scroll_engagement' });
        }
      }
      updateVisibility();
    }

    function requestScrollUpdate() {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(handleScroll);
    }

    // Both events accept optional detail overrides for message, label, placement,
    // pageFamily, campaign, androidUrl, iosUrl, and downloadUrl.
    document.addEventListener('brushforge:converter-result', (event) => {
      engage(null, {
        placement: 'converter_result',
        message: 'Keep this paint match with you at the painting desk.',
        ...(event.detail && typeof event.detail === 'object' ? event.detail : {}),
      });
    });
    document.addEventListener('brushforge:install-prompt', (event) => {
      engage(null, event.detail);
    });
    document.addEventListener('brushforge:consent-state', (event) => {
      const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
      consentPending = detail.pending === true || detail.state === 'pending';
      updateVisibility();
    });

    window.addEventListener('scroll', requestScrollUpdate, { passive: true });
    window.addEventListener('resize', requestScrollUpdate, { passive: true });
    promptQuery.addEventListener?.('change', updateVisibility);
    handleScroll();
  }

  function setupChartFilters() {
    const mount = document.querySelector('[data-chart-filter-mount]');
    if (!mount) return;
    const rows = Array.from(document.querySelectorAll('[data-chart-row]'));
    if (!rows.length) return;

    const behaviors = [...new Set(rows.map((row) => row.dataset.behavior).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second));
    const behaviorOptions = behaviors.map((behavior) => (
      `<option value="${escapeHtml(behavior)}">${escapeHtml(behavior)}</option>`
    )).join('');
    mount.innerHTML = [
      '<form class="bf-chart-filters" data-chart-filters aria-label="Filter this conversion chart">',
      '<div class="bf-chart-filter-search"><label for="bf-chart-search">Search source paints</label>',
      '<input id="bf-chart-search" type="search" autocomplete="off" placeholder="Paint name or code"></div>',
      '<div><label for="bf-chart-behavior">Paint behavior</label>',
      `<select id="bf-chart-behavior"><option value="">All behaviors</option>${behaviorOptions}</select></div>`,
      '<label class="bf-chart-check"><input type="checkbox" data-chart-compatible> Compatible results only</label>',
      '<label class="bf-chart-check"><input type="checkbox" data-chart-close> Close results, ΔE2000 ≤5</label>',
      '<button class="btn" type="reset">Reset filters</button>',
      '<p class="bf-chart-filter-status" role="status" aria-live="polite" aria-atomic="true"></p>',
      '</form>',
    ].join('');

    const form = mount.querySelector('[data-chart-filters]');
    const query = form.querySelector('#bf-chart-search');
    const behavior = form.querySelector('#bf-chart-behavior');
    const compatible = form.querySelector('[data-chart-compatible]');
    const close = form.querySelector('[data-chart-close]');
    const status = form.querySelector('.bf-chart-filter-status');
    const trackedFilters = new Set();

    function normalizedSearch(value) {
      return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    }

    function trackFilter(feature) {
      if (trackedFilters.has(feature)) return;
      trackedFilters.add(feature);
      window.brushForgeTrack?.('chart_filter_use', { feature });
    }

    function applyFilters() {
      const term = normalizedSearch(query.value);
      let visible = 0;
      rows.forEach((row) => {
        const distance = Number(row.dataset.distance);
        const matches = (!term || row.dataset.sourceSearch.includes(term))
          && (!behavior.value || row.dataset.behavior === behavior.value)
          && (!compatible.checked || row.dataset.compatible === 'true')
          && (!close.checked || (row.dataset.distance !== '' && distance <= 5));
        row.hidden = !matches;
        if (matches) visible += 1;
      });
      document.querySelectorAll('.bf-chart-group').forEach((group) => {
        group.hidden = !group.querySelector('[data-chart-row]:not([hidden])');
      });
      status.textContent = `Showing ${visible} of ${rows.length} source paints.`;
    }

    query.addEventListener('input', () => {
      if (query.value.trim()) trackFilter('search');
      applyFilters();
    });
    behavior.addEventListener('change', () => {
      if (behavior.value) trackFilter('behavior');
      applyFilters();
    });
    compatible.addEventListener('change', () => {
      if (compatible.checked) trackFilter('compatible');
      applyFilters();
    });
    close.addEventListener('change', () => {
      if (close.checked) trackFilter('close');
      applyFilters();
    });
    form.addEventListener('reset', () => {
      window.requestAnimationFrame(() => {
        trackFilter('reset');
        applyFilters();
      });
    });
    applyFilters();
  }

  function setupReveals() {
    const elements = document.querySelectorAll('.reveal');
    if (!elements.length) return;

    if (reducedMotionQuery.matches || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('active'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('active');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    elements.forEach((element) => observer.observe(element));
  }

  function init() {
    activateDeferredStylesheets();
    document.querySelectorAll('.header').forEach(setupMobileNavigation);
    setupLegacyFaq();
    setupShareButtons();
    setupMatchReports();
    setupChartAnchors();
    setupStoreRouting();
    setupStorePriority();
    document.addEventListener('brushforge:converter-result', () => {
      window.requestAnimationFrame(setupStorePriority);
    });
    setupAnalyticsConsentUI();
    setupStoreCtaViewTracking();
    setupChartFilters();
    setupContextualInstallPrompt();
    setupReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

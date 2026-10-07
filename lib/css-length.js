module.exports = function resolveCSSLength(element, value, fallback) {
  value = value.trim();
  if (!value || /^(auto|initial|inherit|unset|min-content|max-content|fit-content)$/i.test(value)) {
    return fallback;
  }
  if (value === "0") return 0;
  if (!element.isConnected) {
    const pixels = /^\d*\.?\d+px$/.test(value) ? Number.parseFloat(value) : NaN;
    return Number.isFinite(pixels) ? pixels : fallback;
  }
  const probe = element.ownerDocument.createElement("span");
  probe.style.cssText =
    "position:absolute;display:block;visibility:hidden;pointer-events:none;font-size:inherit;";
  probe.style.width = `${fallback}px`;
  probe.style.width = value;
  element.appendChild(probe);
  try {
    const pixels = Number.parseFloat(
      element.ownerDocument.defaultView.getComputedStyle(probe).width,
    );
    return Number.isFinite(pixels) && pixels >= 0 ? pixels : fallback;
  } finally {
    probe.remove();
  }
};

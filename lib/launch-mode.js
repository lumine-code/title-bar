function resolveLaunchMode({ devMode, safeMode, sourceMode }) {
  if (safeMode) return "safe";
  if (sourceMode) return "source";
  if (devMode) return "dev";
  return null;
}

function resolveLaunchIconFile({ devMode, safeMode }) {
  if (safeMode) return "lumine-safe.svg";
  if (devMode) return "lumine-dev.svg";
  return "lumine.svg";
}

module.exports = { resolveLaunchMode, resolveLaunchIconFile };

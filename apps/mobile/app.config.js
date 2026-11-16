const fs = require('node:fs');

// app.json'daki yapılandırmayı genişletir. google-services.json git'te tutulmaz:
// EAS derlemesinde GOOGLE_SERVICES_JSON gizli dosya değişkeninden, yerelde klasördeki dosyadan okunur.
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};

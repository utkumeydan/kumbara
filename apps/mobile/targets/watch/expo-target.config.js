/** Apple Watch uygulaması: kalan tutar, günlük pay, seri ve zarflar. */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'watch',
  name: 'KumbaraWatch',
  displayName: 'Kumbara',
  icon: '../../assets/images/icon.png',
  deploymentTarget: '10.0',
  bundleIdentifier: '.watchkitapp',
  frameworks: ['SwiftUI'],
  colors: {
    $accent: '#FF6B57',
  },
});

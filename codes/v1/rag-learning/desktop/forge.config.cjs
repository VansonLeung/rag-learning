const path = require('node:path');
module.exports = {
  outDir: path.resolve(__dirname, 'out'),
  packagerConfig: {
    name: 'Grove',
    executableName: 'Grove',
    appBundleId: 'com.grove.ragexplorer',
    asar: false,
    ...(process.env.GROVE_SIGNING_IDENTITY
      ? { osxSign: { identity: process.env.GROVE_SIGNING_IDENTITY } }
      : {}),
    ...(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
      ? {
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {}),
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32', 'linux'] },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: { name: 'Grove', format: 'ULFO' },
    },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'Grove' } },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: { options: { maintainer: 'Grove contributors' } },
    },
    { name: '@electron-forge/maker-rpm', platforms: ['linux'], config: {} },
  ],
};

# Third-party notices

AE Designer is an independent project. Design Mode identifies the public behavioral reference, not this package's publisher. This project is not affiliated with Jake In Motion or Adobe.

| Bundled library | Version/source | License |
| --- | --- | --- |
| Paper.js | [0.12.18](https://github.com/paperjs/paper.js) | MIT; extension/vendor/paper-LICENSE.txt and source header |
| Clipper JavaScript | [6.4.2](https://www.npmjs.com/package/clipper-lib) | Boost Software License 1.0; notice retained in extension/vendor/clipper.js |
| CSInterface.js | [Adobe CEP 12 SDK](https://github.com/Adobe-CEP/CEP-Resources) | Adobe copyright/redistribution notice retained in source |
| JSON2 | [JSON-js](https://github.com/douglascrockford/JSON-js) | Public domain; source notice retained |
| @zimoby/ae-native-gradient | [0.2.0](https://github.com/zimoby/ae-native-gradient-toolkit) | MIT; extension/vendor/native-gradient-LICENSE.txt |

The native-gradient codec and FFX template fixtures are bundled from the toolkit. The build modifies its gradient stop count cap from 8 to 1024. The reproducible transformation is in scripts/bundle-gradient.mjs.

Panel code outside extension/vendor was written for AE Designer. Toolbar SVGs are independently drawn. Original reference screenshots, demonstration artwork, publisher binary and publisher source are not redistributed.

Development dependencies are declared in package.json and pinned in package-lock.json; they are not loaded by the installed extension. Project code is covered by the root MIT LICENSE; third-party code retains the licenses above.

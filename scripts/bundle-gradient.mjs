import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await mkdir('extension/vendor', { recursive: true });
await build({
  stdin: { contents: 'export {generateGradientFfx,resolveAepNativeGradients} from "@zimoby/ae-native-gradient";', resolveDir: process.cwd() },
  bundle: true, format: 'iife', globalName: 'NativeGradientCodec', target: 'chrome88',
  plugins:[{name:'expanded-gradient-stop-count',setup(build){build.onLoad({filter:/gcky-gradient\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('length > 8','length > 1024').replace('2..8 stops','2..1024 stops'),loader:'js'}));}}],
  minify: true, outfile: 'extension/vendor/native-gradient.js', legalComments: 'eof'
});
const presets = {};
for (const family of ['ae22-6', 'ae25-6', 'ae26-3']) {
  presets[family] = {};
  for (const kind of ['fill', 'stroke']) {
    const file = fileURLToPath(import.meta.resolve(`@zimoby/ae-native-gradient/templates/${family}/${kind}.ffx`));
    presets[family][kind] = (await readFile(file)).toString('base64');
  }
}
await writeFile('extension/vendor/gradient-presets.js', 'window.GradientPresets=' + JSON.stringify(presets) + ';\n');
await writeFile('extension/vendor/native-gradient-LICENSE.txt', await readFile('node_modules/@zimoby/ae-native-gradient/LICENSE'));

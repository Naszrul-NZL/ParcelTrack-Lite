import fs from 'node:fs';

const source = 'docs/design/airway.tokens.json';
const target = 'src/app/airway-tokens.css';
const tokens = JSON.parse(fs.readFileSync(source, 'utf8'));
const keys = Object.keys(tokens.themes.light).sort();
if (JSON.stringify(keys) !== JSON.stringify(Object.keys(tokens.themes.dark).sort())) throw new Error('Airway themes must expose the same tokens.');

const output = '/* Generated from docs/design/airway.tokens.json. Run npm run design:write. */\n' + Object.entries(tokens.themes).map(([theme, values]) => {
  const selector = theme === 'light' ? ':root' : ':root[data-theme="dark"]';
  return `${selector} {\n${Object.entries(values).map(([key, value]) => `  --${key}: ${value};`).join('\n')}\n  color-scheme: ${theme};\n}\n`;
}).join('\n');

function luminance(hex) {
  const rgb = hex.replace('#', '').match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
for (const [theme, values] of Object.entries(tokens.themes)) {
  for (const [fg, bg, minimum] of [
    ['foreground', 'background', 4.5], ['muted-foreground', 'background', 4.5],
    ['muted-foreground', 'card', 4.5], ['muted-foreground', 'muted', 4.5], ['primary-foreground', 'primary', 4.5],
    ['primary-foreground', 'primary-hover', 4.5], ['accent-foreground', 'accent', 4.5],
    ['destructive', 'card', 4.5], ['success', 'success-soft', 4.5],
    ['docket-foreground', 'docket', 4.5], ['docket-muted-foreground', 'docket', 4.5],
    ['journey-current-foreground', 'journey-current', 4.5],
    ['input', 'card', 3], ['ring', 'background', 3], ['ring', 'card', 3],
    ['docket-node-border', 'docket', 3],
  ]) {
    const first = luminance(values[fg]), second = luminance(values[bg]);
    const contrast = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    if (contrast < minimum) throw new Error(`${theme} ${fg}/${bg} contrast ${contrast.toFixed(2)} is below ${minimum}.`);
  }
}

if (process.argv.includes('--write')) fs.writeFileSync(target, output);
else if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) throw new Error('Airway token CSS drift. Review the tokens, then run npm run design:write.');
console.log('Airway theme parity, 32 contrast pairs and generated CSS verified.');

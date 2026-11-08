// A small QR code encoder (ISO/IEC 18004), byte mode, error correction L or M, versions 1 to 40 (M5-04).
// Written here so the app needs no QR library and nothing is fetched or sent anywhere (I-06).
// Tests scan the result back with a separate decoder, so it is checked against what phones do.
//
// The block tables are standard data: for each version, groups of "blocks:total codewords:data codewords".
const BLOCKS = {
  L: ["1:26:19","1:44:34","1:70:55","1:100:80","1:134:108","2:86:68","2:98:78","2:121:97","2:146:116","2:86:68/2:87:69","4:101:81","2:116:92/2:117:93","4:133:107","3:145:115/1:146:116","5:109:87/1:110:88","5:122:98/1:123:99","1:135:107/5:136:108","5:150:120/1:151:121","3:141:113/4:142:114","3:135:107/5:136:108","4:144:116/4:145:117","2:139:111/7:140:112","4:151:121/5:152:122","6:147:117/4:148:118","8:132:106/4:133:107","10:142:114/2:143:115","8:152:122/4:153:123","3:147:117/10:148:118","7:146:116/7:147:117","5:145:115/10:146:116","13:145:115/3:146:116","17:145:115","17:145:115/1:146:116","13:145:115/6:146:116","12:151:121/7:152:122","6:151:121/14:152:122","17:152:122/4:153:123","4:152:122/18:153:123","20:147:117/4:148:118","19:148:118/6:149:119"],
  M: ["1:26:16","1:44:28","1:70:44","2:50:32","2:67:43","4:43:27","4:49:31","2:60:38/2:61:39","3:58:36/2:59:37","4:69:43/1:70:44","1:80:50/4:81:51","6:58:36/2:59:37","8:59:37/1:60:38","4:64:40/5:65:41","5:65:41/5:66:42","7:73:45/3:74:46","10:74:46/1:75:47","9:69:43/4:70:44","3:70:44/11:71:45","3:67:41/13:68:42","17:68:42","17:74:46","4:75:47/14:76:48","6:73:45/14:74:46","8:75:47/13:76:48","19:74:46/4:75:47","22:73:45/3:74:46","3:73:45/23:74:46","21:73:45/7:74:46","19:75:47/10:76:48","2:74:46/29:75:47","10:74:46/23:75:47","14:74:46/21:75:47","14:74:46/23:75:47","12:75:47/26:76:48","6:75:47/34:76:48","29:74:46/14:75:47","13:74:46/32:75:47","40:75:47/7:76:48","18:75:47/31:76:48"],
};

const FORMAT_BITS = { L: 1, M: 0 };

/** Block layout for a version: a list of { total, data } per block, short blocks first. */
function layout(version, ecc) {
  const blocks = [];
  for (const group of BLOCKS[ecc][version - 1].split('/')) {
    const [count, total, data] = group.split(':').map(Number);
    for (let i = 0; i < count; i += 1) blocks.push({ total, data });
  }
  return blocks;
}
const dataCodewords = (version, ecc) => layout(version, ecc).reduce((sum, b) => sum + b.data, 0);

// Arithmetic in GF(256) with the polynomial 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function divisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = mul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = mul(root, 2);
  }
  return result;
}

function remainder(data, div) {
  const result = new Array(div.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    div.forEach((c, i) => { result[i] ^= mul(c, factor); });
  }
  return result;
}

/** Data bytes plus error correction, interleaved as the standard says. */
function codewords(bytes, version, ecc) {
  const blocks = layout(version, ecc);
  const eccLen = blocks[0].total - blocks[0].data;
  const div = divisor(eccLen);
  let at = 0;
  const parts = blocks.map((b) => {
    const data = bytes.slice(at, at + b.data);
    at += b.data;
    return { data, ec: remainder(data, div) };
  });
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data));
  for (let i = 0; i < longest; i += 1) for (const p of parts) if (i < p.data.length) out.push(p.data[i]);
  for (let i = 0; i < eccLen; i += 1) for (const p of parts) out.push(p.ec[i]);
  return out;
}

function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** The data bits for byte mode: mode, length, bytes, terminator, padding. */
function dataBytes(utf8, version, ecc) {
  const capacity = dataCodewords(version, ecc) * 8;
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  push(0b0100, 4);
  push(utf8.length, version < 10 ? 8 : 16);
  for (const b of utf8) push(b, 8);
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; bytes.length < capacity / 8; pad ^= 0xec ^ 0x11) bytes.push(pad);
  return bytes;
}

function penalty(m, size) {
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y += 1) lines.push(m[y]);
  for (let x = 0; x < size; x += 1) lines.push(m.map((row) => row[x]));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) run += 1;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    const text = line.map((c) => (c ? '1' : '0')).join('');
    for (const pattern of ['10111010000', '00001011101']) {
      for (let at = text.indexOf(pattern); at !== -1; at = text.indexOf(pattern, at + 1)) score += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (m[y][x]) dark += 1;
      if (y + 1 < size && x + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
  }
  const total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => ((x + y) % 2 + ((x * y) % 3)) % 2 === 0,
];

/**
 * Encode text as a QR code.
 * @param {string} text
 * @param {{ ecc?: 'L' | 'M' }} [options]
 * @returns {{ ok: true, version: number, size: number, modules: boolean[][] } | { ok: false, error: 'too-long' }}
 */
export function encodeQr(text, { ecc = 'M' } = {}) {
  const utf8 = Array.from(new TextEncoder().encode(String(text)));
  let version = 1;
  for (; version <= 40; version += 1) {
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + utf8.length * 8 <= dataCodewords(version, ecc) * 8) break;
  }
  if (version > 40) return { ok: false, error: 'too-long' };

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; fixed[y][x] = true; };

  for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = alignmentPositions(version);
  align.forEach((ax, i) => align.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  const formatBits = (mask) => {
    const data = (FORMAT_BITS[ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  formatBits(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  const words = codewords(dataBytes(utf8, version, ecc), version, ecc);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && bitIndex < words.length * 8) {
          modules[y][x] = ((words[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          bitIndex += 1;
        }
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!fixed[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(mask);
    formatBits(mask);
    const score = penalty(modules, size);
    if (score < bestScore) { best = mask; bestScore = score; }
    applyMask(mask);
  }
  applyMask(best);
  formatBits(best);
  return { ok: true, version, size, modules };
}

/** One SVG path for all dark modules, with a quiet zone around them, in module units. */
export function qrPath(modules, quiet = 4) {
  const parts = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) { x += 1; continue; }
      let end = x;
      while (end < row.length && row[end]) end += 1;
      parts.push(`M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return parts.join('');
}

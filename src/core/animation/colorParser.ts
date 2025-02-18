interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const namedColors: { [key: string]: string } = {
  // Add more named colors as needed
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  // ... (complete the list as per CSS specifications)
  rebeccapurple: '#663399',
  red: '#ff0000',
  blue: '#0000ff',
  green: '#00ff00',
  // Add all other CSS named colors
};

export default function parseColor(color: string): RGBA | null {
  color = color.trim().toLowerCase();

  // Check for named colors
  if (namedColors[color]) {
    color = namedColors[color];
  }

  // Hexadecimal
  const hexMatch = /^#([a-f0-9]{3,8})$/i.exec(color);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      // #RGB
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 1 };
    } else if (hex.length === 4) {
      // #RGBA
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      return { r, g, b, a };
    } else if (hex.length === 6) {
      // #RRGGBB
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 1 };
    } else if (hex.length === 8) {
      // #RRGGBBAA
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return { r, g, b, a };
    }
    return null;
  }

  // RGB or RGBA
  const rgbMatch = /^rgba?\(\s*([^\)]+)\)/.exec(color);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    if (parts.length < 3) return null;

    let r: number,
      g: number,
      b: number,
      a: number = 1;

    // Handle percentages or numbers
    const parseComponent = (comp: string): number => {
      if (comp.endsWith('%')) {
        const value = parseFloat(comp.slice(0, -1));
        return Math.round((value / 100) * 255);
      }
      return parseInt(comp, 10);
    };

    r = parseComponent(parts[0]);
    g = parseComponent(parts[1]);
    b = parseComponent(parts[2]);

    if (parts[3] !== undefined) {
      a = parseFloat(parts[3]);
      if (isNaN(a)) return null;
    }

    if ([r, g, b].some((v) => v === null)) return null;

    return { r: r!, g: g!, b: b!, a };
  }

  // HSL or HSLA
  const hslMatch = /^hsla?\(\s*([^\)]+)\)/.exec(color);
  if (hslMatch) {
    const parts = hslMatch[1].split(',').map((part) => part.trim());
    if (parts.length < 3) return null;

    let h = parseFloat(parts[0]);
    let s = parts[1].endsWith('%') ? parseFloat(parts[1]) / 100 : parseFloat(parts[1]);
    let l = parts[2].endsWith('%') ? parseFloat(parts[2]) / 100 : parseFloat(parts[2]);
    let a = 1;

    if (parts[3] !== undefined) {
      a = parseFloat(parts[3]);
      if (isNaN(a)) return null;
    }

    if (isNaN(h) || isNaN(s) || isNaN(l) || isNaN(a)) return null;

    h = h % 360;
    if (h < 0) h += 360;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let rPrime = 0,
      gPrime = 0,
      bPrime = 0;

    if (h >= 0 && h < 60) {
      rPrime = c;
      gPrime = x;
      bPrime = 0;
    } else if (h >= 60 && h < 120) {
      rPrime = x;
      gPrime = c;
      bPrime = 0;
    } else if (h >= 120 && h < 180) {
      rPrime = 0;
      gPrime = c;
      bPrime = x;
    } else if (h >= 180 && h < 240) {
      rPrime = 0;
      gPrime = x;
      bPrime = c;
    } else if (h >= 240 && h < 300) {
      rPrime = x;
      gPrime = 0;
      bPrime = c;
    } else if (h >= 300 && h < 360) {
      rPrime = c;
      gPrime = 0;
      bPrime = x;
    }

    const r = Math.round((rPrime + m) * 255);
    const g = Math.round((gPrime + m) * 255);
    const b = Math.round((bPrime + m) * 255);

    return { r, g, b, a };
  }

  return null; // Unsupported format
}

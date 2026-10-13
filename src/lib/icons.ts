// Ark Nova icons, hotlinked from https://ssimeonoff.github.io/ark-nova (crops of conservation
// project card scans, plus a few standalone PNGs). Rendered as CSS backgrounds clipped to a circle.

const BASE = 'https://ssimeonoff.github.io/images-ark/';

// The project-card sheet is 1440×670 and its icons are 40px circles at these offsets.
const SHEET = { url: `${BASE}cards2.jpg`, w: 1440, h: 670 };
const SHEET_ICONS: Record<string, [number, number]> = {
  SpeciesDiversity: [14, 14],
  HabitatDiversity: [254, 14],
  Africa: [494, 14],
  Americas: [734, 14],
  Australia: [974, 14],
  Asia: [1214, 14],
  Europe: [14, 349],
  Primate: [254, 349],
  Reptile: [494, 349],
  Predator: [734, 349],
  Herbivore: [974, 349],
  Bird: [1214, 349],
};

// Standalone images: native size and the inset of the circle within them.
const PNG_ICONS: Record<string, { file: string; native: number; inset: number; circle: number }> = {
  SeaAnimal: { file: 'marine.png', native: 110, inset: 0, circle: 110 },
  Pet: { file: 'pet.png', native: 110, inset: 0, circle: 110 },
  Bear: { file: 'bear.png', native: 110, inset: 0, circle: 110 },
  Science: { file: 'science.png', native: 50, inset: 5, circle: 40 },
};

export type IconName = keyof typeof SHEET_ICONS | keyof typeof PNG_ICONS;

export function hasIcon(name: string): boolean {
  return name in SHEET_ICONS || name in PNG_ICONS;
}

// CSS for a circular icon `size` px across.
export function iconStyle(name: string, size: number): React.CSSProperties | null {
  const sheet = SHEET_ICONS[name];
  if (sheet) {
    const f = size / 40;
    return {
      backgroundImage: `url("${SHEET.url}")`,
      backgroundSize: `${SHEET.w * f}px ${SHEET.h * f}px`,
      backgroundPosition: `${-sheet[0] * f}px ${-sheet[1] * f}px`,
    };
  }
  const png = PNG_ICONS[name];
  if (png) {
    const f = size / png.circle;
    return {
      backgroundImage: `url("${BASE}${png.file}")`,
      backgroundSize: `${png.native * f}px ${png.native * f}px`,
      backgroundPosition: `${-png.inset * f}px ${-png.inset * f}px`,
    };
  }
  return null;
}

// Icon for a conservation project, by card id / name.
export function projectIcon(id: string, name: string): IconName | null {
  const s = `${id} ${name}`;
  const rules: [RegExp, IconName][] = [
    [/SpeciesDiversity/i, 'SpeciesDiversity'],
    [/HabitatDiversity/i, 'HabitatDiversity'],
    [/Primate/i, 'Primate'],
    [/Reptile/i, 'Reptile'],
    [/Predator/i, 'Predator'],
    [/Herbivore/i, 'Herbivore'],
    [/Bird/i, 'Bird'],
    [/Sea ?Animal/i, 'SeaAnimal'],
    [/Research/i, 'Science'],
    // Base continent projects and the national-park release projects.
    [/Africa|Serengeti/i, 'Africa'],
    [/Americas|Yosemite/i, 'Americas'],
    [/Australia|BlueMountain/i, 'Australia'],
    [/Asia|Angthong/i, 'Asia'],
    [/Europe|Bavarian/i, 'Europe'],
  ];
  return rules.find(([re]) => re.test(s))?.[1] ?? null;
}

// BGA's own action-card icons (player panel), hotlinked from BGA's static assets.
const BGA_IMG = 'https://x.boardgamearena.net/data/themereleases/current/games/arknova/260803-1142/img/';
const ACTION_ICON_X: Record<string, number> = {
  Animals: 42.33160621761658,
  Association: 49.48186528497409,
  Build: 56.6321243523316,
  Cards: 63.78238341968911,
  Sponsors: 78.08290155440415,
};
const ACTION_ROW: Record<string, number> = { Animals: 0, Build: 25, Cards: 50, Sponsors: 75, Association: 100 };

export function actionIconStyle(action: string): React.CSSProperties | null {
  const x = ACTION_ICON_X[action];
  if (x == null) return null;
  return {
    backgroundImage: `url("${BGA_IMG}icons.png")`,
    backgroundSize: '1735.593220338983%',
    backgroundPosition: `${x}% 21.450777202072537%`,
  };
}

// The small corner badge marking a variant action card (e.g. "Sponsors4" → variant 4).
export function actionVariantStyle(action: string, cardType: string, level: 1 | 2): React.CSSProperties | null {
  const n = Number(cardType.match(/(\d+)$/)?.[1] ?? 0);
  const row = ACTION_ROW[action];
  if (!n || row == null) return null;
  return {
    backgroundImage: `url("${BGA_IMG}${level === 2 ? 'action-cards-special-2.jpg' : 'action-cards-special.jpg'}")`,
    backgroundSize: '400% 500%',
    backgroundPosition: `${((n - 1) / 3) * 100}% ${row}%`,
  };
}

// Board tiles from BGA's enclosures.jpg (2720×2591, shown by BGA at 907px wide inside 90×78 hexes).
// Percent positions are BGA's own, so they stay valid at any scale with the same aspect ratio.
const TILE_POS: Record<string, string> = {
  kiosk: '16.666666666666664% 20%',
  pavilion: '41.66666666666667% 25%',
  // An empty size-1 enclosure: used as the plain green enclosure hex.
  enclosure: '0 0',
};

export const HEX_RATIO = 78 / 90;

export function buildingTileStyle(kind: 'kiosk' | 'pavilion' | 'enclosure', width: number): React.CSSProperties {
  return {
    backgroundImage: `url("${BGA_IMG}enclosures.jpg")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${(907 * width) / 90}px auto`,
    backgroundPosition: TILE_POS[kind],
  };
}

// Animal icon shown inside a special enclosure's hex.
export const SPECIAL_ENCLOSURE_ICON: Record<string, IconName> = {
  'small-aquarium': 'SeaAnimal',
  'large-aquarium': 'SeaAnimal',
  'reptile-house': 'Reptile',
  'large-bird-aviary': 'Bird',
  'petting-zoo': 'Pet',
};

// BGA's partner zoo tokens (handshake on the continent's color), from icons.png. Aspect 4.5:3.7.
const PARTNER_X: Record<string, number> = {
  Africa: 7.700592353257943,
  Americas: 19.063004846526656,
  Asia: 30.42541733979537,
  Australia: 41.78782983306408,
  Europe: 53.150242326332794,
};
export const PARTNER_RATIO = 3.7 / 4.5;

export function partnerZooStyle(continent: string): React.CSSProperties | null {
  const x = PARTNER_X[continent];
  if (x == null) return null;
  return {
    backgroundImage: `url("${BGA_IMG}icons.png")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '1072.2513089005236%',
    backgroundPosition: `${x}% 1.0554089709762533%`,
  };
}

// BGA's university tokens (icons.png), keyed by the token type in the log. Aspect 5:4.
const UNIVERSITY_POS: Record<string, string> = {
  'fac-generic': '89.85811875985287% 49.94845360824742%',
  'fac-rep-hand': '98.52863899106674% 49.94845360824742%',
  'fac-science-bird': '1.0509721492380453% 56.95876288659794%',
  'fac-science-herbivore': '9.721492380451918% 56.95876288659794%',
  'fac-science-marine': '18.39201261166579% 56.95876288659794%',
  'fac-science-predator': '27.062532842879666% 56.95876288659794%',
  'fac-science-primate': '35.73305307409353% 56.95876288659794%',
  'fac-science-rep': '44.40357330530741% 56.95876288659794%',
  'fac-science-reptile': '53.07409353652128% 56.95876288659794%',
  'fac-science-science': '61.74461376773516% 56.95876288659794%',
};
export const UNIVERSITY_RATIO = 4 / 5;

export function universityStyle(type: string): React.CSSProperties | null {
  const pos = UNIVERSITY_POS[type];
  if (!pos) return null;
  return {
    backgroundImage: `url("${BGA_IMG}icons.png")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '1412.4137931034484%',
    backgroundPosition: pos,
  };
}

export function universityLabel(type: string): string {
  const parts = type.replace(/^fac-/, '').split('-');
  const names: Record<string, string> = { rep: 'reputation', hand: 'hand size', marine: 'sea animal' };
  return `University: ${parts.map((p) => names[p] ?? p).join(' + ')}`;
}

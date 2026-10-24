// ===== ASCENSION — holographic character scanner (SVG humanoid) =====
// Six body regions fill with energy as real skills are proven.
// HEAD=AI/ML · TORSO=core CS · LARM=data · RARM=dev/automation · LEGS=systems · CORE=projects
import type { RegionId } from './types';

interface Props {
  fills: Record<RegionId, number>;   // 0..1 per region
  highlight: RegionId | null;        // region pulsing after a level-up / scan
  selected: RegionId | null;
  onSelect: (r: RegionId) => void;
}

// path data per region (viewBox 0 0 320 560)
const PATHS: Record<RegionId, string[]> = {
  HEAD: [
    'M160,28 m-37,0 a37,37 0 1,0 74,0 a37,37 0 1,0 -74,0',           // cranium
    'M132,78 L188,78 L182,102 L138,102 Z',                            // jaw plate
  ],
  TORSO: [
    'M78,118 L242,118 L224,196 L210,282 L198,314 L122,314 L110,282 L96,196 Z',
    'M148,104 L172,104 L172,118 L148,118 Z',                           // neck
  ],
  LARM: [
    'M74,128 m-14,0 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0',            // shoulder joint
    'M64,140 L87,144 L81,214 L57,209 Z',                              // upper arm
    'M68,222 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0',                 // elbow
    'M57,228 L80,232 L89,300 L63,304 Z',                              // forearm
    'M63,304 L89,300 L93,328 L69,332 Z',                              // hand
  ],
  RARM: [
    'M246,128 m-14,0 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0',
    'M233,144 L256,140 L263,209 L239,214 Z',
    'M252,222 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0',
    'M240,232 L263,228 L257,304 L231,300 Z',
    'M231,300 L257,304 L251,332 L227,328 Z',
  ],
  LEGS: [
    'M124,314 L157,314 L151,400 L119,400 Z',                          // L thigh
    'M135,408 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0',                // L knee
    'M120,414 L150,414 L147,492 L123,492 Z',                          // L shin
    'M123,492 L147,492 L154,512 L117,512 Z',                          // L foot
    'M163,314 L196,314 L201,400 L169,400 Z',                          // R thigh
    'M185,408 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0',
    'M170,414 L200,414 L197,492 L173,492 Z',
    'M173,492 L197,492 L203,512 L166,512 Z',
  ],
  CORE: [
    'M160,192 m-22,0 a22,22 0 1,0 44,0 a22,22 0 1,0 -44,0',           // power core
  ],
};

// circuit traces inside each region (light up with fill)
const CIRCUITS: Record<RegionId, string[]> = {
  HEAD: ['M160,40 L160,58 M138,52 L150,62 M182,52 L170,62 M146,86 L174,86'],
  TORSO: ['M100,140 L138,140 L138,168 M220,140 L182,140 L182,168 M120,240 L200,240 M160,240 L160,290 M126,200 L140,214 M194,200 L180,214'],
  LARM: ['M70,150 L68,205 M66,240 L74,295'],
  RARM: ['M250,150 L252,205 M254,240 L246,295'],
  LEGS: ['M138,330 L136,395 M134,425 L133,485 M182,330 L184,395 M186,425 L187,485'],
  CORE: ['M160,176 L160,208 M144,192 L176,192'],
};

// energy nodes that switch on at fill thresholds
const NODES: { region: RegionId; cx: number; cy: number; at: number }[] = [
  { region: 'HEAD', cx: 160, cy: 58, at: 0.15 }, { region: 'HEAD', cx: 146, cy: 70, at: 0.45 },
  { region: 'HEAD', cx: 174, cy: 70, at: 0.7 }, { region: 'HEAD', cx: 160, cy: 88, at: 0.9 },
  { region: 'TORSO', cx: 120, cy: 150, at: 0.15 }, { region: 'TORSO', cx: 200, cy: 150, at: 0.3 },
  { region: 'TORSO', cx: 130, cy: 240, at: 0.5 }, { region: 'TORSO', cx: 190, cy: 240, at: 0.65 },
  { region: 'TORSO', cx: 160, cy: 290, at: 0.85 },
  { region: 'LARM', cx: 70, cy: 178, at: 0.25 }, { region: 'LARM', cx: 72, cy: 265, at: 0.6 }, { region: 'LARM', cx: 78, cy: 316, at: 0.9 },
  { region: 'RARM', cx: 250, cy: 178, at: 0.25 }, { region: 'RARM', cx: 248, cy: 265, at: 0.6 }, { region: 'RARM', cx: 242, cy: 316, at: 0.9 },
  { region: 'LEGS', cx: 137, cy: 358, at: 0.2 }, { region: 'LEGS', cx: 183, cy: 358, at: 0.35 },
  { region: 'LEGS', cx: 134, cy: 452, at: 0.6 }, { region: 'LEGS', cx: 186, cy: 452, at: 0.75 },
  { region: 'LEGS', cx: 135, cy: 502, at: 0.9 }, { region: 'LEGS', cx: 185, cy: 502, at: 0.95 },
  { region: 'CORE', cx: 160, cy: 192, at: 0.05 },
];

const LABELS: { region: RegionId; x: number; y: number; anchor: 'start' | 'end'; lx: number; ly: number; name: string }[] = [
  { region: 'HEAD', x: 306, y: 52, anchor: 'end', lx: 198, ly: 52, name: 'HEAD' },
  { region: 'CORE', x: 14, y: 190, anchor: 'start', lx: 136, ly: 192, name: 'CORE' },
  { region: 'TORSO', x: 306, y: 248, anchor: 'end', lx: 216, ly: 248, name: 'TORSO' },
  { region: 'LARM', x: 14, y: 268, anchor: 'start', lx: 60, ly: 266, name: 'L.ARM' },
  { region: 'RARM', x: 306, y: 150, anchor: 'end', lx: 258, ly: 150, name: 'R.ARM' },
  { region: 'LEGS', x: 14, y: 432, anchor: 'start', lx: 118, ly: 432, name: 'LEGS' },
];

const ORDER: RegionId[] = ['HEAD', 'TORSO', 'LARM', 'RARM', 'LEGS', 'CORE'];

export default function Character({ fills, highlight, selected, onSelect }: Props) {
  return (
    <svg className="char-svg" viewBox="0 0 320 560" role="img" aria-label="Character skill visualization">
      <defs>
        <linearGradient id="energyGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#0e3a52" />
          <stop offset="55%" stopColor="#0e7490" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e9d5ff" />
          <stop offset="45%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#3b0764" stopOpacity="0.25" />
        </radialGradient>
        <radialGradient id="floorGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#164e63" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#04070d" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* rotating scanner rings */}
      <g className="ring ring-a"><circle cx="160" cy="280" r="148" fill="none" stroke="rgba(34,211,238,0.14)" strokeWidth="1" strokeDasharray="4 10" /></g>
      <g className="ring ring-b"><circle cx="160" cy="280" r="132" fill="none" stroke="rgba(168,85,247,0.12)" strokeWidth="1" strokeDasharray="30 18 6 18" /></g>
      <ellipse cx="160" cy="528" rx="110" ry="16" fill="url(#floorGlow)" />
      <ellipse cx="160" cy="528" rx="86" ry="10" fill="none" stroke="rgba(34,211,238,0.35)" strokeWidth="1" />
      <ellipse cx="160" cy="528" rx="58" ry="6" fill="none" stroke="rgba(34,211,238,0.2)" strokeWidth="1" />

      {/* body */}
      <g className="body-float">
        {ORDER.map((r) => {
          const f = fills[r] ?? 0;
          const isHi = highlight === r;
          const isSel = selected === r;
          return (
            <g key={r}
              className={`region ${isHi ? 'region-highlight' : ''} ${isSel ? 'region-selected' : ''}`}
              onClick={() => onSelect(r)} style={{ cursor: 'pointer' }}>
              {/* translucent wireframe base */}
              {PATHS[r].map((d, i) => (
                <path key={`b${i}`} d={d} fill="rgba(8,20,34,0.82)"
                  stroke={isSel ? '#67e8f9' : 'rgba(56,189,248,0.45)'} strokeWidth={isSel ? 1.6 : 1.1} strokeLinejoin="round" />
              ))}
              {/* energy fill — illuminates as real skill XP grows */}
              {PATHS[r].map((d, i) => (
                <path key={`e${i}`} d={d} fill={r === 'CORE' ? 'url(#coreGrad)' : 'url(#energyGrad)'}
                  opacity={r === 'CORE' ? 0.18 + f * 0.82 : 0.05 + f * 0.72}
                  style={{ transition: 'opacity 1.2s ease', pointerEvents: 'none' }} />
              ))}
              {/* circuits */}
              {CIRCUITS[r].map((d, i) => (
                <path key={`c${i}`} d={d} fill="none" stroke="#7dd3fc" strokeWidth="1"
                  strokeOpacity={0.1 + f * 0.8} style={{ transition: 'stroke-opacity 1.2s ease', pointerEvents: 'none' }} />
              ))}
              {r === 'CORE' && (
                <circle cx="160" cy="192" r="29" fill="none" stroke="rgba(216,180,254,0.5)" strokeWidth="1"
                  strokeDasharray="5 5" className="core-ring" style={{ pointerEvents: 'none' }} />
              )}
            </g>
          );
        })}

        {/* visor */}
        <path d="M136,66 L184,66 L178,76 L142,76 Z" fill="#0ea5e9"
          opacity={0.25 + (fills.HEAD ?? 0) * 0.75} style={{ transition: 'opacity 1.2s ease' }} />

        {/* energy nodes */}
        {NODES.map((nd, i) => {
          const on = (fills[nd.region] ?? 0) >= nd.at;
          return (
            <g key={i} style={{ pointerEvents: 'none' }}>
              {on && <circle cx={nd.cx} cy={nd.cy} r="7" fill="rgba(34,211,238,0.18)" />}
              <circle cx={nd.cx} cy={nd.cy} r="2.6" fill={on ? '#a5f3fc' : 'rgba(56,189,248,0.25)'}
                className={on ? 'node-on' : ''} style={{ transition: 'fill 1s ease' }} />
            </g>
          );
        })}
      </g>

      {/* HUD labels with leader lines */}
      {LABELS.map((L) => (
        <g key={L.region} className="char-label" onClick={() => onSelect(L.region)} style={{ cursor: 'pointer' }}>
          <line x1={L.lx} y1={L.ly} x2={L.anchor === 'end' ? L.x - 52 : L.x + 52} y2={L.y - 3}
            stroke="rgba(56,189,248,0.4)" strokeWidth="1" />
          <circle cx={L.lx} cy={L.ly} r="2" fill="#38bdf8" />
          <text x={L.x} y={L.y} textAnchor={L.anchor} className="char-label-text">
            {L.name} {Math.round((fills[L.region] ?? 0) * 100)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

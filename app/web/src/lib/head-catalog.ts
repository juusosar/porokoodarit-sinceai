import iron101 from '@/assets/iron-101-mkii-cutout.png';
import iron201 from '@/assets/iron-201-mkii-cutout.png';
import type { HeadId } from './head-selection-schema';

// Display copy for the engine's heads. Specs and ranking come from the engine (app/api), never from here.
export const HEADS: Record<HeadId, { id: HeadId; name: string; set: string; image: string | null; url: string | null; description: string; tradeoff: string }> = {
  '101-mkii': { id: '101-mkii', name: '101 MKII', set: '5–GW · 7 clubs', image: iron101, url: 'https://takomogolf.com/products/iron-101-mkii', description: 'Game-improvement irons. Forgiveness, distance and an easier launch.', tradeoff: 'A larger profile with more offset. The compact alternatives have a shorter blade, thinner sole and trimmed-down topline.' },
  '201-mkii': { id: '201-mkii', name: '201 MKII', set: '4–PW · 7 clubs', image: iron201, url: 'https://takomogolf.com/products/iron-201-mkii', description: 'Players’ distance irons. A compact profile with hollow-body construction.', tradeoff: 'A shorter blade and thinner sole than the 101 MKII. The compact shape puts more emphasis on strike consistency; smaller doesn’t automatically mean a better fit.' },
  '201t-mkii': { id: '201t-mkii', name: '201T MKII', set: '4–PW · 7 clubs', image: null, url: null, description: 'More workability for players who still want a hint of forgiveness.', tradeoff: 'Less forgiveness and distance than the 201 MKII in exchange for more control and shaping.' },
  '301-cb': { id: '301-cb', name: '301 CB', set: '4–PW · 7 clubs', image: null, url: null, description: 'A forged cavity back that balances control and forgiveness.', tradeoff: 'Forged feel and control; asks for a consistent strike and gives up distance to the hollow-body heads.' },
  '301-mb': { id: '301-mb', name: '301 MB', set: '4–PW · 7 clubs', image: null, url: null, description: 'A forged muscle back for maximum workability and feel.', tradeoff: 'The least forgiving head in the range. Built for players who strike it consistently and want to shape shots.' },
};

import iron101 from '@/assets/iron-101-mkii-cutout.png';
import iron201 from '@/assets/iron-201-mkii-cutout.png';
import type { HeadId } from './head-selection-schema';

export const HEADS: Record<HeadId, { id: HeadId; name: string; set: string; image: string; url: string; description: string; tradeoff: string }> = {
  '101': { id: '101', name: '101 MKII', set: '5–GW · 7 clubs', image: iron101, url: 'https://takomogolf.com/products/iron-101-mkii', description: 'Game-improvement irons. Forgiveness, distance and an easier launch.', tradeoff: 'A larger profile than the 201 MKII. The compact alternative has a shorter blade, thinner sole and trimmed-down topline.' },
  '201': { id: '201', name: '201 MKII', set: '4–PW · 7 clubs', image: iron201, url: 'https://takomogolf.com/products/iron-201-mkii', description: 'Players’ distance irons. A compact profile with hollow-body construction.', tradeoff: 'A shorter blade and thinner sole than the 101 MKII. The compact shape puts more emphasis on strike consistency; smaller doesn’t automatically mean a better fit.' },
};
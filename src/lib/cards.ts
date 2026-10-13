import cardsJson from '../data/cards.json';

export interface CardInfo {
  name: string;
  type: 'animal' | 'sponsor' | 'project' | 'baseProject' | 'scoring' | string;
  cost?: number;
  appeal?: number;
  conservation?: number;
  reputation?: number;
  size?: number;
  categories?: string[];
  continents?: string[];
  wave?: boolean;
  abilities?: string[];
}

const CARDS = cardsJson as Record<string, CardInfo>;

export function cardInfo(id: string | undefined | null): CardInfo | undefined {
  return id ? CARDS[id] : undefined;
}

// Falls back to turning "A412_Jaguar" into "Jaguar" for cards missing from the data file.
export function cardName(id: string): string {
  return CARDS[id]?.name ?? id.replace(/^[A-Z]\d+_/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

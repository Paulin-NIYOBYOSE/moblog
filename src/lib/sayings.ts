// A saying for every month of the Notebook — on money, patience and keeping
// going. Proverbs are labelled as such; non-English ones carry their meaning.

export interface Saying {
  text: string;
  /** English meaning, for sayings in another language. */
  meaning: string | null;
  author: string;
}

const s = (text: string, author: string, meaning: string | null = null): Saying => ({ text, author, meaning });

/** January first. */
export const MONTH_SAYINGS: Saying[] = [
  s("The best time to plant a tree was 20 years ago. The second best time is now.", "Proverb"),
  s("Haba na haba hujaza kibaba.", "Swahili proverb", "Little by little fills the measure."),
  s("A journey of a thousand miles begins with a single step.", "Lao Tzu"),
  s("Akiba haiozi.", "Swahili proverb", "Savings never go bad."),
  s("If you would be wealthy, think of saving as well as getting.", "Benjamin Franklin"),
  s("Beware of little expenses; a small leak will sink a great ship.", "Benjamin Franklin"),
  s("If you want to go fast, go alone. If you want to go far, go together.", "African proverb"),
  s("Dripping water hollows out stone.", "Ovid"),
  s("Never spend your money before you have it.", "Thomas Jefferson"),
  s("You do not rise to the level of your goals. You fall to the level of your systems.", "James Clear"),
  s("Mchumia juani hulia kivulini.", "Swahili proverb", "Who works in the sun eats in the shade."),
  s("Akabando k'iminsi gacibwa kare.", "Kinyarwanda proverb", "The walking stick for later days is cut early."),
];

/** The saying of a month (yyyy-mm). */
export function sayingOfMonth(month: string): Saying {
  return MONTH_SAYINGS[+month.slice(5, 7) - 1];
}

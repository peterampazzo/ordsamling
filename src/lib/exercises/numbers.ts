import { shuffle, syntheticEntry, type LangDirection, type QuizQuestion } from "./types";
import { t } from "@/i18n";

/* ------------------------------------------------------------------ */
/*  Danish number words                                                */
/* ------------------------------------------------------------------ */

const UNITS = [
  "nul", "en", "to", "tre", "fire", "fem", "seks", "syv", "otte", "ni",
  "ti", "elleve", "tolv", "tretten", "fjorten", "femten", "seksten",
  "sytten", "atten", "nitten",
];

const TENS: Record<number, string> = {
  20: "tyve",
  30: "tredive",
  40: "fyrre",
  50: "halvtreds",
  60: "tres",
  70: "halvfjerds",
  80: "firs",
  90: "halvfems",
};

/** The vigesimal tens that trip learners up. */
export const TRICKY_TENS = [50, 60, 70, 80, 90] as const;

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const tens = Math.floor(n / 10) * 10;
  const unit = n % 10;
  if (unit === 0) return TENS[tens];
  return `${UNITS[unit]}og${TENS[tens]}`;
}

/** Convert 0–1000 to its Danish word form (spaced form, e.g. "tohundrede og niogfyrre"). */
export function numberToDanish(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 1000) {
    throw new RangeError(`numberToDanish supports 0–1000, got ${n}`);
  }
  if (n === 1000) return "tusind";
  if (n < 100) return below100(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "hundrede" : `${UNITS[hundreds]}hundrede`;
  if (rest === 0) return head;
  return `${head} og ${below100(rest)}`;
}

/** Compact (unspaced) spelling variant Danes also write, e.g. "tohundredeogniogfyrre". */
export function compactDanishNumber(n: number): string {
  return numberToDanish(n).replace(/\s+/g, "");
}

/** All accepted spellings of a number, as a comma-separated answer string. */
export function numberAnswer(n: number): string {
  const spaced = numberToDanish(n);
  const compact = compactDanishNumber(n);
  const forms = spaced === compact ? [spaced] : [spaced, compact];
  if (n >= 100 && n < 200) forms.push(`et${compact}`, `et ${spaced}`);
  return forms.join(", ");
}

/* ------------------------------------------------------------------ */
/*  Ordinals                                                           */
/* ------------------------------------------------------------------ */

const ORDINAL_UNITS: Record<number, string> = {
  1: "første", 2: "anden", 3: "tredje", 4: "fjerde", 5: "femte", 6: "sjette",
  7: "syvende", 8: "ottende", 9: "niende", 10: "tiende", 11: "ellevte",
  12: "tolvte", 13: "trettende", 14: "fjortende", 15: "femtende",
  16: "sekstende", 17: "syttende", 18: "attende", 19: "nittende",
};

const ORDINAL_TENS: Record<number, string> = {
  20: "tyvende",
  30: "tredivte",
  40: "fyrretyvende",
  50: "halvtredsindstyvende",
  60: "tresindstyvende",
  70: "halvfjerdsindstyvende",
  80: "firsindstyvende",
  90: "halvfemsindstyvende",
};

/** Convert 1–100 to its Danish ordinal ("første", "enogtyvende", …). */
export function ordinalToDanish(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new RangeError(`ordinalToDanish supports 1–100, got ${n}`);
  }
  if (n === 100) return "hundrede";
  if (n < 20) return ORDINAL_UNITS[n];
  const tens = Math.floor(n / 10) * 10;
  const unit = n % 10;
  if (unit === 0) return ORDINAL_TENS[tens];
  return `${UNITS[unit]}og${ORDINAL_TENS[tens]}`;
}

/* ------------------------------------------------------------------ */
/*  Clock & dates                                                      */
/* ------------------------------------------------------------------ */

const HOUR_WORDS = [
  "tolv", "et", "to", "tre", "fire", "fem", "seks", "syv", "otte", "ni", "ti", "elleve",
];

export const MONTHS_DA = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

export const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAYS_DA = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
export const WEEKDAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function hourWord(hour24: number): string {
  return HOUR_WORDS[hour24 % 12];
}

/**
 * Spoken Danish clock time for a 24h hour and a 5-minute step.
 * e.g. 7:15 → "kvart over syv", 14:30 → "halv tre", 7:50 → "ti minutter i otte".
 */
export function timeToDanish(hour: number, minute: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError("hour must be 0–23");
  if (!Number.isInteger(minute) || minute < 0 || minute > 59 || minute % 5 !== 0) {
    throw new RangeError("minute must be a 0–55 multiple of 5");
  }
  const next = hourWord(hour + 1);
  const cur = hourWord(hour);
  if (minute === 0) return cur;
  if (minute === 15) return `kvart over ${cur}`;
  if (minute === 30) return `halv ${next}`;
  if (minute === 45) return `kvart i ${next}`;
  if (minute === 25) return `fem minutter i halv ${next}`;
  if (minute === 35) return `fem minutter over halv ${next}`;
  if (minute < 30) return `${UNITS[minute]} minutter over ${cur}`;
  return `${UNITS[60 - minute]} minutter i ${next}`;
}

/** "den tredje maj" for (3, 4) — month is 0-indexed. */
export function dateToDanish(day: number, monthIndex: number): string {
  return `den ${ordinalToDanish(day)} ${MONTHS_DA[monthIndex]}`;
}

/* ------------------------------------------------------------------ */
/*  Prices & quantities                                                */
/* ------------------------------------------------------------------ */

/** "249,50 kr" → "tohundrede og niogfyrre kroner og halvtreds øre". */
export function priceToDanish(kroner: number, ore = 0): string {
  const kr = `${numberToDanish(kroner)} ${kroner === 1 ? "krone" : "kroner"}`;
  if (ore === 0) return kr;
  return `${kr} og ${numberToDanish(ore)} øre`;
}

/** "2,5 kg" → "to en halv kilo"; "0,5 l" → "en halv liter". */
export function quantityToDanish(value: number, unitDa: string): string {
  const whole = Math.floor(value);
  const hasHalf = Math.abs(value - whole - 0.5) < 1e-9;
  if (!hasHalf) return `${numberToDanish(whole)} ${unitDa}`;
  if (whole === 0) return `en halv ${unitDa}`;
  return `${numberToDanish(whole)} en halv ${unitDa}`;
}

/* ------------------------------------------------------------------ */
/*  Question builders                                                  */
/* ------------------------------------------------------------------ */

export type NumberTopic = "cardinals" | "ordinals" | "datetime" | "prices";

export const NUMBER_TOPICS: readonly NumberTopic[] = ["cardinals", "ordinals", "datetime", "prices"] as const;

const TO_DANISH: LangDirection = {
  from: "english",
  to: "danish",
  fromLabel: "123",
  toLabel: "dansk",
};

const TO_DIGITS: LangDirection = {
  from: "danish",
  to: "english",
  fromLabel: "dansk",
  toLabel: "123",
};

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

/** Pick a cardinal, biased toward the vigesimal traps and reversed-order twenties. */
function pickCardinal(): number {
  const r = Math.random();
  if (r < 0.35) return 50 + randInt(50);
  if (r < 0.6) return 21 + randInt(29);
  if (r < 0.8) return randInt(21);
  return 100 + randInt(901);
}

function withOptions(correct: string, poolFn: () => string): string[] {
  const opts = new Set<string>([correct]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 60) opts.add(poolFn());
  return shuffle([...opts]);
}

function cardinalQuestion(): QuizQuestion {
  const n = pickCardinal();
  const toWords = Math.random() < 0.65;
  if (toWords) {
    return {
      entry: syntheticEntry(`num-${n}`, numberToDanish(n), String(n)),
      prompt: String(n),
      answer: numberAnswer(n),
      options: withOptions(numberToDanish(n), () => numberToDanish(pickCardinal())),
      questionType: "number",
      hint: t("quiz.numbers.hintToWords"),
      direction: TO_DANISH,
    };
  }
  return {
    entry: syntheticEntry(`num-r-${n}`, numberToDanish(n), String(n)),
    prompt: numberToDanish(n),
    answer: String(n),
    options: withOptions(String(n), () => String(pickCardinal())),
    questionType: "number",
    hint: t("quiz.numbers.hintToDigits"),
    direction: TO_DIGITS,
  };
}

function ordinalQuestion(): QuizQuestion {
  const n = 1 + randInt(40);
  return {
    entry: syntheticEntry(`ord-${n}`, ordinalToDanish(n), `${n}.`),
    prompt: `${n}.`,
    answer: ordinalToDanish(n),
    options: withOptions(ordinalToDanish(n), () => ordinalToDanish(1 + randInt(40))),
    questionType: "number",
    hint: t("quiz.numbers.hintOrdinal"),
    direction: TO_DANISH,
  };
}

function datetimeQuestion(): QuizQuestion {
  const kind = randInt(3);
  if (kind === 0) {
    const hour = randInt(24);
    const minute = 5 * randInt(12);
    const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const answer = timeToDanish(hour, minute);
    return {
      entry: syntheticEntry(`time-${label}`, answer, label),
      prompt: label,
      answer,
      options: withOptions(answer, () => timeToDanish(randInt(24), 5 * randInt(12))),
      questionType: "number",
      hint: t("quiz.numbers.hintTime"),
      direction: TO_DANISH,
    };
  }
  if (kind === 1) {
    const day = 1 + randInt(28);
    const month = randInt(12);
    const answer = dateToDanish(day, month);
    return {
      entry: syntheticEntry(`date-${day}-${month}`, answer, `${day}. ${MONTHS_EN[month]}`),
      prompt: `${day}. ${MONTHS_EN[month]}`,
      answer,
      options: withOptions(answer, () => dateToDanish(1 + randInt(28), randInt(12))),
      questionType: "number",
      hint: t("quiz.numbers.hintDate"),
      direction: TO_DANISH,
    };
  }
  const idx = randInt(7);
  return {
    entry: syntheticEntry(`weekday-${idx}`, WEEKDAYS_DA[idx], WEEKDAYS_EN[idx]),
    prompt: WEEKDAYS_EN[idx],
    answer: WEEKDAYS_DA[idx],
    options: withOptions(WEEKDAYS_DA[idx], () => WEEKDAYS_DA[randInt(7)]),
    questionType: "number",
    hint: t("quiz.numbers.hintWeekday"),
    direction: TO_DANISH,
  };
}

const QUANTITY_UNITS: { da: string; en: string }[] = [
  { da: "kilo", en: "kg" },
  { da: "liter", en: "l" },
  { da: "meter", en: "m" },
  { da: "stykker", en: "pcs" },
];

function priceQuestion(): QuizQuestion {
  if (Math.random() < 0.6) {
    const kr = randInt(1000);
    const ore = [0, 25, 50, 75, 95][randInt(5)];
    const answer = priceToDanish(kr, ore);
    const label = ore === 0 ? `${kr} kr` : `${kr},${String(ore).padStart(2, "0")} kr`;
    return {
      entry: syntheticEntry(`price-${kr}-${ore}`, answer, label),
      prompt: label,
      answer,
      options: withOptions(answer, () => priceToDanish(randInt(1000), [0, 25, 50, 75, 95][randInt(5)])),
      questionType: "number",
      hint: t("quiz.numbers.hintPrice"),
      direction: TO_DANISH,
    };
  }
  const unit = QUANTITY_UNITS[randInt(QUANTITY_UNITS.length)];
  const half = Math.random() < 0.5;
  const whole = randInt(10) + (half ? 0 : 1);
  const value = whole + (half ? 0.5 : 0);
  const answer = quantityToDanish(value, unit.da);
  const label = `${String(value).replace(".", ",")} ${unit.en}`;
  return {
    entry: syntheticEntry(`qty-${value}-${unit.en}`, answer, label),
    prompt: label,
    answer,
    options: withOptions(answer, () => quantityToDanish(randInt(10) + (Math.random() < 0.5 ? 0.5 : 0), unit.da)),
    questionType: "number",
    hint: t("quiz.numbers.hintQuantity"),
    direction: TO_DANISH,
  };
}

const TOPIC_BUILDERS: Record<NumberTopic, () => QuizQuestion> = {
  cardinals: cardinalQuestion,
  ordinals: ordinalQuestion,
  datetime: datetimeQuestion,
  prices: priceQuestion,
};

/** Build `count` generated number questions across the selected sub-topics. */
export function buildNumberQuestions(topics: readonly NumberTopic[], count: number): QuizQuestion[] {
  const active = topics.length > 0 ? topics : NUMBER_TOPICS;
  const out: QuizQuestion[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const topic = active[out.length % active.length];
    const q = TOPIC_BUILDERS[topic]();
    if (seen.has(q.entry.id)) continue;
    seen.add(q.entry.id);
    out.push(q);
  }
  return out;
}

import { shuffle, syntheticEntry, type LangDirection, type QuizQuestion } from "./types";
import type { LexisEntry } from "@/lib/lexicon";
import { t } from "@/i18n";

/* ------------------------------------------------------------------ */
/*  Curated Danish preposition pack                                    */
/* ------------------------------------------------------------------ */

export const PREPOSITIONS = [
  "i", "på", "til", "for", "med", "af", "om", "ved", "fra", "efter", "over", "under",
] as const;

export type Preposition = (typeof PREPOSITIONS)[number];

export interface PrepositionItem {
  /** Danish sentence containing exactly one "___" blank. */
  sentence: string;
  answer: Preposition;
  /** English gloss of the full sentence. */
  gloss: string;
  /** Short explanation shown in feedback. */
  note: string;
}

export const PREPOSITION_PACK: readonly PrepositionItem[] = [
  { sentence: "Jeg bor ___ København.", answer: "i", gloss: "I live in Copenhagen.", note: "Cities and countries take «i»." },
  { sentence: "Hun bor ___ Fyn.", answer: "på", gloss: "She lives on Funen.", note: "Islands (except Sjælland/Jylland cities) take «på»." },
  { sentence: "Vi tager ___ Aarhus i morgen.", answer: "til", gloss: "We are going to Aarhus tomorrow.", note: "Movement towards a place: «til»." },
  { sentence: "Bogen ligger ___ bordet.", answer: "på", gloss: "The book is on the table.", note: "Contact with a surface: «på»." },
  { sentence: "Mælken står ___ køleskabet.", answer: "i", gloss: "The milk is in the fridge.", note: "Inside a container: «i»." },
  { sentence: "Jeg venter ___ bussen.", answer: "på", gloss: "I am waiting for the bus.", note: "«At vente på» — fixed verb + preposition." },
  { sentence: "Han tænker ___ sin familie.", answer: "på", gloss: "He is thinking about his family.", note: "«At tænke på» = to think of/about." },
  { sentence: "Vi taler ___ vejret.", answer: "om", gloss: "We are talking about the weather.", note: "«At tale om» = to talk about a topic." },
  { sentence: "Filmen handler ___ en dansk konge.", answer: "om", gloss: "The film is about a Danish king.", note: "«At handle om» = to be about." },
  { sentence: "Jeg glæder mig ___ ferien.", answer: "til", gloss: "I am looking forward to the holiday.", note: "«At glæde sig til» — always «til»." },
  { sentence: "Hun er bange ___ hunde.", answer: "for", gloss: "She is afraid of dogs.", note: "«Bange for» = afraid of." },
  { sentence: "Tak ___ hjælpen!", answer: "for", gloss: "Thanks for the help!", note: "«Tak for» — fixed expression." },
  { sentence: "Jeg arbejder ___ et stort firma.", answer: "i", gloss: "I work at a big company.", note: "Working inside an organisation: «i»." },
  { sentence: "Hun arbejder ___ et hospital.", answer: "på", gloss: "She works at a hospital.", note: "Institutions like hospital/skole/universitet take «på»." },
  { sentence: "Børnene går ___ skole.", answer: "i", gloss: "The children go to school.", note: "«At gå i skole» — fixed expression without article." },
  { sentence: "Jeg studerer ___ universitetet.", answer: "på", gloss: "I study at the university.", note: "«På universitetet» — fixed." },
  { sentence: "Vi mødes ___ klokken syv.", answer: "ved", gloss: "We meet at around seven.", note: "«Ved» = approximately, near a point in time." },
  { sentence: "Han sidder ___ vinduet.", answer: "ved", gloss: "He is sitting by the window.", note: "«Ved» = next to / by." },
  { sentence: "Jeg kommer ___ Italien.", answer: "fra", gloss: "I come from Italy.", note: "Origin: «fra»." },
  { sentence: "Toget kører ___ ti minutter.", answer: "om", gloss: "The train leaves in ten minutes.", note: "Future time span: «om»." },
  { sentence: "Vi spiser middag ___ arbejde.", answer: "efter", gloss: "We eat dinner after work.", note: "Sequence in time: «efter»." },
  { sentence: "Katten ligger ___ sengen.", answer: "under", gloss: "The cat is lying under the bed.", note: "Position below: «under»." },
  { sentence: "Lampen hænger ___ bordet.", answer: "over", gloss: "The lamp hangs above the table.", note: "Position above: «over»." },
  { sentence: "Jeg drikker kaffe ___ mælk.", answer: "med", gloss: "I drink coffee with milk.", note: "Accompaniment: «med»." },
  { sentence: "Hun kører ___ bus til arbejde.", answer: "med", gloss: "She takes the bus to work.", note: "Means of transport: «med»." },
  { sentence: "Bordet er lavet ___ træ.", answer: "af", gloss: "The table is made of wood.", note: "Material: «af»." },
  { sentence: "Det er en del ___ problemet.", answer: "af", gloss: "It is part of the problem.", note: "«En del af» = a part of." },
  { sentence: "Jeg er træt ___ at vente.", answer: "af", gloss: "I am tired of waiting.", note: "«Træt af» = tired of." },
  { sentence: "Hun er god ___ at synge.", answer: "til", gloss: "She is good at singing.", note: "«God til» = good at." },
  { sentence: "Jeg er interesseret ___ historie.", answer: "i", gloss: "I am interested in history.", note: "«Interesseret i» = interested in." },
  { sentence: "Vi holder ___ hinanden.", answer: "af", gloss: "We are fond of each other.", note: "«At holde af» = to be fond of." },
  { sentence: "Han lytter ___ musik.", answer: "til", gloss: "He listens to music.", note: "«At lytte til» = to listen to." },
  { sentence: "Jeg ringer ___ dig i aften.", answer: "til", gloss: "I will call you tonight.", note: "«At ringe til» = to call someone." },
  { sentence: "Hun skriver ___ sin mor.", answer: "til", gloss: "She writes to her mother.", note: "Recipient: «til»." },
  { sentence: "Vi kigger ___ billederne.", answer: "på", gloss: "We look at the pictures.", note: "«At kigge på» = to look at." },
  { sentence: "Jeg leder ___ mine nøgler.", answer: "efter", gloss: "I am looking for my keys.", note: "«At lede efter» = to search for." },
  { sentence: "Han spørger ___ vejen.", answer: "om", gloss: "He asks for directions.", note: "«At spørge om» = to ask about." },
  { sentence: "Vi bliver hjemme ___ weekenden.", answer: "i", gloss: "We stay home during the weekend.", note: "«I weekenden» — fixed time phrase." },
  { sentence: "Butikken åbner ___ mandag.", answer: "på", gloss: "The shop opens on Monday.", note: "Weekdays take «på»." },
  { sentence: "Jeg står op ___ syvtiden.", answer: "ved", gloss: "I get up around seven.", note: "«Ved …-tiden» = around a time." },
  { sentence: "Vi rejser ___ sommeren.", answer: "om", gloss: "We travel in the summer.", note: "Recurring seasons: «om sommeren»." },
  { sentence: "Han sover ___ natten.", answer: "om", gloss: "He sleeps at night.", note: "Recurring parts of the day: «om natten»." },
  { sentence: "Mødet er ___ mandag klokken ni.", answer: "på", gloss: "The meeting is on Monday at nine.", note: "One specific weekday: «på»." },
  { sentence: "Hun har boet her ___ 2019.", answer: "fra", gloss: "She has lived here from 2019.", note: "Starting point: «fra»." },
  { sentence: "Jeg går en tur ___ skoven.", answer: "i", gloss: "I take a walk in the forest.", note: "Inside an area: «i»." },
  { sentence: "Vi mødes ___ stationen.", answer: "på", gloss: "We meet at the station.", note: "«På stationen» — public places take «på»." },
  { sentence: "Der står en cykel ___ døren.", answer: "ved", gloss: "There is a bike by the door.", note: "«Ved» = right next to." },
  { sentence: "Bogen er skrevet ___ en dansk forfatter.", answer: "af", gloss: "The book was written by a Danish author.", note: "Agent in passive: «af»." },
  { sentence: "Jeg har brug ___ hjælp.", answer: "for", gloss: "I need help.", note: "«At have brug for» = to need." },
  { sentence: "Det er svært ___ mig.", answer: "for", gloss: "It is difficult for me.", note: "Beneficiary: «for»." },
  { sentence: "Vi betaler ___ maden.", answer: "for", gloss: "We pay for the food.", note: "«At betale for» = to pay for." },
  { sentence: "Han er stolt ___ sin datter.", answer: "af", gloss: "He is proud of his daughter.", note: "«Stolt af» = proud of." },
  { sentence: "Jeg er enig ___ dig.", answer: "med", gloss: "I agree with you.", note: "«Enig med» a person." },
  { sentence: "Hun hjælper mig ___ lektierne.", answer: "med", gloss: "She helps me with the homework.", note: "«At hjælpe med» = to help with." },
  { sentence: "Vi begynder ___ starten.", answer: "fra", gloss: "We start from the beginning.", note: "Starting point in space or order: «fra»." },
  { sentence: "Der er langt ___ Aalborg.", answer: "til", gloss: "It is far to Aalborg.", note: "Distance towards: «til»." },
  { sentence: "Jeg tager ___ arbejde nu.", answer: "på", gloss: "I am going to work now.", note: "«På arbejde» — fixed expression." },
  { sentence: "Hun er hjemme ___ mandag.", answer: "fra", gloss: "She is home from Monday.", note: "«Fra» marks when something starts." },
  { sentence: "Vi går ___ biografen i aften.", answer: "i", gloss: "We are going to the cinema tonight.", note: "«I biografen» — fixed expression." },
  { sentence: "Han er ___ ferie.", answer: "på", gloss: "He is on holiday.", note: "«På ferie» — fixed expression." },
  { sentence: "Jeg køber ind ___ supermarkedet.", answer: "i", gloss: "I shop in the supermarket.", note: "Inside a shop building: «i»." },
  { sentence: "Vi sidder ___ sofaen.", answer: "i", gloss: "We sit in the sofa.", note: "Danes sit «i sofaen» but «på stolen»." },
  { sentence: "Han sidder ___ stolen.", answer: "på", gloss: "He sits on the chair.", note: "«På stolen» — surfaces you sit on." },
  { sentence: "Jeg lærer dansk ___ min kæreste.", answer: "af", gloss: "I learn Danish from my partner.", note: "«At lære af» = to learn from someone." },
  { sentence: "Der er mange mennesker ___ gaden.", answer: "på", gloss: "There are many people in the street.", note: "«På gaden» — open outdoor spaces." },
  { sentence: "Hun kommer ___ ti minutter.", answer: "om", gloss: "She is coming in ten minutes.", note: "«Om» for future time distance." },
  { sentence: "Vi har ventet ___ en time.", answer: "i", gloss: "We have waited for an hour.", note: "Duration: «i en time»." },
  { sentence: "Jeg drømmer ___ at flytte.", answer: "om", gloss: "I dream about moving.", note: "«At drømme om» = to dream of." },
  { sentence: "Han er vant ___ kulden.", answer: "til", gloss: "He is used to the cold.", note: "«Vant til» = used to." },
  { sentence: "Vi ser frem ___ mødet.", answer: "til", gloss: "We look forward to the meeting.", note: "«Se frem til» = look forward to." },
  { sentence: "Jeg holder ___ at læse.", answer: "af", gloss: "I love reading.", note: "«At holde af» = to be fond of." },
  { sentence: "Hun blev ked ___ det.", answer: "af", gloss: "She got sad about it.", note: "«Ked af det» — fixed expression." },
  { sentence: "Vi bor lige ___ siden af skolen.", answer: "ved", gloss: "We live right next to the school.", note: "«Ved siden af» = next to." },
  { sentence: "Han gik ___ broen.", answer: "over", gloss: "He walked across the bridge.", note: "«Over» = across / above." },
  { sentence: "Prisen er ___ hundrede kroner.", answer: "under", gloss: "The price is under a hundred kroner.", note: "«Under» = below a value." },
  { sentence: "Jeg spiser morgenmad ___ morgenen.", answer: "om", gloss: "I eat breakfast in the morning.", note: "Recurring time of day: «om morgenen»." },
  { sentence: "Vi tager af sted ___ frokost.", answer: "efter", gloss: "We leave after lunch.", note: "«Efter» = after." },
  { sentence: "Nøglen passer ___ døren.", answer: "til", gloss: "The key fits the door.", note: "«At passe til» = to fit." },
  { sentence: "Hun er gift ___ en dansker.", answer: "med", gloss: "She is married to a Dane.", note: "«Gift med» = married to." },
  { sentence: "Jeg er færdig ___ mit arbejde.", answer: "med", gloss: "I am finished with my work.", note: "«Færdig med» = done with." },
] as const;

/** Blank marker used inside the curated sentences. */
export const BLANK = "___";

const PREP_DIRECTION: LangDirection = {
  from: "danish",
  to: "danish",
  fromLabel: "dansk",
  toLabel: "dansk",
};

function distractorsFor(answer: Preposition): Preposition[] {
  return shuffle(PREPOSITIONS.filter((p) => p !== answer)).slice(0, 3);
}

export function prepositionQuestion(item: PrepositionItem, index: number): QuizQuestion {
  return {
    entry: syntheticEntry(`prep-${index}`, item.sentence, item.gloss),
    prompt: item.sentence,
    answer: item.answer,
    options: shuffle([item.answer, ...distractorsFor(item.answer)]),
    questionType: "preposition",
    hint: item.gloss,
    note: item.note,
    direction: PREP_DIRECTION,
  };
}

export function buildPrepositionQuestions(count: number): QuizQuestion[] {
  return shuffle(PREPOSITION_PACK.map((item, i) => prepositionQuestion(item, i))).slice(0, count);
}

/* ------------------------------------------------------------------ */
/*  Article drills from the user's own nouns                           */
/* ------------------------------------------------------------------ */

const ARTICLE_DIRECTION: LangDirection = {
  from: "danish",
  to: "danish",
  fromLabel: "dansk",
  toLabel: "dansk",
};

function cleanArticle(value: string | undefined): "en" | "et" | null {
  const v = value?.trim().toLowerCase();
  if (v === "en" || v === "et") return v;
  return null;
}

/** en/et and definite-form drills built from the user's noun entries. */
export function buildArticleQuestions(entries: readonly LexisEntry[], count: number): QuizQuestion[] {
  const nouns = entries.filter((e) => e.type === "noun");
  const out: QuizQuestion[] = [];

  for (const noun of nouns) {
    const article = cleanArticle(noun.grammar?.article);
    if (article && noun.danish.trim()) {
      out.push({
        entry: noun,
        prompt: `___ ${noun.danish}`,
        answer: article,
        options: shuffle(["en", "et"]),
        questionType: "article",
        hint: t("quiz.articles.hintArticle", { word: noun.danish }),
        direction: ARTICLE_DIRECTION,
      });
    }
    const definite = noun.grammar?.singularDefinite?.trim();
    if (definite) {
      out.push({
        entry: noun,
        prompt: noun.danish,
        answer: definite,
        options: [],
        questionType: "article",
        hint: t("quiz.articles.hintDefinite", { word: noun.danish }),
        direction: ARTICLE_DIRECTION,
      });
    }
  }

  return shuffle(out).slice(0, count);
}

/** Mixed articles + prepositions pool. */
export function buildArticlesExercise(entries: readonly LexisEntry[], count: number): QuizQuestion[] {
  const articles = buildArticleQuestions(entries, Math.ceil(count / 2));
  const preps = buildPrepositionQuestions(count - articles.length);
  return shuffle([...articles, ...preps]).slice(0, count);
}

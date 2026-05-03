# Landing page copy — easy language pass

Goal: keep the warm, personal voice but use shorter, simpler sentences. No clever wordplay, no jargon. Same structure, same keys — only the strings change in `src/i18n/en.yaml` and `src/i18n/da.yaml`.

## English (`src/i18n/en.yaml`)

| Key | New value |
|---|---|
| `eyebrow` | Your little Danish dictionary |
| `tagline` | No more excuses for forgetting a Danish word. Save it here, find it later, practice when you want. |
| `startCollecting` | Start your dictionary |
| `tryDemo` | Take a peek |
| `noAccount` | No sign-up. Nothing to install. |
| `featuresEyebrow` | What's inside |
| `featuresTitle` | Small, simple, and made for you. |
| `feature1Title` | Save a word |
| `feature1Body` | Heard a new word at the bakery or in class? Add it in seconds, before you forget. |
| `feature2Title` | Danish made clear |
| `feature2Body` | en/et, verb forms, adjective endings — all kept next to each word. |
| `feature3Title` | Practice when you want |
| `feature3Body` | Quiz yourself on your own words. No streaks, no pressure. |
| `feature4Title` | Helps you with the hard ones |
| `feature4Body` | Words you often miss show up first, so practice goes where it helps. |
| `privacyTitle` | All yours. |
| `privacyBody` | Your words stay on your device. No tracking. You can save a copy anytime. |
| `ctaTitle` | Start your dictionary today. |
| `ctaBody` | One word today. Many more tomorrow. |
| `footerCredit` | Made with care, and a little help from AI. |

(Unchanged: `openApp`, `github`, `feature3Badge`, `openOrdsamling`, `footerGithub`.)

## Dansk (`src/i18n/da.yaml`)

| Nøgle | Ny tekst |
|---|---|
| `eyebrow` | Din lille danske ordbog |
| `tagline` | Ingen flere undskyldninger for at glemme et dansk ord. Gem det her, find det igen, øv når du vil. |
| `startCollecting` | Start din ordbog |
| `tryDemo` | Kig indenfor |
| `noAccount` | Ingen tilmelding. Intet at installere. |
| `featuresEyebrow` | Hvad der er indeni |
| `featuresTitle` | Lille, enkel og lavet til dig. |
| `feature1Title` | Gem et ord |
| `feature1Body` | Hørte du et nyt ord hos bageren eller i skolen? Tilføj det på et øjeblik, før du glemmer det. |
| `feature2Title` | Dansk gjort tydeligt |
| `feature2Body` | en/et, verbumsformer, adjektivbøjninger — alt sammen ved siden af hvert ord. |
| `feature3Title` | Øv når du vil |
| `feature3Body` | Quiz dig selv i dine egne ord. Ingen streaks, ingen pres. |
| `feature4Title` | Hjælper med de svære |
| `feature4Body` | Ord du tit glemmer, kommer øverst, så øvelsen lander der, hvor den hjælper. |
| `privacyTitle` | Helt dine. |
| `privacyBody` | Dine ord bliver på din enhed. Ingen sporing. Du kan altid gemme en kopi. |
| `ctaTitle` | Start din ordbog i dag. |
| `ctaBody` | Ét ord i dag. Mange flere i morgen. |
| `footerCredit` | Lavet med omhu — og en lille hånd fra AI. |

(Uændret: `openApp`, `github`, `feature3Badge`, `openOrdsamling`, `footerGithub`.)

## Notes

- Only string edits in two YAML files. No component or layout changes.
- Sentence length kept short (≤12 words where possible), no idioms, no metaphors that need decoding.
- Approve and I'll apply both files in one pass.

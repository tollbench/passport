# The mini organizer

`web/organizer.mjs` is a small sentence-meaning model that runs inside the
Passport box, in the browser, with no network. It does two jobs:

1. **Find.** When a new question arrives, it ranks the owner's saved answers by
   how close they are in meaning, even when the words differ. "Whose birthday is
   this for?" finds the saved answer to "Who is the song for?" and leaves "What is
   your company's budget?" out.
2. **Label.** It tags a saved answer as Personal or Business, and with a topic
   from the existing catalog (`web/topic-catalog.mjs`) when one clearly fits.

It only suggests. The owner still sees and chooses what is reused or shared.

## The model

| | |
|---|---|
| Model | `minishlab/potion-base-8M` (Model2Vec static embeddings, distilled from `BAAI/bge-base-en-v1.5`) |
| License | MIT (model card); attribution in `THIRD_PARTY_NOTICES.md` and `NOTICE` |
| Revision | `bf8b056651a2c21b8d2565580b8569da283cab23` |
| Size in the package | about 10.5 MB (10.0 MiB) across six files; 7.9 MB in the wheel after compression |
| Shape | 29,528 WordPiece tokens x 256 numbers, int8 per row with one float32 scale per row |

Why this one: it is MIT, so it can ship inside an Apache-2.0 package; it is a
lookup table plus an average, so it runs in plain JavaScript with no WASM and no
runtime library; and at 8M parameters it lands at the 10 MB size target while
scoring clearly better than the 2M and 4M versions of the same family. Int8 with
a per-row scale keeps every test sentence above 0.9999 cosine to the original
float32 model.

How a sentence becomes meaning: lowercase and strip accents, split into
WordPiece tokens with the model's own vocabulary (the same steps as the original
BERT uncased tokenizer; the tests check token-for-token agreement with the
upstream `model2vec` package), look up each token's row, average, and scale to
length 1. Two sentences are close when their vectors point the same way
(cosine). For finding and labeling, question scaffolding words ("what", "is",
"your", ...) count half and punctuation counts zero, so "What should the tone
be?" does not look like every other "What should ...?" question.

## Files

```
web/organizer.mjs            the code (about 12 KB), imported by the question sheet
web/organizer/labels.mjs     plain descriptions of Personal, Business and each topic, and the tuning numbers
web/organizer/vocab.mjs      vocabulary, one token per line          (generated)
web/organizer/model.mjs      model description + per-row scales      (generated)
web/organizer/vectors-1.mjs  embedding rows, split in three files    (generated)
web/organizer/vectors-2.mjs    so each file stays under 4.5 MB
web/organizer/vectors-3.mjs
```

The generated files are pure data: comments plus `export const NAME = <JSON>;`
lines. The static-origin bundle checker refuses them if they hold anything else.

## API

```js
import { createOrganizer } from './organizer.mjs';
const organizer = await createOrganizer();          // loads the model once per page, then cached
organizer.rank(questionText, [{ id, text }, ...]);  // -> [{ id, score }] best first, score 0..1
organizer.label(text);                              // -> { book: 'personal' | 'business', topic: <catalog requestType> | null }
```

- `rank` drops clearly unrelated answers (cosine below 0.15), keeps one result
  per id, and breaks ties by id, so the same input always gives the same output
  whatever the candidate order. At most 1,000 candidates and 4,000 characters
  per text are read.
- `label` picks the closest topic only if it reaches 0.35 and beats the runner-up
  by 0.03; otherwise `topic` is `null`. Business wins only by a margin; ties and
  empty text go to Personal. Person and pet topics lean Personal, organization
  topics lean Business.
- `organizer.kind` is `'model'`, or `'fallback'` when the model could not load.
  The fallback ranks by shared words and labels everything
  `{ book: 'personal', topic: null }`. `createOrganizer` never throws.
- `createOrganizer({ load })` accepts an async loader returning
  `{ vocab, model, parts }` module namespaces, for tests.

Load lazily: call `createOrganizer()` the first time the sheet needs it, not on
page start. Measured in Node 22 on the staging box: importing the data modules
about 130 to 170 ms, decoding about 85 to 155 ms, ranking 50 saved answers about
7 to 25 ms the first time and under 1 ms once their vectors are cached.

## The sealed box

The box's rule is that it cannot talk to anything outside itself. The organizer
keeps that rule without any policy change: the weights are JavaScript data
modules loaded with fixed, literal `import('./organizer/...')` paths, which
`script-src 'self'` already allows. Nothing uses `fetch`, so `connect-src`
stays `'none'` and every outside request is still blocked. The hosted page's
CSP is unchanged.

(`connect-src 'self'` with a binary weights file was the other option. It would
have saved about 2.5 MB, but it needed a policy change on the hosted page, the
local server and the static origin, and JSON module imports are governed by
`connect-src` too.)

## Rebuilding the weights

Anyone can rebuild the generated files from the original model with only the
Python standard library:

```sh
python3 scripts/build_organizer_model.py                     # downloads the pinned revision
python3 scripts/build_organizer_model.py --source DIR        # or use local copies
pip install model2vec && python3 scripts/build_organizer_model.py --reference-fixture
```

The script checks the pinned SHA-256 of `model.safetensors`, `tokenizer.json`
and `config.json`, refuses a tokenizer it does not implement, and writes the same
bytes every time. `--reference-fixture` rewrites
`tests/fixtures/organizer-reference.json` from the upstream package for the
parity test. `node --test tests/organizer.test.mjs` checks hashes, sizes,
tokenizer parity, ranking, labels, determinism and the fallback.

## Limits

A static model knows word meaning, not sentence structure. It will sometimes
miss a match ("audience" and "customers" are only loosely close) or rank a weak
one; scores are a guide for the owner, never an automatic answer. Topic labels
cover only the twelve catalog types; anything else is `null`. English only.

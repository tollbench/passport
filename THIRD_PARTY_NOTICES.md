# Third party notices

Passport runtime source is newly authored for Steven Ochs and Tollbench. It does not vendor third-party runtime libraries, private Toll Bench code, Ente code or Bitwarden code. It does ship two pieces of third-party data, listed under "Vendored material" below: the organizer's model weights and vocabulary, and icon artwork.

- Python and the browser are user-supplied runtimes with their own licenses. They are not redistributed in the package.
- Web Crypto is a browser API used for AES-GCM and random key generation. Documentation reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API . No MDN prose or examples were copied into runtime code.
- Apache License 2.0 text was taken from Toll Bench's existing public Toll Harness LICENSE, which supplies the standard license text. Passport ownership attribution is supplied explicitly by its owner: Steven Ochs and Tollbench. Passport citation metadata refers to Passport itself.
- Hatchling, build, Twine, Node, jsbeautifier and Playwright are development/build/test tools, not runtime dependencies or vendored distributions. Their upstream licenses apply to their own code. GitHub Actions are referenced at verified upstream commit hashes, not copied into the package.
- The optional `model2vec` Python package (MIT, Copyright (c) 2024 Thomas van Dongen) is used only by `scripts/build_organizer_model.py --reference-fixture` to write a test fixture. It is not shipped. The organizer's JavaScript was written for Passport; it follows the published inference steps of Model2Vec and the BERT WordPiece tokenizer but copies no upstream code.

Any future vendored material must add its source, exact version, license and required attribution here before release. Package contents must remain limited to the public Passport boundary.

## Vendored material

### potion-base-8M model weights and vocabulary (the organizer)

- Files: `src/toll_passport/web/organizer/model.mjs` and `src/toll_passport/web/organizer/vocab.mjs`.
- What they are: the embedding table of the static sentence-embedding model `minishlab/potion-base-8M`, converted to int8 per row with one float32 scale per row, and its WordPiece vocabulary. Converted by `scripts/build_organizer_model.py`; no upstream code is included.
- Source: https://huggingface.co/minishlab/potion-base-8M at revision `bf8b056651a2c21b8d2565580b8569da283cab23`. Input SHA-256: `model.safetensors` `f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2`, `tokenizer.json` `e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50`, `config.json` `2a6ac0e9aaa356a68a5688070db78fc3a464fefe85d2f06a1905ce3718687553`.
- Authors: The Minish Lab (Stephan Tulkens and Thomas van Dongen), https://github.com/MinishLab/model2vec .
- License: MIT, as declared on the model card (`license: mit`). The weights carry no separate copyright line; the line below follows the Minish Lab's own MIT notices.
- Lineage, for information: distilled from `BAAI/bge-base-en-v1.5` (MIT, revision `a5beb1e3e68b9ab74eb54cfd186867f64f240e1a` at the time of conversion) and trained with Tokenlearn, per the model card. The vocabulary is that model's BERT-style uncased WordPiece vocabulary.
- Citation requested by the authors: Stephan Tulkens and Thomas van Dongen, "Model2Vec: Fast State-of-the-Art Static Embeddings", 2024, doi:10.5281/zenodo.17270888.

### Phosphor Icons

- Use: SVG path data for the "plugs" and "plugs-connected" icons (bold weight) in the hosted question sheet (`web/questions-only.mjs`).
- Source: Phosphor Icons, https://phosphoricons.com , https://github.com/phosphor-icons/core .
- License: MIT, Copyright (c) 2023 Phosphor Icons.

## MIT License (applies to the two items above)

Copyright (c) 2024 The Minish Lab (potion-base-8M)
Copyright (c) 2023 Phosphor Icons (Phosphor Icons)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

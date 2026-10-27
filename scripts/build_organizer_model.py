#!/usr/bin/env python3
# Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
"""Rebuild the Passport organizer's packaged model files from the original model.

The organizer (src/toll_passport/web/organizer.mjs) runs a small static
sentence-embedding model inside the browser with no network. This script turns
the published Model2Vec model ``minishlab/potion-base-8M`` (MIT) into two plain
JavaScript data modules that a ``script-src 'self'`` page can import:

* ``organizer/vocab.mjs``  - the WordPiece vocabulary, one token per line.
* ``organizer/model.mjs``  - the model description plus one float32 scale per
  row, base64 encoded.
* ``organizer/vectors-1.mjs`` .. ``vectors-3.mjs`` - the embedding table, int8
  per row (value = q * scale of that row), base64 encoded, split by rows so
  every file stays under 4.5 MB.

Only the Python standard library is used, so the output is byte-for-byte
reproducible from the pinned source files:

    python3 scripts/build_organizer_model.py            # download pinned revision
    python3 scripts/build_organizer_model.py --source DIR  # use local copies

``--reference-fixture`` additionally writes the test fixture with token ids and
embeddings computed by the upstream ``model2vec`` package (``pip install
model2vec``), which the JavaScript tests compare against.
"""

import argparse
import base64
import hashlib
import json
import math
from array import array
from pathlib import Path
import struct
import sys
import tempfile
import urllib.request

REPO = 'minishlab/potion-base-8M'
REVISION = 'bf8b056651a2c21b8d2565580b8569da283cab23'
PINNED_SHA256 = {
    'model.safetensors': 'f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2',
    'tokenizer.json': 'e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50',
    'config.json': '2a6ac0e9aaa356a68a5688070db78fc3a464fefe85d2f06a1905ce3718687553',
}
FORMAT = 'toll-organizer-static-v1'
MAX_TOKENS = 512  # model2vec DEFAULT_MAX_LENGTH
PARTS = 3  # vector files; organizer.mjs imports vectors-1..3.mjs by literal name
MAX_FILE_BYTES = 4_500_000  # headroom under the static origin's 5,000,000-byte file check
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / 'src/toll_passport/web/organizer'
DEFAULT_FIXTURE = ROOT / 'tests/fixtures/organizer-reference.json'
REFERENCE_SENTENCES = [
    'Whose birthday is this for?',
    'keep [MASK] and [CLS] tokens, drop [UNK] ones',
    'Who is the song for? My sister Maya',
    "What is your company's budget? $5,000",
    'Café crème brûlée, s’il vous plaît!',
    'Naïve résumé for ÅNGSTRÖM coöperation',
    'My dog eats grain-free kibble twice a day.',
    '我喜欢狗 and cats',
    'emoji only \U0001F600 \U0001F389 party',
    'tabs\tand\nnew lines nbsp\u0007bell',
    'https://example.com/path?q=1&x=2 email me at a.b@example.org',
    'Supercalifragilisticexpialidocious antidisestablishmentarianism',
    'x' * 120 + ' long word',
    'ALL CAPS QUESTION: WHAT IS YOUR LLC CALLED?',
    'we’re a two-person design studio (est. 2019) in Oakland, CA',
    '',
    '!!! ??? ...',
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def fetch(source, name):
    if source is not None:
        return (source / name).read_bytes()
    url = 'https://huggingface.co/%s/resolve/%s/%s' % (REPO, REVISION, name)
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def load_inputs(source, allow_other):
    files = {name: fetch(source, name) for name in PINNED_SHA256}
    for name, data in files.items():
        if sha256(data) != PINNED_SHA256[name] and not allow_other:
            raise SystemExit('%s does not match the pinned %s@%s SHA-256' % (name, REPO, REVISION))
    return files


def parse_tokenizer(data):
    spec = json.loads(data)
    normalizer, pre, model = spec['normalizer'], spec['pre_tokenizer'], spec['model']
    # organizer.mjs implements exactly this BERT-uncased pipeline; refuse anything else.
    if (normalizer.get('type') != 'BertNormalizer' or normalizer.get('clean_text') is not True
            or normalizer.get('handle_chinese_chars') is not True or normalizer.get('lowercase') is not True
            or normalizer.get('strip_accents') not in (None, True)):
        raise SystemExit('unsupported normalizer: %r' % normalizer)
    if pre.get('type') != 'BertPreTokenizer':
        raise SystemExit('unsupported pre-tokenizer: %r' % pre)
    if (model.get('type') != 'WordPiece' or model.get('continuing_subword_prefix') != '##'
            or model.get('unk_token') != '[UNK]'):
        raise SystemExit('unsupported tokenizer model')
    vocab = model['vocab']
    tokens = [None] * len(vocab)
    for token, index in vocab.items():
        tokens[index] = token
    if any(t is None or '\n' in t or t != t.strip() or not t for t in tokens):
        raise SystemExit('vocabulary is not a contiguous newline-free token list')
    median = sorted(len(t) for t in tokens)[len(tokens) // 2]
    return tokens, vocab['[UNK]'], int(model.get('max_input_chars_per_word', 100)), median


def parse_safetensors(data):
    (length,) = struct.unpack('<Q', data[:8])
    header = json.loads(data[8:8 + length])
    entry = header['embeddings']
    if entry['dtype'] != 'F32' or len(entry['shape']) != 2:
        raise SystemExit('expected a float32 [rows, dim] embeddings tensor')
    rows, dim = entry['shape']
    start, end = entry['data_offsets']
    raw = data[8 + length + start:8 + length + end]
    values = array('f')
    values.frombytes(raw)
    if sys.byteorder != 'little':
        values.byteswap()
    if len(values) != rows * dim:
        raise SystemExit('embedding tensor size mismatch')
    return values, rows, dim


def quantize(values, rows, dim):
    """Symmetric int8 per row: q = round(x / scale), scale = max|x| / 127 (float32)."""
    scales = array('f', [0.0] * rows)
    out = bytearray(rows * dim)
    for r in range(rows):
        row = values[r * dim:(r + 1) * dim]
        peak = max(abs(x) for x in row)
        scale = struct.unpack('<f', struct.pack('<f', peak / 127.0))[0]
        scales[r] = scale
        if scale == 0.0:
            continue
        base = r * dim
        for i, x in enumerate(row):
            q = int(math.floor(x / scale + 0.5))
            out[base + i] = max(-127, min(127, q)) & 0xFF
    if sys.byteorder != 'little':
        scales.byteswap()
    return bytes(out), scales.tobytes()


def js_header(note):
    return ('// Generated by scripts/build_organizer_model.py from %s@%s. Do not edit.\n'
            '// Model weights: potion-base-8M by The Minish Lab, MIT License (see THIRD_PARTY_NOTICES.md).\n'
            '// %s\n' % (REPO, REVISION, note))


def write_modules(out, tokens, unk_id, max_chars, median, vectors, scales, rows, dim, files):
    out.mkdir(parents=True, exist_ok=True)
    vocab_text = '\n'.join(tokens)
    outputs = {}
    outputs['vocab.mjs'] = (
        js_header('WordPiece vocabulary, one token per line; line number = token id.') +
        'export const VOCAB_INFO = Object.freeze(%s);\n' % json.dumps({
            'source': REPO, 'revision': REVISION, 'size': len(tokens), 'unkId': unk_id,
            'maxInputCharsPerWord': max_chars, 'maxTokens': MAX_TOKENS,
            'medianTokenLength': median, 'lowercase': True, 'stripAccents': True,
        }, sort_keys=True, separators=(',', ':')) +
        'export const VOCAB = %s;\n' % json.dumps(vocab_text, ensure_ascii=True))
    # Rows are split into PARTS files so each stays well under the static origin's
    # 5,000,000-byte per-file check. organizer.mjs imports exactly these names.
    per = -(-rows // PARTS)
    parts = []
    for index in range(PARTS):
        first, last = index * per, min(rows, (index + 1) * per)
        chunk = vectors[first * dim:last * dim]
        name = 'vectors-%d.mjs' % (index + 1)
        parts.append({'file': name, 'firstRow': first, 'rows': last - first, 'sha256': sha256(chunk)})
        outputs[name] = (
            js_header('Embedding rows %d to %d, int8, base64; value = q * scale of that row.' % (first, last - 1)) +
            'export const PART = Object.freeze(%s);\n' % json.dumps(parts[-1], sort_keys=True, separators=(',', ':')) +
            'export const VECTORS = "%s";\n' % base64.b64encode(chunk).decode('ascii'))
    outputs['model.mjs'] = (
        js_header('Model description and one float32 scale per row (base64, little endian).') +
        'export const MODEL_INFO = Object.freeze(%s);\n' % json.dumps({
            'format': FORMAT, 'source': REPO, 'revision': REVISION, 'license': 'MIT',
            'rows': rows, 'dim': dim, 'quantization': 'int8-row-absmax', 'parts': parts,
            'sourceSha256': sha256(files['model.safetensors']),
            'vectorsSha256': sha256(vectors), 'scalesSha256': sha256(scales),
        }, sort_keys=True, separators=(',', ':')) +
        'export const SCALES = "%s";\n' % base64.b64encode(scales).decode('ascii'))
    for stale in out.glob('vectors-*.mjs'):
        if stale.name not in outputs:
            stale.unlink()
    report = {}
    for name, text in outputs.items():
        data = text.encode('ascii')
        if len(data) > MAX_FILE_BYTES:
            raise SystemExit('%s is %d bytes; raise PARTS' % (name, len(data)))
        (out / name).write_bytes(data)
        report[name] = {'bytes': len(data), 'sha256': sha256(data)}
    return report


def write_reference(path, source_dir):
    from model2vec import StaticModel  # optional, only for the test fixture
    model = StaticModel.from_pretrained(str(source_dir))
    ids = model.tokenize(REFERENCE_SENTENCES)
    vectors = model.encode(REFERENCE_SENTENCES)
    cases = [{'text': text, 'ids': [int(i) for i in token_ids][:MAX_TOKENS],
              'embedding': [round(float(x), 6) for x in vector]}
             for text, token_ids, vector in zip(REFERENCE_SENTENCES, ids, vectors)]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'source': REPO, 'revision': REVISION, 'generator': 'model2vec',
                                'cases': cases}, indent=1, ensure_ascii=True) + '\n', encoding='ascii')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--source', type=Path, help='directory holding the pinned model files (default: download)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--allow-other-revision', action='store_true', help='skip the pinned SHA-256 check')
    parser.add_argument('--reference-fixture', nargs='?', const=DEFAULT_FIXTURE, type=Path,
                        help='also write the model2vec reference fixture (needs pip install model2vec)')
    args = parser.parse_args()
    files = load_inputs(args.source, args.allow_other_revision)
    tokens, unk_id, max_chars, median = parse_tokenizer(files['tokenizer.json'])
    values, rows, dim = parse_safetensors(files['model.safetensors'])
    if rows != len(tokens):
        raise SystemExit('vocabulary and embedding rows differ')
    vectors, scales = quantize(values, rows, dim)
    report = write_modules(args.out, tokens, unk_id, max_chars, median, vectors, scales, rows, dim, files)
    if args.reference_fixture:
        if args.source is not None:
            write_reference(args.reference_fixture, args.source)
        else:
            with tempfile.TemporaryDirectory() as temporary:
                for name, data in files.items():
                    Path(temporary, name).write_bytes(data)
                write_reference(args.reference_fixture, Path(temporary))
    print(json.dumps({'source': REPO, 'revision': REVISION, 'rows': rows, 'dim': dim, 'files': report},
                     indent=1, sort_keys=True))


if __name__ == '__main__':
    main()

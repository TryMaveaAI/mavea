#!/usr/bin/env python3
# build-semantic-index.py — generate the shippable assets for Live's semantic component fit.
#
# Mavea picks which UI component answers a question. Keyword + intent rules (src/live/select) handle
# the asks whose wording trips a rule; this index covers the rest — a vague or novel question is
# embedded and matched (cosine) against a per-component exemplar vector, so "explain how a black hole
# works" reaches the teaching diagram even though no keyword said so. We use Model2Vec STATIC
# embeddings (minishlab/potion-base-8M, MIT): encoding a query is tokenize -> look up each token's row
# in a [vocab x 256] matrix -> mean -> L2-normalize — zero neural inference, sub-millisecond on the
# weakest CPU, no WASM. That same math runs at RUNTIME in pure JS (src/live/semantic/encode.ts); this
# script ships the matrix + vocab + tokenizer params it needs, plus the precomputed component vectors.
#
# Outputs (default --out public/semantic), versioned together by MODEL_ID — regenerate ALL on a model
# change or the query and component vectors won't share a space:
#   matrix.i8        int8 [vocab x dim] embedding matrix (row-major)
#   vocab.txt        one token per line, ordered by id (for the WordPiece tokenizer)
#   index.json       manifest: model id, shape, matrix scale, tokenizer params, component vectors
#   validate.json    a few {text, emb} pairs so the JS encoder can prove it matches this model
#
# Run (from app/, in a venv with `pip install model2vec`):
#   python3 scripts/build-semantic-index.py --catalog <catalog.json> --exemplars <exemplars.json>
# catalog.json comes from `npx tsx scripts/semantic-catalog-dump.mts`; exemplars.json is the authored
# {type: exemplar} map. Without --exemplars it still emits the matrix/vocab/validate (engine bring-up).
import argparse
import json
import os
import numpy as np

MODEL_ID = "minishlab/potion-base-8M"


def quantize_int8(mat: np.ndarray):
    """Symmetric int8 quantization with a single global scale. Dequant in JS is row*scale; the error
    is averaged away by mean-pooling + renormalization, so cosine fidelity stays > 0.999."""
    scale = float(np.abs(mat).max()) / 127.0
    q = np.clip(np.round(mat / scale), -127, 127).astype(np.int8)
    return q, scale


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", help="catalog.json from semantic-catalog-dump.mts")
    ap.add_argument("--exemplars", help="authored {type: exemplar} JSON")
    ap.add_argument("--out", default="public/semantic")
    args = ap.parse_args()

    from model2vec import StaticModel

    model = StaticModel.from_pretrained(MODEL_ID)
    matrix = np.asarray(model.embedding, dtype=np.float32)  # (vocab, dim)
    vocab_size, dim = matrix.shape
    tok = model.tokenizer
    tj = json.loads(tok.to_str())
    norm = tj.get("normalizer") or {}
    wp = tj["model"]

    os.makedirs(args.out, exist_ok=True)

    # --- matrix (int8) + vocab ---
    q, scale = quantize_int8(matrix)
    q.tofile(os.path.join(args.out, "matrix.i8"))
    id_to_tok = sorted(tok.get_vocab().items(), key=lambda kv: kv[1])
    with open(os.path.join(args.out, "vocab.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(t for t, _ in id_to_tok))

    # --- tokenizer params the JS WordPiece needs (BERT-style) ---
    lowercase = bool(norm.get("lowercase", True))
    tokenizer = {
        "lowercase": lowercase,
        # BertNormalizer: strip_accents defaults to `lowercase` when unset (the original BERT rule).
        "stripAccents": bool(norm["strip_accents"]) if norm.get("strip_accents") is not None else lowercase,
        "handleChineseChars": bool(norm.get("handle_chinese_chars", True)),
        "prefix": wp.get("continuing_subword_prefix", "##"),
        "unkToken": wp.get("unk_token", "[UNK]"),
        "maxChars": int(wp.get("max_input_chars_per_word", 100)),
    }

    # --- component vectors from the authored exemplars (optional during engine bring-up) ---
    components = {}
    if args.catalog and args.exemplars:
        catalog = json.load(open(args.catalog, encoding="utf-8"))
        exemplars = json.load(open(args.exemplars, encoding="utf-8"))
        types = [c["type"] for c in catalog]
        # Fall back to the blurb for any component the authoring pass missed, so coverage is total.
        docs = [exemplars.get(c["type"]) or c.get("blurb") or c["type"] for c in catalog]
        vecs = np.asarray(model.encode(docs), dtype=np.float32)  # (n, dim), L2-normalized
        cq, cscale = quantize_int8(vecs)
        components = {
            "scale": cscale,
            "types": types,
            # int8 rows, base64-packed for a compact JSON the worker reads in one fetch.
            "vectors": [cq[i].tobytes().hex() for i in range(len(types))],
        }

    index = {
        "modelId": MODEL_ID,
        "dim": dim,
        "vocabSize": vocab_size,
        "matrix": {"file": "matrix.i8", "scale": scale, "dtype": "int8"},
        "tokenizer": tokenizer,
        "components": components,
    }
    json.dump(index, open(os.path.join(args.out, "index.json"), "w"), separators=(",", ":"))

    # --- validation set: ground-truth embeddings so the JS encoder can prove parity ---
    samples = [
        "Hello World", "compare renting vs buying a home", "ProCrAstinate!! 2024", "café déjà vu",
        "is my friendship draining me", "explain how a black hole works", "1 + 1 = 2",
        "best laptop for college on a budget", "東京 weather", "  extra   spaces\tand\nlines  ",
    ]
    ref = np.asarray(model.encode(samples), dtype=np.float32)
    json.dump(
        [{"text": s, "emb": [round(float(x), 6) for x in ref[i]]} for i, s in enumerate(samples)],
        open(os.path.join(args.out, "validate.json"), "w"),
    )

    print(f"wrote {args.out}: matrix {q.shape} int8 (scale {scale:.6g}), vocab {vocab_size}, "
          f"components {len(components.get('types', []))}, validate {len(samples)}")


if __name__ == "__main__":
    main()

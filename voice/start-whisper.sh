#!/bin/sh
set -eu

model_path=/models/ggml-small.en-q5_1.bin
model_part=${model_path}.part
model_sha256=bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30
model_revision=c521a4b02f422512d734391fdf08bb08c0862f68
model_url=https://huggingface.co/ggerganov/whisper.cpp/resolve/${model_revision}/ggml-small.en-q5_1.bin

model_valid() {
  [ -f "$model_path" ] && printf '%s  %s\n' "$model_sha256" "$model_path" | sha256sum --check --status
}

if ! model_valid; then
  rm -f "$model_part"
  curl --fail --location --retry 3 "$model_url" --output "$model_part"
  printf '%s  %s\n' "$model_sha256" "$model_part" | sha256sum --check --strict
  mv "$model_part" "$model_path"
fi

exec whisper-server \
  --host 0.0.0.0 \
  --port 8080 \
  --model "$model_path" \
  --threads "${MAVEA_STT_THREADS:-4}" \
  --processors 1 \
  --max-context 0 \
  --suppress-nst

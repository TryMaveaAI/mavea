FROM ubuntu:22.04@sha256:3b06811b2afd352be909dd088a004166d665dc76d38b13eada33522a9d915c6f AS build

ARG WHISPER_CPP_VERSION=1.9.1
ARG WHISPER_CPP_SHA256=147267177eef7b22ec3d2476dd514d1b12e160e176230b740e3d1bd600118447

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      build-essential=12.9ubuntu3 \
      ca-certificates=20260601~22.04.1 \
      cmake=3.22.1-1ubuntu1.22.04.2 \
      curl=7.81.0-1ubuntu1.25 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --location --retry 3 \
      "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_CPP_VERSION}.tar.gz" \
      --output whisper.cpp.tar.gz \
  && echo "${WHISPER_CPP_SHA256}  whisper.cpp.tar.gz" | sha256sum --check --strict \
  && tar --extract --gzip --file whisper.cpp.tar.gz --strip-components=1 \
  && cmake -S . -B build \
      -DBUILD_SHARED_LIBS=OFF \
      -DWHISPER_BUILD_EXAMPLES=ON \
      -DWHISPER_BUILD_TESTS=OFF \
      -DWHISPER_BUILD_SERVER=ON \
      -DGGML_NATIVE=OFF \
  && cmake --build build --config Release --target whisper-server --parallel

FROM ubuntu:22.04@sha256:3b06811b2afd352be909dd088a004166d665dc76d38b13eada33522a9d915c6f AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      ca-certificates=20260601~22.04.1 \
      curl=7.81.0-1ubuntu1.25 \
      libgomp1=12.3.0-1ubuntu1~22.04.3 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
COPY voice/start-whisper.sh /usr/local/bin/start-whisper
RUN mkdir --parents /models \
  && chown 65534:65534 /models

EXPOSE 8080
USER 65534:65534
ENTRYPOINT ["/usr/local/bin/start-whisper"]
